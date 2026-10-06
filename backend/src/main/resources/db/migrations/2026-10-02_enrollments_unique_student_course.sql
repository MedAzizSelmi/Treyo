-- Enrollments: one row per (student, course)
--
-- EnrollmentService refuses a second enrollment by reading the table
-- first, inside the transaction. That protects the ordinary case but not
-- two simultaneous confirmations: both can read "none", both insert. The
-- gateway's own retries make that more than theoretical, since the
-- webhook and the client confirm the same payment.
--
-- The index makes the database the authority: the loser of a race gets a
-- constraint violation instead of creating a second paid enrollment.
--
-- Idempotent. Run it on every environment (local, then VPS).

-- Step 1 — look for duplicates first. The index cannot be created while
-- any exist, and only a human can decide which row to keep.
--
--   SELECT student_id, course_id, COUNT(*) AS rows
--   FROM enrollments
--   GROUP BY student_id, course_id
--   HAVING COUNT(*) > 1;
--
-- If that returns nothing, continue.

-- Step 2 — enforce it.
CREATE UNIQUE INDEX IF NOT EXISTS ux_enrollments_student_course
    ON enrollments (student_id, course_id);
