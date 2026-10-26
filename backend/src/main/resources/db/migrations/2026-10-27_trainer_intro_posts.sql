-- Trainer introductions in the learners' feed (TrainerIntroService).
--
-- New trainers are introduced in the feed rather than by notification: an
-- administrator publishes a short introduction from the dashboard, it stays
-- first for three days, and its card opens the trainer's profile.
--
-- trainer_id
--   The trainer a NEW_TRAINER post introduces. Null for the AI's posts.
--
-- pinned_until
--   Shown above everything else until then. Null for posts that are never
--   pinned, which is all of the AI's.
--
-- category
--   New value NEW_TRAINER. Hibernate created a CHECK constraint listing the
--   enum's values when it made the table and never alters it, so inserting
--   the new value fails until the constraint is rebuilt. Rebuilt as the
--   union of the backend's values and every value already stored, so no
--   existing row can become invalid — the approach of
--   2026-10-22_account_confirmation_codes.sql.
--
-- Safe to re-run.

BEGIN;

ALTER TABLE feed_posts ADD COLUMN IF NOT EXISTS trainer_id   VARCHAR(50);
ALTER TABLE feed_posts ADD COLUMN IF NOT EXISTS pinned_until TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_feed_posts_trainer ON feed_posts (trainer_id);

DO $$
DECLARE
  allowed text;
BEGIN
  SELECT string_agg(quote_literal(v), ', ' ORDER BY v) INTO allowed
  FROM (
    -- Backend vocabulary (FeedPost.Category)
    SELECT unnest(ARRAY['FUN_FACT', 'DOMAIN_TIP', 'MOTIVATION', 'NEWS', 'NEW_TRAINER']) AS v
    UNION
    -- Values already present, kept valid
    SELECT DISTINCT category FROM feed_posts WHERE category IS NOT NULL
  ) s;

  ALTER TABLE feed_posts DROP CONSTRAINT IF EXISTS feed_posts_category_check;

  EXECUTE format(
    'ALTER TABLE feed_posts ADD CONSTRAINT feed_posts_category_check '
    'CHECK (category::text = ANY (ARRAY[%s]::text[]))',
    allowed);

  RAISE NOTICE 'feed_posts_category_check now allows: %', allowed;
END $$;

COMMIT;
