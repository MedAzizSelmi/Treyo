package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * Admin-owned course content. A CourseTemplate is the master record for
 * "this is what this course is about" — title, description, price, etc.
 *
 * The admin then assigns one template to multiple trainers; each assignment
 * creates a {@link Course} (the trainer-specific offering) that copies the
 * shared fields and adds a trainerId. When admin edits a template, all linked
 * Course rows are updated in lockstep so students always see consistent content.
 *
 * Per-trainer state (enrollments, ratings, groups) lives on {@link Course}, not here.
 */
@Entity
@Table(name = "course_templates")
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class CourseTemplate extends BaseEntity {

    @Id
    @Column(name = "template_id", length = 50)
    private String templateId;

    @Column(nullable = false, length = 500)
    private String title;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String description;

    @Column(nullable = false, length = 100)
    private String domain;

    @Column(name = "specific_topic", nullable = false, length = 200)
    private String specificTopic;

    @Column(length = 20)
    private String level; // beginner, intermediate, expert

    @Column(name = "duration_hours")
    private Integer durationHours;

    @Column(length = 50)
    private String language = "French";

    @Column(length = 50)
    private String format; // Face-to-face, Online (Meet), Hybrid

    @Column(columnDefinition = "TEXT")
    private String prerequisites;

    @Column(name = "learning_outcomes", columnDefinition = "text[]")
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.ARRAY)
    private String[] learningOutcomes;

    @Column(precision = 10, scale = 2)
    private BigDecimal price = BigDecimal.ZERO;

    @Column(length = 10)
    private String currency = "TND";

    @Column(name = "has_certificate")
    private Boolean hasCertificate = false;

    @Column(name = "min_students_required")
    private Integer minStudentsRequired = 5;

    @Column(name = "max_students_per_group")
    private Integer maxStudentsPerGroup = 30;

    @Column(name = "max_groups_allowed")
    private Integer maxGroupsAllowed = 1;

    @Column(name = "is_active")
    private Boolean isActive = true;
}
