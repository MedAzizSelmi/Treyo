/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSkills, createSkill, updateSkill, deleteSkill } from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import Badge from '@/components/Badge';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useI18n } from '@/i18n/I18nProvider';
import { Plus, Search, Pencil, Eye, EyeOff, Trash2, X, Sparkles } from 'lucide-react';

type Toast = { kind: 'success' | 'error'; text: string } | null;
type Draft = { skillId?: string; field: string; name: string; nameFr: string; nameAr: string; nameEs: string; learners?: number };

const EMPTY: Draft = { field: '', name: '', nameFr: '', nameAr: '', nameEs: '' };

const errText = (e: any, fallback: string) =>
  e?.response?.data?.message || e?.response?.data?.error || e?.message || fallback;

/**
 * The skills learners choose to develop at onboarding, under each field
 * (backend SkillOptionService). This list used to be written into the app,
 * so nothing could be added without a new release.
 *
 * The English name is what learners' profiles store and what the
 * recommendation engine reads; the French, Arabic and Spanish names are how
 * the app shows it, falling back to the English one. A skill learners chose
 * cannot be deleted, only hidden from new learners, so their profiles keep it.
 */
export default function SkillsPage() {
  const { t } = useI18n();
  const [fields, setFields] = useState<{ key: string; label: string }[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [field, setField] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [confirm, setConfirm] = useState<{ open: boolean; title: string; message: string; action: () => Promise<void> }>(
    { open: false, title: '', message: '', action: async () => {} });

  const showToast = (t: Toast) => {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSkills();
      setFields(res.data?.fields || []);
      setSkills(res.data?.skills || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // The field keys are fixed (SkillOptionService.FIELDS); the server's English name is the fallback.
  const label = (key: string) => t(`skills.field_${key}`, { defaultValue: fields.find((f) => f.key === key)?.label || key });
  const q = search.trim().toLowerCase();
  const visible = skills.filter((s) =>
    (field === 'all' || s.field === field) &&
    (!q || [s.name, s.nameFr, s.nameAr, s.nameEs].some((v: string) => (v || '').toLowerCase().includes(q))));
  const groups = fields
    .filter((f) => field === 'all' || f.key === field)
    .map((f) => ({ ...f, skills: visible.filter((s) => s.field === f.key) }))
    .filter((g) => g.skills.length > 0 || !q);

  const save = async () => {
    if (!draft) return;
    if (!draft.field) { showToast({ kind: 'error', text: t('skills.chooseField') }); return; }
    if (!draft.name.trim()) { showToast({ kind: 'error', text: t('skills.needName') }); return; }
    const body = { field: draft.field, name: draft.name, nameFr: draft.nameFr, nameAr: draft.nameAr, nameEs: draft.nameEs };
    setSaving(true);
    try {
      if (draft.skillId) await updateSkill(draft.skillId, body);
      else await createSkill(body);
      showToast({ kind: 'success', text: draft.skillId ? t('skills.updated') : t('skills.added', { name: draft.name.trim() }) });
      setDraft(null);
      await load();
    } catch (e) {
      showToast({ kind: 'error', text: errText(e, t('skills.saveFailed')) });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (s: any) => {
    try {
      await updateSkill(s.skillId, { isActive: !s.isActive });
      showToast({ kind: 'success', text: s.isActive ? t('skills.hiddenToast', { name: s.name }) : t('skills.offeredToast', { name: s.name }) });
      await load();
    } catch (e) {
      showToast({ kind: 'error', text: errText(e, t('skills.changeFailed')) });
    }
  };

  const askDelete = (s: any) => setConfirm({
    open: true,
    title: t('skills.deleteTitle'),
    message: t('skills.deleteBody', { name: s.name, field: label(s.field) }),
    action: async () => {
      try {
        await deleteSkill(s.skillId);
        showToast({ kind: 'success', text: t('skills.deleted') });
        await load();
      } catch (e) {
        showToast({ kind: 'error', text: errText(e, t('skills.deleteFailed')) });
      }
    },
  });

  const renamed = draft?.skillId && (draft.learners || 0) > 0
    && skills.find((s) => s.skillId === draft.skillId)?.name !== draft.name.trim();

  return (
    <div>
      <PageHeader
        title={t('skills.title')}
        subtitle={t('skills.subtitle')}
        action={
          <button
            onClick={() => setDraft({ ...EMPTY, field: field === 'all' ? '' : field })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-black hover:opacity-90 transition"
          >
            <Plus className="w-4 h-4" /> {t('skills.add')}
          </button>
        }
      />

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {[{ key: 'all', label: t('skills.allFields') }, ...fields].map((f) => (
          <button
            key={f.key}
            onClick={() => setField(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              field === f.key ? 'bg-accent/15 text-accent border-accent/40' : 'border-border text-muted hover:text-white'
            }`}
          >
            {f.key === 'all' ? f.label : label(f.key)}
            <span className="ms-1.5 opacity-70">
              {f.key === 'all' ? skills.length : skills.filter((s) => s.field === f.key).length}
            </span>
          </button>
        ))}
      </div>

      <div className="relative max-w-sm mb-5">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          type="text"
          placeholder={t('skills.searchPh')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full ps-10 pe-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm placeholder:text-muted focus:border-accent outline-none"
        />
      </div>

      {loading ? (
        <div className="p-12 flex items-center justify-center"><LoadingSpinner /></div>
      ) : skills.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <Sparkles className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-white font-medium">{t('skills.empty')}</p>
          <p className="text-xs text-muted mt-1">{t('skills.emptyBody')}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.key} className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <div>
                  <p className="text-white font-semibold">{label(g.key)}</p>
                  {g.key === 'general' && (
                    <p className="text-xs text-muted">{t('skills.generalHint')}</p>
                  )}
                </div>
                <button
                  onClick={() => setDraft({ ...EMPTY, field: g.key })}
                  className="text-xs text-accent hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> {t('skills.addTo', { field: label(g.key) })}
                </button>
              </div>
              {g.skills.length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted">
                  {g.key === 'general'
                    ? t('skills.noGeneral')
                    : t('skills.noneInField')}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {g.skills.map((s: any) => (
                    <li key={s.skillId} className={`px-5 py-3 flex items-center gap-4 ${s.isActive ? '' : 'opacity-55'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-white text-sm font-medium">{s.name}</p>
                          {!s.isActive && <Badge variant="muted">{t('skills.hidden')}</Badge>}
                        </div>
                        <p className="text-xs text-muted truncate">
                          {[s.nameFr && `FR ${s.nameFr}`, s.nameAr && `AR ${s.nameAr}`, s.nameEs && `ES ${s.nameEs}`]
                            .filter(Boolean).join(' · ') || t('skills.sameName')}
                        </p>
                      </div>
                      <span className="text-xs text-muted w-24 text-end">
                        {s.field === 'general' ? '' : t('skills.learners', { count: s.learners })}
                      </span>
                      <button
                        onClick={() => setDraft({ skillId: s.skillId, field: s.field, name: s.name, nameFr: s.nameFr || '', nameAr: s.nameAr || '', nameEs: s.nameEs || '', learners: s.learners })}
                        className="p-2 rounded-lg border border-border text-muted hover:text-white transition" title={t('skills.edit')}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggle(s)}
                        className="p-2 rounded-lg border border-border text-muted hover:text-white transition"
                        title={s.isActive ? t('skills.hideHint') : t('skills.offerAgain')}
                      >
                        {s.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => askDelete(s)}
                        disabled={s.learners > 0}
                        className="p-2 rounded-lg border border-border text-muted hover:text-danger hover:border-danger/40 transition disabled:opacity-30 disabled:hover:text-muted disabled:hover:border-border"
                        title={s.learners > 0 ? t('skills.inUseHint') : t('skills.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add / edit */}
      {draft && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setDraft(null)} />
          <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <p className="text-white font-semibold">{draft.skillId ? t('skills.editTitle') : t('skills.add')}</p>
              <button onClick={() => setDraft(null)} className="p-1 text-muted hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <label className="block">
                <span className="text-xs text-muted">{t('skills.field')}</span>
                <select
                  value={draft.field}
                  onChange={(e) => setDraft({ ...draft, field: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm focus:border-accent outline-none"
                >
                  <option value="">{t('skills.chooseFieldPh')}</option>
                  {fields.map((f) => <option key={f.key} value={f.key}>{label(f.key)}</option>)}
                </select>
              </label>
              <TextField label={t('skills.nameLabel')} value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} placeholder={t('skills.namePh')} />
              {renamed && (
                <p className="text-xs text-warning">
                  {t('skills.renameWarning', { count: draft.learners })}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <TextField label={t('skills.french')} value={draft.nameFr} onChange={(v) => setDraft({ ...draft, nameFr: v })} />
                <TextField label={t('skills.arabic')} value={draft.nameAr} onChange={(v) => setDraft({ ...draft, nameAr: v })} dir="rtl" />
                <TextField label={t('skills.spanish')} value={draft.nameEs} onChange={(v) => setDraft({ ...draft, nameEs: v })} />
              </div>
              <p className="text-xs text-muted">{t('skills.translationHint')}</p>
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setDraft(null)} className="px-4 py-2 rounded-lg text-sm border border-border text-muted hover:text-white">{t('common.cancel')}</button>
              <button onClick={save} disabled={saving}
                      className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-black hover:opacity-90 disabled:opacity-50">
                {saving ? t('common.saving') : draft.skillId ? t('common.save') : t('skills.addShort')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        confirmLabel={t('skills.delete')}
        variant="danger"
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

function TextField({ label, value, onChange, placeholder, dir }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; dir?: 'rtl' | 'ltr';
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        dir={dir}
        maxLength={100}
        className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted focus:border-accent outline-none"
      />
    </label>
  );
}
