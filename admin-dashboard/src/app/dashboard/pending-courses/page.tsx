/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  listPendingTrainerCourses,
  approveTrainerCourse,
  rejectTrainerCourse,
  getRevenueCurrency,
  API_BASE_URL,
} from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import { ShieldCheck, ShieldX, FileText, Clock, User, Layers, X, Loader2, Coins } from 'lucide-react';

/**
 * Pending course review queue.
 *
 * Each row is a course a trainer submitted. Admin opens the review
 * modal, reads the fields + opens the attached material, then hits
 * Approve or Reject. Rejection accepts an optional note that goes
 * into the email verbatim.
 */
const CURRENCY_CHOICES = ['TND', 'USD', 'EUR', 'GBP', 'MAD', 'DZD', 'EGP', 'SAR', 'AED'];

export default function PendingCoursesPage() {
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [price, setPrice] = useState('');
  const [priceCurrency, setPriceCurrency] = useState<string>('TND');
  const [defaultCurrency, setDefaultCurrency] = useState<string>('TND');
  const [priceError, setPriceError] = useState('');

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

  useEffect(() => {
    getRevenueCurrency()
      .then(r => {
        const c = r.data.currency || 'TND';
        setDefaultCurrency(c);
        setPriceCurrency(c);
      })
      .catch(() => { /* default already TND */ });
  }, []);

  const handleApprove = async () => {
    if (!reviewing || busy) return;
    const priceNum = Number(price);
    if (!price.trim() || !Number.isFinite(priceNum) || priceNum < 0) {
      setPriceError('Enter a valid non-negative price before approving.');
      return;
    }
    setPriceError('');
    setBusy(true);
    try {
      await approveTrainerCourse(reviewing.courseId, priceNum, priceCurrency);
      setReviewing(null);
      setRejectNote('');
      setPrice('');
      setPriceCurrency(defaultCurrency);
      await load();
    } catch (e: any) {
      setPriceError(e?.response?.data?.error || 'Could not approve. Try again.');
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

  return (
    <div>
      <PageHeader
        title="Pending courses"
        subtitle="Courses submitted by trainers, waiting for your review"
      />

      {loading ? (
        <LoadingSpinner />
      ) : courses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Clock className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-sm text-foreground font-semibold mb-1">Queue is empty</p>
          <p className="text-xs text-muted">Trainer-submitted courses will show up here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {courses.map(c => (
            <button
              key={c.courseId}
              onClick={() => {
                setRejectNote('');
                setPrice('');
                setPriceCurrency(defaultCurrency);
                setPriceError('');
                setReviewing(c);
              }}
              className="w-full text-left rounded-xl border border-border bg-card p-4 hover:border-accent/40 transition"
            >
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-warning/10 border border-warning/25 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-warning" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">{c.title || 'Untitled course'}</h3>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted">
                    {c.moduleName && (
                      <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3" /> {c.moduleName}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" /> {c.trainerName || 'Unknown trainer'}
                    </span>
                    {c.level && <span className="text-accent">{c.level}</span>}
                    {c.durationHours && <span>{c.durationHours}h</span>}
                  </div>
                  {c.description && (
                    <p className="text-xs text-muted mt-2 line-clamp-2">{c.description}</p>
                  )}
                </div>
                <span className="text-xs text-muted whitespace-nowrap">
                  Review →
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
              className="absolute top-4 right-4 w-9 h-9 rounded-lg bg-card-hover hover:bg-border flex items-center justify-center"
            >
              <X className="w-4 h-4 text-muted" />
            </button>

            <h2 className="text-xl font-bold text-white mb-1">{reviewing.title}</h2>
            <p className="text-sm text-muted mb-4">
              By {reviewing.trainerName || 'Unknown trainer'} · in {reviewing.moduleName || '—'}
            </p>

            <FactGrid
              rows={[
                ['Specific topic', reviewing.specificTopic],
                ['Level', reviewing.level],
                ['Duration', reviewing.durationHours ? `${reviewing.durationHours}h` : '—'],
                ['Format', reviewing.format],
                ['Language', reviewing.language],
                ['Min students', reviewing.minStudentsRequired],
                ['Max per group', reviewing.maxStudentsPerGroup],
                ['Certificate', reviewing.hasCertificate ? 'Yes' : 'No'],
              ]}
            />

            {reviewing.description && (
              <Section title="Description">
                <p className="text-sm text-foreground/85 whitespace-pre-wrap">{reviewing.description}</p>
              </Section>
            )}

            {reviewing.prerequisites && (
              <Section title="Prerequisites">
                <p className="text-sm text-foreground/85 whitespace-pre-wrap">{reviewing.prerequisites}</p>
              </Section>
            )}

            <Section title="Training material">
              {reviewing.materialUrl ? (
                <a
                  href={String(reviewing.materialUrl).startsWith('http')
                    ? reviewing.materialUrl
                    : `${API_BASE_URL}${reviewing.materialUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-accent text-black text-sm font-semibold hover:bg-accent/90"
                >
                  <FileText className="w-4 h-4" /> Open {reviewing.materialName || 'material'}
                </a>
              ) : (
                <p className="text-sm text-muted italic">No material attached.</p>
              )}
            </Section>

            <Section title="Set price">
              <div className="flex items-start gap-3 rounded-xl border border-accent/25 bg-accent/[0.04] p-3">
                <Coins className="w-5 h-5 text-accent mt-1 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-muted mb-3">
                    Trainers submit courses without a price — set one here before approving.
                    Default currency comes from your Settings (Revenue currency).
                  </p>
                  <div className="flex items-stretch gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={price}
                      onChange={(e) => { setPrice(e.target.value); setPriceError(''); }}
                      placeholder="e.g. 250"
                      className="flex-1 rounded-lg bg-card-hover border border-border p-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent outline-none"
                    />
                    <select
                      value={priceCurrency}
                      onChange={(e) => setPriceCurrency(e.target.value)}
                      className="rounded-lg bg-card-hover border border-border px-3 text-sm text-foreground focus:border-accent outline-none"
                    >
                      {CURRENCY_CHOICES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  {priceError && <p className="text-xs text-danger mt-2">{priceError}</p>}
                </div>
              </div>
            </Section>

            <Section title="Rejection note (optional)">
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Included verbatim in the rejection email — tell the trainer what to improve."
                className="w-full min-h-[80px] rounded-lg bg-card-hover border border-border p-3 text-sm text-foreground placeholder:text-muted focus:border-accent outline-none"
              />
            </Section>

            <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-border">
              <button
                onClick={handleReject}
                disabled={busy}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-danger/10 text-danger hover:bg-danger/20 transition disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldX className="w-4 h-4" />} Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={busy}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-success text-black hover:bg-success/90 transition disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Approve
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
