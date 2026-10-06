-- Courses: backfill total_enrolled from the enrollments that exist
--
-- The column was never written by the application, so it has sat at 0
-- since the first course was created. Two things read it:
--
--   * the recommendation engine, which selects it as num_enrolled and
--     uses it for the popularity signal (5 % of the hybrid score) and
--     for trending results — both inert while the value is 0;
--   * the trainer's profile screen, which sums it as "students taught".
--
-- EnrollmentService now increments it on every confirmed enrollment, so
-- this script only needs to correct the history once.
--
-- Idempotent: it recomputes the value rather than adding to it.

UPDATE courses c
SET total_enrolled = COALESCE(e.cnt, 0)
FROM (
    SELECT course_id, COUNT(*) AS cnt
    FROM enrollments
    GROUP BY course_id
) e
WHERE c.course_id = e.course_id
  AND c.total_enrolled IS DISTINCT FROM e.cnt;

-- Courses nobody ever enrolled in: make sure the column is 0, not NULL,
-- so the engine's arithmetic has no gaps.
UPDATE courses
SET total_enrolled = 0
WHERE total_enrolled IS NULL;
