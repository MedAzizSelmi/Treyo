package com.byb.backend.controller;

import com.byb.backend.model.Course;
import com.byb.backend.model.Group;
import com.byb.backend.repository.CourseRepository;
import com.byb.backend.repository.GroupRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.HashMap;
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

    /**
     * Upcoming sessions for the trainer's home dashboard.
     * Returns groups whose startDate is null (just-formed, not scheduled yet)
     * or in the future, sorted earliest-first, enriched with the course title.
     * Cancelled/completed groups are excluded.
     */
    @GetMapping("/course/{courseId}")
    @Operation(summary = "Get all groups for a course")
    public ResponseEntity<List<Map<String, Object>>> getGroupsByCourse(@PathVariable String courseId) {
        List<Group> groups = groupRepository.findByCourseId(courseId);
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
}
