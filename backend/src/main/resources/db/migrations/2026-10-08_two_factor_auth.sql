-- Two-factor authentication (TOTP) for learners and trainers.
--
-- The app has shown a "Two-Factor Authentication" switch since the first
-- release, but it only wrote the user's preference to local storage —
-- logging in was never affected. These columns back the real thing.
--
-- two_factor_secret
--   The shared TOTP secret, Base32, as handed to the authenticator app.
--   NULL until the user starts setup. It is a credential: anyone holding
--   it can generate valid codes, so it is never returned by any endpoint
--   once two_factor_enabled is true.
--
-- two_factor_enabled
--   False while setup is in progress. Only flipped once the user has
--   proved they can produce a correct code, so a half-finished setup can
--   never lock anyone out of their account.
--
-- two_factor_recovery_codes
--   Comma-separated SHA-256 hashes of single-use recovery codes, for the
--   day the phone is lost. Hashed, not encrypted: they are verified, not
--   displayed, and the plaintext is shown exactly once at enrolment.
--   SHA-256 rather than bcrypt deliberately — these are high-entropy
--   random codes, not guessable passwords, so there is nothing for a slow
--   hash to defend against, and a login must check up to ten of them.
--
-- Written so it corrects the schema whether the columns are absent or
-- were already created by Hibernate. This project runs ddl-auto=update,
-- which adds a Boolean field as a NULLABLE column with no default, so
-- "ADD COLUMN IF NOT EXISTS ... NOT NULL DEFAULT FALSE" on its own would
-- skip the whole statement and leave that wrong. The default and the
-- NOT NULL are therefore applied separately, after backfilling any NULLs
-- that are already there.
--
-- Safe to re-run.

ALTER TABLE students
    ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN,
    ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(64),
    ADD COLUMN IF NOT EXISTS two_factor_recovery_codes TEXT;

UPDATE students SET two_factor_enabled = FALSE WHERE two_factor_enabled IS NULL;

ALTER TABLE students
    ALTER COLUMN two_factor_enabled SET DEFAULT FALSE,
    ALTER COLUMN two_factor_enabled SET NOT NULL;

ALTER TABLE trainers
    ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN,
    ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(64),
    ADD COLUMN IF NOT EXISTS two_factor_recovery_codes TEXT;

UPDATE trainers SET two_factor_enabled = FALSE WHERE two_factor_enabled IS NULL;

ALTER TABLE trainers
    ALTER COLUMN two_factor_enabled SET DEFAULT FALSE,
    ALTER COLUMN two_factor_enabled SET NOT NULL;
