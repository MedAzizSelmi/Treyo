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
    /** When sent, replaces the experience and the text made from it; null leaves both. */
    private java.util.List<com.byb.backend.util.ExperienceEntries.Entry> experienceEntries;
    private String[] keySkills;
    private String educationLevel;
    private String trainingDomain;
    private String linkedinUrl;
    private String portfolioUrl;
}
