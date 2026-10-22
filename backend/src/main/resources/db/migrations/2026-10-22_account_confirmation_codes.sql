-- Emailed six-digit codes that confirm account deletion or setting a
-- password, stored in verification_tokens alongside the existing links.
--
-- Why: an account created through Google or LinkedIn is given a random
-- password its owner never knew. Deleting the account and changing the
-- password both asked for the current password, so those users could do
-- neither from the app. A code sent to the account's address now stands in
-- for the password (ConfirmationCodeService).
--
-- attempts
--   Wrong guesses against a code; five spend it. Zero for links, which
--   are long random strings and not guessable. Added, backfilled, then
--   given its default and NOT NULL as separate statements: ddl-auto=update
--   will already have created it as a nullable column with no default, and
--   "ADD COLUMN IF NOT EXISTS ... NOT NULL DEFAULT 0" would then do nothing.
--
-- purpose
--   Two new values, ACCOUNT_DELETE and PASSWORD_SET. Hibernate created a
--   CHECK constraint listing the enum's values when it made the table, and
--   it never alters a constraint afterwards, so inserting either new value
--   fails until the constraint is rebuilt. Rebuilt as the union of the
--   backend's values and every value already stored, so no existing row
--   can become invalid. Same approach as
--   2026-09-15_fix_enrollment_payment_status_check.sql.
--
-- Safe to re-run.

BEGIN;

ALTER TABLE verification_tokens ADD COLUMN IF NOT EXISTS attempts INTEGER;

UPDATE verification_tokens SET attempts = 0 WHERE attempts IS NULL;

ALTER TABLE verification_tokens
    ALTER COLUMN attempts SET DEFAULT 0,
    ALTER COLUMN attempts SET NOT NULL;

DO $$
DECLARE
  allowed text;
BEGIN
  SELECT string_agg(quote_literal(v), ', ' ORDER BY v) INTO allowed
  FROM (
    -- Backend vocabulary (VerificationToken.Purpose)
    SELECT unnest(ARRAY['EMAIL_VERIFY', 'PASSWORD_RESET', 'ACCOUNT_DELETE', 'PASSWORD_SET']) AS v
    UNION
    -- Values already present, kept valid
    SELECT DISTINCT purpose FROM verification_tokens WHERE purpose IS NOT NULL
  ) s;

  ALTER TABLE verification_tokens DROP CONSTRAINT IF EXISTS verification_tokens_purpose_check;

  EXECUTE format(
    'ALTER TABLE verification_tokens ADD CONSTRAINT verification_tokens_purpose_check '
    'CHECK (purpose::text = ANY (ARRAY[%s]::text[]))',
    allowed);

  RAISE NOTICE 'verification_tokens_purpose_check now allows: %', allowed;
END $$;

COMMIT;
