package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "interactions",
        // Enforce one interaction per (student, course, type) — prevents the
        // double-tap race from inserting two "clicked_interested" rows.
        uniqueConstraints = @UniqueConstraint(
                name = "uq_interaction_student_course_type",
                columnNames = {"student_id", "course_id", "interaction_type"}
        )
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class Interaction extends BaseEntity {

    @Id
    @Column(name = "interaction_id", length = 50)
    private String interactionId;

    @Column(name = "student_id", length = 50, nullable = false)
    private String studentId;

    @Column(name = "course_id", length = 50, nullable = false)
    private String courseId;

    @Column(name = "interaction_type", length = 50, nullable = false)
    private String interactionType;
    // viewed, clicked_interested, saved, enrolled, completed, rated, dropped

    @Column(name = "time_spent_seconds")
    private Integer timeSpentSeconds;

    @Column(name = "rating_value")
    private Integer ratingValue;

    @Column(length = 50)
    private String device;

    @Column(name = "referral_source", length = 100)
    private String referralSource;

    @Column(name = "interaction_metadata", columnDefinition = "TEXT")
    private String interactionMetadata;
}