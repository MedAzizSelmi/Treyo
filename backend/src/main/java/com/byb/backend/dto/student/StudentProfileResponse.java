package com.byb.backend.dto.student;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StudentProfileResponse {

    private String studentId;
    private String name;
    private String email;
    private String phone;
    private String address;
    private String city;
    private String state;
    private String postalCode;
    private String profilePictureUrl;
    private String bio;
    private String[] primaryDomains;
    private String[] specificInterests;
    private String experienceLevel;
    private String cvUrl;
    private String professionalExperience;
    private String[] keySkills;
    private String educationLevel;
    private String trainingDomain;
    private Integer totalCoursesEnrolled;
    private Integer totalCoursesCompleted;
    private boolean isOnboardingComplete;
}