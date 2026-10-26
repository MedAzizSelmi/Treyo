package com.byb.backend.service;

import com.byb.backend.model.Course;
import com.byb.backend.model.Enrollment;
import com.byb.backend.model.Group;
import com.byb.backend.model.GroupReport;
import com.byb.backend.model.Interaction;
import com.byb.backend.model.Student;
import com.byb.backend.model.Trainer;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.EnrollmentRepository;
import com.byb.backend.repository.GroupReportRepository;
import com.byb.backend.repository.GroupRepository;
import com.byb.backend.repository.InteractionRepository;
import com.byb.backend.repository.NotificationRepository;
import com.byb.backend.repository.StudentRepository;
import com.byb.backend.repository.TrainerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * What administrators see of demand and groups, and the manual group
 * formation that preceded the automated flow.
 * <p>
 * Since October 2026 groups open, invite and start themselves
 * ({@link GroupAutomationService}). What remains here:
 *   1. Interest per course on /admin/courses/{id}/interest
 *   2. The group list with each group's stage, for the dashboard
 *   3. POST /form-group, for learners who confirmed under the old flow and
 *      have no group yet (creates the Group, links them, sends GROUP_READY)
 */
@Service
@RequiredArgsConstructor
public class AdminGroupFormationService {

    private final CourseRepository courseRepository;
    private final GroupRepository groupRepository;
    private final GroupReportRepository groupReportRepository;
    private final NotificationRepository notificationRepository;
    private final InteractionRepository interactionRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final StudentRepository studentRepository;
    private final TrainerRepository trainerRepository;
    private final NotificationService notificationService;
    private final MessageService messageService;
    // Invoked before listing so finished groups flip to "completed"
    // BEFORE the isActive filter runs, dropping them from the
    // admin's view immediately.
    private final CourseLifecycleService courseLifecycleService;
    // Stage, sessions and members of the automated flow, for the dashboard.
    private final GroupAutomationService groupAutomation;

    /** Count of unique non-enrolled students requesting this course. */
    public int countActiveRequests(String courseId) {
        return getActiveRequestStudentIds(courseId).size();
    }

    /**
     * Maintenance: deletes "clicked_interested" interaction rows that are stale —
     * - the student is already enrolled in that course, OR
     * - there are duplicate rows for the same student/course pair (keeps the earliest).
     * Returns the number of rows removed.
     */
    @Transactional
    public Map<String, Object> cleanupStaleRequests() {
        int removed = 0;
        for (Course course : courseRepository.findAll()) {
            Set<String> enrolledIds = enrollmentRepository.findByCourseId(course.getCourseId()).stream()
                    .map(Enrollment::getStudentId)
                    .collect(Collectors.toSet());

            // Group interactions by student
            Map<String, List<Interaction>> byStudent = new LinkedHashMap<>();
            for (Interaction i : interactionRepository.findByCourseId(course.getCourseId())) {
                if (!"clicked_interested".equals(i.getInteractionType())) continue;
                byStudent.computeIfAbsent(i.getStudentId(), k -> new ArrayList<>()).add(i);
            }

            for (Map.Entry<String, List<Interaction>> e : byStudent.entrySet()) {
                String sid = e.getKey();
                List<Interaction> rows = e.getValue();

                // Already enrolled → delete all their request interactions
                if (enrolledIds.contains(sid)) {
                    interactionRepository.deleteAll(rows);
                    removed += rows.size();
                    continue;
                }

                // Duplicates → keep the earliest, drop the rest
                if (rows.size() > 1) {
                    rows.sort((a, b) -> {
                        if (a.getCreatedAt() == null && b.getCreatedAt() == null) return 0;
                        if (a.getCreatedAt() == null) return 1;
                        if (b.getCreatedAt() == null) return -1;
                        return a.getCreatedAt().compareTo(b.getCreatedAt());
                    });
                    List<Interaction> dupes = rows.subList(1, rows.size());
                    interactionRepository.deleteAll(dupes);
                    removed += dupes.size();
                }
            }
        }

        Map<String, Object> r = new HashMap<>();
        r.put("removedCount", removed);
        return r;
    }

    /**
     * Returns the unique student IDs that are *currently* requesting this course:
     * - interaction type is "clicked_interested"
     * - student doesn't already have an enrollment for the course (otherwise they're past the request stage)
     * Deduplicates across multiple interaction rows for the same student.
     */
    private List<String> getActiveRequestStudentIds(String courseId) {
        Set<String> enrolledStudentIds = enrollmentRepository.findByCourseId(courseId).stream()
                .map(Enrollment::getStudentId)
                .collect(Collectors.toSet());

        Set<String> seen = new HashSet<>();
        List<String> result = new ArrayList<>();
        for (Interaction i : interactionRepository.findByCourseId(courseId)) {
            if (!"clicked_interested".equals(i.getInteractionType())) continue;
            String sid = i.getStudentId();
            if (sid == null || enrolledStudentIds.contains(sid)) continue;
            if (seen.add(sid)) result.add(sid);
        }
        return result;
    }

    /** Earliest "clicked_interested" interaction per student, used to display "Requested at" time. */
    private Map<String, Interaction> getFirstInterestPerStudent(String courseId) {
        Map<String, Interaction> first = new LinkedHashMap<>();
        for (Interaction i : interactionRepository.findByCourseId(courseId)) {
            if (!"clicked_interested".equals(i.getInteractionType())) continue;
            String sid = i.getStudentId();
            if (sid == null) continue;
            first.merge(sid, i, (a, b) -> a.getCreatedAt() != null && b.getCreatedAt() != null
                    && a.getCreatedAt().isBefore(b.getCreatedAt()) ? a : b);
        }
        return first;
    }

    /**
     * Overview of all published courses with their request funnel.
     * Used by the admin's "Requested" tab.
     */
    public List<Map<String, Object>> getRequestedCoursesOverview() {
        return courseRepository.findByIsPublishedTrueAndIsActiveTrue().stream()
                // Only approved courses can accumulate real demand — a
                // PENDING/REJECTED course isn't visible to students, so it
                // can't have a meaningful interest funnel and must not be
                // offered for group formation. Legacy rows (null status)
                // predate the review workflow and count as approved.
                .filter(course -> course.getApprovalStatus() == null
                        || "APPROVED".equalsIgnoreCase(course.getApprovalStatus()))
                .map(course -> {
            long interestedCount = getActiveRequestStudentIds(course.getCourseId()).size();
            long confirmedPending = enrollmentRepository.findByCourseId(course.getCourseId()).stream()
                    .filter(e -> "confirmed".equalsIgnoreCase(e.getEnrollmentStatus()) && e.getGroupId() == null)
                    .count();

            Trainer trainer = trainerRepository.findByTrainerId(course.getTrainerId()).orElse(null);

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("courseId", course.getCourseId());
            m.put("courseTitle", course.getTitle());
            m.put("domain", course.getDomain());
            m.put("trainerId", course.getTrainerId());
            m.put("trainerName", trainer != null ? trainer.getName() : "Unknown");
            m.put("minStudentsRequired", course.getMinStudentsRequired());
            m.put("interestedCount", interestedCount);
            m.put("confirmedCount", confirmedPending);
            m.put("canNotify", interestedCount >= course.getMinStudentsRequired());
            m.put("canFormGroup", confirmedPending >= 2);
            return m;
        }).collect(Collectors.toList());
    }

    /**
     * All groups with enriched info: course, trainer, members. Used by "Enrolled" tab.
     */
    public List<Map<String, Object>> getAllGroupsWithMembers() {
        // Inline lifecycle pass — finished groups flip to "completed"
        // (and isActive = false) before the filter below runs them
        // out of the admin's "active groups" view.
        groupRepository.findAll().forEach(courseLifecycleService::checkAndCompleteOne);
        // Finished groups are listed too, for their end-of-course report;
        // the page's "Completed" filter had nothing to show without them.
        Map<String, GroupReport> reports = groupReportRepository.findAll().stream()
                .collect(Collectors.toMap(GroupReport::getGroupId, r -> r, (a, b) -> a));
        // When the trainer was asked for it. Groups that finished before
        // reports existed were never asked, and are not shown as missing one.
        Map<String, java.time.LocalDateTime> reportAsked = new java.util.HashMap<>();
        notificationRepository.findByNotificationType("GROUP_REPORT_REQUEST")
                .forEach(n -> reportAsked.merge(n.getRelatedEntityId(), n.getCreatedAt(),
                        (a, b) -> a.isBefore(b) ? a : b));

        return groupRepository.findAll().stream()
                .filter(g -> Boolean.TRUE.equals(g.getIsActive()) || "completed".equalsIgnoreCase(g.getGroupStatus()))
                .map(g -> {
                    Course course = courseRepository.findByCourseId(g.getCourseId()).orElse(null);
                    Trainer trainer = trainerRepository.findByTrainerId(g.getTrainerId()).orElse(null);

                    List<Enrollment> members = enrollmentRepository.findByCourseId(g.getCourseId()).stream()
                            .filter(e -> g.getGroupId().equals(e.getGroupId()))
                            .collect(Collectors.toList());

                    List<Map<String, Object>> memberList = members.stream().map(e -> {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("enrollmentId", e.getEnrollmentId());
                        m.put("studentId", e.getStudentId());
                        m.put("enrollmentStatus", e.getEnrollmentStatus());
                        m.put("paymentStatus", e.getPaymentStatus());
                        m.put("progressPercentage", e.getProgressPercentage());
                        m.put("enrolledAt", e.getEnrolledAt());
                        Student s = studentRepository.findByStudentId(e.getStudentId()).orElse(null);
                        if (s != null) {
                            m.put("studentName", s.getName());
                            m.put("studentEmail", s.getEmail());
                            m.put("profilePictureUrl", s.getProfilePictureUrl());
                        }
                        return m;
                    }).collect(Collectors.toList());

                    Map<String, Object> r = new LinkedHashMap<>();
                    r.put("groupId", g.getGroupId());
                    r.put("groupName", g.getGroupName());
                    r.put("groupStatus", g.getGroupStatus());
                    r.put("currentSize", g.getCurrentSize());
                    r.put("maxSize", g.getMaxSize());
                    r.put("startDate", g.getStartDate());
                    r.put("isOnline", g.getIsOnline());
                    r.put("meetingLocation", g.getMeetingLocation());
                    r.put("courseId", g.getCourseId());
                    r.put("courseTitle", course != null ? course.getTitle() : "Unknown");
                    r.put("courseDomain", course != null ? course.getDomain() : null);
                    r.put("trainerId", g.getTrainerId());
                    r.put("trainerName", trainer != null ? trainer.getName() : "Unknown");
                    r.put("members", memberList);
                    // The automated flow (GroupAutomationService): where the
                    // group is, its sessions for the review editor, and how
                    // far it is from its minimum.
                    r.put("stage", groupAutomation.stage(g));
                    r.put("scheduleApprovedAt", g.getScheduleApprovedAt());
                    r.put("meetingSchedule", g.getMeetingSchedule());
                    r.put("firstSessionAt", groupAutomation.firstSession(g).orElse(null));
                    r.put("joinedCount", groupAutomation.members(g).size());
                    r.put("minStudents", course != null ? course.getMinStudentsRequired() : null);
                    r.put("courseDurationHours", course != null ? course.getDurationHours() : null);
                    r.put("createdAt", g.getCreatedAt());
                    GroupReport report = reports.get(g.getGroupId());
                    r.put("reportSubmittedAt", report == null ? null : report.getCreatedAt());
                    r.put("reportRequestedAt", reportAsked.get(g.getGroupId()));
                    return r;
                })
                .collect(Collectors.toList());
    }

    /** Summary of the course's enrollment funnel — used by the admin UI. */
    public Map<String, Object> getCourseInterestSummary(String courseId) {
        Course course = courseRepository.findByCourseId(courseId)
                .orElseThrow(() -> new RuntimeException("Course not found"));

        // Active requests: deduped, excluding students who already have an enrollment
        List<String> activeRequestIds = getActiveRequestStudentIds(courseId);
        Map<String, Interaction> firstInterestPerStudent = getFirstInterestPerStudent(courseId);

        List<Enrollment> enrollments = enrollmentRepository.findByCourseId(courseId);
        long confirmedCount = enrollments.stream()
                .filter(e -> "confirmed".equalsIgnoreCase(e.getEnrollmentStatus()) && e.getGroupId() == null)
                .count();

        List<Map<String, Object>> interestedStudents = activeRequestIds.stream().map(sid -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("studentId", sid);
            Interaction first = firstInterestPerStudent.get(sid);
            m.put("interestedAt", first != null ? first.getCreatedAt() : null);
            Student s = studentRepository.findByStudentId(sid).orElse(null);
            if (s != null) {
                m.put("studentName", s.getName());
                m.put("studentEmail", s.getEmail());
                m.put("profilePictureUrl", s.getProfilePictureUrl());
            }
            m.put("enrollmentStatus", null);
            m.put("hasGroup", false);
            return m;
        }).collect(Collectors.toList());

        int interestedCount = activeRequestIds.size();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("courseId", courseId);
        result.put("courseTitle", course.getTitle());
        result.put("minStudentsRequired", course.getMinStudentsRequired());
        result.put("interestedCount", interestedCount);
        result.put("confirmedCount", confirmedCount);
        result.put("canNotify", interestedCount >= course.getMinStudentsRequired());
        result.put("canFormGroup", confirmedCount >= 2);
        result.put("hasFormingGroup", groupRepository.findFormingGroupByCourse(courseId).isPresent());
        result.put("interestedStudents", interestedStudents);
        return result;
    }

    // notifyInterestedStudents was removed in October 2026: groups open
    // and invite learners by themselves now (GroupAutomationService), and
    // it asked learners to pay for a group that had no dates yet.

    /**
     * Forms a group from all confirmed enrollments (groupId == null).
     * Sends GROUP_READY to each member.
     */
    @Transactional
    public Map<String, Object> formGroup(String courseId) {
        Course course = courseRepository.findByCourseId(courseId)
                .orElseThrow(() -> new RuntimeException("Course not found"));

        // Trainer-availability gate.
        //
        // Two reasons we'd reject a group-formation request:
        //   1. The trainer has flipped themselves to inactive from
        //      their profile screen. They explicitly said "don't
        //      assign me anything" — honour it.
        //   2. The trainer is already at their maxConcurrentGroups
        //      cap (default 3). Lifecycle service drops the count
        //      when a group completes (isActive flips false), so the
        //      slot opens up automatically.
        //
        // Same checks are mirrored on the ML recommendation side, so
        // the admin shouldn't even SEE this course as needing a group
        // when the trainer is unavailable — this is the belt-and-
        // -suspenders guard.
        Trainer trainer = trainerRepository.findByTrainerId(course.getTrainerId())
                .orElseThrow(() -> new RuntimeException("Trainer not found for this course"));
        if (!Boolean.TRUE.equals(trainer.getIsActive())) {
            throw new RuntimeException("Trainer is currently inactive — they've paused new assignments. Reassign the course or wait until they reactivate.");
        }
        int cap = trainer.getMaxConcurrentGroups() == null ? 3 : trainer.getMaxConcurrentGroups();
        long activeGroupsForTrainer = groupRepository.findByTrainerId(trainer.getTrainerId()).stream()
                .filter(g -> Boolean.TRUE.equals(g.getIsActive()))
                .filter(g -> {
                    String s = g.getGroupStatus();
                    return s == null || (!s.equalsIgnoreCase("completed") && !s.equalsIgnoreCase("cancelled"));
                })
                .count();
        if (activeGroupsForTrainer >= cap) {
            throw new RuntimeException("Trainer is at capacity (" + activeGroupsForTrainer + "/" + cap +
                    " active groups). Wait until one of their groups completes before forming another.");
        }

        List<Enrollment> pending = enrollmentRepository.findByCourseId(courseId).stream()
                .filter(e -> "confirmed".equalsIgnoreCase(e.getEnrollmentStatus()) && e.getGroupId() == null)
                .collect(Collectors.toList());

        if (pending.isEmpty()) {
            throw new RuntimeException("No confirmed students waiting for a group");
        }

        int groupNumber = groupRepository.countByCourseId(courseId) + 1;

        Group group = new Group();
        group.setGroupId("GRP_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        group.setCourseId(courseId);
        group.setTrainerId(course.getTrainerId());
        group.setGroupName(course.getTitle() + " - Group " + groupNumber);
        group.setCurrentSize(pending.size());
        group.setMaxSize(course.getMaxStudentsPerGroup());
        group.setGroupStatus("ready");
        group.setIsOnline(course.getFormat() != null && course.getFormat().toLowerCase().contains("online"));
        group.setIsActive(true);
        group = groupRepository.save(group);

        for (Enrollment e : pending) {
            e.setGroupId(group.getGroupId());
            e.setEnrollmentStatus("active");
            e.setStartedAt(LocalDateTime.now());
            enrollmentRepository.save(e);

            notificationService.sendGroupReadyNotification(
                    e.getStudentId(),
                    group.getGroupId(),
                    course.getTitle()
            );
        }

        course.setCurrentGroupsCount((course.getCurrentGroupsCount() == null ? 0 : course.getCurrentGroupsCount()) + 1);
        // totalEnrolled is computed dynamically from the enrollments table — no need to bump here
        courseRepository.save(course);

        // Seed a welcome message in the group's chat, authored by a
        // (randomly picked) admin. Using a real admin sender means:
        //   - the message appears in the chat as a regular bubble, not
        //     an anonymous "SYSTEM" notice
        //   - the admin's name + photo show up so members know who to
        //     reply to if they have onboarding questions
        // Fall back to a system-style attribution only if there's no
        // admin in the database (unusual but possible during bootstrap).
        try {
            Trainer t = trainerRepository.findByTrainerId(course.getTrainerId()).orElse(null);
            String trainerName = t != null ? t.getName() : "your trainer";
            String welcome = "Welcome to " + group.getGroupName() + "! "
                    + "You're now in a group chat with " + trainerName
                    + " and the other students. Use this space to coordinate "
                    + "schedules, ask questions, and get started.";

            com.byb.backend.model.Admin admin = messageService.pickRandomAdmin();
            if (admin != null) {
                messageService.postAsUser(group.getGroupId(),
                        admin.getAdminId(), "admin", welcome);
            } else {
                // Last-resort fallback so the conversation is still seeded
                // even if no admins exist yet.
                messageService.postAsUser(group.getGroupId(),
                        "SYSTEM", "system", welcome);
            }
        } catch (Exception e) {
            // Don't fail group formation if the welcome message can't be
            // written — the group itself is the important artifact.
            System.err.println("Could not seed welcome message for "
                    + group.getGroupId() + ": " + e.getMessage());
        }

        Map<String, Object> r = new LinkedHashMap<>();
        r.put("groupId", group.getGroupId());
        r.put("groupName", group.getGroupName());
        r.put("memberCount", pending.size());
        r.put("trainerId", group.getTrainerId());
        return r;
    }
}
