package com.byb.backend.dto.trainer;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class TrainerProfilePage2Request {

    private String cvUrl; // URL after CV upload

    private String professionalExperience; // Optional, from CV or manual

    @NotEmpty(message = "Specializations are required")
    private String[] specializations;

    @NotNull(message = "Experience years is required")
    private Integer experienceYears;

    @NotEmpty(message = "Education is required")
    private String education;

    @NotEmpty(message = "Skills are required")
    private String[] skills;

    private String[] certificates; // Optional

    private String linkedinUrl; // Optional

    private String githubUrl; // Optional

    private String portfolioUrl; // Optional
}