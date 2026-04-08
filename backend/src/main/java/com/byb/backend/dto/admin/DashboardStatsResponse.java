package com.byb.backend.dto.admin;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * Dashboard overview statistics
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DashboardStatsResponse {

    // User statistics
    private Long totalUsers;
    private Long totalStudents;
    private Long totalTrainers;
    private Long activeUsersToday;
    private Long newUsersThisWeek;
    private Long newUsersThisMonth;

    // Course statistics
    private Long totalCourses;
    private Long publishedCourses;
    private Long pendingCourses;
    private Long coursesCreatedThisWeek;

    // Enrollment statistics
    private Long totalEnrollments;
    private Long activeEnrollments;
    private Long completedEnrollments;
    private Long enrollmentsThisWeek;

    // Group statistics
    private Long totalGroups;
    private Long activeGroups;
    private Double averageGroupSize;

    // Interaction statistics
    private Long totalInteractions;
    private Long interactionsToday;

    // Message statistics
    private Long totalMessages;
    private Long messagesToday;

    // Financial statistics (optional)
    private BigDecimal totalRevenue;
    private BigDecimal revenueThisMonth;
    private BigDecimal averageCoursePrice;

    // System health
    private String systemStatus;
    private Long databaseSize;
}