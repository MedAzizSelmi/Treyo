/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  listPendingTrainerCourses,
  approveTrainerCourse,
  rejectTrainerCourse,
  API_BASE_URL,
  openProtectedFile,
} from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import { ShieldCheck, ShieldX, FileText, Clock, User, Layers, X, Loader2, Coins, Search } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';

/**
 * Pending course review queue.
 *
 * Each row is a course a trainer submitted. Admin opens the review
 * modal, reads the fields + opens the attached course plan, then hits
 * Approve or Reject. Rejection accepts an optional note that goes
 * into the email verbatim.
 *
 * Prices and daily rates are in dinars: ClicToPay charges every card in
 * TND, so a currency picker here only mislabelled what learners paid.
 */

export default function PendingCoursesPage() {
  const { t } = useI18n();
  const level = (l?: string) => (l ? t(`levels.${l.toLowerCase() === 'advanced' ? 'expert' : l.toLowerCase()}`) : '—');
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [price, setPrice] = useState('');
  // The trainer's pay per day taught. Asked for here because a course
  // approved without one paid its trainer nothing, silently.
  const [dailyRate, setDailyRate] = useState('');
  const [priceError, setPriceError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPendingTrainerCourses();
      setCourses(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error('Failed to load pending courses', e);
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async () => {
    if (!reviewing || busy) return;
    const priceNum = Number(price);
    if (!price.trim() || !Number.isFinite(priceNum) || priceNum < 0) {
      setPriceError(t('pending.priceInvalid'));
      return;
    }
    const rateNum = Number(dailyRate);
    if (!dailyRate.trim() || !Number.isFinite(rateNum) || rateNum < 0) {
      setPriceError(t('pending.rateRequired'));
      return;
    }
    setPriceError('');
    setBusy(true);
    try {
      await approveTrainerCourse(reviewing.courseId, priceNum, rateNum);
      setReviewing(null);
      setRejectNote('');
      setPrice('');
      setDailyRate('');
      await load();
    } catch (e: any) {
      setPriceError(e?.response?.data?.error || t('pending.approveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!reviewing || busy) return;
    setBusy(true);
    try {
      await rejectTrainerCourse(reviewing.courseId, rejectNote.trim() || undefined);
      setReviewing(null);
      setRejectNote('');
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  // Matches the course's specialty (module, specific topic, level, format,
  // language) as well as its title, trainer and description.
  const query = search.trim().toLowerCase();
  const shown = query
    ? courses.filter(c =>
        [c.title, c.moduleName, c.specificTopic, c.trainerName, c.level, c.format, c.language, c.description]
          .some(v => String(v ?? '').toLowerCase().includes(query)))
    : courses;

  return (
    <div>
      <PageHeader
        title={t('pending.title')}
        subtitle={t('pending.subtitle')}
      />

      {!loading && courses.length > 0 && (
        <div className="relative max-w-sm mb-5">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder={t('pending.searchPh')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full ps-10 pe-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm placeholder:text-muted focus:border-accent outline-none"
          />
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : courses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Clock className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-sm text-foreground font-semibold mb-1">{t('pending.emptyTitle')}</p>
          <p className="text-xs text-muted">{t('pending.emptyBody')}</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Search className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-sm text-foreground font-semibold mb-1">{t('pending.noMatch')}</p>
          <p className="text-xs text-muted">{t('pending.noMatchBody')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map(c => (
            <button
              key={c.courseId}
              onClick={() => {
                setRejectNote('');
                setPrice('');
                setDailyRate('');
                setPriceError('');
                setReviewing(c);
              }}
              className="w-full text-start rounded-xl border border-border bg-card p-4 hover:border-accent/40 transition"
            >
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-warning/10 border border-warning/25 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-warning" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">{c.title || t('pending.untitled')}</h3>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted">
                    {c.moduleName && (
                      <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3" /> {c.moduleName}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" /> {c.trainerName || t('pending.unknownTrainer')}
                    </span>
                    {c.level && <span className="text-accent">{level(c.level)}</span>}
                    {c.durationHours && <span>{c.durationHours}h</span>}
                  </div>
                  {c.description && (
                    <p className="text-xs text-muted mt-2 line-clamp-2">{c.description}</p>
                  )}
                </div>
                <span className="text-xs text-muted whitespace-nowrap">
                  {t('pending.review')}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {reviewing && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => !busy && setReviewing(null)}
        >
          <div
            className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-card border border-border p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => !busy && setReviewing(null)}
              className="absolute top-4 end-4 w-9 h-9 rounded-lg bg-card-hover hover:bg-border flex items-center justify-center"
            >
              <X className="w-4 h-4 text-muted" />
            </button>

            <h2 className="text-xl font-bold text-white mb-1">{reviewing.title}</h2>
            <p className="text-sm text-muted mb-4">
              {t('pending.byIn', { trainer: reviewing.trainerName || t('pending.unknownTrainer'), domain: reviewing.moduleName || '—' })}
            </p>

            <FactGrid
              rows={[
                [t('pending.topic'), reviewing.specificTopic],
                [t('pending.level'), reviewing.level ? level(reviewing.level) : null],
                [t('pending.duration'), reviewing.durationHours ? `${reviewing.durationHours}h` : '—'],
                [t('pending.format'), reviewing.format],
                [t('pending.language'), reviewing.language],
                [t('pending.minStudents'), reviewing.minStudentsRequired],
                [t('pending.maxPerGroup'), reviewing.maxStudentsPerGroup],
                [t('pending.certificate'), reviewing.hasCertificate ? t('pending.yes') : t('pending.no')],
              ]}
            />

            {reviewing.description && (
              <Section title={t('pending.description')}>
                <p className="text-sm text-foreground/85 whitespace-pre-wrap">{reviewing.description}</p>
              </Section>
            )}

            {reviewing.prerequisites && (
              <Section title={t('pending.prerequisites')}>
                <p className="text-sm text-foreground/85 whitespace-pre-wrap">{reviewing.prerequisites}</p>
              </Section>
            )}

            {/* The course plan (outline and schedule) since the October 2026
                review, not the course itself; "material" in the code and API. */}
            <Section title={t('pending.coursePlan')}>
              {reviewing.materialUrl ? (
                <button
                  type="button"
                  onClick={() => {
                    const url = String(reviewing.materialUrl).startsWith('http')
                      ? reviewing.materialUrl
                      : `${API_BASE_URL}${reviewing.materialUrl}`;
                    openProtectedFile(url, reviewing.materialName)
                      .catch(() => alert(t('pending.planFailed')));
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-accent text-black text-sm font-semibold hover:bg-accent/90"
                >
                  <FileText className="w-4 h-4" /> {t('pending.open', { name: reviewing.materialName || t('pending.coursePlanLower') })}
                </button>
              ) : (
                <p className="text-sm text-muted italic">{t('pending.noPlan')}</p>
              )}
            </Section>

            <Section title={t('pending.setPrice')}>
              <div className="flex items-start gap-3 rounded-xl border border-accent/25 bg-accent/[0.04] p-3">
                <Coins className="w-5 h-5 text-accent mt-1 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-muted mb-3">
                    {t('pending.priceIntro')}
                    {/* Prices are HT: the app labels them so and the card is
                        charged the price plus VAT (backend VatPolicy). An admin
                        entering a VAT-inclusive figure would tax it twice. */}
                    {' '}<strong className="text-foreground">{t('pending.priceHt')}</strong>
                    {' '}{t('pending.plusVat')}
                  </p>
                  <div className="flex items-stretch gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={price}
                      onChange={(e) => { setPrice(e.target.value); setPriceError(''); }}
                      placeholder={t('pending.pricePh')}
                      className="flex-1 rounded-lg bg-card-hover border border-border p-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent outline-none"
                    />
                    <span className="flex items-center rounded-lg bg-card-hover border border-border px-3 text-sm font-semibold text-muted">
                      TND
                    </span>
                  </div>
                  <label className="block text-xs text-muted mt-4 mb-1.5">
                    {t('pending.rateLabel', { currency: 'TND' })}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={dailyRate}
                    onChange={(e) => { setDailyRate(e.target.value); setPriceError(''); }}
                    placeholder={t('pending.ratePh')}
                    className="w-full rounded-lg bg-card-hover border border-border p-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent outline-none"
                  />
                  {priceError && <p className="text-xs text-danger mt-2">{priceError}</p>}
                </div>
              </div>
            </Section>

            <Section title={t('pending.rejectionNote')}>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder={t('pending.rejectionNotePh')}
                className="w-full min-h-[80px] rounded-lg bg-card-hover border border-border p-3 text-sm text-foreground placeholder:text-muted focus:border-accent outline-none"
              />
            </Section>

            <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-border">
              <button
                onClick={handleReject}
                disabled={busy}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-danger/10 text-danger hover:bg-danger/20 transition disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldX className="w-4 h-4" />} {t('pending.reject')}
              </button>
              <button
                onClick={handleApprove}
                disabled={busy}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-success text-black hover:bg-success/90 transition disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} {t('pending.approve')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 mt-5">
      <h3 className="text-xs uppercase tracking-wider text-muted font-semibold mb-2">{title}</h3>
      {children}
    </div>
  );
}

function FactGrid({ rows }: { rows: [string, any][] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 border border-border rounded-xl p-4 bg-card-hover/40">
      {rows.filter(([, v]) => v != null && v !== '').map(([label, value]) => (
        <div key={label}>
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">{label}</div>
          <div className="text-sm text-foreground mt-0.5">{String(value)}</div>
        </div>
      ))}
    </div>
  );
}
