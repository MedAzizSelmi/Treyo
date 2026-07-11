import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { I18nManager, Platform } from 'react-native';

import en from './locales/en.json';
import fr from './locales/fr.json';
import ar from './locales/ar.json';
import es from './locales/es.json';

/**
 * App-wide i18n.
 *
 * Storage:
 *   - User picks a language on settings-language → we persist to
 *     AsyncStorage under LANGUAGE_KEY.
 *   - On app start, init() reads that value (falling back to the
 *     device locale, then English) and tells i18next + RN's I18nManager.
 *
 * RTL:
 *   - Arabic flips the whole RN layout via I18nManager.forceRTL.
 *   - RN can't switch layout direction at runtime — the bundle has to
 *     re-mount after the flag flips. We expose `requiresRestart` from
 *     setLanguage() so the settings screen can prompt the user to
 *     restart the app once. Without this prompt, only newly-mounted
 *     screens get the new direction and the UI looks half-flipped.
 *
 * Adding a new key:
 *   - Add it to en.json with the English fallback string.
 *   - Add translated values to fr/ar/es. Missing keys fall back to
 *     `defaultValue` (English) automatically — nothing breaks.
 */

export const LANGUAGE_KEY = 'app_language';
export const SUPPORTED_LANGUAGES = ['en', 'fr', 'ar', 'es'] as const;
export type Language = typeof SUPPORTED_LANGUAGES[number];

const RTL_LANGUAGES: Language[] = ['ar'];

/** Initialise i18next once at app start. Idempotent — safe to call from
 *  both module load and a useEffect on mount. */
let initialised = false;
export async function initI18n(): Promise<void> {
    if (initialised) return;
    initialised = true;

    // Resolve which language to start in:
    //   1. Persisted choice (highest priority — it's what the user picked)
    //   2. Device locale's primary tag, if supported
    //   3. English
    let chosen: Language = 'en';
    try {
        const persisted = await AsyncStorage.getItem(LANGUAGE_KEY);
        if (persisted && (SUPPORTED_LANGUAGES as readonly string[]).includes(persisted)) {
            chosen = persisted as Language;
        } else {
            const locales = Localization.getLocales();
            const primary = locales?.[0]?.languageCode || 'en';
            if ((SUPPORTED_LANGUAGES as readonly string[]).includes(primary)) {
                chosen = primary as Language;
            }
        }
    } catch (_) {}

    await i18n
        .use(initReactI18next)
        .init({
            // Resources are bundled — no remote fetch. Keeps the first
            // render synchronous after init() resolves and avoids any
            // flash-of-untranslated-content on subsequent app opens.
            resources: { en: { translation: en }, fr: { translation: fr }, ar: { translation: ar }, es: { translation: es } },
            lng: chosen,
            fallbackLng: 'en',
            compatibilityJSON: 'v4',
            interpolation: { escapeValue: false },
            returnNull: false,
        });

    // Align RN layout direction with the persisted language. This is
    // mostly relevant for the first app open in Arabic — without it
    // the OS bundle is LTR until the user touches the language screen.
    const wantRTL = RTL_LANGUAGES.includes(chosen);
    if (I18nManager.isRTL !== wantRTL) {
        try {
            I18nManager.allowRTL(wantRTL);
            I18nManager.forceRTL(wantRTL);
        } catch (_) {}
    }
}

/**
 * Switch language at runtime.
 * Returns whether a full app reload is required for the layout
 * direction to settle (only true when toggling in/out of an RTL
 * language). The caller is responsible for surfacing the restart
 * prompt — we don't reload here so the settings screen can show a
 * confirmation toast first.
 */
export async function setLanguage(lang: Language): Promise<{ requiresRestart: boolean }> {
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
    await i18n.changeLanguage(lang);

    const wantRTL = RTL_LANGUAGES.includes(lang);
    const isRTL = I18nManager.isRTL;
    if (isRTL !== wantRTL) {
        try {
            I18nManager.allowRTL(wantRTL);
            I18nManager.forceRTL(wantRTL);
        } catch (_) {}
        // Direction can only fully apply after the JS bundle reloads.
        return { requiresRestart: true };
    }
    return { requiresRestart: false };
}

export function getCurrentLanguage(): Language {
    const lng = (i18n.language || 'en').split('-')[0];
    return (SUPPORTED_LANGUAGES as readonly string[]).includes(lng) ? (lng as Language) : 'en';
}

export default i18n;
