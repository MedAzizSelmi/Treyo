package com.byb.backend.controller;

import com.byb.backend.dto.admin.CourseManagementResponse;
import com.byb.backend.dto.admin.DashboardStatsResponse;
import com.byb.backend.dto.admin.UserManagementResponse;
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
     * Reject trainer
     */
    @PutMapping("/users/trainers/{trainerId}/reject")
    @Operation(summary = "Reject trainer profile")
    public ResponseEntity<Map<String, String>> rejectTrainer(@PathVariable String trainerId) {
        adminService.rejectTrainer(trainerId);
        return ResponseEntity.ok(Map.of("message", "Trainer rejected"));
    }

    // ============================================
    // COURSE MANAGEMENT
    // ============================================

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
}