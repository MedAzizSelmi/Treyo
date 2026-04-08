package com.byb.backend.dto.student;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class UpdateStudentProfileRequest {

    private String cvUrl;

    @NotNull(message = "Professional experience is required")
    private String professionalExperience;

    @NotEmpty(message = "Key skills are required")
    private String[] keySkills;

    @NotNull(message = "Education level is required")
    private String educationLevel;

    private String trainingDomain; // Optional
}
