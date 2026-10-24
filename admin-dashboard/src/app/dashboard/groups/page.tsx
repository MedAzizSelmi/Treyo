/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAllGroups, approveGroupSchedule, getGroupCallList, saveGroupSchedule } from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import Badge from '@/components/Badge';
import {
  BookOpen,
  Users,
  CheckCircle2,
  GitBranch,
  X,
  ArrowRight,
  Clock,
  GraduationCap,
  Calendar,
  MapPin,
  Globe,
  Filter,
  Search,
  Phone,
  Pencil,
  Plus,
  Trash2,
  CalendarCheck,
  AlertTriangle,
} from 'lucide-react';

type StatusFilter = 'all' | 'review' | 'payment' | 'active' | 'ready' | 'completed';

/**
 * Where a group being prepared is in the automated flow (backend
 * GroupAutomationService.stage). Started groups show their status.
 */
const STAGE_LABEL: Record<string, string> = {
  awaiting_schedule: 'Awaiting schedule',
  awaiting_review: 'Schedule to review',
  open_for_payment: 'Open for payment',
};

/** Sessions as stored on the group: {"sessions":[{date,time,hours}]}. */
function parseSessions(json?: string | null): { date: string; time: string; hours: number }[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed?.sessions)
      ? parsed.sessions.map((s: any) => ({ date: String(s.date), time: String(s.time).slice(0, 5), hours: Number(s.hours) || 0 }))
      : [];
  } catch {
    return [];
  }
}

/** Near the deadline with too few paid: the call list matters now. */
function needsCalls(g: any): boolean {
  if (g.stage !== 'open_for_payment' || !g.firstSessionAt) return false;
  const hoursLeft = (new Date(g.firstSessionAt).getTime() - Date.now()) / 3600000;
  return hoursLeft <= 48 && (g.joinedCount ?? 0) < (g.minStudents ?? 1);
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [editing, setEditing] = useState<any | null>(null);
  const [callList, setCallList] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAllGroups();
      setGroups(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  // Keep the open drawer in step with a reload.
  useEffect(() => {
    if (open) setOpen(groups.find((g) => g.groupId === open.groupId) || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  // The call list is read when a group open for payment is opened.
  useEffect(() => {
    setCallList(null);
    if (open?.stage !== 'open_for_payment') return;
    getGroupCallList(open.groupId)
      .then((r) => setCallList(Array.isArray(r.data) ? r.data : []))
      .catch(() => setCallList([]));
  }, [open?.groupId, open?.stage]);

  const approve = async (g: any) => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await approveGroupSchedule(g.groupId);
      setNotice({ kind: 'ok', text: `Schedule approved — ${r.data?.invited ?? 0} learner(s) invited to pay.` });
      await loadGroups();
    } catch (e: any) {
      setNotice({ kind: 'error', text: e?.response?.data?.error || 'Could not approve the schedule.' });
    } finally {
      setBusy(false);
    }
  };

  const toReview = groups.filter((g) => g.stage === 'awaiting_review').length;
  const toCall = groups.filter(needsCalls).length;

  const totalMembers = groups.reduce((s, g) => s + (g.members?.length || 0), 0);
  const paidMembers = groups.reduce(
    (s, g) => s + (g.members?.filter((m: any) => m.paymentStatus === 'paid').length || 0),
    0,
  );
  const activeCount = groups.filter((g) => (g.groupStatus || '').toLowerCase() === 'active').length;

  const filtered = groups.filter((g) => {
    if (filter === 'review' && g.stage !== 'awaiting_review') return false;
    if (filter === 'payment' && g.stage !== 'open_for_payment') return false;
    if (!['all', 'review', 'payment'].includes(filter) && (g.groupStatus || '').toLowerCase() !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        (g.groupName || '').toLowerCase().includes(s) ||
        (g.courseTitle || '').toLowerCase().includes(s) ||
        (g.trainerName || '').toLowerCase().includes(s)
      );
    }
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Groups"
        subtitle="Groups open by themselves when a course reaches its minimum requests — review their schedules here"
      />

      {/* What needs a person: the rest of the flow runs on its own. */}
      {(toReview > 0 || toCall > 0) && (
        <div className="mb-5 rounded-xl border border-warning/30 bg-warning/[0.06] p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <div className="text-sm text-foreground/90 space-y-1">
            {toReview > 0 && (
              <p><strong className="text-white">{toReview}</strong> schedule{toReview === 1 ? '' : 's'} to review — approving one invites its learners to pay.</p>
            )}
            {toCall > 0 && (
              <p><strong className="text-white">{toCall}</strong> group{toCall === 1 ? '' : 's'} near the deadline without the minimum paid — open {toCall === 1 ? 'it' : 'them'} for the learners to call.</p>
            )}
          </div>
        </div>
      )}

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={GitBranch} color="success" value={groups.length} label="Total Groups" />
        <StatCard icon={GraduationCap} color="accent" value={totalMembers} label="Students Learning" />
        <StatCard icon={CheckCircle2} color="info" value={paidMembers} label="Paid Enrollments" />
        <StatCard icon={Clock} color="warning" value={activeCount} label="Currently Active" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search group, course or trainer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm placeholder:text-muted focus:border-accent outline-none"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-muted" />
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="All" />
          <FilterChip active={filter === 'review'} onClick={() => setFilter('review')} label="To review" tone="warning" />
          <FilterChip active={filter === 'payment'} onClick={() => setFilter('payment')} label="Open for payment" tone="info" />
          <FilterChip active={filter === 'active'} onClick={() => setFilter('active')} label="Active" tone="success" />
          <FilterChip active={filter === 'ready'} onClick={() => setFilter('ready')} label="Ready" tone="warning" />
          <FilterChip active={filter === 'completed'} onClick={() => setFilter('completed')} label="Completed" tone="info" />
        </div>
      </div>

      {/* Groups list */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={GitBranch}
            title={groups.length === 0 ? 'No groups formed yet' : 'No matching groups'}
            hint={
              groups.length === 0
                ? 'A group opens here by itself once a course reaches its minimum requests.'
                : 'Try clearing the search or filter.'
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((g: any) => {
              const status = (g.groupStatus || 'unknown').toLowerCase();
              const memberCount = g.members?.length || 0;
              const fill = g.maxSize > 0 ? Math.round((memberCount / g.maxSize) * 100) : 0;
              return (
                <li
                  key={g.groupId}
                  className="px-5 py-4 hover:bg-card-hover transition cursor-pointer"
                  onClick={() => setOpen(g)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-success/12 flex items-center justify-center flex-shrink-0">
                      <GitBranch className="w-5 h-5 text-success" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-medium text-white truncate">{g.groupName}</p>
                        <Badge variant={statusVariant(status)}>{STAGE_LABEL[g.stage] || status}</Badge>
                        {g.stage === 'open_for_payment' && (
                          <span className={`text-[11px] font-semibold ${needsCalls(g) ? 'text-warning' : 'text-muted'}`}>
                            {g.joinedCount ?? 0}/{g.minStudents ?? '?'} paid
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted truncate">
                        {g.courseTitle} · trainer {g.trainerName}
                      </p>
                    </div>
                    <div className="hidden md:flex items-center gap-4 text-xs">
                      <PillStat
                        label="Members"
                        value={`${memberCount}/${g.maxSize || 0}`}
                        accent="success"
                      />
                      <div className="flex items-center gap-1.5 text-muted">
                        {g.isOnline ? <Globe className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}
                        <span>{g.isOnline ? 'Online' : g.meetingLocation || 'In-person'}</span>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted flex-shrink-0" />
                  </div>
                  {/* Fill bar */}
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-card-hover rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-success transition-all"
                        style={{ width: `${Math.min(fill, 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted font-medium w-16 text-right">
                      {memberCount}/{g.maxSize || 0}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Drawer */}
      {open && (
        <Drawer onClose={() => setOpen(null)}>
          <DrawerHeader label="Group Details" title={open.groupName} onClose={() => setOpen(null)} />
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div className="bg-card-hover/40 border border-border rounded-xl p-4 space-y-2.5">
              <Row icon={BookOpen} label="Course" value={open.courseTitle} />
              <Row icon={Users} label="Trainer" value={open.trainerName} />
              <Row
                icon={open.isOnline ? Globe : MapPin}
                label={open.isOnline ? 'Format' : 'Location'}
                value={open.isOnline ? 'Online sessions' : open.meetingLocation || 'In-person'}
              />
              {open.startDate && (
                <Row
                  icon={Calendar}
                  label="Started"
                  value={new Date(open.startDate).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                />
              )}
              <Row
                icon={GitBranch}
                label="Status"
                value={(open.groupStatus || 'unknown').charAt(0).toUpperCase() + (open.groupStatus || 'unknown').slice(1)}
              />
            </div>

            {notice && (
              <p className={`text-xs rounded-lg px-3 py-2 ${notice.kind === 'ok' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                {notice.text}
              </p>
            )}

            {/* The schedule: reviewed, edited or made here, then approved. */}
            {['awaiting_schedule', 'awaiting_review', 'open_for_payment'].includes(open.stage) && (
              <ScheduleSection
                group={open}
                busy={busy}
                onEdit={() => setEditing(open)}
                onApprove={() => approve(open)}
              />
            )}

            {/* Payments, and who to phone near the deadline. */}
            {open.stage === 'open_for_payment' && (
              <div>
                <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-accent" />
                  Not paid yet ({callList?.length ?? '…'})
                </h4>
                <p className="text-xs text-muted mb-3">
                  {open.joinedCount ?? 0} of {open.minStudents ?? '?'} needed have paid. 24 hours before the first
                  session the group starts with whoever has paid; if nobody has, it closes and nothing is charged.
                </p>
                {callList === null ? (
                  <LoadingSpinner />
                ) : callList.length === 0 ? (
                  <EmptyMini icon={CheckCircle2} text="Everyone invited has paid" />
                ) : (
                  <ul className="space-y-2">
                    {callList.map((c: any) => (
                      <li key={c.studentId} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-card-hover/40 border border-border">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{c.name}</p>
                          {c.email && <p className="text-[11px] text-muted truncate">{c.email}</p>}
                        </div>
                        {c.phone ? (
                          <a href={`tel:${c.phone}`} className="text-sm font-semibold text-accent hover:underline whitespace-nowrap">
                            {c.phone}
                          </a>
                        ) : (
                          <span className="text-[11px] text-muted">No phone</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <FunnelStat icon={GraduationCap} label="Members" value={open.members?.length || 0} tone="success" />
              <FunnelStat icon={Users} label="Capacity" value={open.maxSize || 0} tone="muted" />
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-accent" />
                Enrolled Students ({open.members?.length || 0})
              </h4>
              {open.members?.length > 0 ? (
                <ul className="space-y-2">
                  {open.members.map((m: any) => {
                    const paid = m.paymentStatus === 'paid';
                    return (
                      <StudentRow
                        key={m.enrollmentId}
                        name={m.studentName || m.studentId}
                        email={m.studentEmail}
                        badge={{
                          label: paid ? 'Paid' : 'Unpaid',
                          variant: paid ? 'success' : 'warning',
                        }}
                        extra={
                          typeof m.progressPercentage === 'number'
                            ? `${Math.round(Number(m.progressPercentage))}% complete`
                            : null
                        }
                      />
                    );
                  })}
                </ul>
              ) : (
                <EmptyMini icon={Clock} text="No members assigned yet" />
              )}
            </div>
          </div>
        </Drawer>
      )}

      {editing && (
        <ScheduleEditor
          group={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            setNotice({ kind: 'ok', text: 'Schedule saved.' });
            await loadGroups();
          }}
        />
      )}
    </div>
  );
}

// ─────── schedule ───────

function ScheduleSection({
  group, busy, onEdit, onApprove,
}: { group: any; busy: boolean; onEdit: () => void; onApprove: () => void }) {
  const sessions = parseSessions(group.meetingSchedule);
  const total = sessions.reduce((s, x) => s + (x.hours || 0), 0);
  const locked = group.stage === 'open_for_payment';
  return (
    <div>
      <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <Calendar className="w-4 h-4 text-accent" />
        Schedule {sessions.length > 0 && <span className="text-muted font-normal">· {total}h of {group.courseDurationHours ?? '?'}h</span>}
      </h4>
      {sessions.length === 0 ? (
        <EmptyMini icon={Clock} text="The trainer has not scheduled this group yet — you can do it yourself." />
      ) : (
        <ul className="space-y-1.5 mb-3">
          {sessions.map((s, i) => (
            <li key={`${s.date}-${i}`} className="flex items-center gap-3 text-sm px-3 py-2 rounded-lg bg-card-hover/40 border border-border">
              <span className="text-muted w-5">{i + 1}</span>
              <span className="text-white flex-1">
                {new Date(`${s.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <span className="text-foreground/80">{s.time}</span>
              <span className="text-muted w-10 text-right">{s.hours}h</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2 flex-wrap mt-3">
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-border text-foreground hover:bg-card-hover transition"
        >
          <Pencil className="w-3.5 h-3.5" /> {sessions.length === 0 ? 'Create schedule' : 'Edit schedule'}
        </button>
        {group.stage === 'awaiting_review' && (
          <button
            onClick={onApprove}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-accent text-black hover:bg-accent/90 disabled:opacity-50 transition"
          >
            <CalendarCheck className="w-3.5 h-3.5" /> Approve &amp; invite learners
          </button>
        )}
        {group.stage === 'awaiting_schedule' && sessions.length > 0 && (
          <button
            onClick={onApprove}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-accent text-black hover:bg-accent/90 disabled:opacity-50 transition"
          >
            <CalendarCheck className="w-3.5 h-3.5" /> Approve &amp; invite learners
          </button>
        )}
      </div>
      {locked && (
        <p className="text-[11px] text-warning mt-2">
          Learners are paying for these dates and there are no refunds — the trainer can no longer change them.
          If you change them, contact the learners who have paid.
        </p>
      )}
    </div>
  );
}

/**
 * The admin's schedule editor: the same rule as the trainer's app — the
 * session hours must add up to the course's total. Saved through the same
 * endpoint the app uses.
 */
function ScheduleEditor({ group, onClose, onSaved }: { group: any; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [rows, setRows] = useState(() => {
    const existing = parseSessions(group.meetingSchedule);
    return existing.length > 0 ? existing : [{ date: today, time: '18:00', hours: 2 }];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const duration = Number(group.courseDurationHours) || 0;
  const total = rows.reduce((s, r) => s + (Number(r.hours) || 0), 0);
  const dates = rows.map((r) => r.date);
  const duplicate = dates.some((d, i) => dates.indexOf(d) !== i);
  const past = rows.some((r) => new Date(`${r.date}T${r.time}:00`).getTime() <= Date.now());
  const valid = rows.length > 0 && !duplicate && !past && rows.every((r) => r.date && r.time && r.hours > 0)
    && (duration === 0 || total === duration);

  const set = (i: number, patch: Partial<{ date: string; time: string; hours: number }>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const sorted = [...rows].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
      await saveGroupSchedule(group.groupId, sorted.map((r) => ({ ...r, hours: Number(r.hours) })));
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.response?.data?.error || 'Could not save the schedule.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="relative w-full max-w-lg rounded-2xl bg-card border border-border p-6" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 w-9 h-9 rounded-lg bg-card-hover hover:bg-border flex items-center justify-center">
          <X className="w-4 h-4 text-muted" />
        </button>
        <h2 className="text-lg font-bold text-white mb-1">Schedule — {group.groupName}</h2>
        <p className={`text-xs mb-4 ${duration > 0 && total !== duration ? 'text-warning' : 'text-muted'}`}>
          {total}h scheduled{duration > 0 ? ` of the course's ${duration}h — they must match` : ''}
        </p>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="date" min={today} value={r.date} onChange={(e) => set(i, { date: e.target.value })}
                className="flex-1 rounded-lg bg-card-hover border border-border p-2 text-sm text-foreground outline-none focus:border-accent" />
              <input type="time" step={900} value={r.time} onChange={(e) => set(i, { time: e.target.value })}
                className="w-28 rounded-lg bg-card-hover border border-border p-2 text-sm text-foreground outline-none focus:border-accent" />
              <input type="number" min={1} max={12} value={r.hours} onChange={(e) => set(i, { hours: Number(e.target.value) })}
                className="w-16 rounded-lg bg-card-hover border border-border p-2 text-sm text-foreground outline-none focus:border-accent" />
              <span className="text-xs text-muted">h</span>
              <button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} disabled={rows.length === 1}
                className="p-2 rounded-lg text-muted hover:text-danger disabled:opacity-30">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => setRows((rs) => [...rs, { date: today, time: '18:00', hours: 2 }])}
          className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline">
          <Plus className="w-3.5 h-3.5" /> Add a session
        </button>
        {(duplicate || past) && (
          <p className="text-xs text-danger mt-3">
            {duplicate ? 'Two sessions are on the same day. ' : ''}{past ? 'A session is in the past.' : ''}
          </p>
        )}
        {error && <p className="text-xs text-danger mt-3">{error}</p>}
        <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted hover:text-foreground">Cancel</button>
          <button onClick={save} disabled={!valid || saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-black hover:bg-accent/90 transition disabled:opacity-50">
            {saving ? 'Saving…' : 'Save schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────── helpers ───────

function statusVariant(s?: string): 'success' | 'warning' | 'muted' | 'info' {
  const t = (s || '').toLowerCase();
  if (t === 'active') return 'success';
  if (t === 'ready' || t === 'forming') return 'warning';
  if (t === 'completed') return 'info';
  return 'muted';
}

function StatCard({
  icon: Icon,
  color,
  value,
  label,
}: {
  icon: any;
  color: 'accent' | 'warning' | 'success' | 'info';
  value: number;
  label: string;
}) {
  const cls = {
    accent: 'bg-accent/12 text-accent',
    warning: 'bg-warning/12 text-warning',
    success: 'bg-success/12 text-success',
    info: 'bg-info/12 text-info',
  };
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cls[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-lg font-bold text-white">{value}</p>
        <p className="text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  tone = 'accent',
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone?: 'accent' | 'success' | 'warning' | 'info';
}) {
  const toneClass = {
    accent: 'bg-accent/15 text-accent border-accent/30',
    success: 'bg-success/15 text-success border-success/30',
    warning: 'bg-warning/15 text-warning border-warning/30',
    info: 'bg-info/15 text-info border-info/30',
  };
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
        active ? toneClass[tone] : 'text-muted hover:text-foreground border-border bg-card'
      }`}
    >
      {label}
    </button>
  );
}

function PillStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent: 'warning' | 'accent' | 'success' | 'muted';
}) {
  const cls = { warning: 'text-warning', accent: 'text-accent', success: 'text-success', muted: 'text-muted' };
  return (
    <div className="flex items-center gap-1.5">
      <span className={`font-semibold ${cls[accent]}`}>{value}</span>
      <span className="text-muted">{label}</span>
    </div>
  );
}

function FunnelStat({
  icon: Icon,
  label,
  value,
  threshold,
  tone,
}: {
  icon: any;
  label: string;
  value: number;
  threshold?: number;
  tone: 'success' | 'warning' | 'muted';
}) {
  const cls = {
    success: 'bg-success/12 text-success',
    warning: 'bg-warning/12 text-warning',
    muted: 'bg-card-hover text-muted',
  };
  const reached = threshold !== undefined && value >= threshold;
  return (
    <div className="bg-card-hover/40 border border-border rounded-xl p-3.5 flex flex-col items-start gap-2">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cls[tone]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xl font-bold text-white leading-none">{value}</p>
        <p className="text-[10px] text-muted uppercase tracking-wider mt-1">{label}</p>
        {threshold !== undefined && (
          <p className={`text-[10px] mt-1 ${reached ? 'text-success' : 'text-muted'}`}>
            {reached ? '✓ Min met' : `${threshold - value} more needed`}
          </p>
        )}
      </div>
    </div>
  );
}

function StudentRow({
  name,
  email,
  badge,
  extra,
}: {
  name: string;
  email?: string;
  badge: { label: string; variant: 'success' | 'warning' | 'muted' };
  extra?: string | null;
}) {
  const initial = (name || '?').charAt(0).toUpperCase();
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-card-hover/40 border border-border">
      <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold text-sm flex-shrink-0">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{name}</p>
        {email && <p className="text-[11px] text-muted truncate">{email}</p>}
        {extra && <p className="text-[11px] text-accent mt-0.5">{extra}</p>}
      </div>
      <Badge variant={badge.variant}>{badge.label}</Badge>
    </li>
  );
}

function Row({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <Icon className="w-4 h-4 text-muted flex-shrink-0" />
      <span className="text-muted text-xs uppercase tracking-wider w-20 flex-shrink-0">{label}</span>
      <span className="text-white truncate">{value}</span>
    </div>
  );
}

function EmptyState({ icon: Icon, title, hint }: { icon: any; title: string; hint: string }) {
  return (
    <div className="p-12 text-center">
      <Icon className="w-10 h-10 text-muted mx-auto mb-3 opacity-40" />
      <p className="text-sm font-medium text-white mb-1">{title}</p>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}

function EmptyMini({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="text-center py-8 border border-dashed border-border rounded-xl">
      <Icon className="w-8 h-8 text-muted mx-auto mb-2 opacity-40" />
      <p className="text-xs text-muted">{text}</p>
    </div>
  );
}

function Drawer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-xl h-full bg-card border-l border-border shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function DrawerHeader({
  label,
  title,
  onClose,
}: {
  label: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="px-6 py-5 border-b border-border flex items-center justify-between">
      <div className="min-w-0">
        <p className="text-xs text-accent uppercase tracking-wider font-semibold mb-1">{label}</p>
        <h2 className="text-lg font-bold text-white truncate">{title}</h2>
      </div>
      <button
        onClick={onClose}
        className="p-2 rounded-lg hover:bg-card-hover text-muted hover:text-foreground transition flex-shrink-0"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
