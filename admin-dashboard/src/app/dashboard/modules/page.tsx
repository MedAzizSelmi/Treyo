/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { listAdminModules, createModule, updateModule, archiveModule } from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Plus, Pencil, Archive, RotateCcw, FolderTree, X } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';

/**
 * Domains admin — the categories trainers pick from when creating a
 * course. Called "modules" in the code, the API (/api/modules) and the
 * database; "Domain" is the word users see, chosen at the October 2026
 * review. The chosen name also becomes the course's `domain`.
 * Sits above Courses in the sidebar because it's the source
 * of truth for how courses get grouped.
 *
 * Actions: create, edit inline via modal, archive (soft-delete),
 * unarchive. Deleting hard would orphan courses so we don't offer it.
 */
export default function ModulesPage() {
  const { t } = useI18n();
  const [modules, setModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAdminModules();
      setModules(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error('Failed to load modules', e);
      setModules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleArchive = async (moduleId: string) => {
    try { await archiveModule(moduleId); await load(); }
    catch (e) { console.error(e); }
  };

  const handleUnarchive = async (m: any) => {
    try { await updateModule(m.moduleId, { isActive: true }); await load(); }
    catch (e) { console.error(e); }
  };

  return (
    <div>
      <PageHeader
        title={t('domains.title')}
        subtitle={t('domains.subtitle')}
      />

      <div className="mb-4">
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-black font-semibold text-sm hover:bg-accent/90 transition"
        >
          <Plus className="w-4 h-4" /> {t('domains.new')}
        </button>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : modules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <FolderTree className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-sm text-foreground font-semibold mb-1">{t('domains.empty')}</p>
          <p className="text-xs text-muted">{t('domains.emptyBody')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {modules.map(m => (
            <div
              key={m.moduleId}
              className={`rounded-xl border p-4 transition ${
                m.isActive ? 'border-border bg-card' : 'border-warning/20 bg-warning/[0.03] opacity-70'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">{m.name}</h3>
                  {m.description && (
                    <p className="text-xs text-muted mt-1 line-clamp-2">{m.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted">
                    <span>{t('domains.courses', { count: m.courseCount ?? 0 })}</span>
                    {!m.isActive && <span className="text-warning font-semibold">{t('domains.archived')}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditing(m)}
                    className="p-2 rounded-lg hover:bg-card-hover text-muted"
                    title={t('domains.edit')}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {m.isActive ? (
                    <button
                      onClick={() => handleArchive(m.moduleId)}
                      className="p-2 rounded-lg hover:bg-warning/10 text-muted hover:text-warning"
                      title={t('domains.archive')}
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUnarchive(m)}
                      className="p-2 rounded-lg hover:bg-success/10 text-muted hover:text-success"
                      title={t('domains.unarchive')}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(editing || creating) && (
        <ModuleFormModal
          module={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={async () => {
            setEditing(null); setCreating(false); await load();
          }}
        />
      )}
    </div>
  );
}

function ModuleFormModal({
  module: mod, onClose, onSaved,
}: { module: any | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(mod?.name || '');
  const [description, setDescription] = useState(mod?.description || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { t } = useI18n();

  const handleSave = async () => {
    if (!name.trim()) { setError(t('domains.nameRequired')); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
      };
      if (mod) await updateModule(mod.moduleId, payload);
      else await createModule(payload);
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.error || t('domains.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-md rounded-2xl bg-card border border-border p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 end-4 w-9 h-9 rounded-lg bg-card-hover hover:bg-border flex items-center justify-center"
        >
          <X className="w-4 h-4 text-muted" />
        </button>

        <h2 className="text-xl font-bold text-white mb-4">
          {mod ? t('domains.editTitle') : t('domains.new')}
        </h2>

        <div className="space-y-3">
          <Field label={t('domains.name')} value={name} onChange={setName} placeholder={t('domains.namePh')} />
          <Field label={t('domains.description')} value={description} onChange={setDescription} multi placeholder={t('domains.descriptionPh')} />
        </div>

        {error && <p className="text-xs text-danger mt-3">{error}</p>}

        <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-muted hover:text-foreground"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-black hover:bg-accent/90 transition disabled:opacity-60"
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, multi,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multi?: boolean }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-muted font-semibold mb-1">{label}</label>
      {multi ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full min-h-[70px] rounded-lg bg-card-hover border border-border p-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent outline-none"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg bg-card-hover border border-border p-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent outline-none"
        />
      )}
    </div>
  );
}
