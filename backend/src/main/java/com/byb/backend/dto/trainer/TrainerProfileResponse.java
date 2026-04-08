package com.byb.backend.dto.trainer;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TrainerProfileResponse {

    private String trainerId;
    private String name;
    private String email;
    private String phone;
    private String address;
    private String city;
    private String state;
    private String postalCode;
    private String profilePictureUrl;
    private String bio;
    private String cvUrl;
    private String professionalExperience;
    private String[] specializations;
    private String[] skills;
    private Integer experienceYears;
    private String education;
    private String linkedinUrl;
    private String githubUrl;
    private String portfolioUrl;
    private Integer maxConcurrentGroups;
    private BigDecimal hourlyRate;
    private BigDecimal averageRating;
    private Integer totalStudentsTaught;
    private boolean isProfileComplete;

    // Profile completion status
    private ProfileCompletionStatus profileCompletionStatus;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ProfileCompletionStatus {
        private boolean page1Complete;
        private boolean page2Complete;
        private boolean page3Complete;
        private boolean allComplete;
    }
}