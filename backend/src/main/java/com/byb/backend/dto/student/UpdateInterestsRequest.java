package com.byb.backend.dto.student;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class UpdateInterestsRequest {

    @NotEmpty(message = "Primary domains are required")
    private String[] primaryDomains;

    @NotEmpty(message = "Specific interests are required")
    private String[] specificInterests;

    @NotNull(message = "Experience level is required")
    private String experienceLevel; // beginner, intermediate, expert
}