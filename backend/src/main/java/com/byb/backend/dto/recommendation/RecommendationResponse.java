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
        private BigDecimal rating;
        private Double score;
        private String reason;

        // Additional trainer info
        private String trainerId;
        private String trainerName;
        private BigDecimal price;
        private Integer durationHours;
    }
}