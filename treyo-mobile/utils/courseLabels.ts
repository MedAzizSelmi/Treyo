import type { TFunction } from 'i18next';

/**
 * Course levels and teaching languages: the values stored on a course,
 * and how to show them.
 *
 * Levels are compared word for word — by search, and by the server's
 * recommendation engine against the learner's own level — so there is
 * one vocabulary, the backend's: beginner, intermediate, expert. Search
 * used to filter on "ADVANCED", which no course ever had, so expert
 * courses could not be found by level at all. Older data may still say
 * "advanced" or be capitalised, so it is normalised before comparing.
 *
 * Languages are stored as English names ("French"), as the backend has
 * always done, and translated for display.
 */

export const COURSE_LEVELS = ['beginner', 'intermediate', 'expert'] as const;
export type CourseLevel = typeof COURSE_LEVELS[number];

export function normalizeLevel(level?: string | null): string | null {
    if (!level || !level.trim()) return null;
    const v = level.trim().toLowerCase();
    return v === 'advanced' ? 'expert' : v;
}

export function levelLabel(t: TFunction, level?: string | null): string {
    const v = normalizeLevel(level);
    return v && (COURSE_LEVELS as readonly string[]).includes(v) ? t(`levels.${v}`) : (level || '');
}

export const COURSE_LANGUAGES = ['French', 'Arabic', 'English', 'Spanish'] as const;
export type CourseLanguage = typeof COURSE_LANGUAGES[number];

export function languageLabel(t: TFunction, language?: string | null): string {
    const known = COURSE_LANGUAGES.find(l => l.toLowerCase() === (language || '').trim().toLowerCase());
    return known ? t(`courseLanguages.${known.toLowerCase()}`) : (language || '');
}

/** The trainer's app language is the likeliest teaching language. */
export function defaultCourseLanguage(appLanguage?: string): CourseLanguage {
    const code = (appLanguage || '').slice(0, 2).toLowerCase();
    if (code === 'ar') return 'Arabic';
    if (code === 'en') return 'English';
    if (code === 'es') return 'Spanish';
    return 'French';
}
