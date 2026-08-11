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

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'OPEN', label: 'Open' },
  { key: 'REVIEWED', label: 'Reviewed' },
  { key: 'DISMISSED', label: 'Dismissed' },
  { key: 'ALL', label: 'All' },
];

export default function ReportsPage() {
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
      setError(e?.response?.data?.error || 'Could not update the report.');
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
        title="Reports"
        subtitle="Trainer reports raised by students"
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
            {f.label}
          </button>
        ))}
        {filter === 'OPEN' && openCount > 0 && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-warning font-semibold">
            <AlertTriangle className="w-3.5 h-3.5" />
            {openCount} awaiting review
          </span>
        )}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : reports.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Flag className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-sm text-foreground font-semibold mb-1">Nothing here</p>
          <p className="text-xs text-muted">
            {filter === 'OPEN'
              ? 'No reports are awaiting review.'
              : `No ${filter.toLowerCase()} reports.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <button
              key={r.reportId}
              onClick={() => { setNote(r.adminNote || ''); setError(''); setReviewing(r); }}
              className="w-full text-left rounded-xl border border-border bg-card p-4 hover:border-accent/40 transition"
            >
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-danger/10 border border-danger/25 flex items-center justify-center flex-shrink-0">
                  <Flag className="w-5 h-5 text-danger" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-white truncate">{r.reasonLabel}</h3>
                    <Badge variant={statusVariant(r.status) as any}>{r.status}</Badge>
                    {r.trainerReportCount > 1 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning font-semibold">
                        {r.trainerReportCount} reports on this trainer
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-muted">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" /> {r.trainerName}
                    </span>
                    <span className="flex items-center gap-1">
                      <GraduationCap className="w-3 h-3" /> by {r.studentName}
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
                <span className="text-xs text-muted whitespace-nowrap">Review →</span>
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
              className="absolute top-4 right-4 w-9 h-9 rounded-lg bg-card-hover hover:bg-border flex items-center justify-center"
            >
              <X className="w-4 h-4 text-muted" />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-bold text-white">{reviewing.reasonLabel}</h2>
              <Badge variant={statusVariant(reviewing.status) as any}>{reviewing.status}</Badge>
            </div>
            <p className="text-sm text-muted mb-5">
              Reported by {reviewing.studentName} · {new Date(reviewing.createdAt).toLocaleString()}
            </p>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 border border-border rounded-xl p-4 bg-card-hover/40 mb-5">
              <Fact label="Trainer" value={reviewing.trainerName} />
              <Fact label="Trainer email" value={reviewing.trainerEmail} />
              <Fact label="Reported by" value={reviewing.studentName} />
              <Fact label="Student email" value={reviewing.studentEmail} />
              {reviewing.courseTitle && <Fact label="Course" value={reviewing.courseTitle} />}
              <Fact label="Total reports on trainer" value={reviewing.trainerReportCount} />
            </div>

            {reviewing.details && (
              <div className="mb-5">
                <h3 className="text-xs uppercase tracking-wider text-muted font-semibold mb-2">
                  What the student said
                </h3>
                <p className="text-sm text-foreground/85 whitespace-pre-wrap rounded-lg bg-card-hover border border-border p-3">
                  {reviewing.details}
                </p>
              </div>
            )}

            <div className="mb-2">
              <h3 className="text-xs uppercase tracking-wider text-muted font-semibold mb-2">
                Admin note (internal)
              </h3>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Record what you decided and why. Only visible to admins."
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
                Dismiss
              </button>
              <button
                onClick={() => decide('REVIEWED')}
                disabled={busy}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-success text-black hover:bg-success/90 transition disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                Mark reviewed
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
