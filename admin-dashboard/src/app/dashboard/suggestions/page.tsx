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
import { Lightbulb, Search, Phone, Mail, Users, X, Link2, GitMerge, EyeOff, Check, Ban, Trash2 } from 'lucide-react';

type Status = 'new' | 'searching' | 'published' | 'declined' | 'rejected' | 'withdrawn' | 'merged';
type Toast = { kind: 'success' | 'error'; text: string } | null;

const TABS: { key: Status | 'all'; label: string }[] = [
  { key: 'new', label: 'To review' },
  { key: 'searching', label: 'Looking for a trainer' },
  { key: 'published', label: 'Published' },
  { key: 'declined', label: 'Declined' },
  { key: 'rejected', label: 'Not a course' },
  { key: 'all', label: 'All' },
];

const STATUS_BADGE: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'accent' }> = {
  new: { label: 'To review', variant: 'info' },
  searching: { label: 'Looking for a trainer', variant: 'warning' },
  published: { label: 'Published', variant: 'success' },
  declined: { label: 'Declined', variant: 'danger' },
  rejected: { label: 'Not a course', variant: 'muted' },
  withdrawn: { label: 'Withdrawn', variant: 'muted' },
  merged: { label: 'Merged', variant: 'muted' },
};

const FORMAT_LABEL: Record<string, string> = { Online: 'Online', 'Face-to-face': 'On-site', Hybrid: 'Hybrid' };

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
    'Accepted — other learners can now say "me too"', 'Could not accept');

  const askDecline = (s: any) => setConfirm({
    open: true, title: 'Decline this suggestion',
    message: `The ${s.supporters} learner${s.supporters === 1 ? '' : 's'} behind "${s.topic}" will get a polite notification that it will not be offered for now.`,
    confirmLabel: 'Decline', variant: 'danger',
    action: () => run(() => setCourseSuggestionStatus(s.suggestionId, 'declined', note), 'Declined; learners told', 'Could not decline'),
  });

  const askReject = (s: any) => setConfirm({
    open: true, title: 'Not a course request',
    message: `Close "${s.topic}" as noise. Nobody is notified; the learner sees it as closed.`,
    confirmLabel: 'Close it', variant: 'danger',
    action: () => run(() => setCourseSuggestionStatus(s.suggestionId, 'rejected', note), 'Closed', 'Could not close'),
  });

  const saveNote = (s: any) => run(() => setCourseSuggestionNote(s.suggestionId, note), 'Note saved', 'Could not save the note');

  const doPublish = (s: any, course: any) => setConfirm({
    open: true, title: 'Link the course',
    message: `"${course.title}" answers "${s.topic}". Its ${s.supporters} learner${s.supporters === 1 ? '' : 's'} will be notified (in the app, by push and by email), and their request for this course registered so a group can open.`,
    confirmLabel: 'Link and notify', variant: 'success',
    action: async () => {
      setPublishFor(null);
      setBusy(true);
      try {
        const res = await publishCourseSuggestion(s.suggestionId, course.courseId);
        showToast({ kind: 'success', text: `Linked — ${res.data?.told ?? 0} learner(s) notified` });
        setSelected(null);
        await load();
      } catch (e) {
        showToast({ kind: 'error', text: errText(e, 'Could not link the course') });
      } finally {
        setBusy(false);
      }
    },
  });

  const doMerge = (s: any, into: any) => setConfirm({
    open: true, title: 'Merge suggestions',
    message: `"${s.topic}" is the same request as "${into.topic}". Its learners join that one, and it closes.`,
    confirmLabel: 'Merge', variant: 'success',
    action: async () => {
      setMergeFor(null);
      await run(() => mergeCourseSuggestion(s.suggestionId, into.suggestionId), 'Merged', 'Could not merge');
    },
  });

  const askHide = (m: any) => setConfirm({
    open: true, title: 'Hide this search',
    message: `"${m.label}" and every spelling like it will no longer appear here.`,
    confirmLabel: 'Hide', variant: 'danger',
    action: async () => {
      try {
        await hideMissedSearch(m.label);
        showToast({ kind: 'success', text: 'Hidden' });
        await loadMissed();
      } catch (e) {
        showToast({ kind: 'error', text: errText(e, 'Could not hide it') });
      }
    },
  });

  const isOpen = (s: any) => s.status === 'new' || s.status === 'searching';
  const cq = courseQuery.trim().toLowerCase();

  return (
    <div>
      <PageHeader
        title="Course suggestions"
        subtitle="Courses learners asked for and could not find — find a trainer, then link the course"
      />

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              tab === t.key ? 'bg-accent/15 text-accent border-accent/40' : 'border-border text-muted hover:text-white'
            }`}
          >
            {t.label}
            <span className="ml-1.5 opacity-70">{t.key === 'all' ? all.length : counts[t.key] || 0}</span>
          </button>
        ))}
      </div>

      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          type="text"
          placeholder="Search topic, details, learner or city..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm placeholder:text-muted focus:border-accent outline-none"
        />
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden mb-8">
        {loading ? (
          <div className="p-12 flex items-center justify-center"><LoadingSpinner /></div>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center">
            <Lightbulb className="w-10 h-10 text-muted mx-auto mb-3" />
            <p className="text-white font-medium">No suggestions here</p>
            <p className="text-xs text-muted mt-1">Learners suggest courses from the app when a search finds nothing.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((s) => (
              <li key={s.suggestionId} className="px-5 py-4 hover:bg-card-hover transition cursor-pointer" onClick={() => open(s)}>
                <div className="flex items-start gap-4">
                  <div className="w-12 flex-shrink-0 text-center">
                    <p className="text-xl font-bold text-white leading-none">{s.supporters}</p>
                    <p className="text-[10px] text-muted mt-1">learner{s.supporters === 1 ? '' : 's'}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-medium text-white">{s.topic}</p>
                      <Badge variant={STATUS_BADGE[s.status]?.variant || 'muted'}>{STATUS_BADGE[s.status]?.label || s.status}</Badge>
                    </div>
                    <p className="text-sm text-foreground/80 line-clamp-2">{s.details}</p>
                    <p className="text-xs text-muted mt-1.5">
                      {[s.domain || 'Other domain', s.level, s.format && FORMAT_LABEL[s.format], s.language, s.city]
                        .filter(Boolean).join(' · ')}
                      {' · '}by {s.author?.name}
                      {s.supporters > 1 ? ` + ${s.supporters - 1} other${s.supporters === 2 ? '' : 's'}` : ''}
                      {s.createdAt ? ` · ${new Date(s.createdAt).toLocaleDateString()}` : ''}
                    </p>
                    {s.courseTitle && <p className="text-xs text-success mt-1">Answered by “{s.courseTitle}”</p>}
                    {s.adminNote && <p className="text-xs text-warning/90 mt-1">Note: {s.adminNote}</p>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Searches that found nothing */}
      <h2 className="text-lg font-semibold text-white mb-1">Searches that found nothing</h2>
      <p className="text-xs text-muted mb-3">
        Last 90 days. Spellings are grouped (&quot;powerbi&quot;, &quot;Power BI&quot;, &quot;pwer bi&quot;), and a search shows once at least
        two different learners made it. These are hints, not requests: nobody asked to be told.
      </p>
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {missedLoading ? (
          <div className="p-10 flex items-center justify-center"><LoadingSpinner /></div>
        ) : missed.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {missed.map((m) => (
              <li key={m.key} className="px-5 py-3 flex items-center gap-4">
                <Search className="w-4 h-4 text-muted flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">{m.label}</p>
                  {m.spellings?.length > 1 && (
                    <p className="text-xs text-muted truncate">Also: {m.spellings.slice(1).join(', ')}</p>
                  )}
                </div>
                <div className="text-xs text-muted text-right">
                  <p><span className="text-white font-semibold">{m.learners}</span> learners · {m.searches} searches</p>
                  {m.lastSearchedAt && <p>last {new Date(m.lastSearchedAt).toLocaleDateString()}</p>}
                </div>
                <button
                  onClick={() => askHide(m)}
                  className="p-2 rounded-lg border border-border text-muted hover:text-danger hover:border-danger/40 transition"
                  title="Hide this search"
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
          <div className="relative w-full max-w-lg h-full bg-card border-l border-border flex flex-col">
            <div className="flex items-start justify-between px-6 py-5 border-b border-border">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted">Course suggestion</p>
                <h3 className="text-lg font-bold text-white mt-1">{selected.topic}</h3>
                <div className="mt-2"><Badge variant={STATUS_BADGE[selected.status]?.variant || 'muted'}>{STATUS_BADGE[selected.status]?.label || selected.status}</Badge></div>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 text-muted hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div>
                <p className="text-xs text-muted mb-1">What they want to be able to do</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{selected.details}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Domain" value={selected.domain || 'Other'} />
                <Field label="Level" value={selected.level || 'Any'} />
                <Field label="Format" value={selected.format ? FORMAT_LABEL[selected.format] || selected.format : 'Either'} />
                <Field label="Language" value={selected.language || 'Any'} />
                <Field label="City" value={selected.city || '—'} />
                <Field label="Learners" value={String(selected.supporters)} icon={Users} />
              </div>
              {/* Everyone behind it: the author, then each "me too". */}
              <div className="rounded-xl border border-border">
                <p className="text-xs text-muted px-4 pt-3 pb-2">
                  Learners who want it ({(selected.learners || []).length})
                </p>
                <ul className="divide-y divide-border">
                  {(selected.learners || []).map((l: any) => (
                    <li key={l.studentId} className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <p className="text-white text-sm font-medium">{l.name}</p>
                        {l.author ? <Badge variant="accent">Suggested it</Badge> : <Badge variant="muted">Me too</Badge>}
                        {l.since && <span className="ml-auto text-[11px] text-muted">{new Date(l.since).toLocaleDateString()}</span>}
                      </div>
                      <div className="flex flex-wrap gap-4 mt-1.5 text-xs">
                        {l.phone ? (
                          <a href={`tel:${l.phone}`} className="flex items-center gap-1.5 text-accent hover:underline">
                            <Phone className="w-3.5 h-3.5" />{l.phone}
                          </a>
                        ) : (
                          <span className="text-muted">No phone</span>
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
                <p className="text-xs text-muted mb-1">Private note (administrators only)</p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="e.g. called trainer X, waiting for an answer"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted focus:border-accent outline-none"
                />
                <button onClick={() => saveNote(selected)} disabled={busy}
                        className="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-muted hover:text-white disabled:opacity-40">
                  Save note
                </button>
              </div>
              {selected.courseTitle && <p className="text-sm text-success">Answered by “{selected.courseTitle}”.</p>}
            </div>
            {isOpen(selected) && (
              <div className="px-6 py-4 border-t border-border grid grid-cols-2 gap-2">
                {selected.status === 'new' && (
                  <ActionButton icon={Check} label="Accept" tone="success" onClick={() => accept(selected)} disabled={busy} />
                )}
                <ActionButton icon={Link2} label="Link the course" tone="success" onClick={() => { setCourseQuery(selected.topic || ''); setPublishFor(selected); }} disabled={busy} />
                <ActionButton icon={GitMerge} label="Merge into…" tone="muted" onClick={() => setMergeFor(selected)} disabled={busy} />
                <ActionButton icon={Ban} label="Decline" tone="danger" onClick={() => askDecline(selected)} disabled={busy} />
                <ActionButton icon={Trash2} label="Not a course" tone="danger" onClick={() => askReject(selected)} disabled={busy} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Link a course */}
      {publishFor && (
        <Picker title={`Which course answers “${publishFor.topic}”?`} onClose={() => setPublishFor(null)}
                query={courseQuery} onQuery={setCourseQuery} placeholder="Search published courses...">
          {courses
            .filter((c) => !cq || [c.title, c.domain, c.trainerName, c.specificTopic].some((v: string) => (v || '').toLowerCase().includes(cq)))
            .slice(0, 50)
            .map((c) => (
              <button key={c.courseId} onClick={() => doPublish(publishFor, c)}
                      className="w-full text-left px-4 py-3 hover:bg-card-hover transition">
                <p className="text-white text-sm font-medium">{c.title}</p>
                <p className="text-xs text-muted">{c.domain || '—'} · {c.trainerName}</p>
              </button>
            ))}
          <p className="px-4 py-3 text-xs text-muted">Only approved, published courses are listed: learners must be able to open it.</p>
        </Picker>
      )}

      {/* Merge */}
      {mergeFor && (
        <Picker title={`“${mergeFor.topic}” is the same request as…`} onClose={() => setMergeFor(null)}>
          {all.filter((s) => s.suggestionId !== mergeFor.suggestionId && isOpen(s)).map((s) => (
            <button key={s.suggestionId} onClick={() => doMerge(mergeFor, s)}
                    className="w-full text-left px-4 py-3 hover:bg-card-hover transition">
              <p className="text-white text-sm font-medium">{s.topic}</p>
              <p className="text-xs text-muted">{s.supporters} learner(s) · {STATUS_BADGE[s.status]?.label}</p>
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
        <div className={`fixed bottom-6 right-6 z-[120] px-4 py-3 rounded-xl text-sm font-medium border ${
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
