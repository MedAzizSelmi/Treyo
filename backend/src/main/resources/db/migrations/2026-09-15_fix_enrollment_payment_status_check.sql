-- ============================================================================
--  Migration: widen enrollments_payment_status_check to the backend vocabulary
--  Date:      2026-09-15
--
--  Problem:
--    Confirming an enrollment in a FREE course failed with SQLState 23514:
--      "la nouvelle ligne de la relation « enrollments » viole la contrainte
--       de vérification « enrollments_payment_status_check »"
--
--    EnrollmentService.confirmEnrollment writes payment_status = 'unpaid'
--    when the course price is 0 (and 'paid' otherwise) -- the vocabulary
--    documented on Enrollment.paymentStatus: unpaid, paid, partial, refunded.
--    The CHECK constraint predates that vocabulary and does not accept
--    'unpaid', so every free-course confirmation was rejected. Paid
--    confirmations ('paid') were unaffected, which is why it went unnoticed.
--
--    Same root cause as 2026-08-07_fix_course_format_check.sql: Hibernate
--    never ALTERs an existing constraint, so schema drift only surfaces at
--    runtime.
--
--  Fix:
--    Recreate the constraint as the union of
--      (a) the backend vocabulary, and
--      (b) every value already stored in the table,
--    so no existing row can become invalid, whatever the old constraint
--    allowed. Idempotent: running it again simply rebuilds the same list.
--
--  To see the constraint before/after:
--    SELECT pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conname = 'enrollments_payment_status_check';
-- ============================================================================

BEGIN;

DO $$
DECLARE
  allowed text;
BEGIN
  SELECT string_agg(quote_literal(v), ', ' ORDER BY v) INTO allowed
  FROM (
    -- Backend vocabulary (Enrollment.paymentStatus)
    SELECT unnest(ARRAY['unpaid', 'paid', 'partial', 'refunded']) AS v
    UNION
    -- Values already present, kept valid
    SELECT DISTINCT payment_status FROM enrollments WHERE payment_status IS NOT NULL
  ) s;

  ALTER TABLE enrollments DROP CONSTRAINT IF EXISTS enrollments_payment_status_check;

  EXECUTE format(
    'ALTER TABLE enrollments ADD CONSTRAINT enrollments_payment_status_check '
    'CHECK (payment_status::text = ANY (ARRAY[%s]::text[]))',
    allowed);

  RAISE NOTICE 'enrollments_payment_status_check now allows: %', allowed;
END $$;

COMMIT;
