package com.byb.backend.controller;

import com.byb.backend.dto.course.CreateCourseRequest;
import com.byb.backend.dto.course.CourseResponse;
import com.byb.backend.service.CourseService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/courses")
@RequiredArgsConstructor
@Tag(name = "Courses", description = "Course management endpoints")
@SecurityRequirement(name = "bearerAuth")
public class CourseController {

    private final CourseService courseService;

    // ─────────────────────────────────────────────────────────────────
    // NOTE: Trainers can NO LONGER create or edit course content.
    // The admin owns all course content via CourseTemplate; offerings are
    // auto-created when admin assigns a template to a trainer's roster.
    // The create/update endpoints below are kept disabled (410 Gone) so
    // any stale mobile clients fail fast with a clear message instead of
    // silently mutating data.
    // ─────────────────────────────────────────────────────────────────

    @PostMapping
    @Operation(summary = "DEPRECATED — admin now creates courses via /admin/course-templates")
    public ResponseEntity<?> createCourse(
            @RequestParam(required = false) String trainerId,
            @RequestBody(required = false) CreateCourseRequest request) {
        return ResponseEntity.status(410).body(java.util.Map.of(
                "error", "Trainers can no longer create courses. Contact the admin to publish a new course."
        ));
    }

    @PutMapping("/{courseId}")
    @Operation(summary = "DEPRECATED — course content is now managed by admin via CourseTemplate")
    public ResponseEntity<?> updateCourse(
            @PathVariable String courseId,
            @RequestParam(required = false) String trainerId,
            @RequestBody(required = false) CreateCourseRequest request) {
        return ResponseEntity.status(410).body(java.util.Map.of(
                "error", "Course content is admin-managed. Ask the admin to edit the template."
        ));
    }

    @PostMapping("/{courseId}/publish")
    @Operation(summary = "DEPRECATED — drafts removed; every offering is created live")
    public ResponseEntity<?> publishCourse(
            @PathVariable String courseId,
            @RequestParam(required = false) String trainerId) {
        // Drafts no longer exist — assigning a template to a trainer now
        // immediately publishes the offering. This endpoint is kept for any
        // stale mobile client that still calls it, but it's a no-op.
        return ResponseEntity.status(410).body(java.util.Map.of(
                "error", "Drafts have been removed. Courses are published the moment the admin assigns them."
        ));
    }

    @GetMapping
    @Operation(summary = "Get all published courses")
    public ResponseEntity<List<CourseResponse>> getAllCourses() {
        List<CourseResponse> courses = courseService.getAllPublishedCourses();
        return ResponseEntity.ok(courses);
    }

    @GetMapping("/{courseId}")
    @Operation(summary = "Get course by ID")
    public ResponseEntity<CourseResponse> getCourse(@PathVariable String courseId) {
        CourseResponse course = courseService.getCourseById(courseId);
        return ResponseEntity.ok(course);
    }

    @GetMapping("/trainer/{trainerId}")
    @Operation(summary = "Get courses by trainer")
    public ResponseEntity<List<CourseResponse>> getCoursesByTrainer(@PathVariable String trainerId) {
        List<CourseResponse> courses = courseService.getCoursesByTrainer(trainerId);
        return ResponseEntity.ok(courses);
    }
}