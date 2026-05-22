-- ============================================================================
--  Migration: introduce CourseTemplate + admin-driven course creation
--  Date:      2026-05-13
--
--  Hibernate (ddl-auto=update) will create the new table and add the new
--  column automatically on the next backend restart. This script exists for
--  reproducibility on clean databases and as a paper trail. Run it manually
--  ONLY if you're starting from a fresh DB or want to re-create the table.
--
--  Architecture change:
--    Before: Course was trainer-created. Trainer owned title/price/etc.
--    After : Admin creates a CourseTemplate (the master content). Admin
--            assigns the template to a roster of trainers; each assignment
--            spins up a Course row (the trainer-specific offering) linked
--            back to the template via course.template_id. When admin edits
--            the template, all linked offerings get the new content pushed
--            down — students see consistent info regardless of trainer.
--            ML model is unaffected: each offering still has its own courseId
--            and tracks its own interactions, so the model learns trainer
--            preference naturally.
-- ============================================================================

-- 1) The master template table -----------------------------------------------
CREATE TABLE IF NOT EXISTS course_templates (
    template_id              VARCHAR(50)  PRIMARY KEY,
    title                    VARCHAR(500) NOT NULL,
    description              TEXT         NOT NULL,
    domain                   VARCHAR(100) NOT NULL,
    specific_topic           VARCHAR(200) NOT NULL,
    level                    VARCHAR(20),
    duration_hours           INTEGER,
    language                 VARCHAR(50)  DEFAULT 'French',
    format                   VARCHAR(50),
    prerequisites            TEXT,
    learning_outcomes        TEXT[],
    price                    NUMERIC(10, 2) DEFAULT 0,
    currency                 VARCHAR(10)  DEFAULT 'TND',
    has_certificate          BOOLEAN      DEFAULT FALSE,
    min_students_required    INTEGER      DEFAULT 5,
    max_students_per_group   INTEGER      DEFAULT 30,
    max_groups_allowed       INTEGER      DEFAULT 1,
    is_active                BOOLEAN      DEFAULT TRUE,
    created_at               TIMESTAMP    NOT NULL,
    updated_at               TIMESTAMP
);

-- 2) Backref from Course → CourseTemplate -----------------------------------
ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS template_id VARCHAR(50);

-- Index so the cascade-update query (find offerings by template) is fast.
CREATE INDEX IF NOT EXISTS idx_courses_template_id
    ON courses (template_id);

-- 3) Optional: foreign-key constraint ---------------------------------------
-- Wrapped in a DO block so re-runs are idempotent (Postgres lacks IF NOT EXISTS
-- for ADD CONSTRAINT prior to v17).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_courses_template'
    ) THEN
        ALTER TABLE courses
            ADD CONSTRAINT fk_courses_template
            FOREIGN KEY (template_id)
            REFERENCES course_templates (template_id)
            ON DELETE SET NULL;
    END IF;
END
$$;
