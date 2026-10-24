package com.byb.backend.service;

import com.byb.backend.model.*;
import com.byb.backend.repository.*;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * The group flow agreed at the October 2026 review, run without anyone
 * having to click it along.
 *
 * <ol>
 *   <li><b>Open.</b> When a course's requests reach its minimum, a group is
 *       opened ("forming", no members) and its trainer is asked to
 *       schedule it.</li>
 *   <li><b>Schedule.</b> The trainer plans the sessions. Administrators are
 *       told there is a schedule to review.</li>
 *   <li><b>Approve.</b> An administrator approves the schedule — after
 *       editing it, or having made it themselves. Only then are the
 *       learners who asked for the course invited to pay, with the dates in
 *       the invitation. From here the trainer can no longer change the
 *       schedule: learners pay for those dates and there are no refunds.</li>
 *   <li><b>Join.</b> A learner who pays joins the group at once and sees
 *       its sessions.</li>
 *   <li><b>Start.</b> When the minimum has paid, the group starts.</li>
 *   <li><b>Deadlines.</b> 48 hours before the first session, if the minimum
 *       still has not paid, administrators get the list of invited learners
 *       who have not, with their phone numbers, to call. 24 hours before,
 *       the group starts with whoever has paid; if nobody has, it is closed
 *       — nothing was charged, so nothing is owed. The learners on the call
 *       list are also reminded themselves.</li>
 *   <li><b>End.</b> Once a group can no longer be joined — its first
 *       session has begun, or it closed — the requests of the learners
 *       invited to it who did not pay are ended, and they are told so and
 *       that they can ask again. Their course page then offers "Request"
 *       rather than claiming a request that no longer counts, and asking
 *       again counts towards the next group.</li>
 * </ol>
 *
 * A trainer who has not scheduled after two days is reminded; after five,
 * administrators are told.
 *
 * Notifications double as this service's record of what it has sent: each
 * invitation, reminder and alert carries the group as its related entity,
 * so the 15-minute sweep sends each one once.
 *
 * Groups formed under the old, manual flow (confirmed learners first, group
 * after) have no approved schedule and are left exactly as they were.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GroupAutomationService {

    static final Duration CALL_LIST_BEFORE_FIRST_SESSION = Duration.ofHours(48);
    static final Duration START_BEFORE_FIRST_SESSION = Duration.ofHours(24);
    static final Duration SCHEDULE_REMINDER_AFTER = Duration.ofDays(2);
    static final Duration SCHEDULE_OVERDUE_AFTER = Duration.ofDays(5);

    static final String PAYMENT_OPEN = "GROUP_PAYMENT_OPEN";
    static final String SCHEDULE_REVIEW = "GROUP_SCHEDULE_REVIEW";
    static final String CALL_LIST = "GROUP_CALL_LIST";
    static final String SCHEDULE_REMINDER = "GROUP_SCHEDULE_REMINDER";
    static final String SCHEDULE_OVERDUE = "GROUP_SCHEDULE_OVERDUE";
    static final String PAYMENT_REMINDER = "GROUP_PAYMENT_REMINDER";
    static final String MISSED = "GROUP_MISSED";

    private static final DateTimeFormatter SHOWN = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final CourseRepository courseRepository;
    private final GroupRepository groupRepository;
    private final InteractionRepository interactionRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final StudentRepository studentRepository;
    private final TrainerRepository trainerRepository;
    private final AdminRepository adminRepository;
    private final NotificationRepository notificationRepository;
    private final NotificationService notificationService;
    private final EmailService emailService;
    private final MessageService messageService;
    private final ObjectMapper objectMapper;

    /** The dashboard's address, for the links in administrator emails. */
    @Value("${app.url:https://treyo.app}")
    private String appUrl;

    /** This bean through its proxy, so each sweep step gets its own transaction. */
    @Lazy
    @Autowired
    private GroupAutomationService self;

    // ── Events: run after the request or payment has been saved ─────────

    /** Published when a learner asks to join a course. */
    public record InterestRegistered(String studentId, String courseId) {}

    /** Published when a paid (or free) enrollment joins a group. */
    public record JoinedGroup(String enrollmentId, String groupId) {}

    /**
     * After the request is committed, so the count includes it. Its own
     * transaction, and it never throws: asking for a course must not fail
     * because a group could not be opened.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void handle(InterestRegistered e) {
        try {
            onInterest(e.studentId(), e.courseId(), LocalDateTime.now());
        } catch (Exception ex) {
            log.warn("Group automation after a request for {} failed: {}", e.courseId(), ex.getMessage());
        }
    }

    /** After the payment is committed: start the group if this was the one it needed. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void handle(JoinedGroup e) {
        try {
            groupRepository.findById(e.groupId()).ifPresent(g -> onJoined(g, LocalDateTime.now()));
        } catch (Exception ex) {
            log.warn("Group automation after a payment into {} failed: {}", e.groupId(), ex.getMessage());
        }
    }

    // ── Reading a group ─────────────────────────────────────────────────

    /** Every session start in the group's schedule; empty when it has none. */
    public List<LocalDateTime> sessionTimes(Group g) {
        String json = g.getMeetingSchedule();
        if (json == null || json.isBlank()) return List.of();
        try {
            Map<String, Object> parsed = objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
            if (!(parsed.get("sessions") instanceof List<?> list)) return List.of();
            List<LocalDateTime> out = new ArrayList<>();
            for (Object o : list) {
                if (!(o instanceof Map<?, ?> s) || s.get("date") == null || s.get("time") == null) continue;
                String time = String.valueOf(s.get("time"));
                if (time.length() == 5) time = time + ":00";
                try {
                    out.add(LocalDateTime.parse(s.get("date") + "T" + time));
                } catch (Exception ignored) {
                    // One malformed session should not hide the rest.
                }
            }
            out.sort(Comparator.naturalOrder());
            return out;
        } catch (Exception e) {
            return List.of();
        }
    }

    public Optional<LocalDateTime> firstSession(Group g) {
        List<LocalDateTime> s = sessionTimes(g);
        return s.isEmpty() ? Optional.empty() : Optional.of(s.get(0));
    }

    /** Learners who have joined: an enrollment in this group that was not dropped. */
    public List<Enrollment> members(Group g) {
        return enrollmentRepository.findByCourseId(g.getCourseId()).stream()
                .filter(e -> g.getGroupId().equals(e.getGroupId()))
                .filter(e -> !"dropped".equalsIgnoreCase(e.getEnrollmentStatus())
                        && !"cancelled".equalsIgnoreCase(e.getEnrollmentStatus()))
                .collect(Collectors.toList());
    }

    private static boolean isForming(Group g) {
        return Boolean.TRUE.equals(g.getIsActive()) && "forming".equalsIgnoreCase(g.getGroupStatus());
    }

    private static boolean isStarted(Group g) {
        String s = g.getGroupStatus();
        return Boolean.TRUE.equals(g.getIsActive()) && s != null
                && (s.equalsIgnoreCase("ready") || s.equalsIgnoreCase("active"));
    }

    /**
     * Where a group is in the flow, for the dashboard: awaiting_schedule,
     * awaiting_review, open_for_payment, started — or its status otherwise.
     */
    public String stage(Group g) {
        if (isForming(g)) {
            if (g.getScheduleApprovedAt() != null) return "open_for_payment";
            return sessionTimes(g).isEmpty() ? "awaiting_schedule" : "awaiting_review";
        }
        if (isStarted(g)) return "started";
        return g.getGroupStatus() == null ? "unknown" : g.getGroupStatus().toLowerCase();
    }

    /**
     * Throws, with a reason a learner can read, unless they can pay to join
     * this group now. Checked before the card is charged: there are no
     * refunds, so a payment must never be taken for a place that is not
     * there.
     */
    public void checkJoinable(Group g, String courseId, LocalDateTime now) {
        if (!g.getCourseId().equals(courseId)) {
            throw new IllegalArgumentException("This group is for another course.");
        }
        if (g.getScheduleApprovedAt() == null || !(isForming(g) || isStarted(g))) {
            throw new IllegalArgumentException("This group is not open for enrollment.");
        }
        LocalDateTime first = firstSession(g).orElse(null);
        if (first == null || !first.isAfter(now)) {
            throw new IllegalArgumentException("This group has already started its sessions.");
        }
        int max = g.getMaxSize() == null ? Integer.MAX_VALUE : g.getMaxSize();
        if (members(g).size() >= max) {
            throw new IllegalArgumentException("This group is full.");
        }
    }

    /**
     * The group this learner was invited to and can still pay to join, if
     * any — so the course page can offer it even after the invitation was
     * read or cleared.
     */
    public Optional<Group> openOfferFor(String studentId, String courseId, LocalDateTime now) {
        if (enrollmentRepository.findByStudentIdAndCourseId(studentId, courseId).isPresent()) return Optional.empty();
        for (Group g : groupRepository.findByCourseId(courseId)) {
            if (!notificationRepository.existsByUserIdAndNotificationTypeAndRelatedEntityId(studentId, PAYMENT_OPEN, g.getGroupId())) {
                continue;
            }
            try {
                checkJoinable(g, courseId, now);
                return Optional.of(g);
            } catch (IllegalArgumentException notJoinable) {
                // Try the next group.
            }
        }
        return Optional.empty();
    }

    // ── 1. Open ─────────────────────────────────────────────────────────

    /**
     * A learner asked for a course. If a group of it is open for payment,
     * they are invited to it; if one is being prepared, they will be
     * invited when its schedule is approved; otherwise this may be the
     * request that opens one.
     */
    @Transactional
    public void onInterest(String studentId, String courseId, LocalDateTime now) {
        Course course = courseRepository.findByCourseId(courseId).orElse(null);
        if (course == null) return;
        List<Group> groups = groupRepository.findByCourseId(courseId);
        for (Group g : groups) {
            if (g.getScheduleApprovedAt() == null) continue;
            try {
                checkJoinable(g, courseId, now);
                invite(studentId, g, course);
                return;
            } catch (IllegalArgumentException notJoinable) {
                // Try the next group.
            }
        }
        if (groups.stream().anyMatch(GroupAutomationService::isForming)) return;
        maybeOpenGroup(course, now);
    }

    /** Learners currently asking for the course: a request, and no enrollment in it. */
    private List<Interaction> openRequests(String courseId) {
        Set<String> enrolled = enrollmentRepository.findByCourseId(courseId).stream()
                .map(Enrollment::getStudentId).collect(Collectors.toSet());
        Map<String, Interaction> earliest = new LinkedHashMap<>();
        for (Interaction i : interactionRepository.findByCourseId(courseId)) {
            if (!"clicked_interested".equals(i.getInteractionType())) continue;
            if (i.getStudentId() == null || enrolled.contains(i.getStudentId())) continue;
            earliest.merge(i.getStudentId(), i, (a, b) ->
                    a.getCreatedAt() != null && b.getCreatedAt() != null && b.getCreatedAt().isBefore(a.getCreatedAt()) ? b : a);
        }
        return new ArrayList<>(earliest.values());
    }

    /**
     * Opens a group when enough NEW requests have gathered — newer than the
     * course's last group, so learners who were invited to it and did not
     * pay do not open another one by themselves. Not while a group of the
     * course is being prepared, and not while the trainer is unavailable;
     * the sweep tries again when they are.
     */
    @Transactional
    public Optional<Group> maybeOpenGroup(Course course, LocalDateTime now) {
        if (course.getApprovalStatus() != null && !"APPROVED".equalsIgnoreCase(course.getApprovalStatus())) {
            return Optional.empty();
        }
        if (!Boolean.TRUE.equals(course.getIsActive()) || !Boolean.TRUE.equals(course.getIsPublished())) {
            return Optional.empty();
        }
        List<Group> groups = groupRepository.findByCourseId(course.getCourseId());
        if (groups.stream().anyMatch(GroupAutomationService::isForming)) return Optional.empty();

        LocalDateTime lastOpened = groups.stream().map(Group::getCreatedAt).filter(Objects::nonNull)
                .max(Comparator.naturalOrder()).orElse(null);
        long fresh = openRequests(course.getCourseId()).stream()
                .filter(i -> lastOpened == null || (i.getCreatedAt() != null && i.getCreatedAt().isAfter(lastOpened)))
                .count();
        int min = course.getMinStudentsRequired() == null ? 1 : course.getMinStudentsRequired();
        if (fresh < min) return Optional.empty();

        Trainer trainer = trainerRepository.findByTrainerId(course.getTrainerId()).orElse(null);
        if (trainer == null || !Boolean.TRUE.equals(trainer.getIsActive())) return Optional.empty();
        int cap = trainer.getMaxConcurrentGroups() == null ? 3 : trainer.getMaxConcurrentGroups();
        long running = groupRepository.findByTrainerId(trainer.getTrainerId()).stream()
                .filter(g -> Boolean.TRUE.equals(g.getIsActive()))
                .filter(g -> g.getGroupStatus() == null
                        || (!g.getGroupStatus().equalsIgnoreCase("completed") && !g.getGroupStatus().equalsIgnoreCase("cancelled")))
                .count();
        if (running >= cap) return Optional.empty();

        Group group = new Group();
        group.setGroupId("GRP_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        group.setCourseId(course.getCourseId());
        group.setTrainerId(course.getTrainerId());
        group.setGroupName(course.getTitle() + " - Group " + (groupRepository.countByCourseId(course.getCourseId()) + 1));
        group.setCurrentSize(0);
        group.setMaxSize(course.getMaxStudentsPerGroup());
        group.setGroupStatus("forming");
        group.setIsOnline(course.getFormat() != null && course.getFormat().toLowerCase().contains("online"));
        group.setIsActive(true);
        group.setCreatedAt(now);
        group = groupRepository.save(group);

        notificationService.sendScheduleRequest(course.getTrainerId(), group.getGroupId(), course.getTitle(), false);
        log.info("Opened {} for {} ({} new requests, minimum {})", group.getGroupId(), course.getCourseId(), fresh, min);
        return Optional.of(group);
    }

    // ── 2. Schedule ─────────────────────────────────────────────────────

    /** The trainer saved a schedule for a group being prepared: tell the administrators. */
    @Transactional
    public void onScheduleSaved(Group g, boolean byAdmin) {
        if (byAdmin || !isForming(g) || g.getScheduleApprovedAt() != null) return;
        Course course = courseRepository.findByCourseId(g.getCourseId()).orElse(null);
        String title = course == null ? g.getGroupName() : course.getTitle();
        alertAdmins(SCHEDULE_REVIEW, g, title,
                "Schedule to review: " + title,
                "The trainer has scheduled the sessions for '" + g.getGroupName() + "'. Review it, edit it if needed, "
                        + "and approve it to invite the learners to pay.");
    }

    // ── 3. Approve ──────────────────────────────────────────────────────

    /**
     * An administrator approves the schedule. Learners who asked for the
     * course are invited to pay, with the dates.
     *
     * @return the number of learners invited
     */
    @Transactional
    public int approveSchedule(String groupId, LocalDateTime now) {
        Group g = groupRepository.findById(groupId)
                .orElseThrow(() -> new IllegalArgumentException("Group not found"));
        if (!isForming(g)) throw new IllegalArgumentException("Only a group being prepared can have its schedule approved.");
        if (g.getScheduleApprovedAt() != null) throw new IllegalArgumentException("This schedule is already approved.");
        LocalDateTime first = firstSession(g)
                .orElseThrow(() -> new IllegalArgumentException("The group has no sessions to approve."));
        if (!first.isAfter(now)) throw new IllegalArgumentException("The first session is already in the past.");

        g.setScheduleApprovedAt(now);
        groupRepository.save(g);

        Course course = courseRepository.findByCourseId(g.getCourseId())
                .orElseThrow(() -> new IllegalArgumentException("Course not found"));
        notificationService.sendScheduleApproved(g.getTrainerId(), g.getGroupId(), course.getTitle());

        int invited = 0;
        for (Interaction i : openRequests(course.getCourseId())) {
            if (invite(i.getStudentId(), g, course)) invited++;
        }
        log.info("Schedule of {} approved; {} learners invited", groupId, invited);
        return invited;
    }

    /** Invites a learner to pay for a group, once. */
    private boolean invite(String studentId, Group g, Course course) {
        if (notificationRepository.existsByUserIdAndNotificationTypeAndRelatedEntityId(studentId, PAYMENT_OPEN, g.getGroupId())) {
            return false;
        }
        String first = firstSession(g).map(SHOWN::format).orElse("");
        notificationService.sendPaymentOpen(studentId, g.getGroupId(), course.getCourseId(), course.getTitle(),
                first, sessionTimes(g).size());
        return true;
    }

    // ── 4–5. Join and start ─────────────────────────────────────────────

    /** Someone paid into the group: start it if the minimum is now there. */
    @Transactional
    public void onJoined(Group g, LocalDateTime now) {
        if (!isForming(g) || g.getScheduleApprovedAt() == null) return;
        Course course = courseRepository.findByCourseId(g.getCourseId()).orElse(null);
        if (course == null) return;
        int min = course.getMinStudentsRequired() == null ? 1 : course.getMinStudentsRequired();
        if (members(g).size() >= min) startGroup(g, course, now);
    }

    /**
     * The group goes ahead with its members: they become active and are
     * told, and the chat gets its welcome message.
     */
    @Transactional
    public void startGroup(Group g, Course course, LocalDateTime now) {
        if (!isForming(g)) return;
        List<Enrollment> members = members(g);
        g.setGroupStatus("ready");
        g.setCurrentSize(members.size());
        groupRepository.save(g);

        for (Enrollment e : members) {
            if (!"active".equalsIgnoreCase(e.getEnrollmentStatus())) {
                e.setEnrollmentStatus("active");
                e.setStartedAt(now);
                enrollmentRepository.save(e);
            }
            notificationService.sendGroupReadyNotification(e.getStudentId(), g.getGroupId(), course.getTitle());
        }
        course.setCurrentGroupsCount((course.getCurrentGroupsCount() == null ? 0 : course.getCurrentGroupsCount()) + 1);
        courseRepository.save(course);
        postWelcome(g);
        log.info("Started {} with {} learners", g.getGroupId(), members.size());
    }

    /** The group's first chat message, from an administrator so members know whom to ask. */
    public void postWelcome(Group g) {
        try {
            Trainer t = trainerRepository.findByTrainerId(g.getTrainerId()).orElse(null);
            String welcome = "Welcome to " + g.getGroupName() + "! You're now in a group chat with "
                    + (t != null ? t.getName() : "your trainer")
                    + " and the other learners. Use this space to coordinate, ask questions, and get started.";
            Admin admin = messageService.pickRandomAdmin();
            if (admin != null) {
                messageService.postAsUser(g.getGroupId(), admin.getAdminId(), "admin", welcome);
            } else {
                messageService.postAsUser(g.getGroupId(), "SYSTEM", "system", welcome);
            }
        } catch (Exception e) {
            log.warn("Could not post the welcome message in {}: {}", g.getGroupId(), e.getMessage());
        }
    }

    /** Nobody paid before the deadline: the group does not run, and nothing is owed. */
    @Transactional
    public void closeGroup(Group g) {
        g.setGroupStatus("cancelled");
        g.setIsActive(false);
        groupRepository.save(g);
        String title = courseRepository.findByCourseId(g.getCourseId()).map(Course::getTitle).orElse(g.getGroupName());
        notificationService.sendGroupClosed(g.getTrainerId(), "trainer", g.getGroupId(), title);
        Set<String> told = new HashSet<>();
        for (Notification invitation : notificationRepository.findByNotificationTypeAndRelatedEntityId(PAYMENT_OPEN, g.getGroupId())) {
            if (!told.add(invitation.getUserId())) continue;
            endRequest(invitation.getUserId(), g.getCourseId());
            notificationService.sendGroupClosed(invitation.getUserId(), "student", g.getGroupId(), title);
        }
        log.info("Closed {}: nobody joined before the deadline", g.getGroupId());
    }

    /**
     * The group's first session has begun, so it can no longer be joined:
     * the invited learners who did not pay have their request ended and are
     * told they can ask again. Once per learner and group.
     */
    @Transactional
    public void endUnpaidInvitations(String groupId, LocalDateTime now) {
        Group g = groupRepository.findById(groupId).orElse(null);
        if (g == null || g.getScheduleApprovedAt() == null || !isStarted(g)) return;
        LocalDateTime first = firstSession(g).orElse(null);
        if (first == null || first.isAfter(now)) return;
        String title = courseRepository.findByCourseId(g.getCourseId()).map(Course::getTitle).orElse(g.getGroupName());
        for (Map<String, Object> unpaid : callList(g)) {
            String sid = (String) unpaid.get("studentId");
            if (notificationRepository.existsByUserIdAndNotificationTypeAndRelatedEntityId(sid, MISSED, g.getGroupId())) continue;
            endRequest(sid, g.getCourseId());
            notificationService.sendGroupMissed(sid, g.getGroupId(), title);
        }
    }

    /** Removes the learner's request for the course, as cancelling it in the app does. */
    private void endRequest(String studentId, String courseId) {
        List<Interaction> requests = interactionRepository.findByStudentIdAndCourseId(studentId, courseId).stream()
                .filter(i -> "clicked_interested".equals(i.getInteractionType()))
                .toList();
        if (!requests.isEmpty()) interactionRepository.deleteAll(requests);
    }

    // ── 6. The sweep ────────────────────────────────────────────────────

    /** Every 15 minutes, like the group lifecycle job. */
    @Scheduled(cron = "0 */15 * * * *")
    public void scheduledSweep() {
        sweep(LocalDateTime.now());
    }

    /**
     * Opens groups whose trainer has become available, reminds trainers,
     * and applies the payment deadlines. Each step runs in its own
     * transaction so one group's failure does not hold up the rest.
     */
    public void sweep(LocalDateTime now) {
        for (Course c : courseRepository.findByIsPublishedTrueAndIsActiveTrue()) {
            try {
                self.maybeOpenGroup(c, now);
            } catch (Exception e) {
                log.warn("Sweep could not check {} for a new group: {}", c.getCourseId(), e.getMessage());
            }
        }
        for (Group g : groupRepository.findAll()) {
            try {
                if (isForming(g)) {
                    self.advance(g.getGroupId(), now);
                } else if (isStarted(g) && g.getScheduleApprovedAt() != null) {
                    self.endUnpaidInvitations(g.getGroupId(), now);
                }
            } catch (Exception e) {
                log.warn("Sweep could not advance {}: {}", g.getGroupId(), e.getMessage());
            }
        }
    }

    /** One group's next step in time, if it has one. */
    @Transactional
    public void advance(String groupId, LocalDateTime now) {
        Group g = groupRepository.findById(groupId).orElse(null);
        if (g == null || !isForming(g)) return;
        Course course = courseRepository.findByCourseId(g.getCourseId()).orElse(null);
        if (course == null) return;

        if (g.getScheduleApprovedAt() == null) {
            if (!sessionTimes(g).isEmpty() || g.getCreatedAt() == null) return; // awaiting review: admins were told
            Duration waiting = Duration.between(g.getCreatedAt(), now);
            if (waiting.compareTo(SCHEDULE_REMINDER_AFTER) >= 0
                    && !notificationRepository.existsByUserIdAndNotificationTypeAndRelatedEntityId(
                    g.getTrainerId(), SCHEDULE_REMINDER, g.getGroupId())) {
                notificationService.sendScheduleRequest(g.getTrainerId(), g.getGroupId(), course.getTitle(), true);
            }
            if (waiting.compareTo(SCHEDULE_OVERDUE_AFTER) >= 0) {
                alertAdmins(SCHEDULE_OVERDUE, g, course.getTitle(),
                        "Not scheduled yet: " + course.getTitle(),
                        "The trainer has not scheduled '" + g.getGroupName() + "' after five days. "
                                + "You can schedule it yourself from the dashboard, or contact the trainer.");
            }
            return;
        }

        int min = course.getMinStudentsRequired() == null ? 1 : course.getMinStudentsRequired();
        int joined = members(g).size();
        if (joined >= min) {
            startGroup(g, course, now);
            return;
        }
        LocalDateTime first = firstSession(g).orElse(null);
        if (first == null) return;
        if (!now.isBefore(first.minus(START_BEFORE_FIRST_SESSION))) {
            if (joined > 0) startGroup(g, course, now);
            else closeGroup(g);
            return;
        }
        if (!now.isBefore(first.minus(CALL_LIST_BEFORE_FIRST_SESSION))) {
            List<Map<String, Object>> toCall = callList(g);
            String lines = toCall.stream()
                    .map(m -> "• " + m.get("name") + " — " + (m.get("phone") == null ? "no phone" : m.get("phone"))
                            + " — " + m.get("email"))
                    .collect(Collectors.joining("\n"));
            for (Map<String, Object> unpaid : toCall) {
                String sid = (String) unpaid.get("studentId");
                if (!notificationRepository.existsByUserIdAndNotificationTypeAndRelatedEntityId(sid, PAYMENT_REMINDER, g.getGroupId())) {
                    notificationService.sendPaymentReminder(sid, g.getGroupId(), course.getCourseId(), course.getTitle(),
                            SHOWN.format(first));
                }
            }
            alertAdmins(CALL_LIST, g, course.getTitle(),
                    "Learners to call: " + course.getTitle(),
                    joined + " of the " + min + " learners needed have paid for '" + g.getGroupName()
                            + "', which starts " + SHOWN.format(first) + ". The group will start with whoever "
                            + "has paid 24 hours before. These invited learners have not paid yet:\n\n"
                            + (lines.isEmpty() ? "(none)" : lines));
        }
    }

    /** Learners invited to the group who have not joined it, with what is needed to phone them. */
    public List<Map<String, Object>> callList(Group g) {
        Set<String> joined = members(g).stream().map(Enrollment::getStudentId).collect(Collectors.toSet());
        List<Map<String, Object>> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Notification n : notificationRepository.findByNotificationTypeAndRelatedEntityId(PAYMENT_OPEN, g.getGroupId())) {
            String sid = n.getUserId();
            if (sid == null || joined.contains(sid) || !seen.add(sid)) continue;
            Student s = studentRepository.findByStudentId(sid).orElse(null);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("studentId", sid);
            m.put("name", s == null ? sid : s.getName());
            m.put("email", s == null ? null : s.getEmail());
            m.put("phone", s == null || s.getPhone() == null || s.getPhone().isBlank() ? null : s.getPhone());
            m.put("invitedAt", n.getCreatedAt());
            out.add(m);
        }
        return out;
    }

    /** Notifies every administrator once per group and kind, by notification and email. */
    private void alertAdmins(String type, Group g, String courseTitle, String subject, String body) {
        for (Admin a : adminRepository.findAll()) {
            if (notificationRepository.existsByUserIdAndNotificationTypeAndRelatedEntityId(a.getAdminId(), type, g.getGroupId())) {
                continue;
            }
            notificationService.sendAdminGroupAlert(a.getAdminId(), type, g.getGroupId(), subject, body, courseTitle);
            if (a.getEmail() != null) {
                emailService.sendAdminGroupAlert(a.getEmail(), a.getName(), subject, body, appUrl + "/dashboard/groups");
            }
        }
    }
}
