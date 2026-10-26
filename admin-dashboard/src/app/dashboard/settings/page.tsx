/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { getRevenueCurrency, setRevenueCurrency, changeAdminPassword } from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Coins, Check, Loader2, KeyRound, Eye, EyeOff, Languages } from 'lucide-react';
import { useI18n, LANGS } from '@/i18n/I18nProvider';

/**
 * Admin-tunable global settings. Currently just the revenue display
 * currency — the code chosen here is picked up by the dashboard's
 * Revenue stat card and anywhere else that renders a platform-level
 * total. Per-course prices keep their own `currency` field and are
 * unaffected.
 */
const CURRENCY_CHOICES = [
  { code: 'TND', label: 'Tunisian Dinar', symbol: 'DT' },
  { code: 'USD', label: 'US Dollar', symbol: '$' },
  { code: 'EUR', label: 'Euro', symbol: '€' },
  { code: 'GBP', label: 'British Pound', symbol: '£' },
  { code: 'MAD', label: 'Moroccan Dirham', symbol: 'DH' },
  { code: 'DZD', label: 'Algerian Dinar', symbol: 'DA' },
  { code: 'EGP', label: 'Egyptian Pound', symbol: 'E£' },
  { code: 'SAR', label: 'Saudi Riyal', symbol: 'SR' },
  { code: 'AED', label: 'UAE Dirham', symbol: 'AED' },
];

/** The currency's name in the dashboard's language, from the browser; the English label if it has none. */
function currencyName(code: string, fallback: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'currency' }).of(code) || fallback;
  } catch {
    return fallback;
  }
}

export default function SettingsPage() {
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState<string>('');
  const [savedFlash, setSavedFlash] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getRevenueCurrency();
      setCurrent(res.data.currency || 'TND');
    } catch (e) {
      console.error('Failed to load settings', e);
      setCurrent('TND');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pick = async (code: string) => {
    if (saving || code === current) return;
    setSaving(true);
    try {
      const res = await setRevenueCurrency(code);
      setCurrent(res.data.currency);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
      />

      <LanguageSection />

      <section className="rounded-2xl bg-card border border-border p-6 max-w-3xl mt-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl bg-accent/10 border border-accent/25 flex items-center justify-center flex-shrink-0">
            <Coins className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-white">{t('settings.currency')}</h2>
            <p className="text-xs text-muted mt-1">{t('settings.currencyBody')}</p>
          </div>
          {savedFlash && (
            <span className="flex items-center gap-1 text-xs text-success font-semibold">
              <Check className="w-3.5 h-3.5" /> {t('settings.saved')}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CURRENCY_CHOICES.map(c => {
            const active = c.code === current;
            return (
              <button
                key={c.code}
                onClick={() => pick(c.code)}
                disabled={saving}
                className={`text-start rounded-xl border p-3 transition disabled:opacity-60 ${
                  active
                    ? 'border-accent bg-accent/10'
                    : 'border-border bg-card-hover hover:border-accent/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-white">{c.code}</div>
                    <div className="text-xs text-muted mt-0.5">{currencyName(c.code, c.label, locale)}</div>
                  </div>
                  <div className="text-lg font-bold text-muted">{c.symbol}</div>
                </div>
                {active && (
                  <div className="flex items-center gap-1 text-xs text-accent mt-2">
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    {saving ? t('settings.saving') : t('settings.current')}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <ChangePasswordSection />
    </div>
  );
}

/**
 * The dashboard's language for this browser. The same choice as the
 * sidebar's buttons; kept here too so an admin looking for it in Settings
 * finds it.
 */
function LanguageSection() {
  const { t, lang, setLang } = useI18n();
  return (
    <section className="rounded-2xl bg-card border border-border p-6 max-w-3xl">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-11 h-11 rounded-xl bg-accent/10 border border-accent/25 flex items-center justify-center flex-shrink-0">
          <Languages className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-bold text-white">{t('settings.language')}</h2>
          <p className="text-xs text-muted mt-1">{t('settings.languageBody')}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {LANGS.map((l) => {
          const active = l.code === lang;
          return (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              className={`text-start rounded-xl border p-3 transition ${
                active ? 'border-accent bg-accent/10' : 'border-border bg-card-hover hover:border-accent/40'
              }`}
            >
              <div className="text-sm font-bold text-white">{l.label}</div>
              {active && (
                <div className="flex items-center gap-1 text-xs text-accent mt-2">
                  <Check className="w-3 h-3" /> {t('settings.current')}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Lets the signed-in admin rotate their own password — the only way to
 * replace the temporary password issued when an account is promoted to
 * admin, which previously had no in-app path to change.
 */
function ChangePasswordSection() {
  const { t } = useI18n();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDone(false);

    if (!current || !next) {
      setError(t('settings.pwFillBoth'));
      return;
    }
    // Mirrors the backend's @Size(min = 8) so the user gets the message
    // before a round-trip.
    if (next.length < 8) {
      setError(t('settings.pwTooShort'));
      return;
    }
    if (next !== confirm) {
      setError(t('settings.pwMismatch'));
      return;
    }
    if (next === current) {
      setError(t('settings.pwSame'));
      return;
    }

    setSaving(true);
    try {
      await changeAdminPassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
      setTimeout(() => setDone(false), 4000);
    } catch (err: any) {
      const status = err?.response?.status;
      setError(
        status === 401 || status === 400
          ? err?.response?.data?.message
              || err?.response?.data?.error
              || t('settings.pwWrong')
          : t('settings.pwFailed')
      );
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full rounded-lg bg-card-hover border border-border p-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent outline-none';

  return (
    <section className="rounded-2xl bg-card border border-border p-6 max-w-3xl mt-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-11 h-11 rounded-xl bg-accent/10 border border-accent/25 flex items-center justify-center flex-shrink-0">
          <KeyRound className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-bold text-white">{t('settings.pwTitle')}</h2>
          <p className="text-xs text-muted mt-1">{t('settings.pwBody')}</p>
        </div>
        {done && (
          <span className="flex items-center gap-1 text-xs text-success font-semibold">
            <Check className="w-3.5 h-3.5" /> {t('settings.updated')}
          </span>
        )}
      </div>

      <form onSubmit={submit} className="space-y-3 max-w-md">
        <div>
          <label className="block text-xs uppercase tracking-wider text-muted font-semibold mb-1">
            {t('settings.pwCurrent')}
          </label>
          <input
            type={show ? 'text' : 'password'}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            className={inputClass}
            disabled={saving}
          />
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-muted font-semibold mb-1">
            {t('settings.pwNew')}
          </label>
          <input
            type={show ? 'text' : 'password'}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            placeholder={t('settings.pwNewPh')}
            className={inputClass}
            disabled={saving}
          />
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-muted font-semibold mb-1">
            {t('settings.pwConfirm')}
          </label>
          <input
            type={show ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className={inputClass}
            disabled={saving}
          />
        </div>

        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition"
        >
          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {show ? t('settings.pwHide') : t('settings.pwShow')}
        </button>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="pt-1">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-black hover:bg-accent/90 transition disabled:opacity-60"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? t('settings.pwUpdating') : t('settings.pwUpdate')}
          </button>
        </div>
      </form>
    </section>
  );
}
