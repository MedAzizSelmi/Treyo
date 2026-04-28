/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getAllCourses,
  getPendingCourses,
  approveCourse,
  rejectCourse,
  deleteCourse,
  updateCourseMinStudents,
} from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import Badge from '@/components/Badge';
import ConfirmDialog from '@/components/ConfirmDialog';
import LoadingSpinner from '@/components/LoadingSpinner';
import {
  CheckCircle,
  XCircle,
  Trash2,
  BookOpen,
  Clock,
  Users,
  Layers,
  DollarSign,
  Pencil,
  X,
} from 'lucide-react';

type Tab = 'all' | 'pending';

export default function CoursesPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [courses, setCourses] = useState<any[]>([]);
  const [pendingList, setPendingList] = useState<any[]>([]);
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
      const [c, p] = await Promise.all([getAllCourses(), getPendingCourses()]);
      setCourses(c.data || []);
      setPendingList(p.data || []);
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
      label: 'Min Students',
      sortable: true,
      render: (r: any) => {
        const min = r.minStudentsRequired || 5;
        const enrolled = r.totalEnrolled || 0;
        return (
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-muted" />
            <span className="text-foreground">{min}</span>
            {enrolled >= min ? (
              <CheckCircle className="w-3.5 h-3.5 text-success" />
            ) : (
              <span className="text-xs text-muted">
                ({min - enrolled} more needed)
              </span>
            )}
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
              className="ml-1 p-1 rounded-md hover:bg-card-hover text-muted hover:text-accent transition"
              title="Edit minimum students"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
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
      key: 'isPublished',
      label: 'Status',
      render: (r: any) => (
        <Badge variant={r.isPublished ? 'success' : r.isActive ? 'warning' : 'danger'}>
          {r.isPublished ? 'Published' : r.isActive ? 'Draft' : 'Deleted'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (r: any) => (
        <div className="flex items-center gap-2">
          {!r.isPublished && r.isActive && (
            <button
              onClick={() =>
                setDialog({
                  open: true,
                  title: 'Approve Course',
                  message: `Publish "${r.title}" and make it visible to students?`,
                  variant: 'success',
                  confirmLabel: 'Approve',
                  action: () => approveCourse(r.courseId),
                })
              }
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-success/10 text-success hover:bg-success/20 transition"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Approve
            </button>
          )}
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

  const pendingColumns = [
    {
      key: 'title',
      label: 'Course',
      sortable: true,
      render: (r: any) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-warning/12 flex items-center justify-center">
            <Clock className="w-5 h-5 text-warning" />
          </div>
          <div>
            <p className="font-medium text-white">{r.title}</p>
            <p className="text-xs text-muted">{r.domain || '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'level',
      label: 'Level',
      render: (r: any) => <Badge variant={levelVariant(r.level) as any}>{r.level || '—'}</Badge>,
    },
    {
      key: 'minStudentsRequired',
      label: 'Min Students',
      render: (r: any) => <span className="text-foreground">{r.minStudentsRequired || 5}</span>,
    },
    {
      key: 'price',
      label: 'Price',
      render: (r: any) => (
        <span className="text-foreground">
          {r.price ? `${r.price} ${r.currency || 'TND'}` : 'Free'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (r: any) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              setDialog({
                open: true,
                title: 'Approve Course',
                message: `Publish "${r.title}" and make it visible to students?`,
                variant: 'success',
                confirmLabel: 'Approve',
                action: () => approveCourse(r.courseId),
              })
            }
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-success/10 text-success hover:bg-success/20 transition"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Approve
          </button>
          <button
            onClick={() =>
              setDialog({
                open: true,
                title: 'Reject Course',
                message: `Reject "${r.title}"? This will deactivate it.`,
                variant: 'danger',
                confirmLabel: 'Reject',
                action: () => rejectCourse(r.courseId),
              })
            }
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-danger/10 text-danger hover:bg-danger/20 transition"
          >
            <XCircle className="w-3.5 h-3.5" />
            Reject
          </button>
        </div>
      ),
    },
  ];

  const tabs = [
    { key: 'all' as Tab, label: 'All Courses', icon: BookOpen, count: courses.length },
    { key: 'pending' as Tab, label: 'Pending Approval', icon: Clock, count: pendingList.length },
  ];

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="Course Management"
        subtitle={`${courses.length} courses — ${pendingList.length} pending approval`}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-success/12 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-success" />
          </div>
          <div>
            <p className="text-lg font-bold text-white">
              {courses.filter((c) => c.isPublished).length}
            </p>
            <p className="text-xs text-muted">Published</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-warning/12 flex items-center justify-center">
            <Clock className="w-5 h-5 text-warning" />
          </div>
          <div>
            <p className="text-lg font-bold text-white">{pendingList.length}</p>
            <p className="text-xs text-muted">Pending</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-accent/12 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-accent" />
          </div>
          <div>
            <p className="text-lg font-bold text-white">
              {courses.length > 0
                ? `${(courses.reduce((sum: number, c: any) => sum + (c.price || 0), 0) / courses.length).toFixed(0)} TND`
                : '—'}
            </p>
            <p className="text-xs text-muted">Avg Price</p>
          </div>
        </div>
      </div>

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
            <span
              className={`text-xs px-1.5 py-0.5 rounded-md font-bold ${
                tab === t.key ? 'bg-accent/20 text-accent' : 'bg-card-hover text-muted'
              }`}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {tab === 'all' && (
        <DataTable columns={allColumns} data={courses} searchKeys={['title', 'domain', 'level']} />
      )}
      {tab === 'pending' && (
        <DataTable
          columns={pendingColumns}
          data={pendingList}
          searchKeys={['title', 'domain']}
          emptyMessage="No courses pending approval"
        />
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
