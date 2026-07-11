package com.byb.backend.controller;

import com.byb.backend.model.Course;
import com.byb.backend.model.Enrollment;
import com.byb.backend.model.Group;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.EnrollmentRepository;
import com.byb.backend.repository.GroupRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/groups")
@RequiredArgsConstructor
@Tag(name = "Groups", description = "Group / session endpoints")
@SecurityRequirement(name = "bearerAuth")
public class GroupController {

    private final GroupRepository groupRepository;
    private final CourseRepository courseRepository;
    private final EnrollmentRepository enrollmentRepository;
    // Spring auto-configures this — used to (de)serialize the session
    // schedule that gets stored as JSON in Group.meetingSchedule.
    private final ObjectMapper objectMapper;
    // Used to attach session-progress metadata to single-group responses.
    private final com.byb.backend.service.CourseLifecycleService courseLifecycleService;

    /**
     * Upcoming sessions for the trainer's home dashboard.
     * Returns groups whose startDate is null (just-formed, not scheduled yet)
     * or in the future, sorted earliest-first, enriched with the course title.
     * Cancelled/completed groups are excluded.
     */
    @GetMapping("/course/{courseId}")
    @Operation(summary = "Get all groups for a course (active only)")
    public ResponseEntity<List<Map<String, Object>>> getGroupsByCourse(@PathVariable String courseId) {
        List<Group> groups = groupRepository.findByCourseId(courseId);
        // Inline lifecycle pass first — finished groups flip to
        // "completed" before we filter. Then drop completed +
        // cancelled groups so the trainer's course-detail screen
        // only shows what's still running.
        groups.forEach(courseLifecycleService::checkAndCompleteOne);
        groups = groups.stream()
                .filter(g -> {
                    if (Boolean.FALSE.equals(g.getIsActive())) return false;
                    String s = g.getGroupStatus();
                    return s == null
                            || (!s.equalsIgnoreCase("completed") && !s.equalsIgnoreCase("cancelled"));
                })
                .toList();
        return ResponseEntity.ok(groups.stream().map(g -> {
            Map<String, Object> m = new HashMap<>();
            m.put("groupId", g.getGroupId());
            m.put("groupName", g.getGroupName());
            m.put("groupStatus", g.getGroupStatus());
            m.put("currentSize", g.getCurrentSize());
            m.put("maxSize", g.getMaxSize());
            m.put("startDate", g.getStartDate());
            m.put("endDate", g.getEndDate());
            m.put("isOnline", g.getIsOnline());
            m.put("meetingLocation", g.getMeetingLocation());
            return m;
        }).collect(Collectors.toList()));
    }

    @GetMapping("/trainer/{trainerId}/upcoming")
    @Operation(summary = "Upcoming sessions for a trainer (forming + active groups starting now or later)")
    public ResponseEntity<List<Map<String, Object>>> getUpcomingSessions(@PathVariable String trainerId) {
        LocalDateTime now = LocalDateTime.now();

        // Inline lifecycle pass — same idea as the conversations and
        // course-detail endpoints: catch finished groups before we
        // build the response so the trainer doesn't see a "still
        // running" badge on a course they've already wrapped up.
        groupRepository.findByTrainerId(trainerId)
                .forEach(courseLifecycleService::checkAndCompleteOne);

        List<Group> groups = groupRepository.findByTrainerId(trainerId).stream()
                .filter(g -> Boolean.TRUE.equals(g.getIsActive()))
                .filter(g -> {
                    String status = g.getGroupStatus();
                    return status == null
                            || status.equalsIgnoreCase("forming")
                            || status.equalsIgnoreCase("ready")
                            || status.equalsIgnoreCase("active");
                })
                .filter(g -> g.getStartDate() == null || !g.getStartDate().isBefore(now))
                .sorted(Comparator.comparing(
                        Group::getStartDate,
                        Comparator.nullsLast(Comparator.naturalOrder())
                ))
                .limit(10)
                .collect(Collectors.toList());

        return ResponseEntity.ok(groups.stream().map(g -> {
            Map<String, Object> m = new HashMap<>();
            m.put("groupId", g.getGroupId());
            m.put("groupName", g.getGroupName());
            m.put("courseId", g.getCourseId());
            m.put("trainerId", g.getTrainerId());
            m.put("currentSize", g.getCurrentSize());
            m.put("maxSize", g.getMaxSize());
            m.put("groupStatus", g.getGroupStatus());
            m.put("startDate", g.getStartDate());
            m.put("endDate", g.getEndDate());
            m.put("meetingSchedule", g.getMeetingSchedule());
            m.put("meetingLink", g.getMeetingLink());
            m.put("meetingLocation", g.getMeetingLocation());
            m.put("isOnline", g.getIsOnline());

            // Enrich with course title so the UI doesn't need a second round-trip
            Optional<Course> course = courseRepository.findByCourseId(g.getCourseId());
            m.put("courseTitle", course.map(Course::getTitle).orElse(null));
            m.put("courseDomain", course.map(Course::getDomain).orElse(null));

            return m;
        }).collect(Collectors.toList()));
    }

    /**
     * Single group + the bits of its course the scheduling screen needs
     * (title + total durationHours, used to compute how many sessions
     * the trainer must schedule).
     */
    @GetMapping("/{groupId}")
    @Operation(summary = "Get one group with course info for the scheduling screen")
    public ResponseEntity<Map<String, Object>> getGroup(@PathVariable String groupId) {
        Group g = groupRepository.findById(groupId).orElse(null);
        if (g == null) return ResponseEntity.notFound().build();

        Course course = courseRepository.findByCourseId(g.getCourseId()).orElse(null);
        Map<String, Object> m = new HashMap<>();
        m.put("groupId", g.getGroupId());
        m.put("groupName", g.getGroupName());
        m.put("courseId", g.getCourseId());
        m.put("groupStatus", g.getGroupStatus());
        m.put("startDate", g.getStartDate());
        m.put("endDate", g.getEndDate());
        m.put("isOnline", g.getIsOnline());
        // Raw JSON string of the saved schedule (null if never scheduled).
        m.put("meetingSchedule", g.getMeetingSchedule());
        m.put("courseTitle", course != null ? course.getTitle() : null);
        m.put("courseDurationHours", course != null ? course.getDurationHours() : null);
        // Derived progress — sessionsCompleted / total / percentage /
        // groupStatus / isCompleted. Lets the mobile UI render a
        // progress bar without re-parsing the JSON itself.
        m.put("progress", courseLifecycleService.computeProgress(g).toMap());
        return ResponseEntity.ok(m);
    }

    /**
     * Standalone progress endpoint — same payload as the `progress`
     * field on getGroup, but cheap to poll on its own from screens
     * that don't need the full group payload (e.g. the student's
     * course-detail Schedule section).
     */
    @GetMapping("/{groupId}/progress")
    @Operation(summary = "Session-completion progress for a group")
    public ResponseEntity<Map<String, Object>> getProgress(@PathVariable String groupId) {
        Group g = groupRepository.findById(groupId).orElse(null);
        if (g == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(courseLifecycleService.computeProgress(g).toMap());
    }

    /**
     * Save the trainer's session schedule for a group.
     *
     * Body shape:
     *   {
     *     "hoursPerSession": 2,
     *     "sessions": [ { "date": "2026-06-02", "time": "18:00" }, ... ]
     *   }
     *
     * The whole payload is stored verbatim as JSON in Group.meetingSchedule.
     * We also derive startDate / endDate from the earliest / latest session
     * so the trainer's "Upcoming Sessions" list and any calendar views can
     * sort and display without re-parsing the JSON.
     */
    @PutMapping("/{groupId}/schedule")
    @Operation(summary = "Save the session schedule for a group")
    public ResponseEntity<?> saveSchedule(
            @PathVariable String groupId,
            @RequestBody Map<String, Object> body) {
        Group g = groupRepository.findById(groupId).orElse(null);
        if (g == null) return ResponseEntity.notFound().build();

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> sessions =
                (List<Map<String, Object>>) body.get("sessions");
        if (sessions == null || sessions.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "At least one session is required"));
        }

        // Parse each session's date + time into a LocalDateTime so we can
        // find the schedule's span. time may arrive as "HH:mm" or "HH:mm:ss".
        LocalDateTime earliest = null;
        LocalDateTime latest = null;
        try {
            for (Map<String, Object> s : sessions) {
                String date = String.valueOf(s.get("date"));      // 2026-06-02
                String time = String.valueOf(s.get("time"));      // 18:00
                if (time.length() == 5) time = time + ":00";       // -> 18:00:00
                LocalDateTime dt = LocalDateTime.parse(date + "T" + time);
                if (earliest == null || dt.isBefore(earliest)) earliest = dt;
                if (latest == null || dt.isAfter(latest)) latest = dt;
            }
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Invalid session date/time: " + e.getMessage()));
        }

        try {
            g.setMeetingSchedule(objectMapper.writeValueAsString(body));
        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Could not save schedule"));
        }
        g.setStartDate(earliest);
        g.setEndDate(latest);
        groupRepository.save(g);

        return ResponseEntity.ok(Map.of(
                "status", "saved",
                "sessionCount", sessions.size(),
                "startDate", earliest,
                "endDate", latest
        ));
    }

    /**
     * Flat list of every upcoming session across all the groups the
     * student is enrolled in. Powers:
     *   - the "My Schedule" screen
     *   - the "Upcoming Sessions" strip on the student home
     *   - the schedule section on course-detail (filtered by courseId)
     *
     * Each entry has both the course + group context and the parsed
     * session fields so the client can render without further lookups.
     */
    @GetMapping("/student/{studentId}/sessions")
    @Operation(summary = "Upcoming scheduled sessions for a student across all enrolled groups")
    public ResponseEntity<List<Map<String, Object>>> getStudentSessions(@PathVariable String studentId) {
        LocalDateTime now = LocalDateTime.now();
        List<Map<String, Object>> out = new ArrayList<>();

        List<Enrollment> enrollments = enrollmentRepository.findByStudentId(studentId);
        for (Enrollment e : enrollments) {
            String groupId = e.getGroupId();
            if (groupId == null || groupId.isBlank()) continue;

            Group g = groupRepository.findById(groupId).orElse(null);
            if (g == null) continue;

            String scheduleJson = g.getMeetingSchedule();
            if (scheduleJson == null || scheduleJson.isBlank()) continue;

            Map<String, Object> parsed;
            try {
                parsed = objectMapper.readValue(scheduleJson, new TypeReference<Map<String, Object>>() {});
            } catch (Exception ex) {
                continue; // skip malformed entries rather than fail the whole call
            }

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> sessions = (List<Map<String, Object>>) parsed.get("sessions");
            if (sessions == null || sessions.isEmpty()) continue;

            Course course = courseRepository.findByCourseId(g.getCourseId()).orElse(null);

            for (Map<String, Object> s : sessions) {
                String date = s.get("date") == null ? null : String.valueOf(s.get("date"));
                String time = s.get("time") == null ? null : String.valueOf(s.get("time"));
                if (date == null || time == null) continue;

                String timeNormalized = time.length() == 5 ? time + ":00" : time;
                LocalDateTime dt;
                try {
                    dt = LocalDateTime.parse(date + "T" + timeNormalized);
                } catch (Exception ex) {
                    continue;
                }
                if (dt.isBefore(now)) continue; // future only

                Object hoursObj = s.get("hours");
                Number hours = hoursObj instanceof Number ? (Number) hoursObj : null;

                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("courseId", g.getCourseId());
                entry.put("courseTitle", course != null ? course.getTitle() : null);
                entry.put("courseDomain", course != null ? course.getDomain() : null);
                entry.put("groupId", g.getGroupId());
                entry.put("groupName", g.getGroupName());
                entry.put("date", date);
                entry.put("time", time);
                entry.put("hours", hours);
                entry.put("datetime", dt);
                entry.put("isOnline", g.getIsOnline());
                entry.put("meetingLocation", g.getMeetingLocation());
                entry.put("meetingLink", g.getMeetingLink());
                out.add(entry);
            }
        }

        out.sort(Comparator.comparing(
                m -> (LocalDateTime) m.get("datetime"),
                Comparator.nullsLast(Comparator.naturalOrder())
        ));

        return ResponseEntity.ok(out);
    }
}
