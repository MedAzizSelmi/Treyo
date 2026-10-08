-- A way to revoke sessions.
--
-- Authentication is stateless JWT: the server keeps no record of what it
-- has issued, which is why nothing could ever be taken back. Refresh
-- tokens live 30 days, so a stolen phone or a leaked token stayed valid
-- for a month, and changing the password did not help — it rewrote the
-- hash and left every existing token working.
--
-- tokens_valid_from is the cheap version of a sessions table. Any token
-- issued before this instant is refused. Signing out everywhere sets it
-- to now; so does changing the password. One column, no per-session
-- rows, and nothing new to plumb through the login paths.
--
-- What it deliberately does not do is name the devices. Listing them
-- needs a row per session with device metadata and a last-seen column,
-- which is a different and much larger change. The UI says "sign out
-- everywhere" rather than pretending to know what is signed in.
--
-- NULL means "never revoked", which is every account that exists today,
-- so no backfill is needed and no one is logged out by this migration.
--
-- Stored truncated to the second on write: the JWT `iat` claim has
-- second granularity, so a sub-second value here would reject a token
-- issued in the same second it was set — including the one handed out
-- by the login that immediately follows.
--
-- Safe to re-run.

ALTER TABLE students
    ADD COLUMN IF NOT EXISTS tokens_valid_from TIMESTAMP;

ALTER TABLE trainers
    ADD COLUMN IF NOT EXISTS tokens_valid_from TIMESTAMP;

ALTER TABLE admins
    ADD COLUMN IF NOT EXISTS tokens_valid_from TIMESTAMP;
