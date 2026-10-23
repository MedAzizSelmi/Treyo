import type { TFunction } from 'i18next';

/**
 * Education levels as stored: English text, saved as-is on the learner's
 * and the trainer's profile, and matched against CV parsing. They stay
 * English in the database so existing profiles and the recommendation
 * engine keep reading the same values; only the label shown is translated.
 */
export const EDUCATION_LEVELS = [
    "High School",
    "Bachelor's Degree",
    "Master's Degree",
    "PhD",
    "Professional Certification",
    "Other",
] as const;

const KEYS: Record<string, string> = {
    "High School": 'highSchool',
    "Bachelor's Degree": 'bachelor',
    "Master's Degree": 'master',
    "PhD": 'phd',
    "Professional Certification": 'certification',
    "Other": 'other',
};

/** The stored value's label in the app's language; unknown values as they are. */
export function educationLabel(t: TFunction, value?: string | null): string {
    if (!value) return '';
    const key = KEYS[value];
    return key ? t(`educationLevels.${key}`) : value;
}
