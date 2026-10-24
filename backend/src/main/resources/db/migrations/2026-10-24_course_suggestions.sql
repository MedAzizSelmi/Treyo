-- Course suggestions: courses learners asked for and could not find, so
-- administrators can look for a trainer (CourseSuggestionService).
--
-- course_suggestions
--   One row per request. status is a plain string — new, searching,
--   published, declined, rejected, withdrawn, merged — so it has no CHECK
--   constraint to rebuild when a value is added.
--
-- course_suggestion_supporters
--   The learners behind a request: its author and everyone who said "me
--   too". One row per learner and request.
--
-- hidden_search_terms
--   Searches an administrator hid from "searches that found nothing", by
--   matching key (lower case, no accents, no spaces).
--
-- search_logs.result_count
--   How many courses a search found, sent by the app from October 2026.
--   Nullable on purpose: older rows did not record it and stay out of the
--   "found nothing" list rather than being counted as misses.
--
-- In development ddl-auto=update will already have created all of this;
-- every statement is a no-op then. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS course_suggestions (
    suggestion_id VARCHAR(50)   PRIMARY KEY,
    student_id    VARCHAR(50),
    topic         VARCHAR(120),
    details       VARCHAR(1000),
    domain        VARCHAR(100),
    level         VARCHAR(30),
    format        VARCHAR(30),
    language      VARCHAR(10),
    city          VARCHAR(100),
    status        VARCHAR(20),
    admin_note    VARCHAR(2000),
    course_id     VARCHAR(50),
    merged_into   VARCHAR(50),
    closed_at     TIMESTAMP,
    created_at    TIMESTAMP     NOT NULL,
    updated_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_course_suggestions_student ON course_suggestions (student_id);
CREATE INDEX IF NOT EXISTS idx_course_suggestions_status  ON course_suggestions (status);

CREATE TABLE IF NOT EXISTS course_suggestion_supporters (
    supporter_id  VARCHAR(50)   PRIMARY KEY,
    suggestion_id VARCHAR(50),
    student_id    VARCHAR(50),
    created_at    TIMESTAMP     NOT NULL,
    updated_at    TIMESTAMP,
    CONSTRAINT uq_course_suggestion_supporter UNIQUE (suggestion_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_course_suggestion_supporters_student ON course_suggestion_supporters (student_id);

CREATE TABLE IF NOT EXISTS hidden_search_terms (
    term_key   VARCHAR(200) PRIMARY KEY,
    label      VARCHAR(200),
    hidden_by  VARCHAR(50),
    created_at TIMESTAMP    NOT NULL,
    updated_at TIMESTAMP
);

ALTER TABLE search_logs ADD COLUMN IF NOT EXISTS result_count INTEGER;

COMMIT;
