/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import { X, Megaphone, Trash2, Pin } from 'lucide-react';
import { getTrainerIntro, publishTrainerIntro, removeFeedPost, API_BASE_URL } from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useI18n } from '@/i18n/I18nProvider';

const MIN = 20;
const MAX = 400;

/** Why a trainer cannot be introduced, by the server's code. */
const REASONS: Record<string, string> = {
  NOT_APPROVED: 'intro.reasonNotApproved',
  NO_COURSE: 'intro.reasonNoCourse',
  ALREADY: 'intro.reasonAlready',
};

const errText = (e: any, fallback: string) =>
  e?.response?.data?.message || e?.response?.data?.error || e?.message || fallback;

/**
 * Introducing a new trainer in the learners' feed (backend
 * TrainerIntroService) — instead of a notification to everyone. The post
 * stays first for three days, is translated into the app's languages, and
 * opens the trainer's profile. No push.
 */
export default function TrainerIntroModal({ trainer, onClose, onDone }: {
  trainer: any; onClose: () => void; onDone: (text: string) => void;
}) {
  const [status, setStatus] = useState<any | null>(null);
  const [intro, setIntro] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { t, locale } = useI18n();
  const day = (d: string) => new Date(d).toLocaleDateString(locale);

  const load = async () => {
    try {
      const res = await getTrainerIntro(trainer.userId);
      setStatus(res.data);
      setIntro((cur) => cur || res.data?.defaultIntro || '');
    } catch (e) {
      setError(errText(e, t('intro.loadFailed')));
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const length = intro.trim().length;
  const photo = trainer.profilePictureUrl
    ? (String(trainer.profilePictureUrl).startsWith('http') ? trainer.profilePictureUrl : `${API_BASE_URL}${trainer.profilePictureUrl}`)
    : null;

  const publish = async () => {
    setBusy(true);
    setError('');
    try {
      await publishTrainerIntro(trainer.userId, intro.trim());
      onDone(t('intro.published', { name: trainer.name }));
    } catch (e) {
      setError(errText(e, t('intro.publishFailed')));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!status?.post) return;
    setBusy(true);
    setError('');
    try {
      await removeFeedPost(status.post.postId);
      onDone(t('intro.removed', { name: trainer.name }));
    } catch (e) {
      setError(errText(e, t('intro.removeFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="relative w-full max-w-lg rounded-2xl bg-card border border-border overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <p className="text-white font-semibold flex items-center gap-2"><Megaphone className="w-4 h-4 text-accent" /> {t('intro.title')}</p>
          <button onClick={onClose} className="p-1 text-muted hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {!status ? (
            <div className="py-8 flex justify-center">{error ? <p className="text-sm text-danger">{error}</p> : <LoadingSpinner />}</div>
          ) : status.post ? (
            <>
              <p className="text-sm text-foreground/85">
                {t('intro.upSince', { name: trainer.name, date: day(status.post.publishedAt) })}
                {status.post.pinnedUntil && new Date(status.post.pinnedUntil) > new Date()
                  ? ' ' + t('intro.firstUntil', { date: day(status.post.pinnedUntil) })
                  : ''}{' '}{t('intro.likes', { count: status.post.likesCount })}
              </p>
              <blockquote className="text-sm text-foreground/80 border-s-2 border-accent/50 ps-3 whitespace-pre-wrap">{status.post.body}</blockquote>
            </>
          ) : !status.canIntroduce ? (
            <p className="text-sm text-warning">{REASONS[status.reason] ? t(REASONS[status.reason]) : status.reason}</p>
          ) : (
            <>
              <label className="block">
                <span className="text-xs text-muted">{t('intro.label')}</span>
                <textarea
                  value={intro}
                  onChange={(e) => setIntro(e.target.value.slice(0, MAX))}
                  rows={4}
                  placeholder={t('intro.placeholder')}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted focus:border-accent outline-none"
                />
                <span className={`text-xs ${length >= MIN ? 'text-muted' : 'text-warning'}`}>
                  {length}/{MAX} {length < MIN ? t('intro.atLeast', { min: MIN }) : ''}
                </span>
              </label>

              {/* Preview of the card in the app */}
              <div>
                <p className="text-xs text-muted mb-2">{t('intro.preview')}</p>
                <div className="rounded-xl border border-accent/40 bg-background/40 p-4">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-accent bg-accent/10 border border-accent/30 rounded-full px-2 py-0.5">
                    <Pin className="w-3 h-3" /> {t('intro.newTrainer')}
                  </span>
                  <p className="text-white font-semibold mt-2">{t('intro.meet', { name: trainer.name })}</p>
                  <p className="text-sm text-foreground/80 mt-1 whitespace-pre-wrap">{intro.trim() || '…'}</p>
                  <div className="flex items-center gap-3 mt-3 rounded-lg border border-accent/25 bg-accent/5 p-3">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold">
                        {(trainer.name || 'T').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="text-xs text-muted">
                      <p className="text-white text-sm font-medium">{trainer.name}</p>
                      {t('intro.courses', { count: status.publishedCourses })} · {t('intro.seeProfile')}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
          {error && status && <p className="text-sm text-danger">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-border text-muted hover:text-white">{t('common.close')}</button>
          {status?.post && (
            <button onClick={remove} disabled={busy}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-50">
              <Trash2 className="w-4 h-4" /> {t('intro.remove')}
            </button>
          )}
          {status?.canIntroduce && (
            <button onClick={publish} disabled={busy || length < MIN}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-black hover:opacity-90 disabled:opacity-50">
              {busy ? t('intro.publishing') : t('intro.publish')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
