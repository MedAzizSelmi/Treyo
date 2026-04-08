package com.byb.backend.dto.admin;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Course details for admin dashboard
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CourseManagementResponse {

    private String courseId;
    private String title;
    private String description;
    private String trainerId;
    private String trainerName;

    private String domain;
    private String specificTopic;
    private String level;

    private Integer durationHours;
    private String format;
    private BigDecimal price;

    private Boolean isPublished;
    private Boolean isActive;
    private String approvalStatus; // PENDING, APPROVED, REJECTED

    private Double averageRating;
    private Integer totalRatings;
    private Integer totalEnrolled;
    private Integer totalCompleted;

    private Integer minStudentsRequired;
    private Integer maxStudentsPerGroup;
    private Integer currentGroups;

    private LocalDateTime createdAt;
    private LocalDateTime publishedAt;
    private LocalDateTime lastModifiedAt;
}