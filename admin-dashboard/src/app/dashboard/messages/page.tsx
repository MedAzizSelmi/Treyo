/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Users, MessageSquare, ChevronLeft, ImageIcon, Loader2, Lock, Search, X } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useI18n } from '@/i18n/I18nProvider';
import { connectRealtime, onRealtime, isRealtimeConnected, publishTyping } from '@/lib/realtime';
import {
  getAdminConversations,
  getGroupMessages,
  sendGroupMessage,
  uploadMessageAttachment,
  getAdminUser,
  API_BASE_URL,
} from '@/lib/api';

/*
 * Admin Messages page.
 *
 * Same backend endpoints as the mobile clients — admins are full
 * members of every group conversation, so getAdminConversations()
 * returns the complete list. Tapping a conversation row loads its
 * messages and lets the admin reply. Replies go through the regular
 * group send endpoint (the admin's userId is the sender).
 *
 * Layout: master / detail split. List of conversations on the left,
 * selected conversation on the right. On narrow screens the right
 * pane takes over the screen and the list is dismissed.
 */

// Fallbacks only. Messages arrive over STOMP now and these are skipped
// entirely while the socket is up — they cover a dropped connection,
// where a moderation screen that silently stops updating is worse than
// one a beat behind.
const POLL_MS = 15000;
const CONV_POLL_MS = 30000;

/** Lower case without accents, so "medecine" finds "Médecine". */
function fold(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export default function AdminMessagesPage() {
  const { t, locale } = useI18n();
  const [adminId, setAdminId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  // Finds a group by its name, its course or its trainer.
  const [search, setSearch] = useState('');
  const [convLoading, setConvLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [typingName, setTypingName] = useState('');

  // The socket handlers are registered once; these let them read the
  // current selection and loader without tearing the subscription down
  // and rebuilding it every time an admin clicks a different group.
  const selectedRef = useRef<any | null>(null);
  const loadMessagesRef = useRef<(() => void) | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When this admin last announced typing; one frame every few seconds,
  // not one per keystroke, each of which fans out to every member.
  const lastTypingSent = useRef(0);

  // ── Resolve "who is logged in" once on mount ─────────────────────
  useEffect(() => {
    const u = getAdminUser();
    if (u?.userId) setAdminId(u.userId);
  }, []);

  // ── Conversation list ────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!adminId) return;
    try {
      const res = await getAdminConversations(adminId);
      // Backend returns DMs + groups merged; we only show groups here
      // because admins shouldn't be participating in 1-to-1s (and
      // mostly wouldn't have any).
      const onlyGroups = (res.data || []).filter((c: any) => c.isGroup);
      setConversations(onlyGroups);
    } catch (err) {
      console.error('Failed to load conversations', err);
    } finally {
      setConvLoading(false);
    }
  }, [adminId]);

  useEffect(() => {
    if (!adminId) return;
    loadConversations();
    const id = setInterval(() => {
      if (isRealtimeConnected()) return;
      loadConversations();
    }, CONV_POLL_MS);
    return () => clearInterval(id);
  }, [adminId, loadConversations]);

  // Live group messages. The backend fans every one out to each
  // member's own destination and counts administrators as members, so
  // these frames were already arriving — nothing was listening.
  useEffect(() => {
    if (!adminId) return;
    connectRealtime();
    const off = onRealtime('group-messages', (msg: any) => {
      // The list always moves: a message in any group changes its
      // preview and its ordering.
      loadConversations();
      if (selectedRef.current?.groupId && msg?.groupId === selectedRef.current.groupId) {
        // Their message has landed, so they have stopped typing it.
        setTypingName('');
        if (typingTimer.current) clearTimeout(typingTimer.current);
        loadMessagesRef.current?.();
      }
    });
    return off;
  }, [adminId, loadConversations]);

  // Someone in the open group is typing.
  useEffect(() => {
    if (!adminId) return;
    const off = onRealtime('typing', (payload: any) => {
      if (!payload?.senderId) return;
      if (payload.groupId !== selectedRef.current?.groupId) return;
      const name = String(payload.senderName || '').trim();
      setTypingName(name);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      // No "stopped typing" frame exists by design, so it expires here.
      typingTimer.current = setTimeout(() => setTypingName(''), 4000);
    });
    return () => {
      off();
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [adminId]);

  // ── Selected conversation: load + poll ──────────────────────────
  const loadMessages = useCallback(async () => {
    if (!selected?.groupId || !adminId) return;
    try {
      const res = await getGroupMessages(selected.groupId, adminId);
      setMessages(res.data || []);
    } catch (err) {
      console.error('Failed to load messages', err);
    }
  }, [selected, adminId]);

  selectedRef.current = selected;
  loadMessagesRef.current = loadMessages;

  // First load = show spinner; subsequent polls = silent refresh.
  useEffect(() => {
    if (!selected) return;
    setChatLoading(true);
    loadMessages().finally(() => setChatLoading(false));
    const id = setInterval(() => {
      if (isRealtimeConnected()) return;
      loadMessages();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [selected, loadMessages]);

  // Image-upload state. Decoupled from `sending` so the file picker
  // can show its own spinner while the textarea + send button stay
  // enabled for parallel text messages (rare but allowed).
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Send (text) ─────────────────────────────────────────────────
  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !selected?.groupId || !adminId || sending) return;
    setSending(true);
    // Optimistic append so the message appears instantly. The next
    // poll reconciles against the server-saved row.
    const optimistic = {
      messageId: `tmp_${Date.now()}`,
      senderId: adminId,
      senderName: t('messages.you'),
      content: text,
      sentAt: new Date().toISOString(),
      _pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft('');
    try {
      await sendGroupMessage(selected.groupId, adminId, text);
      await loadMessages();
      // Bubble this conversation to the top of the list immediately.
      setConversations((prev) =>
        prev
          .map((c) => (c.groupId === selected.groupId
            ? { ...c, lastMessage: text, lastMessageTime: new Date().toISOString() }
            : c))
          .sort((a, b) =>
            new Date(b.lastMessageTime || 0).getTime()
            - new Date(a.lastMessageTime || 0).getTime())
      );
    } catch (err: any) {
      // Roll back optimistic add and restore the draft for retry.
      setMessages((prev) => prev.filter((m) => m.messageId !== optimistic.messageId));
      setDraft(text);
      alert(err?.response?.data?.message || t('messages.sendFailed'));
    } finally {
      setSending(false);
    }
  };

  /**
   * Pick + upload + send an image. Two stages mirrored from the mobile
   * client so the UX is identical across surfaces:
   *
   *   1. Upload the picked file to /api/files/upload/message-attachment
   *      → returns a stable /api/files/download/… URL
   *   2. Send a group message with that URL as attachmentUrl and an
   *      empty content (the backend allows image-only messages now).
   *
   * The local <img> preview uses a blob URL so the admin sees their
   * upload land instantly; we replace it with the server-saved row on
   * the next poll.
   */
  const handlePickImage = async (file: File) => {
    if (!selected?.groupId || !adminId || uploadingImage) return;
    setUploadingImage(true);

    // Local blob preview for the optimistic message — much smoother
    // than waiting for the round-trip.
    const blobUrl = URL.createObjectURL(file);
    const optimisticId = `tmp_${Date.now()}`;
    const optimistic = {
      messageId: optimisticId,
      senderId: adminId,
      senderName: t('messages.you'),
      content: '',
      attachmentUrl: blobUrl,
      messageType: 'image',
      sentAt: new Date().toISOString(),
      _pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const { fileUrl } = await uploadMessageAttachment(file);
      if (!fileUrl) throw new Error('Upload returned no fileUrl');

      await sendGroupMessage(selected.groupId, adminId, '', {
        attachmentUrl: fileUrl,
        messageType: 'image',
      });

      // Reconcile against the server-saved row (the real one will replace
      // the optimistic blob-URL message).
      await loadMessages();
      setConversations((prev) =>
        prev
          .map((c) => (c.groupId === selected.groupId
            ? { ...c, lastMessage: '📷 Image', lastMessageTime: new Date().toISOString() }
            : c))
          .sort((a, b) =>
            new Date(b.lastMessageTime || 0).getTime()
            - new Date(a.lastMessageTime || 0).getTime())
      );
    } catch (err: any) {
      setMessages((prev) => prev.filter((m) => m.messageId !== optimisticId));
      alert(err?.response?.data?.message || err?.message || t('messages.imageFailed'));
    } finally {
      // Revoke the blob URL once we're done with it — long-lived blob
      // URLs leak memory in the browser if you forget.
      URL.revokeObjectURL(blobUrl);
      setUploadingImage(false);
      // Reset the file input so picking the SAME image twice fires
      // onChange again (Chrome ignores re-picks of the same value).
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Auto-scroll to the bottom on new messages.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, selected, typingName]);

  if (!adminId || convLoading) return <LoadingSpinner />;

  const q = fold(search);
  const shown = q
    ? conversations.filter((c) =>
        [c.otherUserName, c.courseTitle, c.trainerName].some((f) => fold(f).includes(q)))
    : conversations;

  return (
    <div>
      <PageHeader
        title={t('messages.title')}
        subtitle={t('messages.subtitle', { count: conversations.length })}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        {/* ── Conversation list ── */}
        <div className={`bg-card border border-border rounded-2xl overflow-hidden flex flex-col ${selected ? 'hidden lg:flex' : ''}`}>
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-white">{t('messages.groups')}</p>
            {conversations.length > 0 && (
              <div className="relative mt-2.5">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('messages.searchPh')}
                  aria-label={t('messages.searchPh')}
                  className="w-full ps-9 pe-8 py-2 rounded-lg bg-card-hover border border-border text-foreground text-sm placeholder:text-muted focus:border-accent outline-none"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label={t('messages.clearSearch')}
                    className="absolute end-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
          {conversations.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center px-6">
              <div>
                <Users className="w-10 h-10 text-muted mx-auto mb-3" />
                <p className="text-sm text-muted">
                  {t('messages.noChats')}
                </p>
              </div>
            </div>
          ) : shown.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center px-6">
              <div>
                <Search className="w-10 h-10 text-muted mx-auto mb-3" />
                <p className="text-sm text-muted">{t('messages.noMatch', { query: search.trim() })}</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {shown.map((conv) => {
                const isActive = selected?.groupId === conv.groupId;
                return (
                  <button
                    key={conv.conversationId}
                    onClick={() => setSelected(conv)}
                    className={`w-full text-start px-4 py-3 border-b border-border flex items-start gap-3 transition ${
                      isActive ? 'bg-accent/10' : 'hover:bg-card-hover'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center flex-shrink-0">
                      <Users className="w-5 h-5 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-white truncate">
                          {conv.otherUserName}
                        </p>
                        <span className="text-[10px] text-muted flex-shrink-0">
                          {t('messages.members', { count: conv.memberCount })}
                        </span>
                      </div>
                      {/* While searching, show what matched besides the name. */}
                      {q && (conv.courseTitle || conv.trainerName) && (
                        <p className="text-[11px] text-accent/80 truncate mt-0.5">
                          {[conv.courseTitle !== conv.otherUserName ? conv.courseTitle : null, conv.trainerName]
                            .filter(Boolean).join(' · ')}
                        </p>
                      )}
                      <p className="text-xs text-muted truncate mt-0.5">
                        {conv.lastMessage || t('messages.noMessages')}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Active conversation ── */}
        <div className={`bg-card border border-border rounded-2xl overflow-hidden flex flex-col ${!selected ? 'hidden lg:flex' : ''}`}>
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-center px-6">
              <div>
                <MessageSquare className="w-12 h-12 text-muted mx-auto mb-3" />
                <p className="text-sm text-muted">
                  {t('messages.pick')}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                <button
                  onClick={() => setSelected(null)}
                  className="lg:hidden p-1 text-muted hover:text-foreground"
                >
                  <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
                </button>
                <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center">
                  <Users className="w-4 h-4 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {selected.otherUserName}
                  </p>
                  {/* Replaces the member count while someone is typing
                      rather than adding a line, so the message list does
                      not shift down and back every few seconds. */}
                  {typingName ? (
                    <p className="text-[11px] text-accent truncate">{t('messages.typing', { name: typingName })}</p>
                  ) : (
                    <p className="text-[11px] text-muted">
                      {t('messages.members', { count: selected.memberCount })} · {selected.courseTitle}
                    </p>
                  )}
                </div>
              </div>

              {/* Message list.
                  flex-col so each row's `self-end` / `self-start` aligns it
                  left or right within the column; gap-y handles the vertical
                  spacing between bubbles (replaces the previous `space-y-3`
                  which was margin-based and conflicted with self-alignment). */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 bg-background/30"
              >
                {chatLoading && messages.length === 0 ? (
                  <p className="text-center text-xs text-muted">{t('messages.loading')}</p>
                ) : messages.length === 0 ? (
                  <p className="text-center text-xs text-muted">{t('messages.noMessagesYet')}</p>
                ) : (
                  messages.map((msg, i) => {
                    const isMine = msg.senderId === adminId;
                    const isSystem = msg.senderType === 'system';
                    if (isSystem) {
                      return (
                        <div key={msg.messageId || i} className="flex justify-center">
                          <span className="text-[11px] text-muted bg-card-hover rounded-full px-3 py-1">
                            {msg.content}
                          </span>
                        </div>
                      );
                    }
                    // WhatsApp pattern for a run of messages from one sender,
                    // same as the app: the name on the first bubble, the
                    // avatar beside the last, so the circle sits at the foot
                    // of what that person said. Bubbles inside a run sit
                    // closer together so the run reads as one block.
                    const sameSender = (m: any) =>
                      !!m && m.senderType !== 'system' && m.senderId === msg.senderId;
                    const firstOfRun = !sameSender(messages[i - 1]);
                    const lastOfRun = !sameSender(messages[i + 1]);
                    const showHeader = !isMine && firstOfRun;
                    const showAvatar = !isMine && lastOfRun;

                    // Resolve photo URL — backend ships either an absolute URL
                    // or a relative "/files/..." path; we prefix the latter.
                    const rawPhoto: string | null = msg.senderPhotoUrl ?? null;
                    const photoUrl = rawPhoto
                      ? rawPhoto.startsWith('http')
                        ? rawPhoto
                        : `${API_BASE_URL}${rawPhoto}`
                      : null;

                    // ── Image attachment handling ──
                    // A message is "image-like" when its messageType says
                    // image OR its attachment URL ends in an image
                    // extension. "Image-only" = has the image but no text
                    // caption — that case drops the bubble wrapper so the
                    // photo stands alone, matching the mobile UX.
                    const hasImage = !!msg.attachmentUrl && (
                      msg.messageType === 'image'
                      || /\.(jpg|jpeg|png|gif|webp)$/i.test(msg.attachmentUrl)
                    );
                    const imageOnly = hasImage && !msg.content;
                    const imgUrl = hasImage
                      ? (msg.attachmentUrl as string).startsWith('http')
                        || (msg.attachmentUrl as string).startsWith('blob:')
                        ? (msg.attachmentUrl as string)
                        : `${API_BASE_URL}${msg.attachmentUrl}`
                      : null;

                    const timeText = new Date(msg.sentAt || msg.createdAt).toLocaleTimeString(locale, {
                      hour: '2-digit', minute: '2-digit',
                    });

                    // Pending = optimistic message awaiting server ack.
                    // Drives the "clock" status icon on mine messages.
                    const pending = !!msg._pending;

                    // Layout matches the mobile chat now: avatar circle OUTSIDE
                    // the bubble on the left (for non-mine), sender name INSIDE
                    // the bubble at the top, content + timestamp below.
                    // Mine messages have no avatar — bubble alone, right-aligned.
                    return (
                      <div
                        key={msg.messageId || i}
                        className={`flex items-end gap-2 max-w-[85%] ${
                          isMine ? 'self-end flex-row-reverse' : 'self-start'
                        } ${firstOfRun ? '' : '-mt-2'}`}
                      >
                        {/* Avatar — only for non-mine, only on the last
                            bubble in a run from this sender. A spacer stands
                            in elsewhere so every bubble in the run lines up. */}
                        {!isMine && (
                          showAvatar ? (
                            photoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={photoUrl}
                                alt={msg.senderName || 'sender'}
                                className="w-8 h-8 rounded-full object-cover border border-border flex-shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-bold text-accent">
                                  {(msg.senderName || '?')[0].toUpperCase()}
                                </span>
                              </div>
                            )
                          ) : (
                            <div className="w-8 flex-shrink-0" aria-hidden />
                          )
                        )}

                        {imageOnly ? (
                          // Standalone photo branch — no bubble background.
                          // Sender name above the photo (when applicable),
                          // timestamp + status pill overlaid on the photo.
                          <div className="flex flex-col min-w-0">
                            {showHeader && !isMine && (
                              <span className="text-[11px] text-accent font-medium mb-1 ms-1">
                                {msg.senderName || t('messages.member')}
                              </span>
                            )}
                            <a
                              href={imgUrl!}
                              target="_blank"
                              rel="noreferrer"
                              className="relative inline-block rounded-2xl overflow-hidden hover:opacity-90 transition"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={imgUrl!}
                                alt="attachment"
                                className="block max-w-[280px] max-h-[280px] object-cover"
                              />
                              <span className="absolute bottom-1.5 end-1.5 text-[10px] text-white font-medium bg-black/55 rounded-md px-1.5 py-0.5 flex items-center gap-1">
                                {timeText}
                                {isMine && (pending ? '🕒' : '✓')}
                              </span>
                            </a>
                          </div>
                        ) : (
                          // Bubble branch — text-only or image-with-caption.
                          <div
                            className={`rounded-2xl px-3.5 py-2 min-w-0 ${
                              isMine
                                ? 'bg-accent text-black'
                                : 'bg-card-hover text-foreground border border-border'
                            }`}
                          >
                            {/* Sender name lives INSIDE the bubble, at the top,
                                so the bubble owns the whole identity block (matches
                                mobile). Suppressed on mine bubbles and on streak
                                continuations. */}
                            {showHeader && !isMine && (
                              <p className="text-[11px] text-accent font-semibold mb-1">
                                {msg.senderName || t('messages.member')}
                              </p>
                            )}
                            {hasImage && imgUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <a href={imgUrl} target="_blank" rel="noreferrer">
                                <img
                                  src={imgUrl}
                                  alt="attachment"
                                  className="block w-full max-w-[260px] h-auto rounded-lg mb-2 hover:opacity-90 transition"
                                />
                              </a>
                            )}
                            {!!msg.content && (
                              <p className="text-sm leading-snug whitespace-pre-wrap break-words">
                                {msg.content}
                              </p>
                            )}
                            <p
                              className={`text-[10px] mt-1 text-end flex items-center justify-end gap-1 ${
                                isMine ? 'text-black/50' : 'text-muted'
                              }`}
                            >
                              {timeText}
                              {isMine && (pending ? '🕒' : '✓')}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}

                {/* Where the next message will appear, so it is seen;
                    the header line alone was easy to miss. */}
                {typingName && (
                  <div className="self-start flex flex-col gap-1" aria-live="polite">
                    <div className="flex items-center gap-1.5 rounded-2xl rounded-es-md bg-card-hover border border-border px-4 py-3">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce"
                          style={{ animationDelay: `${i * 160}ms` }}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] text-muted ps-1">{typingName} is typing…</span>
                  </div>
                )}
              </div>

              {/* Composer.
                  Image picker (left) → textarea → send (right). The file
                  input itself is hidden — clicking the visible image button
                  forwards the click to it, which is the standard pattern
                  for styling file inputs in any browser. */}
              {/* A finished group's chat is frozen, not hidden. The
                  server refuses a send to a completed or cancelled group,
                  so offering a composer here only produced an error after
                  something had been typed. readOnly comes from the server
                  for exactly that reason — the rule is not restated. The
                  history stays visible: it is dispute evidence, and the
                  one time anyone needs to read it is when a payment is
                  being contested. */}
              {selected?.readOnly ? (
                <div className="border-t border-border p-4 flex items-center justify-center gap-2 text-sm text-muted">
                  <Lock className="w-4 h-4" />
                  <span>
                    {selected?.groupStatus === 'cancelled' ? t('messages.readOnlyCancelled') : t('messages.readOnlyFinished')}
                  </span>
                </div>
              ) : (
              <div className="border-t border-border p-3 flex items-end gap-2">
                {/* Hidden native file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePickImage(file);
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage || !adminId}
                  title={t('messages.sendPicture')}
                  className="w-10 h-10 rounded-xl flex items-center justify-center bg-accent/10 border border-accent/30 text-accent hover:bg-accent/15 disabled:opacity-40 transition"
                >
                  {uploadingImage ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ImageIcon className="w-4 h-4" />
                  )}
                </button>

                <textarea
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    const now = Date.now();
                    if (e.target.value && selected?.groupId && now - lastTypingSent.current > 2500) {
                      lastTypingSent.current = now;
                      publishTyping(selected.groupId);
                    }
                  }}
                  onKeyDown={(e) => {
                    // Enter sends; Shift+Enter inserts newline (standard chat pattern).
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={t('messages.typePh')}
                  rows={1}
                  className="flex-1 resize-none bg-card-hover border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent/40 max-h-32"
                  disabled={sending}
                />
                <button
                  onClick={handleSend}
                  disabled={!draft.trim() || sending}
                  className="bg-accent text-black w-10 h-10 rounded-xl flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
