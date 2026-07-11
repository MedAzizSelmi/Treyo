/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getAllStudents,
  getAllTrainers,
  getPendingTrainers,
  toggleUserStatus,
  approveTrainer,
  rejectTrainer,
  promoteToAdmin,
} from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import Badge from '@/components/Badge';
import ConfirmDialog from '@/components/ConfirmDialog';
import LoadingSpinner from '@/components/LoadingSpinner';
import {
  UserCheck,
  UserX,
  ShieldCheck,
  ShieldX,
  GraduationCap,
  Briefcase,
  Clock,
  Crown,
  Copy,
  CheckCheck,
  X,
  FileText,
  Mail,
  Phone,
  MapPin,
  Globe,
  Eye,
} from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';

type Tab = 'students' | 'trainers' | 'pending';

interface PromoteResult {
  adminEmail: string;
  tempPassword: string;
}

export default function UsersPage() {
  const [tab, setTab] = useState<Tab>('students');
  const [students, setStudents] = useState<any[]>([]);
  const [trainers, setTrainers] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [promoteResult, setPromoteResult] = useState<PromoteResult | null>(null);
  // Trainer being reviewed in the pending-approval detail panel.
  // Null = panel closed. Populated when the admin clicks "Review".
  const [reviewTrainer, setReviewTrainer] = useState<any | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [dialog, setDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant: 'danger' | 'success';
    confirmLabel: string;
    action: () => Promise<any>;
  }>({ open: false, title: '', message: '', variant: 'danger', confirmLabel: '', action: async () => {} });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t, p] = await Promise.all([getAllStudents(), getAllTrainers(), getPendingTrainers()]);
      setStudents(s.data || []);
      setTrainers(t.data || []);
      setPending(p.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAction = async () => {
    try {
      const result = await dialog.action();
      // If the action returned promote data, show it
      if (result?.data?.tempPassword) {
        setPromoteResult({ adminEmail: result.data.adminEmail, tempPassword: result.data.tempPassword });
      }
      await loadData();
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.message || err.message || 'Action failed');
    }
    setDialog((d) => ({ ...d, open: false }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Avatar ──────────────────────────────────────────
  const Avatar = ({ name, color }: { name: string; color: string }) => (
    <div className={`w-9 h-9 rounded-full ${color} flex items-center justify-center font-bold text-sm`}>
      {(name || '?')[0].toUpperCase()}
    </div>
  );

  // ── Columns ──────────────────────────────────────────
  const studentColumns = [
    {
      key: 'name', label: 'Name', sortable: true,
      render: (r: any) => (
        <div className="flex items-center gap-3">
          <Avatar name={r.name} color="bg-accent/15 text-accent" />
          <div>
            <p className="font-medium text-white">{r.name || 'N/A'}</p>
            <p className="text-xs text-muted">{r.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'experienceLevel', label: 'Level',
      render: (r: any) => <span className="text-foreground">{r.experienceLevel || '—'}</span>,
    },
    {
      key: 'totalCoursesEnrolled', label: 'Enrolled', sortable: true,
      render: (r: any) => <span className="text-foreground">{r.totalCoursesEnrolled || 0}</span>,
    },
    {
      key: 'isActive', label: 'Status',
      render: (r: any) => (
        <Badge variant={r.isActive ? 'success' : 'danger'}>{r.isActive ? 'Active' : 'Disabled'}</Badge>
      ),
    },
    {
      key: 'actions', label: 'Actions',
      render: (r: any) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDialog({
              open: true,
              title: r.isActive ? 'Disable Student' : 'Enable Student',
              message: `Are you sure you want to ${r.isActive ? 'disable' : 'enable'} ${r.name}?`,
              variant: r.isActive ? 'danger' : 'success',
              confirmLabel: r.isActive ? 'Disable' : 'Enable',
              action: () => toggleUserStatus(r.studentId, 'STUDENT'),
            })}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              r.isActive ? 'bg-danger/10 text-danger hover:bg-danger/20' : 'bg-success/10 text-success hover:bg-success/20'
            }`}
          >
            {r.isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
            {r.isActive ? 'Disable' : 'Enable'}
          </button>
          <button
            onClick={() => setDialog({
              open: true,
              title: 'Promote to Admin',
              message: `Promote ${r.name} (${r.email}) to admin? They will receive a temporary password.`,
              variant: 'success',
              confirmLabel: 'Promote',
              action: () => promoteToAdmin(r.studentId, 'STUDENT'),
            })}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-warning/10 text-warning hover:bg-warning/20 transition"
          >
            <Crown className="w-3.5 h-3.5" />
            Make Admin
          </button>
        </div>
      ),
    },
  ];

  const trainerColumns = [
    {
      key: 'name', label: 'Name', sortable: true,
      render: (r: any) => (
        <div className="flex items-center gap-3">
          <Avatar name={r.name} color="bg-info/15 text-info" />
          <div>
            <p className="font-medium text-white">{r.name || 'N/A'}</p>
            <p className="text-xs text-muted">{r.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'specializations', label: 'Specializations',
      render: (r: any) => (
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {(r.specializations || []).slice(0, 2).map((s: string, i: number) => (
            <span key={i} className="text-xs bg-card-hover px-2 py-0.5 rounded text-foreground">{s}</span>
          ))}
          {(r.specializations || []).length > 2 && (
            <span className="text-xs text-muted">+{r.specializations.length - 2}</span>
          )}
        </div>
      ),
    },
    {
      key: 'averageRating', label: 'Rating', sortable: true,
      render: (r: any) => (
        <span className="text-warning font-medium">
          {r.averageRating ? `★ ${r.averageRating.toFixed(1)}` : '—'}
        </span>
      ),
    },
    {
      key: 'isVerified', label: 'Verified',
      render: (r: any) => (
        <Badge variant={r.isVerified ? 'success' : 'warning'}>{r.isVerified ? 'Verified' : 'Pending'}</Badge>
      ),
    },
    {
      key: 'isActive', label: 'Status',
      render: (r: any) => (
        <Badge variant={r.isActive ? 'success' : 'danger'}>{r.isActive ? 'Active' : 'Disabled'}</Badge>
      ),
    },
    {
      key: 'actions', label: 'Actions',
      render: (r: any) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDialog({
              open: true,
              title: r.isActive ? 'Disable Trainer' : 'Enable Trainer',
              message: `Are you sure you want to ${r.isActive ? 'disable' : 'enable'} ${r.name}?`,
              variant: r.isActive ? 'danger' : 'success',
              confirmLabel: r.isActive ? 'Disable' : 'Enable',
              action: () => toggleUserStatus(r.trainerId, 'TRAINER'),
            })}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              r.isActive ? 'bg-danger/10 text-danger hover:bg-danger/20' : 'bg-success/10 text-success hover:bg-success/20'
            }`}
          >
            {r.isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
            {r.isActive ? 'Disable' : 'Enable'}
          </button>
          <button
            onClick={() => setDialog({
              open: true,
              title: 'Promote to Admin',
              message: `Promote ${r.name} (${r.email}) to admin? They will receive a temporary password.`,
              variant: 'success',
              confirmLabel: 'Promote',
              action: () => promoteToAdmin(r.trainerId, 'TRAINER'),
            })}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-warning/10 text-warning hover:bg-warning/20 transition"
          >
            <Crown className="w-3.5 h-3.5" />
            Make Admin
          </button>
        </div>
      ),
    },
  ];

  const pendingColumns = [
    {
      key: 'name', label: 'Name', sortable: true,
      render: (r: any) => (
        <div className="flex items-center gap-3">
          <Avatar name={r.name} color="bg-warning/15 text-warning" />
          <div>
            <p className="font-medium text-white">{r.name || 'N/A'}</p>
            <p className="text-xs text-muted">{r.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'specializations', label: 'Specializations',
      render: (r: any) => (
        <div className="flex flex-wrap gap-1">
          {(r.specializations || []).slice(0, 3).map((s: string, i: number) => (
            <span key={i} className="text-xs bg-card-hover px-2 py-0.5 rounded text-foreground">{s}</span>
          ))}
        </div>
      ),
    },
    {
      key: 'experienceYears', label: 'Experience',
      render: (r: any) => <span className="text-foreground">{r.experienceYears ? `${r.experienceYears} yrs` : '—'}</span>,
    },
    {
      key: 'actions', label: 'Actions',
      render: (r: any) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setRejectNote(''); setReviewTrainer(r); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent/10 text-accent hover:bg-accent/20 transition"
          >
            <Eye className="w-3.5 h-3.5" /> Review
          </button>
          <button
            onClick={() => setDialog({
              open: true,
              title: 'Approve Trainer',
              message: `Approve ${r.name} as a verified trainer? They'll be emailed a confirmation.`,
              variant: 'success',
              confirmLabel: 'Approve',
              action: () => approveTrainer(r.userId),
            })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-success/10 text-success hover:bg-success/20 transition"
          >
            <ShieldCheck className="w-3.5 h-3.5" /> Approve
          </button>
        </div>
      ),
    },
  ];

  const tabs = [
    { key: 'students' as Tab, label: 'Students', icon: GraduationCap, count: students.length },
    { key: 'trainers' as Tab, label: 'Trainers', icon: Briefcase, count: trainers.length },
    { key: 'pending' as Tab, label: 'Pending Approval', icon: Clock, count: pending.length },
  ];

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="User Management"
        subtitle={`${students.length + trainers.length} users total — ${pending.length} pending approval`}
      />

      {/* Promoted to admin result card */}
      {promoteResult && (
        <div className="mb-6 bg-warning/10 border border-warning/30 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-warning/20 flex items-center justify-center flex-shrink-0">
                <Crown className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="font-bold text-white mb-1">User promoted to Admin!</p>
                <p className="text-sm text-foreground mb-3">
                  Share these credentials with <span className="text-warning font-medium">{promoteResult.adminEmail}</span>
                </p>
                <div className="flex items-center gap-3 bg-background border border-border rounded-xl px-4 py-3">
                  <div>
                    <p className="text-xs text-muted mb-0.5">Temporary password</p>
                    <p className="font-mono text-sm font-bold text-white">{promoteResult.tempPassword}</p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(promoteResult.tempPassword)}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent/10 text-accent hover:bg-accent/20 transition"
                  >
                    {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="text-xs text-muted mt-2">⚠️ This password is shown only once. Make sure to copy it.</p>
              </div>
            </div>
            <button
              onClick={() => setPromoteResult(null)}
              className="text-muted hover:text-foreground transition flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'text-muted hover:text-foreground border border-border'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-md font-bold ${
                tab === t.key ? 'bg-accent/20 text-accent' : 'bg-card-hover text-muted'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'students' && <DataTable columns={studentColumns} data={students} searchKeys={['name', 'email']} />}
      {tab === 'trainers' && <DataTable columns={trainerColumns} data={trainers} searchKeys={['name', 'email']} />}
      {tab === 'pending' && (
        <DataTable columns={pendingColumns} data={pending} searchKeys={['name', 'email']} emptyMessage="No pending trainer approvals" />
      )}

      <ConfirmDialog
        open={dialog.open}
        title={dialog.title}
        message={dialog.message}
        variant={dialog.variant}
        confirmLabel={dialog.confirmLabel}
        onConfirm={handleAction}
        onCancel={() => setDialog((d) => ({ ...d, open: false }))}
      />

      {/* Trainer review modal — opened by "Review" on a pending row.
          Shows the trainer's full onboarding submission so the admin
          can decide before approve/reject. */}
      {reviewTrainer && (
        <TrainerReviewModal
          trainer={reviewTrainer}
          note={rejectNote}
          onNoteChange={setRejectNote}
          onClose={() => setReviewTrainer(null)}
          onApprove={async () => {
            await approveTrainer(reviewTrainer.userId);
            setReviewTrainer(null);
            loadData();
          }}
          onReject={async () => {
            await rejectTrainer(reviewTrainer.userId, rejectNote.trim() || undefined);
            setReviewTrainer(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}

/**
 * Detail panel for one pending trainer. Top section shows identity +
 * onboarding info (bio, education, experience, location, links). CV
 * link opens the uploaded resume in a new tab. Bottom is approve /
 * reject with an optional rejection note that gets emailed to the
 * trainer verbatim.
 */
function TrainerReviewModal({
  trainer, note, onNoteChange, onClose, onApprove, onReject,
}: {
  trainer: any;
  note: string;
  onNoteChange: (v: string) => void;
  onClose: () => void;
  onApprove: () => void | Promise<void>;
  onReject: () => void | Promise<void>;
}) {
  const cvUrl = trainer.cvUrl
    ? (String(trainer.cvUrl).startsWith('http') ? trainer.cvUrl : `${API_BASE_URL}${trainer.cvUrl}`)
    : null;
  const photoUrl = trainer.profilePictureUrl
    ? (String(trainer.profilePictureUrl).startsWith('http') ? trainer.profilePictureUrl : `${API_BASE_URL}${trainer.profilePictureUrl}`)
    : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-card border border-border p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 rounded-lg bg-card-hover hover:bg-border flex items-center justify-center"
        >
          <X className="w-4 h-4 text-muted" />
        </button>

        {/* Identity */}
        <div className="flex items-start gap-4 mb-6">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={trainer.name} className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-accent-dim flex items-center justify-center text-accent font-bold text-xl">
              {(trainer.name || 'T').trim().charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white">{trainer.name}</h2>
            <p className="text-sm text-muted flex items-center gap-1.5 mt-0.5">
              <Mail className="w-3.5 h-3.5" /> {trainer.email}
            </p>
            {trainer.experienceYears != null && (
              <p className="text-xs text-muted mt-1">
                {trainer.experienceYears} {trainer.experienceYears === 1 ? 'year' : 'years'} of experience
              </p>
            )}
          </div>
        </div>

        {/* Specializations + skills */}
        {(trainer.specializations?.length || trainer.skills?.length) ? (
          <Section title="Specializations & skills">
            {trainer.specializations?.length ? (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {trainer.specializations.map((s: string, i: number) => (
                  <span key={`spec-${i}`} className="text-xs bg-accent-dim text-accent px-2 py-1 rounded-md">{s}</span>
                ))}
              </div>
            ) : null}
            {trainer.skills?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {trainer.skills.map((s: string, i: number) => (
                  <span key={`skill-${i}`} className="text-xs bg-card-hover text-foreground/80 px-2 py-1 rounded-md">{s}</span>
                ))}
              </div>
            ) : null}
          </Section>
        ) : null}

        {/* Bio + education + experience text */}
        {trainer.bio && (
          <Section title="Bio">
            <p className="text-sm text-foreground/85 whitespace-pre-wrap leading-relaxed">{trainer.bio}</p>
          </Section>
        )}
        {trainer.education && (
          <Section title="Education">
            <p className="text-sm text-foreground/85 whitespace-pre-wrap">{trainer.education}</p>
          </Section>
        )}
        {trainer.professionalExperience && (
          <Section title="Professional experience">
            <p className="text-sm text-foreground/85 whitespace-pre-wrap leading-relaxed">{trainer.professionalExperience}</p>
          </Section>
        )}

        {/* Contact + location */}
        <Section title="Contact">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {trainer.phone && (
              <InfoRow icon={Phone} label="Phone" value={trainer.phone} />
            )}
            {(trainer.address || trainer.city || trainer.state) && (
              <InfoRow
                icon={MapPin}
                label="Location"
                value={[trainer.address, trainer.city, trainer.state, trainer.postalCode]
                  .filter(Boolean).join(', ') || '—'}
              />
            )}
          </div>
        </Section>

        {/* Links */}
        {(trainer.linkedinUrl || trainer.portfolioUrl || trainer.githubUrl) ? (
          <Section title="Links">
            <div className="flex flex-wrap gap-2">
              {trainer.linkedinUrl && (
                <LinkChip icon={Globe} label="LinkedIn" href={trainer.linkedinUrl} />
              )}
              {trainer.portfolioUrl && (
                <LinkChip icon={Globe} label="Portfolio" href={trainer.portfolioUrl} />
              )}
              {trainer.githubUrl && (
                <LinkChip icon={Globe} label="GitHub" href={trainer.githubUrl} />
              )}
            </div>
          </Section>
        ) : null}

        {/* CV */}
        <Section title="CV / resume">
          {cvUrl ? (
            <a
              href={cvUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-accent text-black text-sm font-semibold hover:bg-accent/90"
            >
              <FileText className="w-4 h-4" /> Open CV
            </a>
          ) : (
            <p className="text-sm text-muted italic">No CV attached.</p>
          )}
        </Section>

        {/* Rejection note */}
        <Section title="Rejection note (optional)">
          <textarea
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="If you reject this trainer, this note gets emailed to them verbatim — explain what to improve before re-applying."
            className="w-full min-h-[80px] rounded-lg bg-card-hover border border-border p-3 text-sm text-foreground placeholder:text-muted focus:border-accent outline-none"
          />
        </Section>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-border">
          <button
            onClick={onReject}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-danger/10 text-danger hover:bg-danger/20 transition"
          >
            <ShieldX className="w-4 h-4" /> Reject
          </button>
          <button
            onClick={onApprove}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-success text-black hover:bg-success/90 transition"
          >
            <ShieldCheck className="w-4 h-4" /> Approve
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-xs uppercase tracking-wider text-muted font-semibold mb-2">{title}</h3>
      {children}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-3.5 h-3.5 text-muted mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted font-semibold">{label}</p>
        <p className="text-foreground">{value}</p>
      </div>
    </div>
  );
}

function LinkChip({ icon: Icon, label, href }: { icon: any; label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card-hover hover:bg-border text-xs font-medium text-foreground"
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </a>
  );
}
