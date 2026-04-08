package com.byb.backend.dto.course;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CourseResponse {

    private String courseId;
    private String trainerId;
    private String trainerName;
    private String title;
    private String description;
    private String domain;
    private String specificTopic;
    private String level;
    private Integer durationHours;
    private String language;
    private String format;
    private String prerequisites;
    private String[] learningOutcomes;
    private BigDecimal price;
    private String currency;
    private Boolean hasCertificate;
    private Integer minStudentsRequired;
    private Integer maxStudentsPerGroup;
    private Integer currentGroupsCount;
    private BigDecimal averageRating;
    private Integer totalRatings;
    private Integer totalEnrolled;
    private Integer totalCompleted;
    private BigDecimal completionRate;
    private Boolean isPublished;
    private Boolean isActive;
    private LocalDateTime publishedAt;
    private LocalDateTime createdAt;

    // Additional info
    private Integer interestedStudentsCount;
    private Boolean canFormGroup;
}