import {
    View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
    ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ScreenBackground } from '../components/ScreenBackground';
import { messageService, authService } from '../services/api';
import { onRealtime, publishDirectMessage, publishTyping } from '../services/realtime';

/**
 * One-to-one chat.
 *
 * This screen was the missing half of direct messaging: the backend had
 * the endpoints and the conversation list rendered DMs, but tapping one
 * did nothing because there was nowhere to go.
 *
 * History loads over REST and new messages arrive on the socket. Both,
 * not either: the socket can be down — a tunnel, a backgrounded app, a
 * changed network — and a chat that only works while connected is worse
 * than one that is occasionally a few seconds stale.
 */

type Message = {
    messageId: string;
    senderId: string;
    receiverId: string;
    content: string;
    sentAt?: string;
    createdAt?: string;
    isRead?: boolean;
};

export default function ChatScreen() {
    const router = useRouter();
    const { userId: otherUserId, userName, conversationId } =
        useLocalSearchParams<{ userId: string; userName?: string; conversationId?: string }>();

    const [me, setMe] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [draft, setDraft] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [theyAreTyping, setTheyAreTyping] = useState(false);

    const listRef = useRef<FlatList<Message>>(null);
    const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    /**
     * Messages are keyed by id when merging, because the same message
     * can arrive twice: once as the POST response and once on the
     * socket. Appending blindly would show it twice.
     */
    const mergeMessage = useCallback((incoming: Message) => {
        setMessages((prev) => {
            if (prev.some((m) => m.messageId === incoming.messageId)) return prev;
            return [...prev, incoming];
        });
    }, []);

    useEffect(() => {
        (async () => {
            const user = await authService.getCurrentUser();
            const myId = user?.userId ?? null;
            setMe(myId);
            if (!myId || !otherUserId) {
                setLoading(false);
                return;
            }
            try {
                const history = await messageService.getConversation(myId, String(otherUserId));
                setMessages(Array.isArray(history) ? history : []);
                if (conversationId) {
                    // Clearing the badge is best-effort; failing to do it
                    // must not stop the conversation opening.
                    messageService.markConversationRead(String(conversationId), myId).catch(() => {});
                }
            } catch (_) {
                setMessages([]);
            } finally {
                setLoading(false);
            }
        })();
    }, [otherUserId, conversationId]);

    // Live messages. The server only ever delivers to this account's own
    // destination, so anything arriving here is addressed to us — but it
    // may belong to a different conversation, hence the sender check.
    useEffect(() => {
        const off = onRealtime('messages', (msg: Message) => {
            if (!msg?.messageId) return;
            const relevant = msg.senderId === otherUserId || msg.receiverId === otherUserId;
            if (relevant) mergeMessage(msg);
        });
        return off;
    }, [otherUserId, mergeMessage]);

    useEffect(() => {
        const off = onRealtime('typing', (payload: any) => {
            if (payload?.senderId !== otherUserId) return;
            setTheyAreTyping(true);
            if (typingTimer.current) clearTimeout(typingTimer.current);
            // The server sends "typing" but never "stopped typing", so
            // the indicator expires on its own rather than sticking.
            typingTimer.current = setTimeout(() => setTheyAreTyping(false), 3000);
        });
        return () => {
            off();
            if (typingTimer.current) clearTimeout(typingTimer.current);
        };
    }, [otherUserId]);

    useEffect(() => {
        if (messages.length) {
            requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
        }
    }, [messages.length]);

    const send = async () => {
        const content = draft.trim();
        if (!content || !me || !otherUserId || sending) return;

        setDraft('');
        setSending(true);
        try {
            // Over the socket when it is up, REST otherwise. The server
            // sets the sender from the session either way, so the two
            // paths cannot disagree about who sent what.
            const viaSocket = publishDirectMessage(String(otherUserId), content);
            if (!viaSocket) {
                const saved = await messageService.sendMessage(me, String(otherUserId), content);
                if (saved?.messageId) mergeMessage(saved);
            }
        } catch (_) {
            // Put the text back rather than losing what was typed.
            setDraft(content);
        } finally {
            setSending(false);
        }
    };

    const onChangeDraft = (text: string) => {
        setDraft(text);
        if (otherUserId) publishTyping(String(otherUserId));
    };

    const renderItem = ({ item }: { item: Message }) => {
        const mine = item.senderId === me;
        return (
            <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>
                        {item.content}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <ScreenBackground>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color="#ffffff" />
                    </TouchableOpacity>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                            {(userName || '?').charAt(0).toUpperCase()}
                        </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerName} numberOfLines={1}>
                            {userName || 'Conversation'}
                        </Text>
                        {theyAreTyping && <Text style={styles.typing}>typing…</Text>}
                    </View>
                </View>

                {loading ? (
                    <View style={styles.center}>
                        <ActivityIndicator size="large" color="#7cce06" />
                    </View>
                ) : messages.length === 0 ? (
                    <View style={styles.center}>
                        <Ionicons name="chatbubbles-outline" size={44} color="rgba(255,255,255,0.25)" />
                        <Text style={styles.emptyText}>No messages yet. Say hello.</Text>
                    </View>
                ) : (
                    <FlatList
                        ref={listRef}
                        data={messages}
                        keyExtractor={(m) => m.messageId}
                        renderItem={renderItem}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
                    />
                )}

                <View style={styles.composer}>
                    <TextInput
                        style={styles.input}
                        value={draft}
                        onChangeText={onChangeDraft}
                        placeholder="Message"
                        placeholderTextColor="rgba(255,255,255,0.35)"
                        multiline
                        maxLength={2000}
                    />
                    <TouchableOpacity
                        style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
                        onPress={send}
                        disabled={!draft.trim() || sending}
                    >
                        <Ionicons name="send" size={18} color="#02000e" />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    emptyText: { color: 'rgba(255,255,255,0.45)', fontSize: 14 },
    header: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingTop: Platform.OS === 'ios' ? 58 : 38,
        paddingBottom: 14, paddingHorizontal: 16,
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
    },
    backBtn: { padding: 4 },
    avatar: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(124,206,6,0.2)', borderWidth: 2,
        borderColor: 'rgba(124,206,6,0.5)', alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { color: '#7cce06', fontWeight: 'bold', fontSize: 15 },
    headerName: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
    typing: { color: '#7cce06', fontSize: 12, marginTop: 1 },
    listContent: { padding: 16, paddingBottom: 8 },
    bubbleRow: { flexDirection: 'row', marginBottom: 8 },
    rowMine: { justifyContent: 'flex-end' },
    rowTheirs: { justifyContent: 'flex-start' },
    bubble: { maxWidth: '78%', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 },
    bubbleMine: { backgroundColor: '#7cce06', borderBottomRightRadius: 4 },
    bubbleTheirs: { backgroundColor: 'rgba(255,255,255,0.1)', borderBottomLeftRadius: 4 },
    bubbleText: { color: '#ffffff', fontSize: 15, lineHeight: 21 },
    bubbleTextMine: { color: '#02000e' },
    composer: {
        flexDirection: 'row', alignItems: 'flex-end', gap: 10,
        paddingHorizontal: 14, paddingVertical: 10,
        borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
    },
    input: {
        flex: 1, maxHeight: 110, color: '#ffffff', fontSize: 15,
        backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 20,
        paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11,
    },
    sendBtn: {
        width: 42, height: 42, borderRadius: 21, backgroundColor: '#7cce06',
        alignItems: 'center', justifyContent: 'center',
    },
    sendBtnDisabled: { opacity: 0.4 },
});
