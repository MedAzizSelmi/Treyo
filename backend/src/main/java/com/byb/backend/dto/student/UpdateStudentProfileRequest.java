package com.byb.backend.dto.student;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class UpdateStudentProfileRequest {

    private String cvUrl;
    private String professionalExperience;
    private String[] keySkills;
    private String educationLevel;
    private String trainingDomain;
    private String linkedinUrl;
    private String portfolioUrl;
}
