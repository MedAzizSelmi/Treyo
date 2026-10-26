/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  listTrainerReports,
  updateReportStatus,
} from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import Badge from '@/components/Badge';
import { useI18n } from '@/i18n/I18nProvider';
import {
  Flag, ShieldCheck, ShieldX, X, Loader2, User, GraduationCap,
  BookOpen, AlertTriangle,
} from 'lucide-react';

/**
 * Trainer report moderation queue.
 *
 * Reports are never deleted — the admin moves them OPEN → REVIEWED or
 * DISMISSED, and the note explaining the call is kept on the row so the
 * moderation trail stays auditable.
 */

type StatusFilter = 'OPEN' | 'REVIEWED' | 'DISMISSED' | 'ALL';

// Labels: reports.status_OPEN, _REVIEWED, _DISMISSED, _ALL.
const FILTERS: { key: StatusFilter }[] = [
  { key: 'OPEN' },
  { key: 'REVIEWED' },
  { key: 'DISMISSED' },
  { key: 'ALL' },
];

export default function ReportsPage() {
  const { t, locale } = useI18n();
  /** The reason in the dashboard's language; the server's English label otherwise. */
  const reason = (r: any) => t(`reports.reason_${r.reason || 'OTHER'}`, { defaultValue: r.reasonLabel });
  const status = (s: string) => t(`reports.status_${s}`, { defaultValue: s });
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('OPEN');
  const [reviewing, setReviewing] = useState<any | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listTrainerReports(filter);
      setReports(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error('Failed to load reports', e);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const decide = async (status: 'REVIEWED' | 'DISMISSED') => {
    if (!reviewing || busy) return;
    setBusy(true);
    setError('');
    try {
      await updateReportStatus(reviewing.reportId, status, note.trim() || undefined);
      setReviewing(null);
      setNote('');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error || t('reports.updateFailed'));
    } finally {
      setBusy(false);
    }
  };

  const statusVariant = (s: string) =>
    s === 'OPEN' ? 'warning' : s === 'REVIEWED' ? 'success' : 'muted';

  const openCount = reports.filter(r => r.status === 'OPEN').length;

  return (
    <div>
      <PageHeader
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
      />

      {/* Status filter */}
      <div className="flex items-center gap-2 mb-5">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition ${
              filter === f.key
                ? 'bg-accent text-black'
                : 'bg-card border border-border text-muted hover:text-foreground'
            }`}
          >
            {status(f.key)}
          </button>
        ))}
        {filter === 'OPEN' && openCount > 0 && (
          <span className="ms-auto flex items-center gap-1.5 text-xs text-warning font-semibold">
            <AlertTriangle className="w-3.5 h-3.5" />
            {t('reports.awaiting', { count: openCount })}
          </span>
        )}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : reports.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Flag className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-sm text-foreground font-semibold mb-1">{t('reports.nothing')}</p>
          <p className="text-xs text-muted">
            {filter === 'OPEN' ? t('reports.noneOpen') : t('reports.noneIn', { status: status(filter) })}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <button
              key={r.reportId}
              onClick={() => { setNote(r.adminNote || ''); setError(''); setReviewing(r); }}
              className="w-full text-start rounded-xl border border-border bg-card p-4 hover:border-accent/40 transition"
            >
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-danger/10 border border-danger/25 flex items-center justify-center flex-shrink-0">
                  <Flag className="w-5 h-5 text-danger" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-white truncate">{reason(r)}</h3>
                    <Badge variant={statusVariant(r.status) as any}>{status(r.status)}</Badge>
                    {r.trainerReportCount > 1 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning font-semibold">
                        {t('reports.onTrainer', { count: r.trainerReportCount })}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-muted">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" /> {r.trainerName}
                    </span>
                    <span className="flex items-center gap-1">
                      <GraduationCap className="w-3 h-3" /> {t('reports.by', { name: r.studentName })}
                    </span>
                    {r.courseTitle && (
                      <span className="flex items-center gap-1">
                        <BookOpen className="w-3 h-3" /> {r.courseTitle}
                      </span>
                    )}
                  </div>
                  {r.details && (
                    <p className="text-xs text-muted mt-2 line-clamp-2">{r.details}</p>
                  )}
                </div>
                <span className="text-xs text-muted whitespace-nowrap">{t('reports.review')}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Review modal */}
      {reviewing && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => !busy && setReviewing(null)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-card border border-border p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => !busy && setReviewing(null)}
              className="absolute top-4 end-4 w-9 h-9 rounded-lg bg-card-hover hover:bg-border flex items-center justify-center"
            >
              <X className="w-4 h-4 text-muted" />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-bold text-white">{reason(reviewing)}</h2>
              <Badge variant={statusVariant(reviewing.status) as any}>{status(reviewing.status)}</Badge>
            </div>
            <p className="text-sm text-muted mb-5">
              {t('reports.reportedBy', { name: reviewing.studentName })} · {new Date(reviewing.createdAt).toLocaleString(locale)}
            </p>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 border border-border rounded-xl p-4 bg-card-hover/40 mb-5">
              <Fact label={t('reports.trainer')} value={reviewing.trainerName} />
              <Fact label={t('reports.trainerEmail')} value={reviewing.trainerEmail} />
              <Fact label={t('reports.reportedByLabel')} value={reviewing.studentName} />
              <Fact label={t('reports.studentEmail')} value={reviewing.studentEmail} />
              {reviewing.courseTitle && <Fact label={t('reports.course')} value={reviewing.courseTitle} />}
              <Fact label={t('reports.totalOnTrainer')} value={reviewing.trainerReportCount} />
            </div>

            {reviewing.details && (
              <div className="mb-5">
                <h3 className="text-xs uppercase tracking-wider text-muted font-semibold mb-2">
                  {t('reports.whatTheySaid')}
                </h3>
                <p className="text-sm text-foreground/85 whitespace-pre-wrap rounded-lg bg-card-hover border border-border p-3">
                  {reviewing.details}
                </p>
              </div>
            )}

            <div className="mb-2">
              <h3 className="text-xs uppercase tracking-wider text-muted font-semibold mb-2">
                {t('reports.adminNote')}
              </h3>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('reports.notePh')}
                className="w-full min-h-[80px] rounded-lg bg-card-hover border border-border p-3 text-sm text-foreground placeholder:text-muted focus:border-accent outline-none"
              />
            </div>

            {error && <p className="text-xs text-danger mt-2">{error}</p>}

            <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-border">
              <button
                onClick={() => decide('DISMISSED')}
                disabled={busy}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-card-hover text-muted hover:text-foreground transition disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldX className="w-4 h-4" />}
                {t('reports.dismiss')}
              </button>
              <button
                onClick={() => decide('REVIEWED')}
                disabled={busy}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-success text-black hover:bg-success/90 transition disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {t('reports.markReviewed')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: any }) {
  if (value == null || value === '') return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">{label}</div>
      <div className="text-sm text-foreground mt-0.5 break-words">{String(value)}</div>
    </div>
  );
}
