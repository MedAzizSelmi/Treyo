package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * A course a learner asked for and could not find in the catalogue.
 *
 * Administrators use these to look for a trainer who can teach it. The
 * learners behind one — its author and everyone who tapped "me too" — are
 * its supporters ({@link CourseSuggestionSupporter}), and the count of them
 * is the demand.
 *
 * Status, a string so new values need no CHECK constraint rebuilt:
 * <ul>
 *   <li>{@code new} — waiting for an administrator. Seen only by its
 *       author: nothing a learner types reaches other learners unread.</li>
 *   <li>{@code searching} — accepted; an administrator is looking for a
 *       trainer. Shown to other learners for "me too".</li>
 *   <li>{@code published} — a course now exists ({@link #courseId}); every
 *       supporter was told and their request for it registered.</li>
 *   <li>{@code declined} — a real request that will not be served; the
 *       supporters were told.</li>
 *   <li>{@code rejected} — not a course request (nonsense, spam); closed
 *       without telling anyone.</li>
 *   <li>{@code withdrawn} — its author took it back.</li>
 *   <li>{@code merged} — the same request as {@link #mergedInto}, which
 *       took over its supporters.</li>
 * </ul>
 */
@Entity
@Table(
        name = "course_suggestions",
        indexes = {
                @Index(name = "idx_course_suggestions_student", columnList = "student_id"),
                @Index(name = "idx_course_suggestions_status", columnList = "status")
        }
)
@Data
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class CourseSuggestion extends BaseEntity {

    @Id
    @Column(name = "suggestion_id", length = 50)
    private String suggestionId;

    /** The author. Null once they deleted their account and others still back it. */
    @Column(name = "student_id", length = 50)
    private String studentId;

    /** What the course is about, as the learner put it. */
    @Column(name = "topic", length = 120)
    private String topic;

    /** What they want to be able to do — the context a vague title lacks. */
    @Column(name = "details", length = 1000)
    private String details;

    /** One of the administrators' domains, or null for "Other". */
    @Column(name = "domain", length = 100)
    private String domain;

    /** beginner, intermediate or expert (Levels), or null for any. */
    @Column(name = "level", length = 30)
    private String level;

    /** Online, Face-to-face or Hybrid, as courses use; null for either. */
    @Column(name = "format", length = 30)
    private String format;

    /** Language code the learner wants it taught in, or null for any. */
    @Column(name = "language", length = 10)
    private String language;

    @Column(name = "city", length = 100)
    private String city;

    @Column(name = "status", length = 20)
    private String status;

    /** For administrators only: who was called, what was said. */
    @Column(name = "admin_note", length = 2000)
    private String adminNote;

    /** The course that answered it, once published. */
    @Column(name = "course_id", length = 50)
    private String courseId;

    @Column(name = "merged_into", length = 50)
    private String mergedInto;

    @Column(name = "closed_at")
    private LocalDateTime closedAt;
}
