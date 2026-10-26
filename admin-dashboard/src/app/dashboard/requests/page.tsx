/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getRequestedCourses,
  getCourseInterest,
  formCourseGroup,
  cleanupStaleRequests,
} from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import Badge from '@/components/Badge';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useI18n } from '@/i18n/I18nProvider';
import {
  BookOpen,
  Users,
  CheckCircle2,
  Send,
  GitBranch,
  X,
  ArrowRight,
  Clock,
  Mail,
  Filter,
  Trash2,
  Search,
} from 'lucide-react';

type Filter = 'all' | 'ready' | 'waiting';
type Toast = { kind: 'success' | 'error'; text: string } | null;

export default function RequestsPage() {
  const { t } = useI18n();
  const [requested, setRequested] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const [selected, setSelected] = useState<any | null>(null);
  const [interest, setInterest] = useState<any | null>(null);
  const [interestLoading, setInterestLoading] = useState(false);

  const [actionLoading, setActionLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    variant: 'danger' | 'success';
    action: () => Promise<any>;
  }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'success', action: async () => {} });
  const [toast, setToast] = useState<Toast>(null);

  const loadRequested = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getRequestedCourses();
      setRequested(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRequested(); }, [loadRequested]);

  const showToast = (t: Toast) => {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 3500);
  };

  const openCourse = async (course: any) => {
    setSelected(course);
    setInterestLoading(true);
    try {
      const res = await getCourseInterest(course.courseId);
      setInterest(res.data);
    } catch (err) {
      console.error(err);
      setInterest(null);
    } finally {
      setInterestLoading(false);
    }
  };

  const closeDrawer = () => { setSelected(null); setInterest(null); };

  const refreshInterest = async () => {
    if (!selected) return;
    try {
      const res = await getCourseInterest(selected.courseId);
      setInterest(res.data);
    } catch (err) { console.error(err); }
  };

  const askCleanup = () => {
    setConfirmDialog({
      open: true,
      title: t('requests.cleanupTitle'),
      message: t('requests.cleanupBody'),
      confirmLabel: t('requests.cleanupConfirm'),
      variant: 'danger',
      action: async () => {
        setActionLoading(true);
        try {
          const res = await cleanupStaleRequests();
          await loadRequested();
          showToast({
            kind: 'success',
            text: t('requests.cleanupDone', { count: res.data?.removedCount || 0 }),
          });
        } catch (err: any) {
          showToast({ kind: 'error', text: err?.response?.data?.error || err?.message || t('requests.cleanupFailed') });
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const askFormGroup = () => {
    if (!interest) return;
    setConfirmDialog({
      open: true,
      title: t('requests.formGroup'),
      message: t('requests.formGroupBody', { course: interest.courseTitle, count: interest.confirmedCount }),
      confirmLabel: t('requests.formGroup'),
      variant: 'success',
      action: async () => {
        setActionLoading(true);
        try {
          const res = await formCourseGroup(selected.courseId);
          await refreshInterest();
          await loadRequested();
          showToast({ kind: 'success', text: t('requests.formed', { name: res.data?.groupName, count: res.data?.memberCount }) });
        } catch (err: any) {
          showToast({ kind: 'error', text: err?.response?.data?.error || err?.message || t('requests.formFailed') });
        } finally { setActionLoading(false); }
      },
    });
  };

  // Filtered list
  const query = search.trim().toLowerCase();
  const filtered = requested.filter((c) => {
    if (filter === 'ready' && !(c.canNotify || c.canFormGroup)) return false;
    if (filter === 'waiting' && !(c.interestedCount > 0 && !c.canNotify)) return false;
    if (query) {
      return [c.courseTitle, c.domain, c.trainerName]
        .some((v) => (v || '').toLowerCase().includes(query));
    }
    return true;
  });

  // Stats
  const totalRequests = requested.reduce((s, r) => s + (r.interestedCount || 0), 0);
  const totalConfirmed = requested.reduce((s, r) => s + (r.confirmedCount || 0), 0);
  const readyToNotify = requested.filter((r) => r.canNotify && !r.canFormGroup).length;
  const readyToForm = requested.filter((r) => r.canFormGroup).length;

  return (
    <div>
      <PageHeader
        title={t('requests.title')}
        subtitle={t('requests.subtitle')}
      />

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Mail} color="warning" value={totalRequests} label={t('requests.totalRequests')} />
        <StatCard icon={CheckCircle2} color="accent" value={totalConfirmed} label={t('requests.awaitingGroup')} />
        <StatCard icon={Send} color="info" value={readyToNotify} label={t('requests.minReached')} />
        <StatCard icon={GitBranch} color="success" value={readyToForm} label={t('requests.readyToForm')} />
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-3">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          type="text"
          placeholder={t('requests.searchPh')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full ps-10 pe-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm placeholder:text-muted focus:border-accent outline-none"
        />
      </div>

      {/* Filter chips + cleanup */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <Filter className="w-4 h-4 text-muted" />
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label={t('requests.all')} count={requested.length} />
        <FilterChip
          active={filter === 'ready'}
          onClick={() => setFilter('ready')}
          label={t('requests.actionNeeded')}
          count={requested.filter((r) => r.canNotify || r.canFormGroup).length}
          tone="success"
        />
        <FilterChip
          active={filter === 'waiting'}
          onClick={() => setFilter('waiting')}
          label={t('requests.waitingMin')}
          count={requested.filter((r) => r.interestedCount > 0 && !r.canNotify).length}
          tone="warning"
        />
        <button
          onClick={askCleanup}
          disabled={actionLoading}
          className="ms-auto flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-muted hover:text-danger hover:border-danger/40 transition disabled:opacity-40"
          title={t('requests.cleanupHint')}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t('requests.cleanup')}
        </button>
      </div>

      {/* Course list */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={requested.length === 0 ? t('requests.noCourses') : t('requests.noMatch')}
            hint={requested.length === 0 ? t('requests.noCoursesBody') : t('requests.noMatchBody')}
          />
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((c: any) => {
              const reachedMin = c.interestedCount >= c.minStudentsRequired;
              const progress = Math.min(100, Math.round((c.interestedCount / Math.max(c.minStudentsRequired, 1)) * 100));
              return (
                <li
                  key={c.courseId}
                  className="px-5 py-4 hover:bg-card-hover transition cursor-pointer"
                  onClick={() => openCourse(c)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-warning/12 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-5 h-5 text-warning" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-medium text-white truncate">{c.courseTitle}</p>
                        {c.canFormGroup && <Badge variant="accent">{t('requests.readyToForm')}</Badge>}
                        {c.canNotify && !c.canFormGroup && <Badge variant="success">{t('requests.minMet')}</Badge>}
                      </div>
                      <p className="text-xs text-muted truncate">
                        {c.domain || '—'} · {t('requests.by', { name: c.trainerName })}
                      </p>
                    </div>
                    <div className="hidden sm:flex items-center gap-4 text-xs">
                      <PillStat label={t('requests.requested')} value={c.interestedCount} accent="warning" />
                      <PillStat label={t('requests.confirmed')} value={c.confirmedCount} accent="accent" />
                      <PillStat label={t('requests.min')} value={c.minStudentsRequired} accent="muted" />
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted flex-shrink-0" />
                  </div>
                  {/* Progress bar */}
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-card-hover rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${reachedMin ? 'bg-success' : 'bg-warning'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted font-medium w-16 text-end">
                      {c.interestedCount}/{c.minStudentsRequired}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Drawer */}
      {selected && (
        <Drawer onClose={closeDrawer}>
          <DrawerHeader label={t('requests.funnel')} title={selected.courseTitle} onClose={closeDrawer} />
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {interestLoading || !interest ? (
              <div className="flex items-center justify-center py-12"><LoadingSpinner /></div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <FunnelStat
                    icon={Mail}
                    label={t('requests.interested')}
                    value={interest.interestedCount}
                    threshold={interest.minStudentsRequired}
                    tone="warning"
                  />
                  <FunnelStat icon={CheckCircle2} label={t('requests.confirmed')} value={interest.confirmedCount} tone="success" />
                  <FunnelStat icon={Users} label={t('requests.minRequired')} value={interest.minStudentsRequired} tone="muted" />
                </div>

                {/* Groups open by themselves now (GroupAutomationService):
                    there is no "notify" step to click. */}
                <div className="rounded-xl border border-accent/25 bg-accent/[0.05] p-4 flex gap-3">
                  <Send className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-foreground/85 leading-relaxed">
                    {interest.hasFormingGroup
                      ? t('requests.infoPreparing')
                      : interest.canNotify
                        ? t('requests.infoMinReached')
                        : t('requests.infoMore', { count: interest.minStudentsRequired - interest.interestedCount })}
                    {' '}{t('requests.infoFlow')}
                  </p>
                </div>

                {/* The old flow: learners who paid before groups were opened
                    automatically still need forming the old way. */}
                {interest.confirmedCount > 0 && (
                <ActionPanel
                  step={2}
                  icon={GitBranch}
                  tone="success"
                  title={t('requests.formTheGroup')}
                  description={interest.canFormGroup ? t('requests.formReady') : t('requests.formNotReady')}
                  buttonLabel={t('requests.formGroupCount', { count: interest.confirmedCount })}
                  buttonIcon={GitBranch}
                  disabled={!interest.canFormGroup || actionLoading}
                  onClick={askFormGroup}
                />
                )}

                <div>
                  <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4 text-accent" />
                    {t('requests.interestedStudents', { count: interest.interestedStudents?.length || 0 })}
                  </h4>
                  {interest.interestedStudents?.length > 0 ? (
                    <ul className="space-y-2">
                      {interest.interestedStudents.map((s: any, i: number) => {
                        const status = s.hasGroup
                          ? { label: t('requests.inGroup'), variant: 'success' as const }
                          : s.enrollmentStatus === 'confirmed'
                          ? { label: t('requests.confirmed'), variant: 'success' as const }
                          : { label: t('requests.requested'), variant: 'warning' as const };
                        return (
                          <StudentRow
                            key={s.studentId || i}
                            name={s.studentName || s.studentId}
                            email={s.studentEmail}
                            badge={status}
                          />
                        );
                      })}
                    </ul>
                  ) : (
                    <EmptyMini icon={Clock} text={t('requests.noInterest')} />
                  )}
                </div>
              </>
            )}
          </div>
        </Drawer>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 end-6 z-[60] px-4 py-3 rounded-xl border shadow-lg flex items-center gap-3 ${
            toast.kind === 'success'
              ? 'bg-success/10 border-success/30 text-success'
              : 'bg-danger/10 border-danger/30 text-danger'
          }`}
        >
          {toast.kind === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <X className="w-4 h-4" />}
          <span className="text-sm font-medium">{toast.text}</span>
        </div>
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
        confirmLabel={confirmDialog.confirmLabel}
        onConfirm={async () => {
          await confirmDialog.action();
          setConfirmDialog((d) => ({ ...d, open: false }));
        }}
        onCancel={() => setConfirmDialog((d) => ({ ...d, open: false }))}
      />
    </div>
  );
}

// ─────── shared bits ───────

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
  count,
  tone = 'accent',
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone?: 'accent' | 'success' | 'warning';
}) {
  const toneClass = {
    accent: 'bg-accent/15 text-accent border-accent/30',
    success: 'bg-success/15 text-success border-success/30',
    warning: 'bg-warning/15 text-warning border-warning/30',
  };
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
        active ? toneClass[tone] : 'text-muted hover:text-foreground border-border bg-card'
      }`}
    >
      {label}
      <span className={`text-[10px] px-1.5 rounded-md font-bold ${active ? 'bg-white/10' : 'bg-card-hover'}`}>
        {count}
      </span>
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
  const { t } = useI18n();
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
            {reached ? `✓ ${t('requests.minMet')}` : t('requests.moreNeeded', { count: threshold - value })}
          </p>
        )}
      </div>
    </div>
  );
}

function ActionPanel({
  step,
  icon: Icon,
  tone,
  title,
  description,
  buttonLabel,
  buttonIcon: BIcon,
  disabled,
  onClick,
}: {
  step: number;
  icon: any;
  tone: 'warning' | 'success';
  title: string;
  description: string;
  buttonLabel: string;
  buttonIcon: any;
  disabled: boolean;
  onClick: () => void;
}) {
  const cls = {
    warning: { wrap: 'bg-warning/12 text-warning', btn: 'bg-warning/15 text-warning hover:bg-warning/25' },
    success: { wrap: 'bg-success/12 text-success', btn: 'bg-success/15 text-success hover:bg-success/25' },
  };
  return (
    <div className="bg-card-hover/40 border border-border rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${cls[tone].wrap}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white mb-1">
            {step}. {title}
          </p>
          <p className="text-xs text-muted leading-relaxed mb-3">{description}</p>
          <button
            onClick={onClick}
            disabled={disabled}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed ${cls[tone].btn}`}
          >
            <BIcon className="w-3.5 h-3.5" />
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function StudentRow({
  name,
  email,
  badge,
}: {
  name: string;
  email?: string;
  badge: { label: string; variant: 'success' | 'warning' | 'muted' };
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
      </div>
      <Badge variant={badge.variant}>{badge.label}</Badge>
    </li>
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
        className="w-full max-w-xl h-full bg-card border-s border-border shadow-2xl flex flex-col"
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
