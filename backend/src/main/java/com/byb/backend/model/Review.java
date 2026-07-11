package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

/**
 * A single end-of-course survey submission.
 *
 * One row holds BOTH the course rating + the trainer rating + the
 * student's written feedback — they're collected on the same screen
 * after the last session ends, so co-locating them keeps the model
 * lean and lets us look up "has this student already reviewed this
 * course?" with a single read.
 *
 * The same Review row also drives the rolling average shown on the
 * course-detail card (course.averageRating) and the trainer profile
 * (trainer.averageRating) — both are recomputed off of this table.
 */
@Entity
@Table(
        name = "reviews",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_reviews_student_course",
                        columnNames = {"student_id", "course_id"}
                )
        },
        indexes = {
                @Index(name = "idx_reviews_course", columnList = "course_id"),
                @Index(name = "idx_reviews_trainer", columnList = "trainer_id"),
                @Index(name = "idx_reviews_student", columnList = "student_id")
        }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class Review extends BaseEntity {

    @Id
    @Column(name = "review_id", length = 50)
    private String reviewId;

    @Column(name = "student_id", length = 50, nullable = false)
    private String studentId;

    @Column(name = "course_id", length = 50, nullable = false)
    private String courseId;

    @Column(name = "trainer_id", length = 50, nullable = false)
    private String trainerId;

    @Column(name = "enrollment_id", length = 50)
    private String enrollmentId;

    /** 1–5. Required. */
    @Column(name = "course_rating", nullable = false)
    private Integer courseRating;

    /** 1–5. Required — survey forces both. */
    @Column(name = "trainer_rating", nullable = false)
    private Integer trainerRating;

    /** Optional written feedback about the course itself (content,
     *  pacing, materials). Surfaced on course-detail's "What students
     *  said" section. Plain text, no formatting. */
    @Column(name = "course_feedback", columnDefinition = "TEXT")
    private String courseFeedback;

    /** Optional written feedback about the trainer (delivery, clarity,
     *  responsiveness). Surfaced on the trainer's public profile and
     *  on the trainer's own "Student feedback" section. */
    @Column(name = "trainer_feedback", columnDefinition = "TEXT")
    private String trainerFeedback;

    /** Admin-controlled visibility flag. False = visible to everyone;
     *  true = hidden from the public reviews list (still in the DB, still
     *  counts against the rolling average — moderating one bad-faith
     *  review shouldn't silently change the trainer's star count). The
     *  admin Reviews page can flip this. */
    @Column(name = "is_hidden", nullable = false)
    private Boolean isHidden = false;
}
