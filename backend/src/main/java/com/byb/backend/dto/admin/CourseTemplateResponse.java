package com.byb.backend.dto.admin;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CourseTemplateResponse {

    private String templateId;
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
    private Integer maxGroupsAllowed;
    private Boolean isActive;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // The trainers this template is currently assigned to (one offering each)
    private List<AssignedTrainer> assignedTrainers;
    private Integer offeringCount; // == assignedTrainers.size()

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AssignedTrainer {
        private String trainerId;
        private String trainerName;
        private String courseId;     // the offering's id
        private Boolean isPublished;
        private Integer totalEnrolled;
        private Integer interestedCount;
    }
}
