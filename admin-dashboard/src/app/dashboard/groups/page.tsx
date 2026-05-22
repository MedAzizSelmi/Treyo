/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAllGroups } from '@/lib/api';
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
} from 'lucide-react';

type StatusFilter = 'all' | 'active' | 'ready' | 'completed';

export default function GroupsPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');

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

  const totalMembers = groups.reduce((s, g) => s + (g.members?.length || 0), 0);
  const paidMembers = groups.reduce(
    (s, g) => s + (g.members?.filter((m: any) => m.paymentStatus === 'paid').length || 0),
    0,
  );
  const activeCount = groups.filter((g) => (g.groupStatus || '').toLowerCase() === 'active').length;

  const filtered = groups.filter((g) => {
    if (filter !== 'all' && (g.groupStatus || '').toLowerCase() !== filter) return false;
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
        subtitle="Active learning groups — students who've paid and are taking the course"
      />

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
                ? 'Form a group from the Requests page once enough students confirm.'
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
                        <Badge variant={statusVariant(status)}>{status}</Badge>
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
