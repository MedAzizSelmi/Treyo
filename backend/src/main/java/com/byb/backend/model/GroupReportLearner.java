package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * One learner in a {@link GroupReport}: how many sessions they attended and
 * their result. COMPLETED earns the learner an attestation de participation.
 *
 * Kept out of Enrollment on purpose: the trainer's note is for
 * administrators, and enrollments are sent to the learner as they are.
 */
@Entity
@Table(
        name = "group_report_learners",
        uniqueConstraints = @UniqueConstraint(name = "uq_group_report_learners_enrollment", columnNames = "enrollment_id"),
        indexes = {
                @Index(name = "idx_group_report_learners_report", columnList = "report_id"),
                @Index(name = "idx_group_report_learners_student", columnList = "student_id")
        }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class GroupReportLearner extends BaseEntity {

    public static final String COMPLETED = "COMPLETED", PARTIAL = "PARTIAL", DID_NOT_FOLLOW = "DID_NOT_FOLLOW";

    @Id
    @Column(name = "report_learner_id", length = 50)
    private String reportLearnerId;

    @Column(name = "report_id", length = 50)
    private String reportId;

    @Column(name = "group_id", length = 50)
    private String groupId;

    @Column(name = "enrollment_id", length = 50)
    private String enrollmentId;

    @Column(name = "student_id", length = 50)
    private String studentId;

    @Column(name = "sessions_attended")
    private Integer sessionsAttended;

    /** COMPLETED, PARTIAL or DID_NOT_FOLLOW. */
    @Column(name = "result", length = 20)
    private String result;

    /** The trainer's note on this learner, for administrators only. */
    @Column(name = "note", length = 200)
    private String note;

    /** When the attestation was emailed; null until it was. */
    @Column(name = "attestation_emailed_at")
    private LocalDateTime attestationEmailedAt;
}
