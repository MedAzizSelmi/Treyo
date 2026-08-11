-- ============================================================================
--  Migration: widen courses_format_check to the delivery-mode vocabulary
--  Date:      2026-08-07
--
--  Problem:
--    Trainer course creation failed with SQLState 23514:
--      "la nouvelle ligne de la relation « courses » viole la contrainte
--       de vérification « courses_format_check »"
--
--    The CHECK constraint still encoded the ORIGINAL content-type
--    vocabulary from the first schema draft:
--        'Video', 'Live Sessions', 'Hybrid', 'Text-based', 'Project-based'
--
--    But the app has since moved to a DELIVERY-MODE vocabulary (what the
--    CourseFormat enum and the trainer course-create screen actually use):
--        'Online', 'Face-to-face', 'Hybrid'
--
--    Only 'Hybrid' overlapped, so any trainer picking Online or
--    Face-to-face hit the constraint and the insert was rejected.
--
--    Hibernate's ddl-auto=update never ALTERs an existing constraint, so
--    the drift went unnoticed until a trainer tried to submit a course.
--
--  Fix:
--    Widen the constraint to accept BOTH vocabularies. This is deliberately
--    non-destructive: at the time of writing, 201 existing course rows still
--    use the legacy content-type values (Video 46, Live Sessions 43,
--    Project-based 40, Hybrid 38, Text-based 34). Narrowing the constraint
--    to delivery-mode only would require rewriting those rows, and the
--    old -> new mapping is genuinely ambiguous (is "Live Sessions" Online
--    or Face-to-face? what delivery mode is "Project-based"?). That is a
--    product decision, not a mechanical migration -- see the note below.
--
--  Follow-up (NOT done here, requires a product decision):
--    Once the legacy rows are either migrated or retired, this constraint
--    should be narrowed to just the three delivery modes:
--      ALTER TABLE courses DROP CONSTRAINT courses_format_check;
--      ALTER TABLE courses ADD CONSTRAINT courses_format_check
--        CHECK (format::text = ANY (ARRAY['Online','Face-to-face','Hybrid']::text[]));
-- ============================================================================

BEGIN;

ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_format_check;

ALTER TABLE courses ADD CONSTRAINT courses_format_check
  CHECK (format::text = ANY (ARRAY[
    -- Current delivery-mode vocabulary (CourseFormat)
    'Online', 'Face-to-face', 'Hybrid',
    -- Legacy content-type vocabulary, kept so existing rows stay valid
    'Video', 'Live Sessions', 'Text-based', 'Project-based'
  ]::text[]));

COMMIT;
