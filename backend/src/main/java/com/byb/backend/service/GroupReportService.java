package com.byb.backend.service;

import com.byb.backend.model.*;
import com.byb.backend.repository.*;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * The trainer's end-of-course report, and the attestations it decides.
 *
 * When a group's last session is over (CourseLifecycleService) its trainer
 * is asked for a report: for each learner, sessions attended and a result;
 * then whether every session was held, how much of the course plan was
 * covered, how the level and the prerequisites fitted the group, and
 * anything else for the administrators. Sent once and never edited, so an
 * attestation, once given, is not taken back.
 *
 * Learners marked COMPLETED are congratulated by notification and push and
 * receive their attestation de participation (AttestationService) in the
 * app and by email. COMPLETED needs at least 80% of the sessions held, so
 * no attestation goes to someone who missed more than a fifth of the
 * course. Nothing in the report reaches learners otherwise.
 *
 * The trainer is reminded after two days without a report and the
 * administrators told after five, as for schedules. Sessions the report
 * says were not held are not paid (TrainerController earnings).
 *
 * A course's "certificate" box means it prepares for a certification that
 * LeanConsulting may organise a test for — not that Treyo issues one. For
 * such courses the report shows administrators who completed, so they know
 * whom to invite.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GroupReportService {

    static final Duration REPORT_REMINDER_AFTER = Duration.ofDays(2);
    static final Duration REPORT_OVERDUE_AFTER = Duration.ofDays(5);

    static final String REPORT_REQUEST = "GROUP_REPORT_REQUEST";
    static final String REPORT_REMINDER = "GROUP_REPORT_REMINDER";
    static final String REPORT_OVERDUE = "GROUP_REPORT_OVERDUE";
    static final String COURSE_COMPLETED = "COURSE_COMPLETED";

    private static final Set<String> COVERAGE = Set.of(GroupReport.ALL, GroupReport.MOST, GroupReport.PART);
    private static final Set<String> LEVEL = Set.of(GroupReport.TOO_EASY, GroupReport.RIGHT, GroupReport.TOO_HARD);
    private static final Set<String> PREREQUISITES =
            Set.of(GroupReport.MOST_HAD, GroupReport.SOME_LACKED, GroupReport.MOST_LACKED);
    private static final Set<String> RESULTS = Set.of(
            GroupReportLearner.COMPLETED, GroupReportLearner.PARTIAL, GroupReportLearner.DID_NOT_FOLLOW);
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");

    /**
     * A learner is Completed — and gets the attestation — only having
     * attended at least 80% of the sessions held. LeanConsulting's rule.
     * Sessions not held are left out: nobody could attend them.
     */
    static final int ATTENDANCE_PERCENT_TO_COMPLETE = 80;

    /** Sessions a learner must have attended, out of those held, to complete: 80% rounded up. */
    public static int sessionsNeededToComplete(int held) {
        return (held * ATTENDANCE_PERCENT_TO_COMPLETE + 99) / 100;
    }

    private final GroupReportRepository reportRepository;
    private final GroupReportLearnerRepository learnerRepository;
    private final GroupRepository groupRepository;
    private final CourseRepository courseRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final StudentRepository studentRepository;
    private final AdminRepository adminRepository;
    private final NotificationRepository notificationRepository;
    private final NotificationService notificationService;
    private final EmailService emailService;
    private final AttestationService attestationService;
    private final GroupAutomationService groupAutomation;
    private final CourseLifecycleService courseLifecycle;
    private final ApplicationEventPublisher events;
    private final ObjectMapper objectMapper;

    @Value("${app.url:https://treyo.app}")
    private String appUrl;

    /** This bean through its proxy, so each sweep step gets its own transaction. */
    @Lazy
    @Autowired
    private GroupReportService self;

    /** Published once a report is saved; attestations go out after the commit. */
    public record ReportSubmitted(String reportId) {}

    // ── What the form needs ─────────────────────────────────────────────

    /** One scheduled session, as the form lists it and the report names it. */
    public record Session(String date, String time) {
        static Session of(LocalDateTime t) {
            return new Session(t.toLocalDate().toString(), TIME.format(t));
        }

        String key() { return date + "|" + time; }
    }

    /** The group's sessions in order, from its saved schedule. */
    public List<Session> sessions(Group g) {
        return groupAutomation.sessionTimes(g).stream().map(Session::of).toList();
    }

    /** The learners the report is about: everyone who joined the group. */
    public List<Enrollment> learners(Group g) {
        return groupAutomation.members(g);
    }

    /**
     * Everything the trainer's form and the administrators' view need: the
     * group, its sessions and learners, and the report once sent. Read by
     * the group's trainer and by administrators.
     */
    @Transactional
    public Map<String, Object> view(String groupId, String callerId, boolean callerIsAdmin) {
        Group g = groupRepository.findById(groupId).orElseThrow(() -> new IllegalArgumentException("Group not found."));
        if (!callerIsAdmin && !Objects.equals(g.getTrainerId(), callerId)) {
            throw new org.springframework.security.access.AccessDeniedException("Not your group");
        }
        courseLifecycle.checkAndCompleteOne(g);
        Course course = courseRepository.findByCourseId(g.getCourseId()).orElse(null);
        List<Session> sessions = sessions(g);
        GroupReport report = reportRepository.findByGroupId(groupId).orElse(null);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("groupId", g.getGroupId());
        out.put("groupName", g.getGroupName());
        out.put("groupStatus", g.getGroupStatus());
        out.put("courseId", g.getCourseId());
        out.put("courseTitle", course == null ? null : course.getTitle());
        out.put("preparesCertification", course != null && Boolean.TRUE.equals(course.getHasCertificate()));
        out.put("sessions", sessions);
        out.put("firstSession", sessions.isEmpty() ? null : sessions.get(0).date());
        out.put("lastSession", sessions.isEmpty() ? null : sessions.get(sessions.size() - 1).date());
        out.put("completed", "completed".equalsIgnoreCase(g.getGroupStatus()));
        out.put("attendancePercentToComplete", ATTENDANCE_PERCENT_TO_COMPLETE);

        Map<String, GroupReportLearner> rows = report == null ? Map.of()
                : learnerRepository.findByReportId(report.getReportId()).stream()
                        .collect(Collectors.toMap(GroupReportLearner::getEnrollmentId, r -> r, (a, b) -> a));
        List<Map<String, Object>> people = new ArrayList<>();
        for (Enrollment e : learners(g)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("enrollmentId", e.getEnrollmentId());
            m.put("studentId", e.getStudentId());
            Student s = studentRepository.findByStudentId(e.getStudentId()).orElse(null);
            m.put("name", s == null ? e.getStudentId() : s.getName());
            if (callerIsAdmin && s != null) {
                m.put("email", s.getEmail());
                m.put("phone", s.getPhone());
            }
            GroupReportLearner r = rows.get(e.getEnrollmentId());
            if (r != null) {
                m.put("sessionsAttended", r.getSessionsAttended());
                m.put("result", r.getResult());
                m.put("note", r.getNote());
            }
            people.add(m);
        }
        out.put("learners", people);

        if (report == null) {
            out.put("report", null);
            out.put("canSubmit", !callerIsAdmin && Boolean.TRUE.equals(out.get("completed")));
        } else {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("reportId", report.getReportId());
            r.put("submittedAt", report.getCreatedAt());
            r.put("allSessionsHeld", report.getAllSessionsHeld());
            r.put("sessionsNotHeld", notHeld(report));
            r.put("planCoverage", report.getPlanCoverage());
            r.put("planLeftOut", report.getPlanLeftOut());
            r.put("levelFit", report.getLevelFit());
            r.put("prerequisites", report.getPrerequisites());
            r.put("comments", report.getComments());
            if (callerIsAdmin) {
                r.put("adminNote", report.getAdminNote());
                r.put("adminNoteAt", report.getAdminNoteAt());
            }
            out.put("report", r);
            out.put("canSubmit", false);
        }
        return out;
    }

    /**
     * The trainer's finished groups still waiting for a report: the ones
     * they were asked about. The trainer's home shows them, so the
     * notification is not the only way to the form.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> pendingFor(String trainerId) {
        List<Map<String, Object>> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Notification asked : notificationRepository.findByNotificationType(REPORT_REQUEST)) {
            String groupId = asked.getRelatedEntityId();
            if (!Objects.equals(asked.getUserId(), trainerId) || groupId == null || !seen.add(groupId)) continue;
            if (reportRepository.existsByGroupId(groupId)) continue;
            Group g = groupRepository.findById(groupId).orElse(null);
            if (g == null || !Objects.equals(g.getTrainerId(), trainerId)) continue;
            List<Session> sessions = sessions(g);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("groupId", groupId);
            m.put("groupName", g.getGroupName());
            m.put("courseTitle", courseRepository.findByCourseId(g.getCourseId()).map(Course::getTitle).orElse(null));
            m.put("lastSession", sessions.isEmpty() ? null : sessions.get(sessions.size() - 1).date());
            m.put("askedAt", asked.getCreatedAt());
            out.add(m);
        }
        out.sort(Comparator.comparing(m -> String.valueOf(m.get("askedAt"))));
        return out;
    }

    // ── Sending it ──────────────────────────────────────────────────────

    /** What the trainer sends. */
    public record LearnerAnswer(String enrollmentId, Integer sessionsAttended, String result, String note) {}

    public record NotHeld(String date, String time, String reason) {}

    public record Submission(List<LearnerAnswer> learners, Boolean allSessionsHeld, List<NotHeld> sessionsNotHeld,
                             String planCoverage, String planLeftOut, String levelFit, String prerequisites,
                             String comments, Boolean confirmed) {}

    /**
     * Saves the report, once. Every learner who joined must be answered for,
     * the sessions named as not held must be the group's own, and each
     * choice must be one the form offers. Refuses, with a reason the trainer
     * can read, anything else.
     */
    @Transactional
    public GroupReport submit(String groupId, String trainerId, Submission s) {
        Group g = groupRepository.findById(groupId).orElseThrow(() -> new IllegalArgumentException("Group not found."));
        if (!Objects.equals(g.getTrainerId(), trainerId)) {
            throw new org.springframework.security.access.AccessDeniedException("Not your group");
        }
        courseLifecycle.checkAndCompleteOne(g);
        if (!"completed".equalsIgnoreCase(g.getGroupStatus())) {
            throw new IllegalArgumentException("The report can be sent once the group's last session is over.");
        }
        if (reportRepository.existsByGroupId(groupId)) {
            throw new IllegalStateException("The report for this group has already been sent.");
        }
        if (s == null || !Boolean.TRUE.equals(s.confirmed())) {
            throw new IllegalArgumentException("Confirm that the report is accurate before sending it.");
        }

        List<Session> sessions = sessions(g);

        // Sessions first: the ones not held are not counted against learners.
        if (s.allSessionsHeld() == null) {
            throw new IllegalArgumentException("Say whether every session was held.");
        }
        List<NotHeld> notHeld = new ArrayList<>();
        if (!s.allSessionsHeld()) {
            Set<String> scheduled = sessions.stream().map(Session::key).collect(Collectors.toSet());
            Set<String> seen = new HashSet<>();
            for (NotHeld n : s.sessionsNotHeld() == null ? List.<NotHeld>of() : s.sessionsNotHeld()) {
                if (n == null || n.date() == null || n.time() == null) continue;
                String time = n.time().length() > 5 ? n.time().substring(0, 5) : n.time();
                String key = n.date() + "|" + time;
                if (!scheduled.contains(key)) {
                    throw new IllegalArgumentException("A session marked as not held is not in the group's schedule.");
                }
                if (!seen.add(key)) continue;
                String reason = n.reason() == null ? "" : n.reason().trim();
                if (reason.isEmpty()) throw new IllegalArgumentException("Say why each session was not held.");
                if (reason.length() > 150) throw new IllegalArgumentException("A reason is 150 characters at most.");
                notHeld.add(new NotHeld(n.date(), time, reason));
            }
            if (notHeld.isEmpty()) {
                throw new IllegalArgumentException("Choose the sessions that were not held.");
            }
        }
        int held = sessions.size() - notHeld.size();
        int needed = sessionsNeededToComplete(held);

        // Learners: exactly the group's, each once.
        Map<String, Enrollment> members = learners(g).stream()
                .collect(Collectors.toMap(Enrollment::getEnrollmentId, e -> e, (a, b) -> a, LinkedHashMap::new));
        List<LearnerAnswer> answers = s.learners() == null ? List.of() : s.learners();
        Map<String, LearnerAnswer> byEnrollment = new HashMap<>();
        for (LearnerAnswer a : answers) {
            if (a == null || a.enrollmentId() == null || !members.containsKey(a.enrollmentId())) {
                throw new IllegalArgumentException("A learner in the report is not in this group.");
            }
            if (byEnrollment.put(a.enrollmentId(), a) != null) {
                throw new IllegalArgumentException("A learner appears twice in the report.");
            }
            if (a.sessionsAttended() == null || a.sessionsAttended() < 0 || a.sessionsAttended() > held) {
                throw new IllegalArgumentException("Sessions attended must be between 0 and " + held
                        + ", the sessions held.");
            }
            if (a.result() == null || !RESULTS.contains(a.result())) {
                throw new IllegalArgumentException("Choose a result for every learner.");
            }
            if (GroupReportLearner.COMPLETED.equals(a.result()) && (held == 0 || a.sessionsAttended() < needed)) {
                throw new IllegalArgumentException("Completed needs at least " + needed + " of the " + held
                        + " sessions held (80%): that is what earns the attestation.");
            }
            if (a.note() != null && a.note().trim().length() > 200) {
                throw new IllegalArgumentException("A note about a learner is 200 characters at most.");
            }
        }
        if (byEnrollment.size() != members.size()) {
            throw new IllegalArgumentException("Every learner in the group needs an answer.");
        }

        // The course plan, the level, the prerequisites.
        if (s.planCoverage() == null || !COVERAGE.contains(s.planCoverage())) {
            throw new IllegalArgumentException("Say how much of the course plan you covered.");
        }
        String leftOut = trimToNull(s.planLeftOut());
        if (!GroupReport.ALL.equals(s.planCoverage())) {
            if (leftOut == null) throw new IllegalArgumentException("Say what was left out of the plan, and why.");
            if (leftOut.length() > 300) throw new IllegalArgumentException("What was left out is 300 characters at most.");
        } else {
            leftOut = null;
        }
        if (s.levelFit() == null || !LEVEL.contains(s.levelFit())) {
            throw new IllegalArgumentException("Say whether the course's level was right for the group.");
        }
        if (s.prerequisites() == null || !PREREQUISITES.contains(s.prerequisites())) {
            throw new IllegalArgumentException("Say whether the learners had the prerequisites.");
        }
        String comments = trimToNull(s.comments());
        if (comments != null && comments.length() > 1000) {
            throw new IllegalArgumentException("Comments are 1,000 characters at most.");
        }

        GroupReport report = new GroupReport();
        report.setReportId("GRR_" + UUID.randomUUID().toString().substring(0, 12).toUpperCase());
        report.setGroupId(g.getGroupId());
        report.setCourseId(g.getCourseId());
        report.setTrainerId(g.getTrainerId());
        report.setAllSessionsHeld(s.allSessionsHeld());
        report.setSessionsNotHeld(notHeld.isEmpty() ? null : json(notHeld));
        report.setPlanCoverage(s.planCoverage());
        report.setPlanLeftOut(leftOut);
        report.setLevelFit(s.levelFit());
        report.setPrerequisites(s.prerequisites());
        report.setComments(comments);
        report = reportRepository.save(report);

        for (Enrollment e : members.values()) {
            LearnerAnswer a = byEnrollment.get(e.getEnrollmentId());
            GroupReportLearner row = new GroupReportLearner();
            row.setReportLearnerId("GRL_" + UUID.randomUUID().toString().substring(0, 12).toUpperCase());
            row.setReportId(report.getReportId());
            row.setGroupId(g.getGroupId());
            row.setEnrollmentId(e.getEnrollmentId());
            row.setStudentId(e.getStudentId());
            row.setSessionsAttended(a.sessionsAttended());
            row.setResult(a.result());
            row.setNote(trimToNull(a.note()));
            learnerRepository.save(row);
            // Attendance is the learner's own to see; the note and result stay here.
            e.setSessionsAttended(a.sessionsAttended());
            enrollmentRepository.save(e);
        }

        events.publishEvent(new ReportSubmitted(report.getReportId()));
        return report;
    }

    /** An administrator's internal note on a report. */
    @Transactional
    public GroupReport setAdminNote(String reportId, String note) {
        GroupReport r = reportRepository.findById(reportId)
                .orElseThrow(() -> new IllegalArgumentException("Report not found."));
        String n = trimToNull(note);
        if (n != null && n.length() > 2000) throw new IllegalArgumentException("A note is 2,000 characters at most.");
        r.setAdminNote(n);
        r.setAdminNoteAt(n == null ? null : LocalDateTime.now());
        return reportRepository.save(r);
    }

    // ── Attestations ────────────────────────────────────────────────────

    /** The learner's report row, when the trainer marked them COMPLETED. */
    public Optional<GroupReportLearner> completed(String enrollmentId) {
        return learnerRepository.findByEnrollmentId(enrollmentId)
                .filter(r -> GroupReportLearner.COMPLETED.equals(r.getResult()));
    }

    /** Which of these enrollments have an attestation. */
    public Set<String> withAttestation(Collection<String> enrollmentIds) {
        if (enrollmentIds.isEmpty()) return Set.of();
        return learnerRepository.findByEnrollmentIdIn(enrollmentIds).stream()
                .filter(r -> GroupReportLearner.COMPLETED.equals(r.getResult()))
                .map(GroupReportLearner::getEnrollmentId)
                .collect(Collectors.toSet());
    }

    /** The attestation's PDF and filename, or empty when this enrollment has none. */
    public Optional<Attestation> attestation(String enrollmentId) {
        GroupReportLearner row = completed(enrollmentId).orElse(null);
        if (row == null) return Optional.empty();
        Group g = groupRepository.findById(row.getGroupId()).orElse(null);
        Student s = studentRepository.findByStudentId(row.getStudentId()).orElse(null);
        Course c = g == null ? null : courseRepository.findByCourseId(g.getCourseId()).orElse(null);
        if (g == null || s == null || c == null) return Optional.empty();
        List<Session> sessions = sessions(g);
        LocalDate from = sessions.isEmpty() ? null : LocalDate.parse(sessions.get(0).date());
        LocalDate to = sessions.isEmpty() ? null : LocalDate.parse(sessions.get(sessions.size() - 1).date());
        byte[] pdf = attestationService.render(s.getName(), c.getTitle(), from, to);
        return Optional.of(new Attestation(pdf, attestationService.filenameFor(c.getTitle()),
                s.getName(), s.getEmail(), c.getTitle()));
    }

    public record Attestation(byte[] pdf, String filename, String learnerName, String learnerEmail, String courseTitle) {}

    /**
     * After the report is committed: congratulate each learner who completed,
     * in the app and by push, and email them their attestation. Never throws
     * — the report is sent whatever a mail server says, and the attestation
     * stays downloadable in the app.
     */
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void deliverAttestations(ReportSubmitted event) {
        try {
            self.notifyCompleted(event.reportId());
        } catch (Exception e) {
            log.warn("Completion notifications for report {} failed: {}", event.reportId(), e.getMessage());
        }
        for (GroupReportLearner row : learnerRepository.findByReportId(event.reportId())) {
            if (!GroupReportLearner.COMPLETED.equals(row.getResult()) || row.getAttestationEmailedAt() != null) continue;
            try {
                Attestation a = attestation(row.getEnrollmentId()).orElse(null);
                if (a == null || a.learnerEmail() == null || a.learnerEmail().isBlank()) continue;
                emailService.sendAttestationEmail(a.learnerEmail(), a.learnerName(), a.courseTitle(), a.pdf(), a.filename());
                row.setAttestationEmailedAt(LocalDateTime.now());
                learnerRepository.save(row);
            } catch (Exception e) {
                log.warn("Attestation not emailed for {}: {}", row.getEnrollmentId(), e.getMessage());
            }
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void notifyCompleted(String reportId) {
        GroupReport report = reportRepository.findById(reportId).orElse(null);
        if (report == null) return;
        String title = courseRepository.findByCourseId(report.getCourseId()).map(Course::getTitle).orElse("your course");
        for (GroupReportLearner row : learnerRepository.findByReportId(reportId)) {
            if (!GroupReportLearner.COMPLETED.equals(row.getResult())) continue;
            if (notificationRepository.existsByUserIdAndNotificationTypeAndRelatedEntityId(
                    row.getStudentId(), COURSE_COMPLETED, report.getGroupId())) continue;
            notificationService.sendCourseCompleted(row.getStudentId(), report.getGroupId(), row.getEnrollmentId(), title);
        }
    }

    // ── Asking for it, and reminding ────────────────────────────────────

    /** When a group's last session is over: ask its trainer for the report. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onGroupCompleted(CourseLifecycleService.GroupCompleted event) {
        try {
            requestReport(event.groupId());
        } catch (Exception e) {
            log.warn("Could not ask for the report on {}: {}", event.groupId(), e.getMessage());
        }
    }

    /** Asks the trainer once; a group with no learner who joined needs no report. */
    public void requestReport(String groupId) {
        Group g = groupRepository.findById(groupId).orElse(null);
        if (g == null || g.getTrainerId() == null || reportRepository.existsByGroupId(groupId)) return;
        if (learners(g).isEmpty()) return;
        if (notificationRepository.existsByUserIdAndNotificationTypeAndRelatedEntityId(g.getTrainerId(), REPORT_REQUEST, groupId)) return;
        String title = courseRepository.findByCourseId(g.getCourseId()).map(Course::getTitle).orElse(g.getGroupName());
        notificationService.sendReportRequest(g.getTrainerId(), groupId, title, false);
    }

    /** Every 15 minutes, like the other group jobs. */
    @Scheduled(cron = "0 */15 * * * *")
    public void scheduledSweep() {
        sweep(LocalDateTime.now());
    }

    /**
     * Reminds trainers whose report is two days late and tells administrators
     * at five. Only groups whose report was asked for: groups that finished
     * before reports existed are left alone.
     */
    public void sweep(LocalDateTime now) {
        for (Notification asked : notificationRepository.findByNotificationType(REPORT_REQUEST)) {
            try {
                self.remind(asked.getRelatedEntityId(), asked.getUserId(), asked.getCreatedAt(), now);
            } catch (Exception e) {
                log.warn("Report reminder for {} failed: {}", asked.getRelatedEntityId(), e.getMessage());
            }
        }
    }

    @Transactional
    public void remind(String groupId, String trainerId, LocalDateTime askedAt, LocalDateTime now) {
        if (groupId == null || askedAt == null || reportRepository.existsByGroupId(groupId)) return;
        Group g = groupRepository.findById(groupId).orElse(null);
        if (g == null) return;
        String title = courseRepository.findByCourseId(g.getCourseId()).map(Course::getTitle).orElse(g.getGroupName());
        Duration waiting = Duration.between(askedAt, now);
        if (waiting.compareTo(REPORT_REMINDER_AFTER) >= 0
                && !notificationRepository.existsByUserIdAndNotificationTypeAndRelatedEntityId(trainerId, REPORT_REMINDER, groupId)) {
            notificationService.sendReportRequest(trainerId, groupId, title, true);
        }
        if (waiting.compareTo(REPORT_OVERDUE_AFTER) >= 0) {
            for (Admin a : adminRepository.findAll()) {
                if (notificationRepository.existsByUserIdAndNotificationTypeAndRelatedEntityId(a.getAdminId(), REPORT_OVERDUE, groupId)) {
                    continue;
                }
                String subject = "Report missing: " + title;
                String body = "The trainer has not sent the end-of-course report for '" + g.getGroupName()
                        + "' five days after its last session. Learners who completed get their attestation "
                        + "only once it is sent. You can contact the trainer from the Groups page.";
                notificationService.sendAdminGroupAlert(a.getAdminId(), REPORT_OVERDUE, groupId, subject, body, title);
                if (a.getEmail() != null) {
                    emailService.sendAdminGroupAlert(a.getEmail(), a.getName(), subject, body, appUrl + "/dashboard/groups");
                }
            }
        }
    }

    // ── For trainer pay ─────────────────────────────────────────────────

    /** "date|HH:mm" of every session the group's report says was not held. */
    public Set<String> notHeldKeys(String groupId) {
        return reportRepository.findByGroupId(groupId)
                .map(r -> notHeld(r).stream().map(n -> n.date() + "|" + n.time()).collect(Collectors.toSet()))
                .orElse(Set.of());
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private List<NotHeld> notHeld(GroupReport r) {
        if (r.getSessionsNotHeld() == null || r.getSessionsNotHeld().isBlank()) return List.of();
        try {
            return objectMapper.readValue(r.getSessionsNotHeld(), new TypeReference<List<NotHeld>>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    private String json(Object o) {
        try {
            return objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
