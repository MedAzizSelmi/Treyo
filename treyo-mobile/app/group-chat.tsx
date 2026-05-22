import {
    View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
    ActivityIndicator, Platform, Alert, Image, Keyboard, KeyboardEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenBackground } from '../components/ScreenBackground';
import { authService, messageService, fetchUpload, API_BASE_URL } from '../services/api';

// How often we re-fetch the message list while the chat is open. 4s matches
// the admin dashboard's cadence — frequent enough that a reply lands within
// a heartbeat without hammering the API. Mirror updates to the admin side
// if you change this. Polling is paused while a send is in flight to avoid
// a race that briefly removes the optimistic bubble before the GET catches up.
const POLL_INTERVAL_MS = 4000;

/**
 * Group chat screen.
 *
 * Lists every message in a group's conversation and lets a member post
 * a new one. Membership (and therefore read/write permission) is
 * enforced server-side — if the user isn't enrolled / isn't the trainer
 * / isn't an admin, the GET errors out and we show "You're not a
 * member of this group" instead of an empty thread.
 *
 * Refresh strategy is simple polling on focus + after each send. We
 * could wire this to the existing /user/queue/group-messages WebSocket
 * frame for live updates, but polling-on-focus covers 95% of the UX
 * with a fraction of the surface area to debug.
 */
export default function GroupChatScreen() {
    const router = useRouter();
    const { groupId, groupName } = useLocalSearchParams<{ groupId: string; groupName?: string }>();
    const [userId, setUserId] = useState<string | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [draft, setDraft] = useState('');
    const [error, setError] = useState<string | null>(null);
    // True while we're uploading a picked image to the backend. The
    // composer's send button shows a spinner during this so the user
    // knows their tap registered and isn't trying to send twice.
    const [uploadingImage, setUploadingImage] = useState(false);

    // Keyboard handling differs sharply by platform:
    //
    //   iOS — system does NOT resize the window when the keyboard opens.
    //         We have to apply paddingBottom = kbHeight ourselves so the
    //         composer sits above the keyboard rather than under it.
    //
    //   Android (with edgeToEdgeEnabled) — the system DOES auto-resize
    //         the window when the keyboard opens. Our root view's
    //         `flex: 1` then naturally fills the smaller area and the
    //         composer ends up just above the keyboard for free.
    //         Adding paddingBottom on top of that double-counts and
    //         pushes the input WAY above the keyboard (the bug seen on
    //         Redmi: input floats mid-screen with a big empty gap below
    //         it before the keyboard starts).
    //
    // We still listen for keyboard events on both platforms — but only
    // to scroll the message list to the bottom when the keyboard opens,
    // so the latest message stays visible above the input.
    const [kbHeight, setKbHeight] = useState(0);
    useEffect(() => {
        const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const showSub = Keyboard.addListener(showEvt, (e: KeyboardEvent) => {
            setKbHeight(e.endCoordinates?.height ?? 0);
            // Keep the most recent message visible when the keyboard
            // pushes the chat area up (Android) or shrinks visually (iOS).
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
        });
        const hideSub = Keyboard.addListener(hideEvt, () => setKbHeight(0));
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    // Bottom-system-bar inset (e.g. gesture/nav bar). On Android with
    // edge-to-edge enabled, the React Native view extends UNDER this area —
    // so the keyboard height reported by the Keyboard event includes the
    // pixels behind the nav bar even though the composer wasn't using them.
    // Subtracting the inset puts the composer at the visible keyboard's
    // top edge, then we add a small `COMPOSER_GAP` so the input isn't
    // visually crowded against the keyboard.
    const insets = useSafeAreaInsets();
    const COMPOSER_GAP = 28;
    const composerOffset = kbHeight > 0
        ? Math.max(0, kbHeight - insets.bottom) + COMPOSER_GAP
        : 0;

    // Scroll-to-bottom on new messages — keeps the "most recent at the
    // bottom" UX standard from every other chat app.
    const scrollRef = useRef<ScrollView>(null);
    const scrollToBottom = (animated = true) => {
        // setTimeout gives the new bubble a frame to lay out before we
        // measure the content height. Without this, scrolling fires
        // before the message is rendered and the scroll lands short.
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated }), 50);
    };

    // `silent` distinguishes background-poll calls (no spinner, no scroll)
    // from the initial / user-driven load. The first GET we do in this
    // screen wants the spinner + auto-scroll-to-bottom; everything after
    // should be silent so the polling doesn't jolt the UI mid-read.
    const load = useCallback(async (silent = false) => {
        if (!groupId) return;
        try {
            const user = await authService.getCurrentUser();
            if (!user?.userId) {
                if (!silent) {
                    setError('You must be logged in to view this chat.');
                    setLoading(false);
                }
                return;
            }
            setUserId(user.userId);
            const list = await messageService.getGroupMessages(groupId, user.userId);
            const safe = Array.isArray(list) ? list : [];
            setMessages(prev => {
                // Skip the state update when nothing changed — avoids the
                // ScrollView re-laying-out and stealing the user's scroll
                // position during polls.
                if (prev.length === safe.length
                    && prev.every((m, i) => m.messageId === safe[i]?.messageId)) {
                    return prev;
                }
                return safe;
            });
            if (!silent) {
                setError(null);
                scrollToBottom(false);
            }
        } catch (e: any) {
            if (silent) return; // swallow transient poll errors
            // Backend returns SecurityException → 403 for non-members.
            const status = e?.response?.status;
            if (status === 403) {
                setError("You're not a member of this group.");
            } else {
                setError(e?.response?.data?.message || 'Could not load this chat.');
            }
        } finally {
            if (!silent) setLoading(false);
        }
    }, [groupId]);

    // First load shows the spinner + scrolls to the bottom of history.
    useEffect(() => { load(); }, [load]);

    // Background poll for live updates. Without this, the user has to
    // leave-and-return to see new messages — what the user reported.
    // We hold a ref to the latest `sending` flag so the interval can read
    // it without re-arming every time sending toggles.
    const sendingRef = useRef(sending);
    sendingRef.current = sending;
    useEffect(() => {
        if (!groupId) return;
        const id = setInterval(() => {
            // Don't reconcile mid-send — the optimistic bubble would briefly
            // disappear if the GET landed before our POST round-trip finished.
            if (sendingRef.current) return;
            load(true);
        }, POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [groupId, load]);

    const handleSend = async () => {
        const text = draft.trim();
        if (!text || !groupId || !userId || sending) return;
        setSending(true);
        const optimistic = {
            messageId: `tmp_${Date.now()}`,
            senderId: userId,
            senderName: 'You',
            senderType: 'self',
            content: text,
            sentAt: new Date().toISOString(),
            _pending: true,
        };
        // Optimistically append so the user sees their message instantly.
        // We'll reconcile against the server's row in the next load.
        setMessages(prev => [...prev, optimistic]);
        setDraft('');
        scrollToBottom();
        try {
            await messageService.sendGroupMessage(groupId, userId, text);
            // Re-fetch to pick up the real saved row (and any new ones
            // that arrived while we were typing).
            await load();
        } catch (e: any) {
            // Roll back the optimistic message and restore the draft.
            setMessages(prev => prev.filter(m => m.messageId !== optimistic.messageId));
            setDraft(text);
            Alert.alert('Could not send', e?.response?.data?.message || 'Please try again.');
        } finally {
            setSending(false);
        }
    };

    /**
     * Pick an image from the device library and send it as a new chat
     * message. Two stages — separated so the user sees a spinner during
     * the (slower) upload, not just the (fast) send:
     *
     *   1. Ask for library permission, present the picker, get a local URI
     *   2. Upload to /files/upload/message-attachment → backend returns
     *      a stable /api/files/download/… URL
     *   3. Send a regular group message with messageType='image' and the
     *      uploaded URL as attachmentUrl. Backend allows blank content
     *      for image messages.
     */
    const handlePickImage = async () => {
        if (!groupId || !userId || sending || uploadingImage) return;

        // Permission gate. Granted state is sticky so we only show the
        // OS prompt the first time.
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
            Alert.alert(
                'Permission needed',
                'Please grant photo library access to send images.',
            );
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8, // 80% — visibly indistinguishable, ~5× smaller payload
            allowsEditing: false,
            // Single-pick is enough for now; can swap to allowsMultipleSelection
            // when we support galleries of images per message.
        });
        if (result.canceled || !result.assets?.[0]) return;

        const asset = result.assets[0];
        setUploadingImage(true);

        // Use the same "optimistic message + reconcile on next poll"
        // pattern as text — show a local preview straight away so it
        // feels instant; if the upload fails we roll it back.
        const optimisticId = `tmp_${Date.now()}`;
        const optimistic = {
            messageId: optimisticId,
            senderId: userId,
            senderName: 'You',
            senderType: 'self',
            content: '',
            attachmentUrl: asset.uri, // local URI, only used while uploading
            messageType: 'image',
            sentAt: new Date().toISOString(),
            _pending: true,
        };
        setMessages(prev => [...prev, optimistic]);
        scrollToBottom();

        try {
            // Upload first. messageId param is required by the existing
            // backend endpoint — we generate a UUID-ish placeholder so
            // the file path is unique per upload (the real Message.id is
            // assigned later by sendGroupMessage; the two don't need to
            // match — the URL is opaque to everyone except the storage).
            const placeholderMsgId = `MSG_${Date.now().toString(36).toUpperCase()}`;
            const filename = asset.fileName || `image_${Date.now()}.jpg`;
            const mimeType = asset.mimeType || 'image/jpeg';

            const formData = new FormData();
            formData.append('file', {
                uri: asset.uri,
                name: filename,
                type: mimeType,
            } as any);
            formData.append('messageId', placeholderMsgId);

            const uploadResp = await fetchUpload('/files/upload/message-attachment', formData);
            // Endpoint returns { fileUrl: "/api/files/download/<encoded>" }.
            // Relative — the chat bubble renderer prefixes API_BASE_URL.
            const fileUrl: string | undefined = uploadResp?.fileUrl;
            if (!fileUrl) throw new Error('Upload returned no fileUrl');

            // Send the message that references it.
            await messageService.sendGroupMessage(groupId, userId, '', {
                attachmentUrl: fileUrl,
                messageType: 'image',
            });
            // Replace the optimistic local-URI bubble with the real saved row.
            await load();
        } catch (e: any) {
            setMessages(prev => prev.filter(m => m.messageId !== optimisticId));
            Alert.alert(
                'Could not send image',
                e?.response?.data?.message || e?.message || 'Please try again.',
            );
        } finally {
            setUploadingImage(false);
        }
    };

    const formatTime = (iso: string) => {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <ScreenBackground>
            {/* Platform-specific composer offset.
                - iOS: paddingBottom = keyboard height (system doesn't resize).
                - Android: 0 (system already resizes the window when the
                  keyboard opens; any additional padding here doubles-up
                  and floats the composer mid-screen — the Redmi bug). */}
            <View style={{ flex: 1, paddingBottom: composerOffset }}>
                {/* ── Header ── */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color="#ffffff" />
                    </TouchableOpacity>
                    <View style={styles.headerAvatar}>
                        <Ionicons name="people" size={20} color="#7cce06" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle} numberOfLines={1}>
                            {groupName || 'Group chat'}
                        </Text>
                        <Text style={styles.headerSubtitle}>
                            Trainer · students · admin
                        </Text>
                    </View>
                </View>

                {/* ── Body ── */}
                {loading ? (
                    <View style={styles.centered}>
                        <ActivityIndicator size="large" color="#7cce06" />
                    </View>
                ) : error ? (
                    <View style={styles.centered}>
                        <Ionicons name="lock-closed-outline" size={44} color="rgba(255,255,255,0.3)" />
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                ) : (
                    <ScrollView
                        ref={scrollRef}
                        style={{ flex: 1 }}
                        contentContainerStyle={styles.messagesContent}
                        onContentSizeChange={() => scrollToBottom(false)}
                    >
                        {messages.length === 0 ? (
                            <Text style={styles.noMessages}>
                                No messages yet — say hi!
                            </Text>
                        ) : messages.map((msg, i) => {
                            const isMine = msg.senderId === userId;
                            const isSystem = msg.senderType === 'system' || msg.senderId === 'SYSTEM';

                            if (isSystem) {
                                return (
                                    <View key={msg.messageId || i} style={styles.systemRow}>
                                        <Text style={styles.systemText}>{msg.content}</Text>
                                    </View>
                                );
                            }

                            // WhatsApp pattern — only the first bubble in a streak
                            // from one sender gets the avatar + name header. Streaks
                            // mean less visual repetition for chained replies.
                            const prev = messages[i - 1];
                            const showHeader = !isMine
                                && (!prev || prev.senderId !== msg.senderId || prev.senderType === 'system');

                            // Resolve the absolute URL for the sender's photo so
                            // <Image> doesn't get a leading "/files/..." that won't
                            // resolve when the API is on another host. senderPhotoUrl
                            // comes back from the backend as either:
                            //   - already-absolute (https://…)
                            //   - relative (/files/profile-pictures/abc.jpg)
                            //   - null (no upload yet → initial-letter fallback)
                            const rawPhoto: string | null = msg.senderPhotoUrl ?? null;
                            const photoUri = rawPhoto
                                ? (rawPhoto.startsWith('http')
                                    ? rawPhoto
                                    : `${API_BASE_URL}${rawPhoto}`)
                                : null;

                            // Every non-mine avatar is tappable now — routes to a
                            // generic /user-profile screen that handles all three
                            // sender types. Previously only trainer avatars worked
                            // because student/admin had no profile destination.
                            const openProfile = () => {
                                if (!msg.senderId) return;
                                router.push({
                                    pathname: '/user-profile' as any,
                                    params: {
                                        userId: msg.senderId,
                                        userType: msg.senderType,
                                        userName: msg.senderName || '',
                                    },
                                });
                            };

                            return (
                                <View
                                    key={msg.messageId || i}
                                    style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowTheirs]}
                                >
                                    {/* Layout for non-mine messages: avatar circle on
                                        the left (outside bubble), bubble on the right
                                        containing name + content + timestamp. Matches
                                        the requested WhatsApp-style design. */}
                                    {!isMine && showHeader && (
                                        <TouchableOpacity
                                            onPress={openProfile}
                                            activeOpacity={0.7}
                                            style={styles.avatarOutside}
                                            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                                        >
                                            {photoUri ? (
                                                <Image source={{ uri: photoUri }} style={styles.avatarOutsideImg} />
                                            ) : (
                                                <View style={styles.avatarOutsideFallback}>
                                                    <Text style={styles.avatarOutsideLetter}>
                                                        {(msg.senderName || '?')[0].toUpperCase()}
                                                    </Text>
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    )}

                                    {/* Spacer keeps continuation bubbles aligned with
                                        the first bubble's text (where the avatar used
                                        to be) — so a streak reads as a single visual
                                        block from one speaker. */}
                                    {!isMine && !showHeader && <View style={styles.avatarSpacer} />}

                                    {(() => {
                                        // Image attachment detection — a message is
                                        // image-like if its messageType says so, OR
                                        // if its attachment URL has an image extension.
                                        const hasImage = !!msg.attachmentUrl && (
                                            msg.messageType === 'image'
                                            || /\.(jpg|jpeg|png|gif|webp)$/i.test(msg.attachmentUrl)
                                        );
                                        // Image-ONLY = no text caption. These get
                                        // rendered as a raw image (no bubble bg),
                                        // matching how WhatsApp / Telegram surface
                                        // standalone photos.
                                        const imageOnly = hasImage && !msg.content;

                                        // Resolve absolute URL for remote images; local
                                        // file:// (optimistic preview) passes through.
                                        const imgUri = hasImage
                                            ? ((msg.attachmentUrl as string).startsWith('http')
                                                || (msg.attachmentUrl as string).startsWith('file:')
                                                ? msg.attachmentUrl
                                                : `${API_BASE_URL}${msg.attachmentUrl}`)
                                            : null;

                                        // ── Sent / pending indicator ──
                                        // Optimistic bubbles carry `_pending: true`
                                        // until the server returns the real row and
                                        // load() reconciles. We show a clock icon
                                        // while pending; a single checkmark once
                                        // server-acknowledged. Mine messages only —
                                        // status next to other people's bubbles
                                        // would be confusing.
                                        const pending = !!msg._pending;
                                        const statusIcon = isMine
                                            ? (pending ? 'time-outline' : 'checkmark')
                                            : null;

                                        // Image-only branch: image is the bubble. No
                                        // green/dark wrapper around it. The sender
                                        // header still renders ABOVE the image, and
                                        // the timestamp sits as a subtle overlay on
                                        // the bottom-right corner so we don't need
                                        // any padded container below the image.
                                        if (imageOnly) {
                                            return (
                                                <View style={styles.imageOnlyWrap}>
                                                    {showHeader && (
                                                        <TouchableOpacity onPress={openProfile} activeOpacity={0.7}>
                                                            <Text style={styles.bubbleSenderNameStandalone}>
                                                                {msg.senderName || 'Member'}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    )}
                                                    <View style={styles.imageOnlyImageWrap}>
                                                        <Image
                                                            source={{ uri: imgUri! }}
                                                            style={styles.imageOnlyImage}
                                                            resizeMode="cover"
                                                        />
                                                        {/* Timestamp + status overlaid on
                                                            the image so it fills the
                                                            entire bubble area. */}
                                                        <View style={styles.imageOnlyTimeOverlay}>
                                                            <Text style={styles.imageOnlyTimeText}>
                                                                {formatTime(msg.sentAt || msg.createdAt)}
                                                            </Text>
                                                            {statusIcon && (
                                                                <Ionicons
                                                                    name={statusIcon as any}
                                                                    size={11}
                                                                    color="#ffffff"
                                                                    style={{ marginLeft: 4 }}
                                                                />
                                                            )}
                                                        </View>
                                                    </View>
                                                </View>
                                            );
                                        }

                                        // Default: text bubble (with optional image at
                                        // the top if there's both a caption AND image).
                                        return (
                                            <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                                                {showHeader && (
                                                    <TouchableOpacity onPress={openProfile} activeOpacity={0.7}>
                                                        <Text style={styles.bubbleSenderName}>
                                                            {msg.senderName || 'Member'}
                                                        </Text>
                                                    </TouchableOpacity>
                                                )}
                                                {hasImage && imgUri && (
                                                    <Image
                                                        source={{ uri: imgUri }}
                                                        style={styles.attachmentImage}
                                                        resizeMode="cover"
                                                    />
                                                )}
                                                {!!msg.content && (
                                                    <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>
                                                        {msg.content}
                                                    </Text>
                                                )}
                                                {/* Timestamp + status icon on one row.
                                                    The icon colour mirrors the time
                                                    colour so it inherits the right
                                                    contrast on mine vs theirs bubbles. */}
                                                <View style={styles.bubbleTimeRow}>
                                                    <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>
                                                        {formatTime(msg.sentAt || msg.createdAt)}
                                                    </Text>
                                                    {statusIcon && (
                                                        <Ionicons
                                                            name={statusIcon as any}
                                                            size={12}
                                                            color={isMine ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.55)'}
                                                            style={{ marginLeft: 4 }}
                                                        />
                                                    )}
                                                </View>
                                            </View>
                                        );
                                    })()}
                                </View>
                            );
                        })}
                    </ScrollView>
                )}

                {/* ── Composer ── */}
                {!error && (
                    <View style={styles.composer}>
                        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />

                        {/* Image-picker button. Sits to the LEFT of the text
                            field so it's reachable with a thumb on both
                            handsizes, and so the right-side send button stays
                            the visual "primary action" of the row. */}
                        <TouchableOpacity
                            style={styles.attachBtn}
                            onPress={handlePickImage}
                            disabled={sending || uploadingImage}
                            activeOpacity={0.7}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                            {uploadingImage ? (
                                <ActivityIndicator size="small" color="#7cce06" />
                            ) : (
                                <Ionicons name="image-outline" size={22} color="#7cce06" />
                            )}
                        </TouchableOpacity>

                        <TextInput
                            style={styles.input}
                            placeholder="Type a message…"
                            placeholderTextColor="rgba(255,255,255,0.35)"
                            value={draft}
                            onChangeText={setDraft}
                            multiline
                            maxLength={2000}
                            editable={!sending}
                        />
                        <TouchableOpacity
                            style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
                            onPress={handleSend}
                            disabled={!draft.trim() || sending}
                            activeOpacity={0.7}
                        >
                            {sending ? (
                                <ActivityIndicator size="small" color="#000" />
                            ) : (
                                <Ionicons name="arrow-up" size={20} color="#000" />
                            )}
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    // Header sits above the keyboard-avoiding area so it stays put when
    // the keyboard opens.
    header: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingTop: 56, paddingBottom: 14, paddingHorizontal: 16,
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
    },
    backBtn: { padding: 6 },
    headerAvatar: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(124,206,6,0.18)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.35)',
        justifyContent: 'center', alignItems: 'center',
    },
    headerTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
    headerSubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 },

    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
    errorText: { fontSize: 14, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },
    noMessages: { textAlign: 'center', color: 'rgba(255,255,255,0.4)', marginTop: 60 },

    messagesContent: { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 24 },

    // System messages (e.g. the welcome message) get centred neutral
    // styling, distinct from chat bubbles so they read as announcements.
    systemRow: { alignItems: 'center', marginVertical: 10 },
    systemText: {
        fontSize: 12, color: 'rgba(255,255,255,0.5)',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6,
        textAlign: 'center', maxWidth: '90%',
    },

    // Each message row is now a horizontal flex line: optional avatar on
    // the left (only for non-mine messages, and only on the FIRST bubble
    // in a streak), then the bubble. maxWidth caps total row width so
    // a long message doesn't span the entire screen.
    msgRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        marginBottom: 10,
        maxWidth: '85%',
        gap: 6,
    },
    msgRowMine: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
    msgRowTheirs: { alignSelf: 'flex-start', justifyContent: 'flex-start' },

    // Avatar sitting OUTSIDE the bubble, to the left. Tap → user-profile.
    avatarOutside: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden' },
    avatarOutsideImg: { width: 32, height: 32, borderRadius: 16 },
    avatarOutsideFallback: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: 'rgba(124,206,6,0.18)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.35)',
        justifyContent: 'center', alignItems: 'center',
    },
    avatarOutsideLetter: { fontSize: 14, fontWeight: '700', color: '#7cce06' },
    // Same width as the avatar so streak continuations stay aligned.
    avatarSpacer: { width: 32 },

    // Sender name INSIDE the bubble, sitting at the top above the message
    // text. Greenish so it reads as metadata rather than message body.
    bubbleSenderName: { fontSize: 12, color: '#7cce06', fontWeight: '700', marginBottom: 4 },

    bubble: {
        paddingHorizontal: 14, paddingVertical: 9,
        borderRadius: 18,
        // flexShrink so a long message wraps inside the row's maxWidth
        // (instead of forcing the row to overflow horizontally).
        flexShrink: 1,
    },
    bubbleMine: { backgroundColor: '#7cce06' },
    bubbleTheirs: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },
    bubbleText: { fontSize: 14, color: '#ffffff', lineHeight: 19 },
    bubbleTextMine: { color: '#0a0520' },
    // Row that holds the timestamp + the sent/pending status icon.
    // alignSelf right-aligns it under the message text just like a
    // standalone timestamp Text would.
    bubbleTimeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-end',
        marginTop: 4,
    },
    bubbleTime: { fontSize: 10, color: 'rgba(255,255,255,0.4)' },
    bubbleTimeMine: { color: 'rgba(0,0,0,0.5)' },

    composer: {
        flexDirection: 'row', alignItems: 'flex-end', gap: 8,
        paddingHorizontal: 12, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 24 : 12,
        borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)',
    },
    // Image-picker button — same footprint as sendBtn so the row keeps
    // visual balance. Subtler colouring (outline + accent icon) so it
    // doesn't compete with the primary send button.
    attachBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(124,206,6,0.1)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.3)',
        justifyContent: 'center', alignItems: 'center',
    },
    // Image attachment inside a bubble (used when there's also a caption).
    // Fixed aspect-ratio box so the row stays tidy regardless of source
    // image dimensions.
    attachmentImage: {
        width: 220, height: 180,
        borderRadius: 12,
        marginBottom: 6,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },

    // ── Image-only message styles ──
    // For messages where there's no text caption, we drop the bubble
    // background entirely so the image reads as a self-contained photo —
    // matches WhatsApp / Telegram standalone-image behaviour.
    imageOnlyWrap: { flexShrink: 1 },
    // Sender name when shown outside a bubble (for image-only messages).
    // Same colour as inside-bubble, just no padding around it.
    bubbleSenderNameStandalone: {
        fontSize: 12,
        color: '#7cce06',
        fontWeight: '700',
        marginBottom: 4,
        marginLeft: 2,
    },
    // The image wrapper hosts the image itself + the timestamp pill
    // overlaid in the bottom-right corner. Border-radius clips the image
    // and the overlay together so they share rounded corners.
    imageOnlyImageWrap: {
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    imageOnlyImage: {
        width: 240,
        height: 240,
    },
    // Translucent dark pill behind the timestamp + status icon so it's
    // legible whatever the underlying photo looks like (light or dark).
    // Flex row so the icon sits next to the time, not below it.
    imageOnlyTimeOverlay: {
        position: 'absolute',
        bottom: 6,
        right: 6,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.55)',
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 8,
    },
    imageOnlyTimeText: {
        fontSize: 10,
        color: '#ffffff',
        fontWeight: '600',
    },
    input: {
        flex: 1, minHeight: 40, maxHeight: 120,
        paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        color: '#ffffff', fontSize: 14,
    },
    sendBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#7cce06',
        justifyContent: 'center', alignItems: 'center',
    },
    sendBtnDisabled: { opacity: 0.5 },
});
