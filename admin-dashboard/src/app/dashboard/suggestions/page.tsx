/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getCourseSuggestions,
  setCourseSuggestionStatus,
  setCourseSuggestionNote,
  mergeCourseSuggestion,
  publishCourseSuggestion,
  getMissedSearches,
  hideMissedSearch,
  getAllCourses,
} from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import Badge from '@/components/Badge';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useI18n } from '@/i18n/I18nProvider';
import { Lightbulb, Search, Phone, Mail, Users, X, Link2, GitMerge, EyeOff, Check, Ban, Trash2 } from 'lucide-react';

type Status = 'new' | 'searching' | 'published' | 'declined' | 'rejected' | 'withdrawn' | 'merged';
type Toast = { kind: 'success' | 'error'; text: string } | null;

// Labels are translation keys (suggestions.status_* and suggestions.format_*).
const TABS: { key: Status | 'all' }[] = [
  { key: 'new' }, { key: 'searching' }, { key: 'published' }, { key: 'declined' }, { key: 'rejected' }, { key: 'all' },
];

const STATUS_BADGE: Record<string, { variant: 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'accent' }> = {
  new: { variant: 'info' },
  searching: { variant: 'warning' },
  published: { variant: 'success' },
  declined: { variant: 'danger' },
  rejected: { variant: 'muted' },
  withdrawn: { variant: 'muted' },
  merged: { variant: 'muted' },
};

const FORMAT_KEY: Record<string, string> = { Online: 'online', 'Face-to-face': 'onsite', Hybrid: 'hybrid' };

const errText = (e: any, fallback: string) =>
  e?.response?.data?.message || e?.response?.data?.error || e?.message || fallback;

/**
 * Course suggestions: courses learners asked for and could not find, so
 * administrators can look for a trainer (backend CourseSuggestionService).
 *
 * A suggestion is "To review" until accepted; only accepted ones are shown
 * to other learners for "me too". Declining tells its learners politely;
 * "Not a course" closes noise without telling anyone. Linking the course
 * that answers it tells every learner behind it — notification, push and
 * email — and registers their request, so a group opens by itself once
 * enough of them are asking.
 *
 * Below, the searches that found nothing in the app, grouped by spelling
 * and shown once two different learners made them.
 */
export default function SuggestionsPage() {
  const { t, locale } = useI18n();
  const statusLabel = (s: string) => t(`suggestions.status_${s}`, { defaultValue: s });
  const formatLabel = (f?: string) => (f ? (FORMAT_KEY[f] ? t(`suggestions.format_${FORMAT_KEY[f]}`) : f) : '');
  const day = (d: string) => new Date(d).toLocaleDateString(locale);
  const [tab, setTab] = useState<Status | 'all'>('new');
  const [items, setItems] = useState<any[]>([]);
  const [all, setAll] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [missed, setMissed] = useState<any[]>([]);
  const [missedLoading, setMissedLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [publishFor, setPublishFor] = useState<any | null>(null);
  const [courseQuery, setCourseQuery] = useState('');
  const [mergeFor, setMergeFor] = useState<any | null>(null);
  const [confirm, setConfirm] = useState<{
    open: boolean; title: string; message: string; confirmLabel: string;
    variant: 'danger' | 'success'; action: () => Promise<void>;
  }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'success', action: async () => {} });

  const showToast = (t: Toast) => {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, everything] = await Promise.all([
        getCourseSuggestions(tab === 'all' ? undefined : tab),
        getCourseSuggestions(),
      ]);
      setItems(list.data || []);
      setAll(everything.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  const loadMissed = useCallback(async () => {
    setMissedLoading(true);
    try {
      const res = await getMissedSearches();
      setMissed(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setMissedLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadMissed(); }, [loadMissed]);
  useEffect(() => {
    getAllCourses()
      .then((res) => setCourses((res.data || []).filter((c: any) =>
        c.isPublished && (!c.approvalStatus || c.approvalStatus === 'APPROVED'))))
      .catch(() => {});
  }, []);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    all.forEach((s) => { m[s.status] = (m[s.status] || 0) + 1; });
    return m;
  }, [all]);

  const q = search.trim().toLowerCase();
  const visible = items.filter((s) => !q || [s.topic, s.details, s.domain, s.author?.name, s.city]
    .some((v) => (v || '').toLowerCase().includes(q)));

  const open = (s: any) => { setSelected(s); setNote(s.adminNote || ''); };

  const run = async (fn: () => Promise<any>, ok: string, fail: string) => {
    setBusy(true);
    try {
      await fn();
      showToast({ kind: 'success', text: ok });
      setSelected(null);
      await load();
    } catch (e) {
      showToast({ kind: 'error', text: errText(e, fail) });
    } finally {
      setBusy(false);
    }
  };

  const accept = (s: any) => run(() => setCourseSuggestionStatus(s.suggestionId, 'searching', note),
    t('suggestions.accepted'), t('suggestions.acceptFailed'));

  const askDecline = (s: any) => setConfirm({
    open: true, title: t('suggestions.declineTitle'),
    message: t('suggestions.declineBody', { count: s.supporters, topic: s.topic }),
    confirmLabel: t('suggestions.decline'), variant: 'danger',
    action: () => run(() => setCourseSuggestionStatus(s.suggestionId, 'declined', note), t('suggestions.declined'), t('suggestions.declineFailed')),
  });

  const askReject = (s: any) => setConfirm({
    open: true, title: t('suggestions.rejectTitle'),
    message: t('suggestions.rejectBody', { topic: s.topic }),
    confirmLabel: t('suggestions.rejectConfirm'), variant: 'danger',
    action: () => run(() => setCourseSuggestionStatus(s.suggestionId, 'rejected', note), t('suggestions.closed'), t('suggestions.closeFailed')),
  });

  const saveNote = (s: any) => run(() => setCourseSuggestionNote(s.suggestionId, note), t('suggestions.noteSaved'), t('suggestions.noteFailed'));

  const doPublish = (s: any, course: any) => setConfirm({
    open: true, title: t('suggestions.linkTitle'),
    message: t('suggestions.linkBody', { course: course.title, topic: s.topic, count: s.supporters }),
    confirmLabel: t('suggestions.linkConfirm'), variant: 'success',
    action: async () => {
      setPublishFor(null);
      setBusy(true);
      try {
        const res = await publishCourseSuggestion(s.suggestionId, course.courseId);
        showToast({ kind: 'success', text: t('suggestions.linked', { count: res.data?.told ?? 0 }) });
        setSelected(null);
        await load();
      } catch (e) {
        showToast({ kind: 'error', text: errText(e, t('suggestions.linkFailed')) });
      } finally {
        setBusy(false);
      }
    },
  });

  const doMerge = (s: any, into: any) => setConfirm({
    open: true, title: t('suggestions.mergeTitle'),
    message: t('suggestions.mergeBody', { topic: s.topic, into: into.topic }),
    confirmLabel: t('suggestions.merge'), variant: 'success',
    action: async () => {
      setMergeFor(null);
      await run(() => mergeCourseSuggestion(s.suggestionId, into.suggestionId), t('suggestions.merged'), t('suggestions.mergeFailed'));
    },
  });

  const askHide = (m: any) => setConfirm({
    open: true, title: t('suggestions.hideTitle'),
    message: t('suggestions.hideBody', { label: m.label }),
    confirmLabel: t('suggestions.hide'), variant: 'danger',
    action: async () => {
      try {
        await hideMissedSearch(m.label);
        showToast({ kind: 'success', text: t('suggestions.hidden') });
        await loadMissed();
      } catch (e) {
        showToast({ kind: 'error', text: errText(e, t('suggestions.hideFailed')) });
      }
    },
  });

  const isOpen = (s: any) => s.status === 'new' || s.status === 'searching';
  const cq = courseQuery.trim().toLowerCase();

  return (
    <div>
      <PageHeader
        title={t('suggestions.title')}
        subtitle={t('suggestions.subtitle')}
      />

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              tab === tb.key ? 'bg-accent/15 text-accent border-accent/40' : 'border-border text-muted hover:text-white'
            }`}
          >
            {tb.key === 'all' ? t('suggestions.all') : statusLabel(tb.key)}
            <span className="ms-1.5 opacity-70">{tb.key === 'all' ? all.length : counts[tb.key] || 0}</span>
          </button>
        ))}
      </div>

      <div className="relative max-w-sm mb-4">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          type="text"
          placeholder={t('suggestions.searchPh')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full ps-10 pe-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm placeholder:text-muted focus:border-accent outline-none"
        />
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden mb-8">
        {loading ? (
          <div className="p-12 flex items-center justify-center"><LoadingSpinner /></div>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center">
            <Lightbulb className="w-10 h-10 text-muted mx-auto mb-3" />
            <p className="text-white font-medium">{t('suggestions.empty')}</p>
            <p className="text-xs text-muted mt-1">{t('suggestions.emptyBody')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((s) => (
              <li key={s.suggestionId} className="px-5 py-4 hover:bg-card-hover transition cursor-pointer" onClick={() => open(s)}>
                <div className="flex items-start gap-4">
                  <div className="w-12 flex-shrink-0 text-center">
                    <p className="text-xl font-bold text-white leading-none">{s.supporters}</p>
                    <p className="text-[10px] text-muted mt-1">{t('suggestions.learnersWord', { count: s.supporters })}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-medium text-white">{s.topic}</p>
                      <Badge variant={STATUS_BADGE[s.status]?.variant || 'muted'}>{statusLabel(s.status)}</Badge>
                    </div>
                    <p className="text-sm text-foreground/80 line-clamp-2">{s.details}</p>
                    <p className="text-xs text-muted mt-1.5">
                      {[s.domain || t('suggestions.otherDomain'), s.level && t(`levels.${s.level}`, { defaultValue: s.level }), formatLabel(s.format), s.language, s.city]
                        .filter(Boolean).join(' · ')}
                      {' · '}{t('suggestions.by', { name: s.author?.name })}
                      {s.supporters > 1 ? ' ' + t('suggestions.others', { count: s.supporters - 1 }) : ''}
                      {s.createdAt ? ` · ${day(s.createdAt)}` : ''}
                    </p>
                    {s.courseTitle && <p className="text-xs text-success mt-1">{t('suggestions.answeredBy', { course: s.courseTitle })}</p>}
                    {s.adminNote && <p className="text-xs text-warning/90 mt-1">{t('suggestions.note', { note: s.adminNote })}</p>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Searches that found nothing */}
      <h2 className="text-lg font-semibold text-white mb-1">{t('suggestions.missedTitle')}</h2>
      <p className="text-xs text-muted mb-3">{t('suggestions.missedBody')}</p>
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {missedLoading ? (
          <div className="p-10 flex items-center justify-center"><LoadingSpinner /></div>
        ) : missed.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">{t('suggestions.nothingYet')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {missed.map((m) => (
              <li key={m.key} className="px-5 py-3 flex items-center gap-4">
                <Search className="w-4 h-4 text-muted flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">{m.label}</p>
                  {m.spellings?.length > 1 && (
                    <p className="text-xs text-muted truncate">{t('suggestions.also', { list: m.spellings.slice(1).join(', ') })}</p>
                  )}
                </div>
                <div className="text-xs text-muted text-end">
                  <p>{t('suggestions.searchCounts', { learners: m.learners, searches: m.searches })}</p>
                  {m.lastSearchedAt && <p>{t('suggestions.last', { date: day(m.lastSearchedAt) })}</p>}
                </div>
                <button
                  onClick={() => askHide(m)}
                  className="p-2 rounded-lg border border-border text-muted hover:text-danger hover:border-danger/40 transition"
                  title={t('suggestions.hideTitle')}
                >
                  <EyeOff className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Drawer */}
      {selected && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-lg h-full bg-card border-s border-border flex flex-col">
            <div className="flex items-start justify-between px-6 py-5 border-b border-border">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted">{t('suggestions.one')}</p>
                <h3 className="text-lg font-bold text-white mt-1">{selected.topic}</h3>
                <div className="mt-2"><Badge variant={STATUS_BADGE[selected.status]?.variant || 'muted'}>{statusLabel(selected.status)}</Badge></div>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 text-muted hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div>
                <p className="text-xs text-muted mb-1">{t('suggestions.wantTo')}</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{selected.details}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label={t('suggestions.domain')} value={selected.domain || t('suggestions.other')} />
                <Field label={t('suggestions.level')} value={selected.level ? t(`levels.${selected.level}`, { defaultValue: selected.level }) : t('suggestions.any')} />
                <Field label={t('suggestions.format')} value={selected.format ? formatLabel(selected.format) : t('suggestions.either')} />
                <Field label={t('suggestions.language')} value={selected.language || t('suggestions.any')} />
                <Field label={t('suggestions.city')} value={selected.city || '—'} />
                <Field label={t('suggestions.learners')} value={String(selected.supporters)} icon={Users} />
              </div>
              {/* Everyone behind it: the author, then each "me too". */}
              <div className="rounded-xl border border-border">
                <p className="text-xs text-muted px-4 pt-3 pb-2">
                  {t('suggestions.whoWants', { count: (selected.learners || []).length })}
                </p>
                <ul className="divide-y divide-border">
                  {(selected.learners || []).map((l: any) => (
                    <li key={l.studentId} className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <p className="text-white text-sm font-medium">{l.name}</p>
                        {l.author ? <Badge variant="accent">{t('suggestions.suggestedIt')}</Badge> : <Badge variant="muted">{t('suggestions.meToo')}</Badge>}
                        {l.since && <span className="ms-auto text-[11px] text-muted">{day(l.since)}</span>}
                      </div>
                      <div className="flex flex-wrap gap-4 mt-1.5 text-xs">
                        {l.phone ? (
                          <a href={`tel:${l.phone}`} className="flex items-center gap-1.5 text-accent hover:underline">
                            <Phone className="w-3.5 h-3.5" />{l.phone}
                          </a>
                        ) : (
                          <span className="text-muted">{t('suggestions.noPhone')}</span>
                        )}
                        {l.email && (
                          <a href={`mailto:${l.email}`} className="flex items-center gap-1.5 text-accent hover:underline">
                            <Mail className="w-3.5 h-3.5" />{l.email}
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs text-muted mb-1">{t('suggestions.privateNote')}</p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder={t('suggestions.notePh')}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted focus:border-accent outline-none"
                />
                <button onClick={() => saveNote(selected)} disabled={busy}
                        className="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-muted hover:text-white disabled:opacity-40">
                  {t('suggestions.saveNote')}
                </button>
              </div>
              {selected.courseTitle && <p className="text-sm text-success">{t('suggestions.answeredBy', { course: selected.courseTitle })}</p>}
            </div>
            {isOpen(selected) && (
              <div className="px-6 py-4 border-t border-border grid grid-cols-2 gap-2">
                {selected.status === 'new' && (
                  <ActionButton icon={Check} label={t('suggestions.accept')} tone="success" onClick={() => accept(selected)} disabled={busy} />
                )}
                <ActionButton icon={Link2} label={t('suggestions.linkTitle')} tone="success" onClick={() => { setCourseQuery(selected.topic || ''); setPublishFor(selected); }} disabled={busy} />
                <ActionButton icon={GitMerge} label={t('suggestions.mergeInto')} tone="muted" onClick={() => setMergeFor(selected)} disabled={busy} />
                <ActionButton icon={Ban} label={t('suggestions.decline')} tone="danger" onClick={() => askDecline(selected)} disabled={busy} />
                <ActionButton icon={Trash2} label={t('suggestions.status_rejected')} tone="danger" onClick={() => askReject(selected)} disabled={busy} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Link a course */}
      {publishFor && (
        <Picker title={t('suggestions.whichCourse', { topic: publishFor.topic })} onClose={() => setPublishFor(null)}
                query={courseQuery} onQuery={setCourseQuery} placeholder={t('suggestions.searchCoursesPh')}>
          {courses
            .filter((c) => !cq || [c.title, c.domain, c.trainerName, c.specificTopic].some((v: string) => (v || '').toLowerCase().includes(cq)))
            .slice(0, 50)
            .map((c) => (
              <button key={c.courseId} onClick={() => doPublish(publishFor, c)}
                      className="w-full text-start px-4 py-3 hover:bg-card-hover transition">
                <p className="text-white text-sm font-medium">{c.title}</p>
                <p className="text-xs text-muted">{c.domain || '—'} · {c.trainerName}</p>
              </button>
            ))}
          <p className="px-4 py-3 text-xs text-muted">{t('suggestions.onlyPublished')}</p>
        </Picker>
      )}

      {/* Merge */}
      {mergeFor && (
        <Picker title={t('suggestions.sameAs', { topic: mergeFor.topic })} onClose={() => setMergeFor(null)}>
          {all.filter((s) => s.suggestionId !== mergeFor.suggestionId && isOpen(s)).map((s) => (
            <button key={s.suggestionId} onClick={() => doMerge(mergeFor, s)}
                    className="w-full text-start px-4 py-3 hover:bg-card-hover transition">
              <p className="text-white text-sm font-medium">{s.topic}</p>
              <p className="text-xs text-muted">{t('suggestions.learnersWord', { count: s.supporters })} · {statusLabel(s.status)}</p>
            </button>
          ))}
        </Picker>
      )}

      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        confirmLabel={confirm.confirmLabel}
        variant={confirm.variant}
        onConfirm={async () => { const a = confirm.action; setConfirm((c) => ({ ...c, open: false })); await a(); }}
        onCancel={() => setConfirm((c) => ({ ...c, open: false }))}
      />

      {toast && (
        <div className={`fixed bottom-6 end-6 z-[120] px-4 py-3 rounded-xl text-sm font-medium border ${
          toast.kind === 'success' ? 'bg-success/15 text-success border-success/30' : 'bg-danger/15 text-danger border-danger/30'
        }`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, icon: Icon }: { label: string; value: string; icon?: any }) {
  return (
    <div className="rounded-lg bg-background/40 border border-border px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className="text-white text-sm flex items-center gap-1.5">{Icon && <Icon className="w-3.5 h-3.5 text-muted" />}{value}</p>
    </div>
  );
}

function ActionButton({ icon: Icon, label, tone, onClick, disabled }: {
  icon: any; label: string; tone: 'success' | 'danger' | 'muted'; onClick: () => void; disabled?: boolean;
}) {
  const tones = {
    success: 'border-success/40 text-success hover:bg-success/10',
    danger: 'border-danger/40 text-danger hover:bg-danger/10',
    muted: 'border-border text-muted hover:text-white',
  };
  return (
    <button onClick={onClick} disabled={disabled}
            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border transition disabled:opacity-40 ${tones[tone]}`}>
      <Icon className="w-4 h-4" />{label}
    </button>
  );
}

function Picker({ title, onClose, query, onQuery, placeholder, children }: {
  title: string; onClose: () => void; query?: string; onQuery?: (v: string) => void; placeholder?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[80vh] bg-card border border-border rounded-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <p className="text-white font-semibold">{title}</p>
          <button onClick={onClose} className="p-1 text-muted hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        {onQuery && (
          <div className="px-5 py-3 border-b border-border">
            <input autoFocus value={query} onChange={(e) => onQuery(e.target.value)} placeholder={placeholder}
                   className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted focus:border-accent outline-none" />
          </div>
        )}
        <div className="flex-1 overflow-y-auto divide-y divide-border">{children}</div>
      </div>
    </div>
  );
}
