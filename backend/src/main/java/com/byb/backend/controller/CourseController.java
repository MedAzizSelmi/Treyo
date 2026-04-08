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

    @PostMapping
    @Operation(summary = "Create a new course (Trainer only)")
    public ResponseEntity<CourseResponse> createCourse(
            @RequestParam String trainerId,
            @Valid @RequestBody CreateCourseRequest request) {
        CourseResponse course = courseService.createCourse(trainerId, request);
        return ResponseEntity.ok(course);
    }

    @PostMapping("/{courseId}/publish")
    @Operation(summary = "Publish a course (Trainer only)")
    public ResponseEntity<CourseResponse> publishCourse(
            @PathVariable String courseId,
            @RequestParam String trainerId) {
        CourseResponse course = courseService.publishCourse(courseId, trainerId);
        return ResponseEntity.ok(course);
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