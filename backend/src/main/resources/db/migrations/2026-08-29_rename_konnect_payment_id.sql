-- Rename enrollments.konnect_payment_id -> payment_ref
--
-- Konnect was the gateway used while prototyping; ClicToPay (SMT/ATB) is
-- the real one. The column holds a gateway reference, not a Konnect one,
-- and naming it after a provider that was never used in production is
-- misleading to anyone reading the schema later.
--
-- ORDERING MATTERS. The backend runs with ddl-auto=validate, which fails
-- at startup on any mismatch between entity and schema. So:
--
--   1. upload the new JAR to /tmp (do NOT restart yet)
--   2. run this migration
--   3. move the JAR into place and restart
--
-- Between 2 and 3 the running instance keeps serving from memory, but a
-- restart in that window would fail — keep it short. Reversing the order
-- fails immediately instead, which is the safer way to get it wrong.
--
-- Idempotent: safe to run twice, and safe on a database that has already
-- been renamed by hand.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'enrollments'
          AND column_name = 'konnect_payment_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'enrollments'
          AND column_name = 'payment_ref'
    ) THEN
        ALTER TABLE enrollments RENAME COLUMN konnect_payment_id TO payment_ref;
        RAISE NOTICE 'Renamed enrollments.konnect_payment_id to payment_ref';
    ELSE
        RAISE NOTICE 'No rename needed (already payment_ref, or column absent)';
    END IF;
END $$;
