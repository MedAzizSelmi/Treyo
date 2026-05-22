package com.byb.backend.dto.admin;

import jakarta.validation.constraints.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * Payload used by admin to create OR update a CourseTemplate.
 * Same shape on both endpoints; nullable fields on PUT mean "don't change".
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CourseTemplateRequest {

    @NotBlank(message = "Title is required")
    @Size(max = 500, message = "Title must not exceed 500 characters")
    private String title;

    @NotBlank(message = "Description is required")
    private String description;

    @NotBlank(message = "Domain is required")
    private String domain;

    @NotBlank(message = "Specific topic is required")
    private String specificTopic;

    @NotNull(message = "Level is required")
    private String level;

    @Min(value = 1, message = "Duration must be at least 1 hour")
    private Integer durationHours;

    private String language = "French";
    private String format;
    private String prerequisites;
    private String[] learningOutcomes;

    @DecimalMin(value = "0.0", message = "Price must be positive")
    private BigDecimal price;

    @Min(value = 1, message = "Minimum students must be at least 1")
    private Integer minStudentsRequired = 5;

    @Min(value = 1, message = "Maximum students must be at least 1")
    private Integer maxStudentsPerGroup = 30;

    @Min(value = 1, message = "Max groups allowed must be at least 1")
    private Integer maxGroupsAllowed = 1;

    private Boolean hasCertificate = false;
}
