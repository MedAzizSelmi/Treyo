-- When an administrator approved a group's session schedule.
--
-- The group flow agreed at the October 2026 review: a course reaching its
-- minimum requests opens a group on its own, the trainer schedules it, an
-- administrator approves (or edits) the schedule, and only then are the
-- learners asked to pay — so they pay knowing the dates. This column is the
-- line between "being prepared" and "open for payment"; once it is set the
-- trainer can no longer change the schedule, because learners are paying
-- for those dates and there are no refunds.
--
-- NULL means not approved, which is also what every group formed under the
-- old flow has: those keep their old behaviour.
--
-- Safe to re-run.

ALTER TABLE groups ADD COLUMN IF NOT EXISTS schedule_approved_at TIMESTAMP;
