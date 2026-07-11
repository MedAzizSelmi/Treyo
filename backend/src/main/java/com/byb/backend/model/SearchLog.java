package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

/**
 * One row per search the student executed (or clicked a result on).
 *
 * Why this exists separately from interactions:
 *   The ML recommendation engine reads `search_logs` to build a
 *   "what is this student curious about right now" signal. Queries
 *   are short-tail intent that doesn't show up in plain enroll /
 *   view interactions. The schema (columns + types) matches the
 *   SELECT in ml-service/recommendation_engine.py — keep them in sync.
 */
@Entity
@Table(
        name = "search_logs",
        indexes = {
                @Index(name = "idx_search_logs_student", columnList = "student_id"),
                @Index(name = "idx_search_logs_created", columnList = "created_at")
        }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class SearchLog extends BaseEntity {

    @Id
    @Column(name = "search_id", length = 50)
    private String searchId;

    @Column(name = "student_id", length = 50, nullable = false)
    private String studentId;

    /** Raw query text — trimmed but otherwise preserved as the
     *  student typed it. Capped at 200 chars on insert. */
    @Column(name = "query", length = 200, nullable = false)
    private String query;

    /** Set when the student tapped a course from the result list.
     *  Null when the search led nowhere (also valuable signal —
     *  shows the catalogue gap). */
    @Column(name = "clicked_course_id", length = 50)
    private String clickedCourseId;
}
