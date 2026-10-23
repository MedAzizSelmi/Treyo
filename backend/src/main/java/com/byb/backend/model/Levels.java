package com.byb.backend.model;

import java.util.Locale;

/**
 * The one vocabulary for difficulty: beginner, intermediate, expert.
 *
 * A course's level and a learner's experience level are compared word for
 * word — by the app's search filter, and by the recommendation engine,
 * which boosts courses whose level equals the learner's. The search
 * screen filtered on "ADVANCED" while trainers saved "expert", so no
 * expert course ever matched; and a stray "Beginner" or "advanced" from
 * an import silently missed the recommender's boost. Every write goes
 * through here so only the three words reach the database
 * (2026-10-22_normalize_levels.sql cleaned what was already there).
 */
public final class Levels {

    private Levels() {}

    /**
     * Lower-cased, with "advanced" read as "expert". Null and blank stay
     * null; anything unrecognised is kept, lower-cased, rather than
     * guessed at.
     */
    public static String normalize(String level) {
        if (level == null || level.isBlank()) return null;
        String v = level.trim().toLowerCase(Locale.ROOT);
        return "advanced".equals(v) ? "expert" : v;
    }
}
