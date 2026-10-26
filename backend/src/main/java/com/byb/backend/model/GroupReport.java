package com.byb.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * A trainer's report on a group once its sessions are over, sent once and
 * never edited (GroupReportService). The learners' part — attendance and
 * result, which decides who gets an attestation — is in
 * {@link GroupReportLearner}.
 *
 * Choices are stored as plain strings, like the rest of the codebase's
 * statuses, so adding a value needs no CHECK constraint rebuilt.
 */
@Entity
@Table(
        name = "group_reports",
        uniqueConstraints = @UniqueConstraint(name = "uq_group_reports_group", columnNames = "group_id"),
        indexes = @Index(name = "idx_group_reports_trainer", columnList = "trainer_id")
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class GroupReport extends BaseEntity {

    public static final String ALL = "ALL", MOST = "MOST", PART = "PART";
    public static final String TOO_EASY = "TOO_EASY", RIGHT = "RIGHT", TOO_HARD = "TOO_HARD";
    public static final String MOST_HAD = "MOST_HAD", SOME_LACKED = "SOME_LACKED", MOST_LACKED = "MOST_LACKED";

    @Id
    @Column(name = "report_id", length = 50)
    private String reportId;

    @Column(name = "group_id", length = 50)
    private String groupId;

    @Column(name = "course_id", length = 50)
    private String courseId;

    @Column(name = "trainer_id", length = 50)
    private String trainerId;

    /** False when the trainer said some sessions were not held. */
    @Column(name = "all_sessions_held")
    private Boolean allSessionsHeld;

    /**
     * The sessions not held, as JSON: [{"date":"2026-11-10","time":"18:00",
     * "reason":"…"}]. Read by trainer earnings, which leave those days out.
     */
    @Column(name = "sessions_not_held", columnDefinition = "TEXT")
    private String sessionsNotHeld;

    /** How much of the course plan was covered: ALL, MOST or PART. */
    @Column(name = "plan_coverage", length = 10)
    private String planCoverage;

    /** What was left out of the plan, and why. Only with MOST or PART. */
    @Column(name = "plan_left_out", length = 300)
    private String planLeftOut;

    /** TOO_EASY, RIGHT or TOO_HARD for this group. */
    @Column(name = "level_fit", length = 10)
    private String levelFit;

    /** MOST_HAD, SOME_LACKED or MOST_LACKED the prerequisites. */
    @Column(name = "prerequisites", length = 15)
    private String prerequisites;

    /** Anything else for the administrators. */
    @Column(name = "comments", length = 1000)
    private String comments;

    /** An administrator's internal note on the report. */
    @Column(name = "admin_note", length = 2000)
    private String adminNote;

    @Column(name = "admin_note_at")
    private LocalDateTime adminNoteAt;
}
