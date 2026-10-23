-- One vocabulary for difficulty levels: beginner, intermediate, expert.
--
-- Why: levels are compared word for word. The app's search filter offered
-- "ADVANCED" while trainers saved "expert", so no expert course ever
-- matched; and the recommendation engine boosts a course only when its
-- level equals the learner's experience_level exactly, so a "Beginner" or
-- "advanced" from an import silently missed the boost. The backend now
-- normalises every write (Levels.normalize); this cleans what was already
-- stored.
--
-- Lower-cases the three known words and reads "advanced" as "expert".
-- Anything else is left alone, and listed in the NOTICE so it can be
-- looked at rather than guessed at.
--
-- Safe to re-run.

BEGIN;

DO $$
DECLARE
  n_courses   int;
  n_templates int;
  n_students  int;
  leftovers   text;
BEGIN
  UPDATE courses
     SET level = CASE WHEN lower(trim(level)) = 'advanced' THEN 'expert' ELSE lower(trim(level)) END
   WHERE level IS NOT NULL
     AND lower(trim(level)) IN ('beginner', 'intermediate', 'expert', 'advanced')
     AND level <> CASE WHEN lower(trim(level)) = 'advanced' THEN 'expert' ELSE lower(trim(level)) END;
  GET DIAGNOSTICS n_courses = ROW_COUNT;

  UPDATE course_templates
     SET level = CASE WHEN lower(trim(level)) = 'advanced' THEN 'expert' ELSE lower(trim(level)) END
   WHERE level IS NOT NULL
     AND lower(trim(level)) IN ('beginner', 'intermediate', 'expert', 'advanced')
     AND level <> CASE WHEN lower(trim(level)) = 'advanced' THEN 'expert' ELSE lower(trim(level)) END;
  GET DIAGNOSTICS n_templates = ROW_COUNT;

  UPDATE students
     SET experience_level = CASE WHEN lower(trim(experience_level)) = 'advanced' THEN 'expert'
                                 ELSE lower(trim(experience_level)) END
   WHERE experience_level IS NOT NULL
     AND lower(trim(experience_level)) IN ('beginner', 'intermediate', 'expert', 'advanced')
     AND experience_level <> CASE WHEN lower(trim(experience_level)) = 'advanced' THEN 'expert'
                                  ELSE lower(trim(experience_level)) END;
  GET DIAGNOSTICS n_students = ROW_COUNT;

  SELECT string_agg(DISTINCT v, ', ') INTO leftovers FROM (
    SELECT level AS v FROM courses WHERE level IS NOT NULL
    UNION SELECT level FROM course_templates WHERE level IS NOT NULL
    UNION SELECT experience_level FROM students WHERE experience_level IS NOT NULL
  ) s WHERE v NOT IN ('beginner', 'intermediate', 'expert');

  RAISE NOTICE 'Levels normalised: % course(s), % template(s), % learner(s). Unrecognised values left as they are: %',
    n_courses, n_templates, n_students, coalesce(leftovers, 'none');
END $$;

COMMIT;
