package com.byb.backend.dto.recommendation;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RecommendationResponse {

    private String studentId;
    private List<RecommendedCourse> recommendations;
    private Integer totalRecommended;
    private String generatedAt;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RecommendedCourse {
        private String courseId;
        private String title;
        private String domain;
        private String specificTopic;
        private String level;
        /** Average rating — DB-sourced so it reflects the latest review
         *  submitted by any student, not the value cached in the ML
         *  service's in-memory model. */
        private BigDecimal rating;
        /** Alias that matches the field name the mobile cards already
         *  read (`course.averageRating`). Same value as `rating`. */
        private BigDecimal averageRating;
        private Double score;
        private String reason;

        // Additional trainer info
        private String trainerId;
        private String trainerName;
        private BigDecimal price;
        private Integer durationHours;
        /** Live enrolled-students count read off Course.totalEnrolled.
         *  Driven by the enrollment flow, not the ML cache. */
        private Integer totalEnrolled;
    }
}