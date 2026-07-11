package com.byb.backend.dto.course;

import jakarta.validation.constraints.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CreateCourseRequest {

    @NotBlank(message = "Title is required")
    @Size(max = 500, message = "Title must not exceed 500 characters")
    private String title;

    @NotBlank(message = "Description is required")
    private String description;

    @NotBlank(message = "Domain is required")
    private String domain; // informatique, marketing, etc.

    @NotBlank(message = "Specific topic is required")
    private String specificTopic; // Python, React, etc.

    @NotNull(message = "Level is required")
    private String level; // beginner, intermediate, expert

    @Min(value = 1, message = "Duration must be at least 1 hour")
    private Integer durationHours;

    private String language = "French";

    private String format; // "Face-to-face", "Online (Meet)", "Hybrid"

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

    /** v2: the module this course belongs to. Required at create time
     *  in {@link com.byb.backend.service.CourseService#createTrainerCourse}. */
    private String moduleId;

    /** v2: URL of the uploaded course material (PDF / PPT / ZIP). */
    private String materialUrl;

    /** v2: original filename of the material for a friendlier download link. */
    private String materialName;
}