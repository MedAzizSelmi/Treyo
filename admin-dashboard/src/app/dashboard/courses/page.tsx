/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getAllCourses,
  deleteCourse,
  updateCourseMinStudents,
} from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import Badge from '@/components/Badge';
import ConfirmDialog from '@/components/ConfirmDialog';
import LoadingSpinner from '@/components/LoadingSpinner';
import {
  Trash2,
  BookOpen,
  Users,
  Layers,
  Pencil,
  X,
  Mail,
} from 'lucide-react';

// Drafts/pending courses were removed — every offering is created live the
// moment the admin assigns a template to a trainer. This page now shows a
// single flat list of live courses.

export default function CoursesPage() {
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant: 'danger' | 'success';
    confirmLabel: string;
    action: () => Promise<any>;
  }>({ open: false, title: '', message: '', variant: 'danger', confirmLabel: '', action: async () => {} });

  const [minStudentsModal, setMinStudentsModal] = useState<{
    open: boolean;
    course: any | null;
    value: string;
    saving: boolean;
    error: string;
  }>({ open: false, course: null, value: '5', saving: false, error: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const c = await getAllCourses();
      setCourses(c.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAction = async () => {
    try {
      await dialog.action();
      await loadData();
    } catch (err) {
      console.error(err);
    }
    setDialog((d) => ({ ...d, open: false }));
  };

  const handleSaveMinStudents = async () => {
    const n = parseInt(minStudentsModal.value, 10);
    if (isNaN(n) || n < 1) {
      setMinStudentsModal((m) => ({ ...m, error: 'Must be a positive integer' }));
      return;
    }
    if (n > 100) {
      setMinStudentsModal((m) => ({ ...m, error: 'Maximum is 100' }));
      return;
    }
    setMinStudentsModal((m) => ({ ...m, saving: true, error: '' }));
    try {
      await updateCourseMinStudents(minStudentsModal.course.courseId, n);
      await loadData();
      setMinStudentsModal({ open: false, course: null, value: '5', saving: false, error: '' });
    } catch (err: any) {
      setMinStudentsModal((m) => ({
        ...m,
        saving: false,
        error: err?.response?.data?.error || 'Failed to update',
      }));
    }
  };

  const levelVariant = (level: string) => {
    switch (level?.toLowerCase()) {
      case 'beginner': return 'success';
      case 'intermediate': return 'warning';
      case 'expert': case 'advanced': return 'danger';
      default: return 'muted';
    }
  };

  const allColumns = [
    {
      key: 'title',
      label: 'Course',
      sortable: true,
      render: (r: any) => (
        <div className="flex items-center gap-3 max-w-[280px]">
          <div className="w-10 h-10 rounded-xl bg-accent/12 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-5 h-5 text-accent" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-white truncate">{r.title}</p>
            <p className="text-xs text-muted truncate">{r.domain || r.specificTopic || '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'level',
      label: 'Level',
      render: (r: any) => (
        <Badge variant={levelVariant(r.level) as any}>{r.level || '—'}</Badge>
      ),
    },
    {
      key: 'requestedCount',
      label: 'Requested',
      sortable: true,
      render: (r: any) => {
        const requested = r.requestedCount || 0;
        const min = r.minStudentsRequired || 5;
        const reached = requested >= min;
        return (
          <div className="flex items-center gap-1.5">
            <Mail className={`w-3.5 h-3.5 ${reached ? 'text-success' : 'text-warning'}`} />
            <span className={`font-medium ${reached ? 'text-success' : 'text-foreground'}`}>
              {requested}
            </span>
            {reached && requested > 0 && (
              <span className="text-[10px] text-success">✓ min met</span>
            )}
          </div>
        );
      },
    },
    {
      key: 'totalEnrolled',
      label: 'Enrolled',
      sortable: true,
      render: (r: any) => (
        <div className="flex items-center gap-1.5 text-foreground">
          <Users className="w-3.5 h-3.5 text-muted" />
          {r.totalEnrolled || 0}
        </div>
      ),
    },
    {
      key: 'minStudentsRequired',
      label: 'Min',
      sortable: true,
      render: (r: any) => {
        const min = r.minStudentsRequired || 5;
        return (
          <button
            onClick={() =>
              setMinStudentsModal({
                open: true,
                course: r,
                value: String(min),
                saving: false,
                error: '',
              })
            }
            className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-card-hover text-foreground hover:text-accent transition group"
            title="Click to edit minimum students"
          >
            <Layers className="w-3.5 h-3.5 text-muted group-hover:text-accent transition" />
            <span className="font-medium">{min}</span>
            <Pencil className="w-3 h-3 text-muted opacity-0 group-hover:opacity-100 transition" />
          </button>
        );
      },
    },
    {
      key: 'price',
      label: 'Price',
      sortable: true,
      render: (r: any) => (
        <span className="text-foreground font-medium">
          {r.price ? `${r.price} ${r.currency || 'TND'}` : 'Free'}
        </span>
      ),
    },
    {
      key: 'isActive',
      label: 'Status',
      render: (r: any) => (
        <Badge variant={r.isActive ? 'success' : 'danger'}>
          {r.isActive ? 'Live' : 'Deleted'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (r: any) => (
        <div className="flex items-center gap-2">
          {r.isActive && (
            <button
              onClick={() =>
                setDialog({
                  open: true,
                  title: 'Delete Course',
                  message: `Are you sure you want to delete "${r.title}"? This action is reversible (soft delete).`,
                  variant: 'danger',
                  confirmLabel: 'Delete',
                  action: () => deleteCourse(r.courseId),
                })
              }
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-danger/10 text-danger hover:bg-danger/20 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="Courses"
        subtitle={`${courses.length} live ${courses.length === 1 ? 'course' : 'courses'}`}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <SummaryCard
          icon={BookOpen}
          color="success"
          value={courses.filter((c) => c.isActive).length}
          label="Live"
        />
        <SummaryCard
          icon={Mail}
          color="info"
          value={courses.reduce((s: number, c: any) => s + (c.requestedCount || 0), 0)}
          label="Total Requests"
        />
        <SummaryCard
          icon={Users}
          color="accent"
          value={courses.reduce((s: number, c: any) => s + (c.totalEnrolled || 0), 0)}
          label="Total Enrolled"
        />
      </div>

      <DataTable columns={allColumns} data={courses} searchKeys={['title', 'domain', 'level']} />

      <ConfirmDialog
        open={dialog.open}
        title={dialog.title}
        message={dialog.message}
        variant={dialog.variant}
        confirmLabel={dialog.confirmLabel}
        onConfirm={handleAction}
        onCancel={() => setDialog((d) => ({ ...d, open: false }))}
      />

      {/* Edit Min Students Modal */}
      {minStudentsModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() =>
            !minStudentsModal.saving &&
            setMinStudentsModal({ open: false, course: null, value: '5', saving: false, error: '' })
          }
        >
          <div
            className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/12 flex items-center justify-center">
                  <Layers className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Minimum Students Required</h3>
                  <p className="text-xs text-muted truncate max-w-[280px]">
                    {minStudentsModal.course?.title}
                  </p>
                </div>
              </div>
              <button
                onClick={() =>
                  !minStudentsModal.saving &&
                  setMinStudentsModal({
                    open: false,
                    course: null,
                    value: '5',
                    saving: false,
                    error: '',
                  })
                }
                className="p-1 rounded-lg hover:bg-card-hover text-muted hover:text-foreground transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-muted mb-4">
              Number of student requests required before a group is created for this course.
              Default is 5.
            </p>

            <input
              type="number"
              min={1}
              max={100}
              value={minStudentsModal.value}
              onChange={(e) =>
                setMinStudentsModal((m) => ({ ...m, value: e.target.value, error: '' }))
              }
              className="w-full px-4 py-3 rounded-xl bg-card-hover border border-border focus:border-accent outline-none text-white text-lg font-semibold text-center"
              placeholder="5"
              disabled={minStudentsModal.saving}
            />

            {minStudentsModal.error && (
              <p className="text-xs text-danger mt-2">{minStudentsModal.error}</p>
            )}

            <div className="flex items-center gap-2 mt-6">
              <button
                onClick={() =>
                  setMinStudentsModal({
                    open: false,
                    course: null,
                    value: '5',
                    saving: false,
                    error: '',
                  })
                }
                disabled={minStudentsModal.saving}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border border-border text-muted hover:text-foreground hover:bg-card-hover transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMinStudents}
                disabled={minStudentsModal.saving}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent text-black hover:bg-accent/90 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {minStudentsModal.saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  color,
  value,
  label,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  color: 'success' | 'warning' | 'info' | 'accent';
  value: number;
  label: string;
}) {
  const cls = {
    success: 'bg-success/12 text-success',
    warning: 'bg-warning/12 text-warning',
    info: 'bg-info/12 text-info',
    accent: 'bg-accent/12 text-accent',
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
