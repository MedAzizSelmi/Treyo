package com.byb.backend.controller;

import com.byb.backend.model.Enrollment;
import com.byb.backend.service.EnrollmentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/enrollments")
@RequiredArgsConstructor
@Tag(name = "Enrollments", description = "Student enrollment management")
@SecurityRequirement(name = "bearerAuth")
public class EnrollmentController {

    private final EnrollmentService enrollmentService;

    @PostMapping("/confirm")
    @Operation(summary = "Student confirms enrollment in course/group")
    public ResponseEntity<Enrollment> confirmEnrollment(
            @RequestParam String studentId,
            @RequestParam String courseId,
            @RequestParam(required = false) String groupId) {
        Enrollment enrollment = enrollmentService.confirmEnrollment(studentId, courseId, groupId);
        return ResponseEntity.ok(enrollment);
    }

    @GetMapping("/student/{studentId}")
    @Operation(summary = "Get all enrollments for student")
    public ResponseEntity<List<Enrollment>> getStudentEnrollments(@PathVariable String studentId) {
        List<Enrollment> enrollments = enrollmentService.getStudentEnrollments(studentId);
        return ResponseEntity.ok(enrollments);
    }

    @GetMapping("/student/{studentId}/active")
    @Operation(summary = "Get active enrollments for student")
    public ResponseEntity<List<Enrollment>> getActiveEnrollments(@PathVariable String studentId) {
        List<Enrollment> enrollments = enrollmentService.getActiveEnrollments(studentId);
        return ResponseEntity.ok(enrollments);
    }

    @PutMapping("/{enrollmentId}/start")
    @Operation(summary = "Start an enrollment (mark as active)")
    public ResponseEntity<Enrollment> startEnrollment(@PathVariable String enrollmentId) {
        Enrollment enrollment = enrollmentService.startEnrollment(enrollmentId);
        return ResponseEntity.ok(enrollment);
    }

    @PutMapping("/{enrollmentId}/complete")
    @Operation(summary = "Complete an enrollment")
    public ResponseEntity<Enrollment> completeEnrollment(@PathVariable String enrollmentId) {
        Enrollment enrollment = enrollmentService.completeEnrollment(enrollmentId);
        return ResponseEntity.ok(enrollment);
    }
}