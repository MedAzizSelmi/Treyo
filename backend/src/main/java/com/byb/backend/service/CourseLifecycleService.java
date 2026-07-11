package com.byb.backend.service;

import com.byb.backend.model.Course;
import com.byb.backend.model.Enrollment;
import com.byb.backend.model.Group;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.EnrollmentRepository;
import com.byb.backend.repository.GroupRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * Drives the lifecycle of a group from "active" through to "completed".
 *
 * Two responsibilities:
 *   1. A scheduled job that scans active groups every 15 minutes,
 *      checks each one's saved session schedule, and flips the group
 *      (and its enrollments) to "completed" once every session has
 *      ended. This is what triggers the student's "Rate the course"
 *      prompt — the home screen looks for enrollments whose status
 *      is "completed" and surfaces the review modal.
 *   2. {@link #computeProgress} — a derived percentage + counts that
 *      the mobile UI shows as a progress bar. Computed on demand from
 *      the session JSON, so there's no extra column to keep in sync.
 *
 * "Completion" cascades the right way:
 *   - Group.groupStatus = "completed", isActive = false
 *   - Enrollment.enrollmentStatus = "completed", completedAt = now
 *     for every enrollment in the group
 *
 * Side effects students will see after this fires:
 *   - The chat for the group rejects new messages (MessageService).
 *   - The conversation drops out of the active list on the messages
 *     tab (filtered by Group.isActive on the client).
 *   - The course-detail enrollment status flips to "completed".
 *   - On next home load, the review prompt appears.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CourseLifecycleService {

    private final GroupRepository groupRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final CourseRepository courseRepository;
    private final ObjectMapper objectMapper;

    /**
     * Mark a single group as completed if all its sessions have ended.
     * Called inline from any endpoint that surfaces group/chat state so
     * the user never has to wait up to 15 minutes for the cron to
     * catch up. Idempotent and cheap — short-circuits if the group
     * is already inactive or has unfinished sessions.
     */
    @Transactional
    public boolean checkAndCompleteOne(Group g) {
        if (g == null) return false;
        if (Boolean.FALSE.equals(g.getIsActive())) return false;
        String status = g.getGroupStatus();
        if (status != null && (status.equalsIgnoreCase("completed") || status.equalsIgnoreCase("cancelled"))) {
            return false;
        }
        if (g.getMeetingSchedule() == null || g.getMeetingSchedule().isBlank()) return false;

        Progress p = computeProgress(g);
        if (p.totalSessions > 0 && p.sessionsCompleted >= p.totalSessions) {
            markCompleted(g, LocalDateTime.now());
            log.info("Lifecycle: group {} completed on-demand", g.getGroupId());
            return true;
        }
        return false;
    }

    /** Catch-up pass at app boot — if the server was down when the
     *  cron should have fired, this picks up the slack so users never
     *  open the app and see a "still active" group that should have
     *  been closed hours ago. */
    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void runOnStartup() {
        try { completeFinishedGroups(); }
        catch (Exception e) { log.warn("Startup lifecycle scan failed: {}", e.getMessage()); }
    }

    /** Scheduled scan — runs every 15 minutes. Cheap query (active
     *  groups with a schedule), so even at scale this is fine. The
     *  cron expression: second minute hour day month dow. Also
     *  invoked at app startup via {@link #runOnStartup}. */
    @Scheduled(cron = "0 */15 * * * *")
    @Transactional
    public void completeFinishedGroups() {
        LocalDateTime now = LocalDateTime.now();
        List<Group> candidates = groupRepository.findAll().stream()
                .filter(g -> Boolean.TRUE.equals(g.getIsActive()))
                .filter(g -> {
                    String s = g.getGroupStatus();
                    return s == null
                            || s.equalsIgnoreCase("active")
                            || s.equalsIgnoreCase("ready");
                })
                .filter(g -> g.getMeetingSchedule() != null && !g.getMeetingSchedule().isBlank())
                .toList();

        int completed = 0;
        for (Group g : candidates) {
            Progress p = computeProgress(g);
            if (p.totalSessions > 0 && p.sessionsCompleted >= p.totalSessions) {
                markCompleted(g, now);
                completed++;
            }
        }
        if (completed > 0) {
            log.info("Lifecycle: marked {} group(s) as completed", completed);
        }
    }

    /** Mark a single group + its enrollments as completed. Idempotent —
     *  re-running has no effect on already-completed enrollments. Also
     *  decrements the parent course's currentGroupsCount so the
     *  trainer's My Courses card shows the live "active groups" total
     *  instead of the historical lifetime count. */
    private void markCompleted(Group g, LocalDateTime when) {
        g.setGroupStatus("completed");
        g.setIsActive(false);
        groupRepository.save(g);

        List<Enrollment> enrollments = enrollmentRepository.findByGroupId(g.getGroupId());
        for (Enrollment e : enrollments) {
            String status = e.getEnrollmentStatus();
            if (status != null && status.equalsIgnoreCase("completed")) continue;
            e.setEnrollmentStatus("completed");
            e.setCompletedAt(when);
            enrollmentRepository.save(e);
        }

        // Live-active-groups counter on the course. Bumped on
        // AdminGroupFormationService.formGroup, decremented here.
        // Clamped at 0 so a stale bump can't drive it negative.
        if (g.getCourseId() != null) {
            courseRepository.findByCourseId(g.getCourseId()).ifPresent(course -> {
                Integer current = course.getCurrentGroupsCount();
                int next = (current == null ? 0 : current) - 1;
                course.setCurrentGroupsCount(Math.max(0, next));
                courseRepository.save(course);
            });
        }
    }

    /**
     * Parse the group's saved schedule and report how many sessions
     * have already ended. Used by the mobile progress bar and by the
     * completion check above.
     *
     * Session end is computed as start + hours (default 1 hour if
     * hours isn't recorded). Sessions without parseable dates are
     * silently skipped — they shouldn't count against either side.
     */
    public Progress computeProgress(Group g) {
        Progress out = new Progress();
        out.groupStatus = g.getGroupStatus();

        if (g.getMeetingSchedule() == null || g.getMeetingSchedule().isBlank()) {
            return out;
        }
        try {
            Map<String, Object> parsed = objectMapper.readValue(
                    g.getMeetingSchedule(),
                    new TypeReference<Map<String, Object>>() {}
            );
            Object sessionsRaw = parsed.get("sessions");
            if (!(sessionsRaw instanceof List<?> sessions)) return out;

            LocalDateTime now = LocalDateTime.now();
            for (Object item : sessions) {
                if (!(item instanceof Map<?, ?> m)) continue;
                String date = stringOrNull(m.get("date"));
                String time = stringOrNull(m.get("time"));
                if (date == null || time == null) continue;

                String timeNormalized = time.length() == 5 ? time + ":00" : time;
                LocalDateTime start;
                try {
                    start = LocalDateTime.parse(date + "T" + timeNormalized);
                } catch (Exception ex) {
                    continue;
                }
                double hours = 1.0;
                Object h = m.get("hours");
                if (h instanceof Number n) hours = n.doubleValue();
                LocalDateTime end = start.plusMinutes((long) (hours * 60));

                out.totalSessions++;
                if (end.isBefore(now) || end.isEqual(now)) {
                    out.sessionsCompleted++;
                }
            }
        } catch (Exception e) {
            // Malformed schedule — treat as no progress rather than
            // erroring the whole request.
            return out;
        }

        if (out.totalSessions > 0) {
            out.percentage = (int) Math.round(100.0 * out.sessionsCompleted / out.totalSessions);
        }
        return out;
    }

    private static String stringOrNull(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    /** Plain DTO for the mobile API. Includes both raw counts and the
     *  pre-rounded percentage so the client just renders. */
    public static class Progress {
        public int sessionsCompleted = 0;
        public int totalSessions = 0;
        public int percentage = 0;
        public String groupStatus;

        public Map<String, Object> toMap() {
            return Map.of(
                    "sessionsCompleted", sessionsCompleted,
                    "totalSessions", totalSessions,
                    "percentage", percentage,
                    "groupStatus", groupStatus == null ? "active" : groupStatus,
                    "isCompleted", percentage >= 100 && totalSessions > 0
            );
        }
    }
}
