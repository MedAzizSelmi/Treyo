'use client';

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from 'react';
import en from './locales/en.json';
import fr from './locales/fr.json';
import ar from './locales/ar.json';
import es from './locales/es.json';

/**
 * The dashboard's language: English, French, Arabic or Spanish, as the
 * app speaks (October 2026). Chosen in the sidebar and remembered in this
 * browser; Arabic turns the page right-to-left, which is why the layout uses
 * start/end classes (ms-, ps-, start-…) rather than left/right.
 *
 * Client-side rather than Next's locale routes (/fr/dashboard/…): the
 * dashboard renders in the browser behind a sign-in, so localised URLs
 * would only move every page for nothing.
 *
 * Messages coming from the server (errors, notification text) stay as the
 * server wrote them.
 */
export type Lang = 'en' | 'fr' | 'ar' | 'es';
export const LANGS: { code: Lang; label: string; short: string }[] = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'fr', label: 'Français', short: 'FR' },
  { code: 'ar', label: 'العربية', short: 'ع' },
  { code: 'es', label: 'Español', short: 'ES' },
];

type Dict = Record<string, unknown>;
const DICTS: Record<Lang, Dict> = { en, fr, ar, es };
const STORAGE_KEY = 'treyo_admin_lang';
/** For dates and numbers: Tunisian Arabic keeps Western digits. */
const LOCALES: Record<Lang, string> = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-TN', es: 'es-ES' };

type Params = Record<string, string | number | null | undefined>;
type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, params?: Params) => string;
  /** The browser locale for this language, for toLocaleDateString and friends. */
  locale: string;
};

const I18nContext = createContext<Ctx | null>(null);

function lookup(dict: Dict, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Dict)) cur = (cur as Dict)[part];
    else return undefined;
  }
  return typeof cur === 'string' ? cur : undefined;
}

function translate(lang: Lang, key: string, params?: Params): string {
  const count = params && typeof params.count === 'number' ? params.count : null;
  const keys = count === null ? [key] : [`${key}_${count === 1 ? 'one' : 'other'}`, key];
  let text: string | undefined;
  for (const k of keys) {
    text = lookup(DICTS[lang], k) ?? lookup(DICTS.en, k);
    if (text !== undefined) break;
  }
  if (text === undefined) {
    // A value with no translation, such as a status the server added.
    const fallback = params?.defaultValue;
    return fallback != null ? String(fallback) : key;
  }
  if (!params) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_, name) => (params[name] ?? '').toString());
}

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved && saved in DICTS) return saved;
  } catch {
    // Storage blocked: fall through to the browser's language.
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : 'en';
  return (nav in DICTS ? nav : 'en') as Lang;
}

// The choice lives outside React so it survives a storage failure and every
// provider reads the same one; useSyncExternalStore subscribes to it.
let chosen: Lang | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function choose(l: Lang) {
  chosen = l;
  try { localStorage.setItem(STORAGE_KEY, l); } catch { /* not remembered, still applied */ }
  listeners.forEach((fn) => fn());
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // English on the server render; the saved choice once in the browser.
  const lang = useSyncExternalStore(
    subscribe,
    () => chosen ?? (chosen = initialLang()),
    () => 'en' as Lang,
  );

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const setLang = useCallback((l: Lang) => choose(l), []);

  const t = useCallback((key: string, params?: Params) => translate(lang, key, params), [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t, locale: LOCALES[lang] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
}
