package com.byb.backend.controller;

import com.byb.backend.model.Enrollment;
import com.byb.backend.repository.EnrollmentRepository;
import com.byb.backend.repository.StudentRepository;
import com.byb.backend.service.EnrollmentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/enrollments")
@RequiredArgsConstructor
@Tag(name = "Enrollments", description = "Student enrollment management")
@SecurityRequirement(name = "bearerAuth")
public class EnrollmentController {

    private final EnrollmentService enrollmentService;
    private final EnrollmentRepository enrollmentRepository;
    private final StudentRepository studentRepository;

    @GetMapping("/course/{courseId}")
    @Operation(summary = "Get all enrollments for a course (trainer view)")
    public ResponseEntity<List<Map<String, Object>>> getCourseEnrollments(@PathVariable String courseId) {
        List<Enrollment> enrollments = enrollmentRepository.findByCourseId(courseId);
        List<Map<String, Object>> result = enrollments.stream().map(e -> {
            Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("enrollmentId", e.getEnrollmentId());
            m.put("studentId", e.getStudentId());
            m.put("courseId", e.getCourseId());
            m.put("groupId", e.getGroupId());
            m.put("enrollmentStatus", e.getEnrollmentStatus());
            m.put("progressPercentage", e.getProgressPercentage());
            m.put("sessionsAttended", e.getSessionsAttended());
            m.put("enrolledAt", e.getEnrolledAt());
            // Enrich with student name
            studentRepository.findByStudentId(e.getStudentId()).ifPresent(s -> {
                m.put("studentName", s.getName());
                m.put("studentProfilePicture", s.getProfilePictureUrl());
            });
            return m;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    @PostMapping("/confirm")
    @Operation(summary = "Student confirms enrollment (requires successful Konnect payment for paid courses)")
    public ResponseEntity<Enrollment> confirmEnrollment(
            @RequestParam String studentId,
            @RequestParam String courseId,
            @RequestParam(required = false) String groupId,
            // For paid courses this MUST be a Konnect paymentRef returned
            // by POST /api/payments/enrollment-payment and completed via
            // the user's redirect flow. Optional for free courses.
            @RequestParam(required = false) String paymentRef) {
        Enrollment enrollment = enrollmentService.confirmEnrollment(
                studentId, courseId, groupId, paymentRef);
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