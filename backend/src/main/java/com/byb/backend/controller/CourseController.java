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
import java.util.Map;

@RestController
@RequestMapping("/api/courses")
@RequiredArgsConstructor
@Tag(name = "Courses", description = "Course management endpoints")
@SecurityRequirement(name = "bearerAuth")
public class CourseController {

    private final CourseService courseService;

    // ─────────────────────────────────────────────────────────────────
    // NEW FLOW (v2 — replaces admin-owned CourseTemplate):
    //   1. Admin creates modules (categories).
    //   2. Trainer POSTs to /api/courses with a moduleId + fields +
    //      a materialUrl pointing at their uploaded PDF/PPT. The row
    //      starts as approvalStatus = PENDING and is invisible to
    //      students.
    //   3. Admin reviews via /api/admin/courses/pending, calls
    //      /approve or /reject. Approved courses go live; rejected
    //      courses stay hidden and the trainer sees the reason.
    //   4. Emails fire on both verdicts.
    // ─────────────────────────────────────────────────────────────────

    @PostMapping
    @Operation(summary = "Trainer submits a new course for admin review")
    public ResponseEntity<?> createCourse(
            @RequestParam String trainerId,
            @Valid @RequestBody CreateCourseRequest request) {
        try {
            CourseResponse course = courseService.createTrainerCourse(trainerId, request);
            return ResponseEntity.ok(course);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{courseId}")
    @Operation(summary = "Trainer edits their pending course (only while PENDING or REJECTED)")
    public ResponseEntity<?> updateCourse(
            @PathVariable String courseId,
            @RequestParam String trainerId,
            @Valid @RequestBody CreateCourseRequest request) {
        try {
            CourseResponse course = courseService.updateTrainerCourse(courseId, trainerId, request);
            return ResponseEntity.ok(course);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{courseId}/publish")
    @Operation(summary = "DEPRECATED — courses are published by admin approval")
    public ResponseEntity<?> publishCourse(
            @PathVariable String courseId,
            @RequestParam(required = false) String trainerId) {
        return ResponseEntity.status(410).body(java.util.Map.of(
                "error", "Publishing is handled by admin approval — submit the course via POST /api/courses."
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