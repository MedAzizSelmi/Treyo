package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

/**
 * A learner behind a course suggestion: its author, or someone who tapped
 * "me too". One row per learner and suggestion; the count is the demand,
 * and these are the learners told when the course is published.
 */
@Entity
@Table(
        name = "course_suggestion_supporters",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_course_suggestion_supporter", columnNames = {"suggestion_id", "student_id"}),
        indexes = @Index(name = "idx_course_suggestion_supporters_student", columnList = "student_id")
)
@Data
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class CourseSuggestionSupporter extends BaseEntity {

    @Id
    @Column(name = "supporter_id", length = 50)
    private String supporterId;

    @Column(name = "suggestion_id", length = 50)
    private String suggestionId;

    @Column(name = "student_id", length = 50)
    private String studentId;
}
