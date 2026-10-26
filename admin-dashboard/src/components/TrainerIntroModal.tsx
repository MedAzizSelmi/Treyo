/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import { X, Megaphone, Trash2, Pin } from 'lucide-react';
import { getTrainerIntro, publishTrainerIntro, removeFeedPost, API_BASE_URL } from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';

const MIN = 20;
const MAX = 400;

const REASONS: Record<string, string> = {
  NOT_APPROVED: 'Only an approved, active trainer can be introduced.',
  NO_COURSE: 'This trainer has no published course yet. Introduce them once they have one, so learners have something to join.',
  ALREADY: 'This trainer is already introduced in the feed.',
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

  const load = async () => {
    try {
      const res = await getTrainerIntro(trainer.userId);
      setStatus(res.data);
      setIntro((cur) => cur || res.data?.defaultIntro || '');
    } catch (e) {
      setError(errText(e, 'Could not load the trainer'));
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
      onDone(`${trainer.name} is introduced in the feed — first for 3 days`);
    } catch (e) {
      setError(errText(e, 'Could not publish the introduction'));
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
      onDone(`${trainer.name}'s introduction was taken out of the feed`);
    } catch (e) {
      setError(errText(e, 'Could not remove it'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="relative w-full max-w-lg rounded-2xl bg-card border border-border overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <p className="text-white font-semibold flex items-center gap-2"><Megaphone className="w-4 h-4 text-accent" /> Introduce in the feed</p>
          <button onClick={onClose} className="p-1 text-muted hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {!status ? (
            <div className="py-8 flex justify-center">{error ? <p className="text-sm text-danger">{error}</p> : <LoadingSpinner />}</div>
          ) : status.post ? (
            <>
              <p className="text-sm text-foreground/85">
                {trainer.name} is introduced in the feed since {new Date(status.post.publishedAt).toLocaleDateString()}
                {status.post.pinnedUntil && new Date(status.post.pinnedUntil) > new Date()
                  ? `, first until ${new Date(status.post.pinnedUntil).toLocaleDateString()}`
                  : ''}. {status.post.likesCount} like{status.post.likesCount === 1 ? '' : 's'}.
              </p>
              <blockquote className="text-sm text-foreground/80 border-l-2 border-accent/50 pl-3 whitespace-pre-wrap">{status.post.body}</blockquote>
            </>
          ) : !status.canIntroduce ? (
            <p className="text-sm text-warning">{REASONS[status.reason] || status.reason}</p>
          ) : (
            <>
              <label className="block">
                <span className="text-xs text-muted">Introduction — learners see it in their language</span>
                <textarea
                  value={intro}
                  onChange={(e) => setIntro(e.target.value.slice(0, MAX))}
                  rows={4}
                  placeholder="e.g. Sami has taught Power BI to finance teams for eight years…"
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted focus:border-accent outline-none"
                />
                <span className={`text-xs ${length >= MIN ? 'text-muted' : 'text-warning'}`}>
                  {length}/{MAX} {length < MIN ? `— at least ${MIN}` : ''}
                </span>
              </label>

              {/* Preview of the card in the app */}
              <div>
                <p className="text-xs text-muted mb-2">Preview</p>
                <div className="rounded-xl border border-accent/40 bg-background/40 p-4">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-accent bg-accent/10 border border-accent/30 rounded-full px-2 py-0.5">
                    <Pin className="w-3 h-3" /> New trainer
                  </span>
                  <p className="text-white font-semibold mt-2">Meet {trainer.name}</p>
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
                      {status.publishedCourses} published course{status.publishedCourses === 1 ? '' : 's'} · See their profile →
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
          {error && status && <p className="text-sm text-danger">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-border text-muted hover:text-white">Close</button>
          {status?.post && (
            <button onClick={remove} disabled={busy}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-50">
              <Trash2 className="w-4 h-4" /> Remove from feed
            </button>
          )}
          {status?.canIntroduce && (
            <button onClick={publish} disabled={busy || length < MIN}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-black hover:opacity-90 disabled:opacity-50">
              {busy ? 'Publishing… (translating)' : 'Publish in the feed'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
