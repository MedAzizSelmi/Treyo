/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAllReviews, setReviewVisibility } from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Eye, EyeOff, Star, Search, Filter, MessageSquare, Loader2 } from 'lucide-react';

/**
 * Review moderation page.
 *
 * Lists every review (newest first), with a Hide / Show toggle on
 * each row. Hiding is presentation-only — the underlying rating
 * still counts toward the course / trainer rolling averages. The
 * intent is for the admin to silence obviously bad-faith reviews
 * without distorting the score.
 *
 * Filters: All / Visible / Hidden, plus a search box that matches
 * course title, trainer name, student name, and the review body.
 */
type Filter = 'all' | 'visible' | 'hidden';

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAllReviews();
      setReviews(Array.isArray(res.data) ? res.data : []);
    } catch (e: any) {
      // Surface the backend's error body so we can debug from the
      // browser console without having to dig through the network tab.
      const body = e?.response?.data;
      console.error('Failed to load reviews',
        'status:', e?.response?.status,
        'body:', body,
        'raw:', e);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Optimistic toggle — flip the row immediately, roll back on error. */
  const handleToggle = async (r: any) => {
    if (pendingId) return;
    const willHide = !r.isHidden;
    setPendingId(r.reviewId);
    setReviews(rs => rs.map(x => x.reviewId === r.reviewId ? { ...x, isHidden: willHide } : x));
    try {
      await setReviewVisibility(r.reviewId, willHide);
    } catch (e) {
      console.error('Toggle failed', e);
      setReviews(rs => rs.map(x => x.reviewId === r.reviewId ? { ...x, isHidden: !willHide } : x));
    } finally {
      setPendingId(null);
    }
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return reviews.filter(r => {
      if (filter === 'visible' && r.isHidden) return false;
      if (filter === 'hidden' && !r.isHidden) return false;
      if (!s) return true;
      return (
        String(r.courseTitle || '').toLowerCase().includes(s) ||
        String(r.trainerName || '').toLowerCase().includes(s) ||
        String(r.studentName || '').toLowerCase().includes(s) ||
        String(r.courseFeedback || '').toLowerCase().includes(s) ||
        String(r.trainerFeedback || '').toLowerCase().includes(s) ||
        String(r.feedback || '').toLowerCase().includes(s)
      );
    });
  }, [reviews, filter, search]);

  const hiddenCount = reviews.filter(r => r.isHidden).length;

  return (
    <div>
      <PageHeader
        title="Reviews"
        subtitle="Moderate course and trainer feedback. Hidden reviews stay in the database — averages aren't affected."
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={MessageSquare} color="accent" value={reviews.length} label="Total Reviews" />
        <StatCard icon={Eye} color="success" value={reviews.length - hiddenCount} label="Visible" />
        <StatCard icon={EyeOff} color="warning" value={hiddenCount} label="Hidden" />
        <StatCard
          icon={Star}
          color="info"
          value={averageRating(reviews)}
          label="Avg Course Rating"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search course, trainer, student, or feedback..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm placeholder:text-muted focus:border-accent outline-none"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-muted" />
          <Chip active={filter === 'all'} onClick={() => setFilter('all')} label="All" />
          <Chip active={filter === 'visible'} onClick={() => setFilter('visible')} label="Visible" tone="success" />
          <Chip active={filter === 'hidden'} onClick={() => setFilter('hidden')} label="Hidden" tone="warning" />
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <EmptyState search={search.length > 0} totalCount={reviews.length} />
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <ReviewRow
              key={r.reviewId}
              review={r}
              busy={pendingId === r.reviewId}
              onToggle={() => handleToggle(r)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function averageRating(reviews: any[]): string {
  const ratings = reviews.map(r => Number(r.courseRating || 0)).filter(n => n > 0);
  if (ratings.length === 0) return '—';
  return (ratings.reduce((s, x) => s + x, 0) / ratings.length).toFixed(2);
}

// ── Sub-components ──────────────────────────────────────────────

function ReviewRow({ review, busy, onToggle }: { review: any; busy: boolean; onToggle: () => void }) {
  const hidden = !!review.isHidden;
  const created = review.createdAt
    ? new Date(review.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <div
      className={`relative rounded-xl border p-4 transition-all ${
        hidden ? 'border-warning/30 bg-warning/[0.04] opacity-80' : 'border-border bg-card'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-accent-dim flex items-center justify-center text-accent font-bold text-sm flex-shrink-0">
          {(review.studentName || 'S').trim().charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-foreground">
              {review.studentName || 'Anonymous'}
            </span>
            <span className="text-xs text-muted">on</span>
            <span className="text-sm font-medium text-accent">
              {review.courseTitle || review.courseId}
            </span>
            {review.trainerName && (
              <>
                <span className="text-xs text-muted">·</span>
                <span className="text-xs text-muted">by {review.trainerName}</span>
              </>
            )}
            <span className="text-xs text-muted ml-auto">{created}</span>
          </div>

          {/* Ratings */}
          <div className="flex items-center gap-4 mt-1.5">
            <RatingChip label="Course" value={Number(review.courseRating || 0)} />
            <RatingChip label="Trainer" value={Number(review.trainerRating || 0)} />
          </div>

          {/* Feedback bodies — show course + trainer separately when
              they exist. Falls back to the legacy single `feedback`
              for reviews submitted before the split. */}
          <FeedbackBlocks review={review} />
        </div>

        {/* Toggle */}
        <button
          onClick={onToggle}
          disabled={busy}
          title={hidden ? 'Show review' : 'Hide review'}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${
            hidden
              ? 'bg-accent text-black hover:bg-accent/90'
              : 'border border-border text-muted hover:text-warning hover:border-warning/30'
          } ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : hidden ? (
            <>
              <Eye className="w-3.5 h-3.5" />
              <span>Show</span>
            </>
          ) : (
            <>
              <EyeOff className="w-3.5 h-3.5" />
              <span>Hide</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function FeedbackBlocks({ review }: { review: any }) {
  const courseText = review.courseFeedback ?? null;
  const trainerText = review.trainerFeedback ?? null;
  // Legacy fallback — rows written before the split only have the
  // single `feedback` column populated.
  const legacyText = !courseText && !trainerText ? review.feedback : null;

  if (!courseText && !trainerText && !legacyText) {
    return (
      <p className="mt-2.5 text-xs text-muted italic">
        No written feedback — rating only.
      </p>
    );
  }

  return (
    <div className="mt-2.5 space-y-2">
      {courseText && (
        <FeedbackBlock label="On the course" text={courseText} />
      )}
      {trainerText && (
        <FeedbackBlock label="On the trainer" text={trainerText} />
      )}
      {legacyText && (
        <FeedbackBlock label="Feedback" text={legacyText} muted />
      )}
    </div>
  );
}

function FeedbackBlock({ label, text, muted }: { label: string; text: string; muted?: boolean }) {
  return (
    <div className={muted ? 'opacity-90' : ''}>
      <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-0.5">
        {label}
      </div>
      <p className="text-sm text-foreground/80 leading-relaxed break-words whitespace-pre-wrap">
        {text}
      </p>
    </div>
  );
}

function RatingChip({ label, value }: { label: string; value: number }) {
  const safe = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">{label}</span>
      <div className="flex">
        {[1, 2, 3, 4, 5].map(n => (
          <Star
            key={n}
            className={`w-3 h-3 ${n <= safe ? 'fill-warning text-warning' : 'text-border'}`}
          />
        ))}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon, color, value, label,
}: {
  icon: any;
  color: 'success' | 'accent' | 'info' | 'warning';
  value: number | string;
  label: string;
}) {
  const tone = {
    success: 'text-success',
    accent: 'text-accent',
    info: 'text-info',
    warning: 'text-warning',
  }[color];
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">{label}</span>
        <Icon className={`w-4 h-4 ${tone}`} />
      </div>
      <div className={`mt-2 text-2xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}

function Chip({
  active, label, onClick, tone,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  tone?: 'success' | 'warning' | 'info';
}) {
  const activeTone = tone
    ? { success: 'bg-success/15 text-success border-success/30', warning: 'bg-warning/15 text-warning border-warning/30', info: 'bg-info/15 text-info border-info/30' }[tone]
    : 'bg-accent-dim text-accent border-accent/30';
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
        active ? activeTone : 'border-border text-muted hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function EmptyState({ search, totalCount }: { search: boolean; totalCount: number }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-12 text-center">
      <MessageSquare className="w-10 h-10 text-muted mx-auto mb-3" />
      <p className="text-sm text-foreground font-semibold mb-1">
        {totalCount === 0 ? 'No reviews yet' : search ? 'No matching reviews' : 'No reviews in this filter'}
      </p>
      <p className="text-xs text-muted">
        {totalCount === 0
          ? 'Reviews will appear here once students complete courses and rate them.'
          : 'Try a different search term or filter.'}
      </p>
    </div>
  );
}
