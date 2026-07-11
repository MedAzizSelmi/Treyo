package com.byb.backend.controller;

import com.byb.backend.dto.admin.CourseManagementResponse;
import com.byb.backend.dto.admin.DashboardStatsResponse;
import com.byb.backend.dto.admin.SendNotificationRequest;
import com.byb.backend.dto.admin.UserManagementResponse;
import com.byb.backend.dto.course.CourseResponse;
import com.byb.backend.service.AdminGroupFormationService;
import com.byb.backend.service.AdminService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@Tag(name = "Admin Dashboard", description = "Admin management endpoints")
public class AdminController {

    private final AdminService adminService;
    private final AdminGroupFormationService groupFormationService;

    /**
     * Get dashboard overview statistics
     */
    @GetMapping("/dashboard/stats")
    @Operation(summary = "Get dashboard statistics")
    public ResponseEntity<DashboardStatsResponse> getDashboardStats() {
        DashboardStatsResponse stats = adminService.getDashboardStats();
        return ResponseEntity.ok(stats);
    }

    // ============================================
    // USER MANAGEMENT
    // ============================================

    /**
     * Get all users
     */
    @GetMapping("/users")
    @Operation(summary = "Get all users (students + trainers)")
    public ResponseEntity<List<UserManagementResponse>> getAllUsers() {
        List<UserManagementResponse> users = adminService.getAllUsers();
        return ResponseEntity.ok(users);
    }

    /**
     * Get all students
     */
    @GetMapping("/users/students")
    @Operation(summary = "Get all students")
    public ResponseEntity<List<UserManagementResponse>> getAllStudents() {
        List<UserManagementResponse> students = adminService.getAllStudents();
        return ResponseEntity.ok(students);
    }

    /**
     * Get all trainers
     */
    @GetMapping("/users/trainers")
    @Operation(summary = "Get all trainers")
    public ResponseEntity<List<UserManagementResponse>> getAllTrainers() {
        List<UserManagementResponse> trainers = adminService.getAllTrainers();
        return ResponseEntity.ok(trainers);
    }

    /**
     * Get pending trainer approvals
     */
    @GetMapping("/users/trainers/pending")
    @Operation(summary = "Get pending trainer approvals")
    public ResponseEntity<List<UserManagementResponse>> getPendingTrainers() {
        List<UserManagementResponse> pending = adminService.getPendingTrainers();
        return ResponseEntity.ok(pending);
    }

    /**
     * Activate/Deactivate user
     */
    @PutMapping("/users/{userId}/toggle-status")
    @Operation(summary = "Activate or deactivate user")
    public ResponseEntity<Map<String, String>> toggleUserStatus(
            @PathVariable String userId,
            @RequestParam String userType
    ) {
        adminService.toggleUserStatus(userId, userType);
        return ResponseEntity.ok(Map.of("message", "User status updated successfully"));
    }

    /**
     * Approve trainer
     */
    @PutMapping("/users/trainers/{trainerId}/approve")
    @Operation(summary = "Approve trainer profile")
    public ResponseEntity<Map<String, String>> approveTrainer(@PathVariable String trainerId) {
        adminService.approveTrainer(trainerId);
        return ResponseEntity.ok(Map.of("message", "Trainer approved successfully"));
    }

    /**
     * Reject trainer. Optional body {@code { "note": "..." }} is
     * included verbatim in the rejection email so the trainer
     * knows what to fix before re-applying.
     */
    @PutMapping("/users/trainers/{trainerId}/reject")
    @Operation(summary = "Reject trainer profile")
    public ResponseEntity<Map<String, String>> rejectTrainer(
            @PathVariable String trainerId,
            @RequestBody(required = false) Map<String, Object> body) {
        String note = null;
        if (body != null && body.get("note") != null) {
            note = String.valueOf(body.get("note")).trim();
            if (note.isEmpty()) note = null;
        }
        adminService.rejectTrainer(trainerId, note);
        return ResponseEntity.ok(Map.of("message", "Trainer rejected"));
    }

    // ============================================
    // COURSE MANAGEMENT
    // ============================================

    /** Trainer-submitted courses waiting for admin approval. Includes
     *  the material URL so the admin can open the trainer's uploaded
     *  PDF/PPT directly from the review card. */
    @GetMapping("/courses/pending-trainer")
    @Operation(summary = "Courses submitted by trainers, waiting for admin review")
    public ResponseEntity<List<CourseResponse>> getPendingTrainerCourses() {
        return ResponseEntity.ok(adminService.getPendingTrainerCourses());
    }

    @PutMapping("/courses/{courseId}/approve-trainer")
    @Operation(summary = "Approve a trainer-submitted course and set its price")
    public ResponseEntity<Map<String, String>> approveTrainerCourse(
            @PathVariable String courseId,
            @RequestBody Map<String, Object> body) {
        Object rawPrice = body == null ? null : body.get("price");
        Object rawCurrency = body == null ? null : body.get("currency");
        java.math.BigDecimal price;
        try {
            price = new java.math.BigDecimal(String.valueOf(rawPrice));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Price is required."));
        }
        String currency = rawCurrency == null ? null : String.valueOf(rawCurrency);
        try {
            adminService.approveTrainerCourse(courseId, price, currency);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
        return ResponseEntity.ok(Map.of("message", "Course approved"));
    }

    @PutMapping("/courses/{courseId}/reject-trainer")
    @Operation(summary = "Reject a trainer-submitted course, optionally with a note")
    public ResponseEntity<Map<String, String>> rejectTrainerCourse(
            @PathVariable String courseId,
            @RequestBody(required = false) Map<String, Object> body) {
        String note = null;
        if (body != null && body.get("note") != null) {
            note = String.valueOf(body.get("note")).trim();
            if (note.isEmpty()) note = null;
        }
        adminService.rejectTrainerCourse(courseId, note);
        return ResponseEntity.ok(Map.of("message", "Course rejected"));
    }

    /**
     * Get all courses
     */
    @GetMapping("/courses")
    @Operation(summary = "Get all courses")
    public ResponseEntity<List<CourseManagementResponse>> getAllCourses() {
        List<CourseManagementResponse> courses = adminService.getAllCourses();
        return ResponseEntity.ok(courses);
    }

    /**
     * Get pending courses
     */
    @GetMapping("/courses/pending")
    @Operation(summary = "Get pending course approvals")
    public ResponseEntity<List<CourseManagementResponse>> getPendingCourses() {
        List<CourseManagementResponse> pending = adminService.getPendingCourses();
        return ResponseEntity.ok(pending);
    }

    /**
     * Approve course
     */
    @PutMapping("/courses/{courseId}/approve")
    @Operation(summary = "Approve course")
    public ResponseEntity<Map<String, String>> approveCourse(@PathVariable String courseId) {
        adminService.approveCourse(courseId);
        return ResponseEntity.ok(Map.of("message", "Course approved successfully"));
    }

    /**
     * Reject course
     */
    @PutMapping("/courses/{courseId}/reject")
    @Operation(summary = "Reject course")
    public ResponseEntity<Map<String, String>> rejectCourse(@PathVariable String courseId) {
        adminService.rejectCourse(courseId);
        return ResponseEntity.ok(Map.of("message", "Course rejected"));
    }

    /**
     * Delete course
     */
    @DeleteMapping("/courses/{courseId}")
    @Operation(summary = "Delete course (soft delete)")
    public ResponseEntity<Map<String, String>> deleteCourse(@PathVariable String courseId) {
        adminService.deleteCourse(courseId);
        return ResponseEntity.ok(Map.of("message", "Course deleted successfully"));
    }

    /**
     * Update minimum students required for course
     */
    @PutMapping("/courses/{courseId}/min-students")
    @Operation(summary = "Update minimum students required for course")
    public ResponseEntity<Map<String, String>> updateMinStudents(
            @PathVariable String courseId,
            @RequestParam int minStudents
    ) {
        adminService.updateCourseMinStudents(courseId, minStudents);
        return ResponseEntity.ok(Map.of("message", "Minimum students updated to " + minStudents));
    }

    /**
     * Set the daily amount the trainer earns while running this
     * course. Independent of the student-facing price — this is the
     * trainer's cut per day of training. Null clears the value.
     */
    @PutMapping("/courses/{courseId}/trainer-daily-revenue")
    @Operation(summary = "Set the trainer's daily earnings for a course")
    public ResponseEntity<Map<String, String>> updateTrainerDailyRevenue(
            @PathVariable String courseId,
            @RequestBody Map<String, Object> body
    ) {
        Object raw = body == null ? null : body.get("amount");
        java.math.BigDecimal amount = null;
        if (raw != null && !String.valueOf(raw).isBlank()) {
            try {
                amount = new java.math.BigDecimal(String.valueOf(raw));
                if (amount.signum() < 0) {
                    return ResponseEntity.badRequest().body(Map.of("error", "Amount must be non-negative."));
                }
            } catch (Exception e) {
                return ResponseEntity.badRequest().body(Map.of("error", "Invalid amount."));
            }
        }
        adminService.updateTrainerDailyRevenue(courseId, amount);
        return ResponseEntity.ok(Map.of("message", "Trainer daily revenue updated"));
    }

    // ============================================
    // GROUP FORMATION WORKFLOW
    // ============================================

    /**
     * Overview of all published courses with their request funnel (interested + confirmed).
     */
    @GetMapping("/requests")
    @Operation(summary = "Get all courses with request/funnel info")
    public ResponseEntity<List<Map<String, Object>>> getRequestedCourses() {
        return ResponseEntity.ok(groupFormationService.getRequestedCoursesOverview());
    }

    /**
     * Maintenance: remove stale "clicked_interested" interactions
     * (rows for students who are already enrolled, plus duplicate rows for the same student).
     */
    @PostMapping("/requests/cleanup")
    @Operation(summary = "Clean up stale interest interactions")
    public ResponseEntity<Map<String, Object>> cleanupStaleRequests() {
        return ResponseEntity.ok(groupFormationService.cleanupStaleRequests());
    }

    /**
     * Lists every active group enriched with course, trainer, and member details.
     */
    @GetMapping("/groups")
    @Operation(summary = "Get all groups with members")
    public ResponseEntity<List<Map<String, Object>>> getAllGroups() {
        return ResponseEntity.ok(groupFormationService.getAllGroupsWithMembers());
    }

    /**
     * Returns the enrollment funnel for a course: interested students, confirmed enrollments,
     * and whether the admin can take next-step actions (notify / form group).
     */
    @GetMapping("/courses/{courseId}/interest")
    @Operation(summary = "Get course interest summary with interested students")
    public ResponseEntity<Map<String, Object>> getCourseInterest(@PathVariable String courseId) {
        return ResponseEntity.ok(groupFormationService.getCourseInterestSummary(courseId));
    }

    /**
     * Sends a GROUP_FORMING notification to every interested student. The students
     * confirm by accepting the notification (which creates a pending Enrollment).
     */
    @PostMapping("/courses/{courseId}/notify-interested")
    @Operation(summary = "Send group-forming notifications to interested students")
    public ResponseEntity<Map<String, Object>> notifyInterested(@PathVariable String courseId) {
        return ResponseEntity.ok(groupFormationService.notifyInterestedStudents(courseId));
    }

    /**
     * Finalises group creation with all students who have confirmed. Sends GROUP_READY
     * and moves enrollments from "confirmed" to "active".
     */
    @PostMapping("/courses/{courseId}/form-group")
    @Operation(summary = "Form a group from confirmed enrollments")
    public ResponseEntity<Map<String, Object>> formGroup(@PathVariable String courseId) {
        return ResponseEntity.ok(groupFormationService.formGroup(courseId));
    }

    // ============================================
    // PROMOTE TO ADMIN
    // ============================================

    /**
     * Promote a student or trainer to admin.
     * Returns a temporary password that must be shared with the promoted user.
     */
    @PostMapping("/users/{userId}/promote-to-admin")
    @Operation(summary = "Promote a user to admin role")
    public ResponseEntity<Map<String, String>> promoteToAdmin(
            @PathVariable String userId,
            @RequestParam String userType
    ) {
        Map<String, String> result = adminService.promoteToAdmin(userId, userType);
        return ResponseEntity.ok(result);
    }

    // ============================================
    // SEND NOTIFICATION
    // ============================================

    /**
     * Send a notification to a specific user, all students, all trainers, or everyone.
     */
    @PostMapping("/notifications/send")
    @Operation(summary = "Send admin notification")
    public ResponseEntity<Map<String, String>> sendNotification(
            @RequestBody SendNotificationRequest request
    ) {
        adminService.sendAdminNotification(request);
        return ResponseEntity.ok(Map.of("message", "Notification sent successfully"));
    }
}