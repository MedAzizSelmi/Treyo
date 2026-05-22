/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

/**
 * Course Templates — the admin's authoring surface.
 *
 * Admin creates a template (the master content) and assigns it to a roster
 * of trainers. Each trainer gets their own Course "offering" linked back to
 * the template; editing the template cascades to every offering.
 *
 * Trainers no longer create courses on mobile — this page is now the only
 * way new courses come into existence.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getAllTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  assignTemplateTrainers,
  getAllTrainers,
  CourseTemplatePayload,
} from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import LoadingSpinner from '@/components/LoadingSpinner';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  Plus,
  FileText,
  Users,
  Pencil,
  Trash2,
  X,
  Check,
  Search,
  UserPlus,
} from 'lucide-react';

type AssignedTrainer = {
  trainerId: string;
  trainerName: string;
  courseId: string;
  isPublished: boolean;
  totalEnrolled: number;
  interestedCount: number;
};

type Template = {
  templateId: string;
  title: string;
  description: string;
  domain: string;
  specificTopic: string;
  level: string;
  durationHours?: number;
  language?: string;
  format?: string;
  prerequisites?: string;
  learningOutcomes?: string[];
  price?: number;
  currency?: string;
  hasCertificate?: boolean;
  minStudentsRequired?: number;
  maxStudentsPerGroup?: number;
  maxGroupsAllowed?: number;
  isActive?: boolean;
  createdAt?: string;
  assignedTrainers?: AssignedTrainer[];
  offeringCount?: number;
};

const EMPTY_FORM: CourseTemplatePayload = {
  title: '',
  description: '',
  domain: '',
  specificTopic: '',
  level: 'beginner',
  durationHours: 10,
  language: 'French',
  format: 'Online (Meet)',
  prerequisites: '',
  learningOutcomes: [],
  price: 0,
  minStudentsRequired: 5,
  maxStudentsPerGroup: 30,
  maxGroupsAllowed: 1,
  hasCertificate: false,
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [trainers, setTrainers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // form drawer for create / edit
  const [editing, setEditing] = useState<Template | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CourseTemplatePayload>(EMPTY_FORM);
  const [outcomesText, setOutcomesText] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // assignment drawer
  const [assignTarget, setAssignTarget] = useState<Template | null>(null);
  const [selectedTrainerIds, setSelectedTrainerIds] = useState<Set<string>>(new Set());
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState('');

  // delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [t, tr] = await Promise.all([getAllTemplates(), getAllTrainers()]);
      setTemplates(t.data || []);
      setTrainers(tr.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.title?.toLowerCase().includes(q) ||
        t.domain?.toLowerCase().includes(q) ||
        t.specificTopic?.toLowerCase().includes(q)
    );
  }, [templates, search]);

  // ── Form open / close ──────────────────────────────────────────────

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOutcomesText('');
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (t: Template) => {
    setEditing(t);
    setForm({
      title: t.title,
      description: t.description,
      domain: t.domain,
      specificTopic: t.specificTopic,
      level: t.level,
      durationHours: t.durationHours,
      language: t.language,
      format: t.format,
      prerequisites: t.prerequisites,
      learningOutcomes: t.learningOutcomes,
      price: t.price,
      minStudentsRequired: t.minStudentsRequired,
      maxStudentsPerGroup: t.maxStudentsPerGroup,
      maxGroupsAllowed: t.maxGroupsAllowed,
      hasCertificate: t.hasCertificate,
    });
    setOutcomesText((t.learningOutcomes || []).join('\n'));
    setFormError('');
    setShowForm(true);
  };

  const saveForm = async () => {
    // Client-side validation mirrors the backend @NotBlank / @Min constraints
    // so the user gets a fast failure with a specific field name instead of
    // a generic 400. Same checks as CourseTemplateRequest.java.
    const missing: string[] = [];
    if (!form.title?.trim()) missing.push('Title');
    if (!form.description?.trim()) missing.push('Description');
    if (!form.domain?.trim()) missing.push('Domain');
    if (!form.specificTopic?.trim()) missing.push('Specific Topic');
    if (!form.level?.trim()) missing.push('Level');
    if (!form.durationHours || form.durationHours < 1) missing.push('Duration (must be ≥ 1 hour)');
    if (form.minStudentsRequired != null && form.minStudentsRequired < 1) missing.push('Min Students (≥ 1)');
    if (form.maxStudentsPerGroup != null && form.maxStudentsPerGroup < 1) missing.push('Max per Group (≥ 1)');
    if (form.maxGroupsAllowed != null && form.maxGroupsAllowed < 1) missing.push('Max Groups (≥ 1)');
    if (missing.length > 0) {
      setFormError(`Please fix: ${missing.join(', ')}`);
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const outcomes = outcomesText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = { ...form, learningOutcomes: outcomes };
      if (editing) {
        await updateTemplate(editing.templateId, payload);
      } else {
        await createTemplate(payload);
      }
      setShowForm(false);
      await loadData();
    } catch (err: any) {
      // GlobalExceptionHandler returns validation errors as
      //   { status, timestamp, errors: { fieldName: "message", ... } }
      // and runtime errors as { status, message, timestamp }.
      // Extract whichever shape we got so the admin sees the real cause.
      const data = err?.response?.data;
      let msg = 'Failed to save template';
      if (data?.errors && typeof data.errors === 'object') {
        msg = Object.entries(data.errors as Record<string, string>)
          .map(([f, m]) => `${f}: ${m}`)
          .join('; ');
      } else if (data?.message) {
        msg = data.message;
      } else if (data?.error) {
        msg = data.error;
      } else if (err?.message) {
        msg = err.message;
      }
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Assignment ─────────────────────────────────────────────────────

  const openAssign = (t: Template) => {
    setAssignTarget(t);
    setSelectedTrainerIds(
      new Set((t.assignedTrainers || []).map((at) => at.trainerId))
    );
    setAssignError('');
  };

  const toggleTrainer = (trainerId: string) => {
    setSelectedTrainerIds((prev) => {
      const next = new Set(prev);
      if (next.has(trainerId)) next.delete(trainerId);
      else next.add(trainerId);
      return next;
    });
  };

  const saveAssignment = async () => {
    if (!assignTarget) return;
    if (selectedTrainerIds.size === 0) {
      setAssignError('Select at least one trainer (or use Delete to remove the template entirely).');
      return;
    }
    setAssignSaving(true);
    setAssignError('');
    try {
      await assignTemplateTrainers(
        assignTarget.templateId,
        Array.from(selectedTrainerIds)
      );
      setAssignTarget(null);
      await loadData();
    } catch (err: any) {
      const data = err?.response?.data;
      setAssignError(
        data?.message ||
          data?.error ||
          (data?.errors && Object.values(data.errors).join('; ')) ||
          'Failed to update assignments'
      );
    } finally {
      setAssignSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="Course Templates"
        subtitle="Master course content — assign one template to many trainers, each gets their own offering."
        action={
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-black font-semibold hover:bg-accent/90 transition"
          >
            <Plus className="w-4 h-4" />
            New Template
          </button>
        }
      />

      {/* Search */}
      <div className="relative mb-6 max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, domain, topic…"
          className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:border-accent transition"
        />
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <FileText className="w-12 h-12 text-muted mx-auto mb-3" />
          <p className="text-foreground font-medium mb-1">No templates yet</p>
          <p className="text-sm text-muted mb-4">Create your first course template to get started.</p>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-black font-semibold hover:bg-accent/90 transition"
          >
            <Plus className="w-4 h-4" />
            New Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <TemplateCard
              key={t.templateId}
              template={t}
              onEdit={() => openEdit(t)}
              onAssign={() => openAssign(t)}
              onDelete={() => setDeleteTarget(t)}
            />
          ))}
        </div>
      )}

      {/* Form Drawer */}
      {showForm && (
        <Drawer onClose={() => setShowForm(false)} title={editing ? 'Edit Template' : 'New Template'}>
          <TemplateForm
            form={form}
            setForm={setForm}
            outcomesText={outcomesText}
            setOutcomesText={setOutcomesText}
            saving={saving}
            error={formError}
            onCancel={() => setShowForm(false)}
            onSave={saveForm}
            isEditing={!!editing}
          />
        </Drawer>
      )}

      {/* Assignment Drawer */}
      {assignTarget && (
        <Drawer
          onClose={() => setAssignTarget(null)}
          title={`Assign Trainers — ${assignTarget.title}`}
        >
          <AssignTrainersPanel
            trainers={trainers}
            selected={selectedTrainerIds}
            onToggle={toggleTrainer}
            existing={assignTarget.assignedTrainers || []}
            saving={assignSaving}
            error={assignError}
            onCancel={() => setAssignTarget(null)}
            onSave={saveAssignment}
          />
        </Drawer>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Template"
        message={`Delete "${deleteTarget?.title}"? This will deactivate the template and hide all ${deleteTarget?.offeringCount ?? 0} trainer offering(s).`}
        variant="danger"
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteTemplate(deleteTarget.templateId);
            await loadData();
          }
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ─── Template Card ──────────────────────────────────────────────────

function TemplateCard({
  template,
  onEdit,
  onAssign,
  onDelete,
}: {
  template: Template;
  onEdit: () => void;
  onAssign: () => void;
  onDelete: () => void;
}) {
  const assigned = template.assignedTrainers || [];
  const totalEnrolled = assigned.reduce((s, a) => s + (a.totalEnrolled || 0), 0);
  const totalInterested = assigned.reduce((s, a) => s + (a.interestedCount || 0), 0);

  return (
    <div className="bg-card border border-border rounded-2xl p-5 hover:border-accent/40 transition">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-11 h-11 rounded-xl bg-accent/12 flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white truncate">{template.title}</h3>
          <p className="text-xs text-muted truncate">
            {template.domain} · {template.specificTopic}
          </p>
        </div>
        {!template.isActive && <Badge variant="danger">Deleted</Badge>}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Badge variant={template.level === 'beginner' ? 'success' : template.level === 'expert' ? 'danger' : 'warning'}>
          {template.level || '—'}
        </Badge>
        <Badge variant="info">{template.durationHours || 0}h</Badge>
        <Badge variant="muted">
          {template.price ? `${template.price} ${template.currency || 'TND'}` : 'Free'}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat label="Trainers" value={assigned.length} />
        <Stat label="Interested" value={totalInterested} />
        <Stat label="Enrolled" value={totalEnrolled} />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onAssign}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-accent/12 text-accent hover:bg-accent/20 text-xs font-semibold transition"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Assign ({assigned.length})
        </button>
        <button
          onClick={onEdit}
          className="p-2 rounded-xl bg-card-hover text-muted hover:text-foreground transition"
          title="Edit content"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-xl bg-danger/10 text-danger hover:bg-danger/20 transition"
          title="Delete template"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card-hover rounded-xl p-2 text-center">
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted uppercase tracking-wider">{label}</p>
    </div>
  );
}

// ─── Drawer wrapper ─────────────────────────────────────────────────

function Drawer({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="w-full max-w-2xl h-full bg-card border-l border-border overflow-y-auto">
        <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-5 border-b border-border bg-card">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-card-hover transition">
            <X className="w-5 h-5" />
          </button>
        </header>
        <div className="p-6">{children}</div>
      </aside>
    </div>
  );
}

// ─── Template Form ──────────────────────────────────────────────────

function TemplateForm({
  form,
  setForm,
  outcomesText,
  setOutcomesText,
  saving,
  error,
  onCancel,
  onSave,
  isEditing,
}: {
  form: CourseTemplatePayload;
  setForm: React.Dispatch<React.SetStateAction<CourseTemplatePayload>>;
  outcomesText: string;
  setOutcomesText: (s: string) => void;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSave: () => void;
  isEditing: boolean;
}) {
  const set = <K extends keyof CourseTemplatePayload>(k: K, v: CourseTemplatePayload[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-5">
      {isEditing && (
        <div className="rounded-xl bg-warning/10 border border-warning/30 px-4 py-3 text-xs text-warning">
          Editing this template will update content (title, price, etc.) on every trainer offering linked to it.
        </div>
      )}

      <Field label="Title">
        <input
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          className="w-full px-3 py-2.5 bg-card-hover border border-border rounded-xl text-foreground"
          placeholder="Master Node.js for Backend Development"
        />
      </Field>

      <Field label="Description">
        <textarea
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          rows={4}
          className="w-full px-3 py-2.5 bg-card-hover border border-border rounded-xl text-foreground resize-none"
          placeholder="What students will learn, who it's for, etc."
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Domain">
          <input
            value={form.domain}
            onChange={(e) => set('domain', e.target.value)}
            className="w-full px-3 py-2.5 bg-card-hover border border-border rounded-xl text-foreground"
            placeholder="informatique"
          />
        </Field>
        <Field label="Specific Topic">
          <input
            value={form.specificTopic}
            onChange={(e) => set('specificTopic', e.target.value)}
            className="w-full px-3 py-2.5 bg-card-hover border border-border rounded-xl text-foreground"
            placeholder="Node.js"
          />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Level">
          <select
            value={form.level}
            onChange={(e) => set('level', e.target.value)}
            className="w-full px-3 py-2.5 bg-card-hover border border-border rounded-xl text-foreground"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="expert">Expert</option>
          </select>
        </Field>
        <Field label="Duration (hrs)">
          <input
            type="number"
            value={form.durationHours ?? ''}
            onChange={(e) => set('durationHours', parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2.5 bg-card-hover border border-border rounded-xl text-foreground"
          />
        </Field>
        <Field label="Language">
          <input
            value={form.language ?? ''}
            onChange={(e) => set('language', e.target.value)}
            className="w-full px-3 py-2.5 bg-card-hover border border-border rounded-xl text-foreground"
          />
        </Field>
      </div>

      <Field label="Format">
        <select
          value={form.format ?? ''}
          onChange={(e) => set('format', e.target.value)}
          className="w-full px-3 py-2.5 bg-card-hover border border-border rounded-xl text-foreground"
        >
          <option value="Face-to-face">Face-to-face</option>
          <option value="Online (Meet)">Online (Meet)</option>
          <option value="Hybrid">Hybrid</option>
        </select>
      </Field>

      <Field label="Prerequisites">
        <textarea
          value={form.prerequisites ?? ''}
          onChange={(e) => set('prerequisites', e.target.value)}
          rows={2}
          className="w-full px-3 py-2.5 bg-card-hover border border-border rounded-xl text-foreground resize-none"
        />
      </Field>

      <Field label="Learning Outcomes (one per line)">
        <textarea
          value={outcomesText}
          onChange={(e) => setOutcomesText(e.target.value)}
          rows={4}
          className="w-full px-3 py-2.5 bg-card-hover border border-border rounded-xl text-foreground resize-none"
          placeholder="Build a REST API&#10;Deploy to production&#10;…"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Price (TND)">
          <input
            type="number"
            value={form.price ?? 0}
            onChange={(e) => set('price', parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2.5 bg-card-hover border border-border rounded-xl text-foreground"
          />
        </Field>
        <Field label="Certificate?">
          <select
            value={form.hasCertificate ? 'yes' : 'no'}
            onChange={(e) => set('hasCertificate', e.target.value === 'yes')}
            className="w-full px-3 py-2.5 bg-card-hover border border-border rounded-xl text-foreground"
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Min Students">
          <input
            type="number"
            value={form.minStudentsRequired ?? 5}
            onChange={(e) => set('minStudentsRequired', parseInt(e.target.value) || 5)}
            className="w-full px-3 py-2.5 bg-card-hover border border-border rounded-xl text-foreground"
          />
        </Field>
        <Field label="Max per Group">
          <input
            type="number"
            value={form.maxStudentsPerGroup ?? 30}
            onChange={(e) => set('maxStudentsPerGroup', parseInt(e.target.value) || 30)}
            className="w-full px-3 py-2.5 bg-card-hover border border-border rounded-xl text-foreground"
          />
        </Field>
        <Field label="Max Groups">
          <input
            type="number"
            value={form.maxGroupsAllowed ?? 1}
            onChange={(e) => set('maxGroupsAllowed', parseInt(e.target.value) || 1)}
            className="w-full px-3 py-2.5 bg-card-hover border border-border rounded-xl text-foreground"
          />
        </Field>
      </div>

      {error && (
        <div className="rounded-xl bg-danger/10 border border-danger/30 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 sticky bottom-0 bg-card pb-2">
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex-1 px-4 py-2.5 rounded-xl bg-card-hover text-foreground font-medium hover:bg-card-hover/70 transition"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 px-4 py-2.5 rounded-xl bg-accent text-black font-semibold hover:bg-accent/90 transition disabled:opacity-60"
        >
          {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Template'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

// ─── Assignment Panel ──────────────────────────────────────────────

function AssignTrainersPanel({
  trainers,
  selected,
  onToggle,
  existing,
  saving,
  error,
  onCancel,
  onSave,
}: {
  trainers: any[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  existing: AssignedTrainer[];
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [q, setQ] = useState('');
  const existingById = useMemo(() => {
    const map = new Map<string, AssignedTrainer>();
    for (const a of existing) map.set(a.trainerId, a);
    return map;
  }, [existing]);

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return trainers;
    return trainers.filter(
      (tr) =>
        (tr.name || '').toLowerCase().includes(t) ||
        (tr.email || '').toLowerCase().includes(t)
    );
  }, [q, trainers]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Each selected trainer will get their own offering of this course. Students will
        see one course card per trainer and choose who they want to learn from.
      </p>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search trainers by name or email…"
          className="w-full pl-10 pr-4 py-2.5 bg-card-hover border border-border rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:border-accent transition"
        />
      </div>

      <div className="space-y-2 max-h-[55vh] overflow-y-auto">
        {visible.map((tr) => {
          const id = tr.userId || tr.trainerId;
          const isSelected = selected.has(id);
          const offering = existingById.get(id);
          return (
            <button
              key={id}
              onClick={() => onToggle(id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition text-left ${
                isSelected
                  ? 'bg-accent/12 border-accent/40'
                  : 'bg-card-hover border-border hover:border-border/80'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition ${
                  isSelected ? 'bg-accent text-black' : 'bg-card border border-border'
                }`}
              >
                {isSelected && <Check className="w-3.5 h-3.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{tr.name || tr.email}</p>
                <p className="text-xs text-muted truncate">{tr.email}</p>
              </div>
              {offering && (
                <div className="text-right">
                  <p className="text-[10px] text-muted">
                    <Users className="w-2.5 h-2.5 inline mr-0.5" />
                    {offering.totalEnrolled} · {offering.interestedCount} interested
                  </p>
                </div>
              )}
            </button>
          );
        })}
        {visible.length === 0 && (
          <p className="text-center text-sm text-muted py-8">No trainers match.</p>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-danger/10 border border-danger/30 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 sticky bottom-0 bg-card pt-2 pb-2 border-t border-border">
        <p className="text-xs text-muted mr-auto">
          {selected.size} trainer{selected.size === 1 ? '' : 's'} selected
        </p>
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2.5 rounded-xl bg-card-hover text-foreground font-medium hover:bg-card-hover/70 transition"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-accent text-black font-semibold hover:bg-accent/90 transition disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save Assignments'}
        </button>
      </div>
    </div>
  );
}
