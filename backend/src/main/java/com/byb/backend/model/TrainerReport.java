package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * A student's report of a trainer, raised for admin review.
 *
 * Unlike {@link Review} there is no unique constraint on
 * (student, trainer): a student may legitimately need to report the
 * same trainer more than once for separate incidents. Duplicate-spam
 * is handled at the service layer instead (see
 * TrainerReportService.submit), which rejects a second OPEN report from
 * the same student against the same trainer — once the admin resolves
 * the first one, the student can raise a new one.
 *
 * Reports are never hard-deleted; an admin moves them through
 * {@link #status} so the moderation trail stays auditable.
 */
@Entity
@Table(
        name = "trainer_reports",
        indexes = {
                @Index(name = "idx_trainer_reports_trainer", columnList = "trainer_id"),
                @Index(name = "idx_trainer_reports_student", columnList = "student_id"),
                @Index(name = "idx_trainer_reports_status", columnList = "status")
        }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class TrainerReport extends BaseEntity {

    @Id
    @Column(name = "report_id", length = 50)
    private String reportId;

    /** Who raised it. */
    @Column(name = "student_id", length = 50, nullable = false)
    private String studentId;

    /** Who it is about. */
    @Column(name = "trainer_id", length = 50, nullable = false)
    private String trainerId;

    /**
     * Coarse category, chosen from a fixed list in the mobile UI:
     * INAPPROPRIATE_BEHAVIOUR, MISLEADING_CONTENT, NO_SHOW,
     * HARASSMENT, SPAM, OTHER.
     * Stored as a String (not a JPA enum) to match how the rest of the
     * codebase persists statuses — see Course.approvalStatus.
     */
    @Column(name = "reason", length = 40, nullable = false)
    private String reason;

    /** Free-text detail from the student. Optional but encouraged. */
    @Column(name = "details", columnDefinition = "TEXT")
    private String details;

    /** Optional course the incident relates to, for admin context. */
    @Column(name = "course_id", length = 50)
    private String courseId;

    /** OPEN → REVIEWED → DISMISSED. Set by the admin. */
    @Column(name = "status", length = 20, nullable = false)
    private String status = "OPEN";

    /** Admin's internal note explaining the decision. */
    @Column(name = "admin_note", columnDefinition = "TEXT")
    private String adminNote;

    /** When the admin last moved it out of OPEN. */
    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;
}
