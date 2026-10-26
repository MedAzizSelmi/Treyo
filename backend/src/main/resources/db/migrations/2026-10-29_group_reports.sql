-- End-of-course reports and attestations (GroupReportService).
--
-- When a group's sessions are over its trainer is asked for a report: for
-- each learner, sessions attended and a result; then whether every session
-- was held, how much of the course plan was covered, how the level and the
-- prerequisites fitted the group, and anything else. Sent once, never
-- edited. Learners marked COMPLETED receive an attestation de
-- participation (AttestationService), in the app and by email.
--
-- group_reports
--   One row per group (unique group_id). sessions_not_held is JSON, read by
--   trainer earnings: those days are not paid. Choices are plain strings,
--   so there is no CHECK constraint to rebuild when one is added.
--
-- group_report_learners
--   One row per learner in a report (unique enrollment_id). The note is
--   for administrators only, which is why this is not on enrollments: the
--   app receives enrollments as they are.
--
-- In development ddl-auto=update will already have created all of this;
-- every statement is a no-op then. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS group_reports (
    report_id          VARCHAR(50)   PRIMARY KEY,
    group_id           VARCHAR(50),
    course_id          VARCHAR(50),
    trainer_id         VARCHAR(50),
    all_sessions_held  BOOLEAN,
    sessions_not_held  TEXT,
    plan_coverage      VARCHAR(10),
    plan_left_out      VARCHAR(300),
    level_fit          VARCHAR(10),
    prerequisites      VARCHAR(15),
    comments           VARCHAR(1000),
    admin_note         VARCHAR(2000),
    admin_note_at      TIMESTAMP,
    created_at         TIMESTAMP     NOT NULL,
    updated_at         TIMESTAMP,
    CONSTRAINT uq_group_reports_group UNIQUE (group_id)
);

CREATE INDEX IF NOT EXISTS idx_group_reports_trainer ON group_reports (trainer_id);

CREATE TABLE IF NOT EXISTS group_report_learners (
    report_learner_id       VARCHAR(50)  PRIMARY KEY,
    report_id               VARCHAR(50),
    group_id                VARCHAR(50),
    enrollment_id           VARCHAR(50),
    student_id              VARCHAR(50),
    sessions_attended       INTEGER,
    result                  VARCHAR(20),
    note                    VARCHAR(200),
    attestation_emailed_at  TIMESTAMP,
    created_at              TIMESTAMP    NOT NULL,
    updated_at              TIMESTAMP,
    CONSTRAINT uq_group_report_learners_enrollment UNIQUE (enrollment_id)
);

CREATE INDEX IF NOT EXISTS idx_group_report_learners_report  ON group_report_learners (report_id);
CREATE INDEX IF NOT EXISTS idx_group_report_learners_student ON group_report_learners (student_id);

COMMIT;
