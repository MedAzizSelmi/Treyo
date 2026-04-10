import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
    Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useRef, useEffect } from 'react';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { ScreenBackground } from '../../components/ScreenBackground';
import { authService } from '../../services/api';
import { useRouter } from 'expo-router';
import api from '../../services/api';

type Message = {
    id: string;
    text: string;
    isBot: boolean;
    timestamp: Date;
};

type ChatHistoryItem = {
    role: 'user' | 'model';
    text: string;
};

type RecordingStatus = 'idle' | 'recording' | 'transcribing';

export default function ChatbotScreen() {
    const router = useRouter();
    const [userName, setUserName] = useState('');
    const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
    const [isSpeaking, setIsSpeaking] = useState(false);

    const scrollRef = useRef<ScrollView>(null);
    const recordingRef = useRef<Audio.Recording | null>(null);

    const isEmptyState = messages.length === 0;

    useEffect(() => {
        (async () => {
            const user = await authService.getCurrentUser();
            if (user?.name) setUserName(user.name.split(' ')[0]);
            try {
                const res = await api.get('/students/me');
                setProfilePicUrl(res.data.profilePictureUrl || null);
            } catch (_) {}
        })();
    }, []);

    const scrollToBottom = () => {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    };

    const formatTime = (date: Date) => {
        const h = date.getHours();
        const m = date.getMinutes().toString().padStart(2, '0');
        const ampm = h >= 12 ? 'pm' : 'am';
        return `${h % 12 || 12}:${m}${ampm}`;
    };

    // ── Send message → backend → Gemini ──────────────────────────────────────
    const sendMessage = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || loading) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            text: trimmed,
            isBot: false,
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);
        scrollToBottom();

        try {
            const messageText = userName ? `[User's name: ${userName}]\n${trimmed}` : trimmed;

            const res = await api.post('/chatbot/chat', {
                history: chatHistory,
                message: messageText,
            });

            const data = res.data;

            if (data.success && data.reply) {
                const botMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    text: data.reply,
                    isBot: true,
                    timestamp: new Date(),
                };
                setMessages(prev => [...prev, botMsg]);

                // Keep history for context (last 20 turns to avoid token bloat)
                setChatHistory(prev => [
                    ...prev,
                    { role: 'user' as const, text: trimmed },
                    { role: 'model' as const, text: data.reply },
                ].slice(-20) as ChatHistoryItem[]);

                scrollToBottom();
            } else {
                throw new Error(data.error || 'No reply from AI');
            }
        } catch (err: any) {
            console.error('Chatbot error:', err);
            const errorText = err?.response?.data?.error
                || err?.message
                || "Sorry, I couldn't reach the AI right now. Please try again.";
            const errMsg: Message = {
                id: (Date.now() + 1).toString(),
                text: errorText,
                isBot: true,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, errMsg]);
            scrollToBottom();
        } finally {
            setLoading(false);
        }
    };

    // ── TTS ───────────────────────────────────────────────────────────────────
    const speakText = (text: string) => {
        Speech.stop();
        setIsSpeaking(true);
        Speech.speak(text, {
            language: 'en-US', pitch: 1.0, rate: 0.95,
            onDone: () => setIsSpeaking(false),
            onStopped: () => setIsSpeaking(false),
            onError: () => setIsSpeaking(false),
        });
    };

    // ── Voice recording → transcribe via backend ──────────────────────────────
    const startRecording = async () => {
        try {
            const { granted } = await Audio.requestPermissionsAsync();
            if (!granted) return;
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
            const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
            recordingRef.current = recording;
            setRecordingStatus('recording');
        } catch (err) { console.error(err); }
    };

    const stopRecording = async () => {
        if (!recordingRef.current) return;
        setRecordingStatus('transcribing');
        try {
            await recordingRef.current.stopAndUnloadAsync();
            await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
            const uri = recordingRef.current.getURI();
            recordingRef.current = null;
            if (!uri) throw new Error('No URI');

            // Upload audio to backend for transcription
            const filename = uri.split('/').pop() || 'recording.m4a';
            const formData = new FormData();
            formData.append('audio', { uri, name: filename, type: 'audio/m4a' } as any);

            const res = await api.post('/chatbot/transcribe', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            const transcript = res.data?.transcript?.trim();
            setRecordingStatus('idle');
            if (transcript) sendMessage(transcript);
        } catch (err) {
            console.error(err);
            setRecordingStatus('idle');
            recordingRef.current = null;
        }
    };

    const handleMicPress = () => {
        if (recordingStatus === 'recording') stopRecording();
        else if (recordingStatus === 'idle') startRecording();
    };

    return (
        <ScreenBackground>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
            >
                {/* ── Header ── */}
                <View style={styles.header}>
                    <Image source={require('../../assets/images/logo-white.png')} style={styles.logo} resizeMode="contain" />
                    <View style={styles.headerRow}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                            <Ionicons name="arrow-back" size={20} color="#ffffff" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>AI Chat</Text>
                        <View style={styles.headerRight}>
                            <TouchableOpacity style={styles.bellWrap}>
                                <Ionicons name="notifications-outline" size={22} color="#ffffff" />
                                <View style={styles.badge}><Text style={styles.badgeText}>2</Text></View>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => router.push('/(student-tabs)/profile' as any)}>
                                {profilePicUrl ? (
                                    <Image source={{ uri: profilePicUrl }} style={styles.headerAvatar} />
                                ) : (
                                    <View style={styles.headerAvatarFallback}>
                                        <Text style={styles.headerAvatarLetter}>{userName.charAt(0) || 'S'}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                {/* ── Messages / Empty state ── */}
                {isEmptyState ? (
                    <View style={styles.emptyState}>
                        <Image
                            source={require('../../assets/images/AI_Robot.png')}
                            style={styles.robotImage}
                            resizeMode="contain"
                        />
                        <Text style={styles.emptyTitle}>
                            {userName ? `Hello, ${userName}!` : 'Hello there!'}{'\n'}I'm Ready To Help You
                        </Text>
                        <Text style={styles.emptySubtitle}>
                            Ask me anything that's on your mind.{'\n'}I'm here to assist you!
                        </Text>
                    </View>
                ) : (
                    <ScrollView
                        ref={scrollRef}
                        style={styles.scroll}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        {messages.map((msg) => (
                            <View
                                key={msg.id}
                                style={[styles.msgRow, msg.isBot ? styles.msgRowBot : styles.msgRowUser]}
                            >
                                {msg.isBot && (
                                    <Image
                                        source={require('../../assets/images/AI_Robot_small.png')}
                                        style={styles.botAvatarSmall}
                                        resizeMode="contain"
                                    />
                                )}
                                <TouchableOpacity
                                    activeOpacity={0.85}
                                    style={[styles.bubble, msg.isBot ? styles.bubbleBot : styles.bubbleUser]}
                                    onLongPress={msg.isBot ? () => speakText(msg.text) : undefined}
                                >
                                    <Text style={[styles.bubbleText, msg.isBot ? styles.bubbleTextBot : styles.bubbleTextUser]}>
                                        {msg.text}
                                    </Text>
                                    {!msg.isBot && (
                                        <View style={styles.timeRow}>
                                            <Text style={styles.timeText}>{formatTime(msg.timestamp)}</Text>
                                            <Ionicons name="checkmark-done" size={14} color="#7cce06" />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            </View>
                        ))}

                        {/* Typing indicator */}
                        {loading && (
                            <View style={[styles.msgRow, styles.msgRowBot]}>
                                <Image
                                    source={require('../../assets/images/AI_Robot_small.png')}
                                    style={styles.botAvatarSmall}
                                    resizeMode="contain"
                                />
                                <View style={[styles.bubble, styles.bubbleBot, styles.typingBubble]}>
                                    <View style={styles.dotsRow}>
                                        <View style={styles.dot} />
                                        <View style={styles.dot} />
                                        <View style={styles.dot} />
                                    </View>
                                </View>
                            </View>
                        )}
                    </ScrollView>
                )}

                {/* ── Input bar ── */}
                <View style={styles.inputBar}>
                    <TouchableOpacity style={styles.clipBtn} activeOpacity={0.7}>
                        <Ionicons name="attach-outline" size={24} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>

                    <View style={styles.inputWrap}>
                        <TextInput
                            style={styles.textInput}
                            value={input}
                            onChangeText={setInput}
                            placeholder="Ask Treyo's Chat Robot"
                            placeholderTextColor="rgba(120,130,160,0.8)"
                            multiline
                            maxLength={500}
                            editable={recordingStatus === 'idle'}
                        />
                        <TouchableOpacity style={styles.inputIcon} activeOpacity={0.7}>
                            <Ionicons name="image-outline" size={22} color="rgba(120,130,160,0.8)" />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.inputIcon}
                            onPress={handleMicPress}
                            disabled={recordingStatus === 'transcribing' || loading}
                            activeOpacity={0.7}
                        >
                            {recordingStatus === 'transcribing' ? (
                                <ActivityIndicator size="small" color="#7cce06" />
                            ) : (
                                <Ionicons
                                    name={recordingStatus === 'recording' ? 'stop-circle' : 'mic-outline'}
                                    size={22}
                                    color={recordingStatus === 'recording' ? '#ff4444' : 'rgba(120,130,160,0.8)'}
                                />
                            )}
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={styles.sendBtn}
                        onPress={() => sendMessage(input)}
                        disabled={!input.trim() || loading}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="send" size={18} color={input.trim() ? '#3b5bdb' : 'rgba(120,130,160,0.7)'} />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, paddingBottom: 90 },

    // Header
    header: { paddingTop: 52, paddingHorizontal: 20, marginBottom: 8 },
    logo: { width: 36, height: 36, marginBottom: 10 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    backBtn: { marginRight: 2 },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#ffffff', flex: 1 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    bellWrap: { position: 'relative' },
    badge: {
        position: 'absolute', top: -4, right: -6,
        backgroundColor: '#7cce06', width: 16, height: 16,
        borderRadius: 8, justifyContent: 'center', alignItems: 'center',
    },
    badgeText: { fontSize: 9, fontWeight: 'bold', color: '#000000' },
    headerAvatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
    headerAvatarFallback: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(124,206,6,0.2)',
        borderWidth: 2, borderColor: 'rgba(124,206,6,0.4)',
        justifyContent: 'center', alignItems: 'center',
    },
    headerAvatarLetter: { fontSize: 16, fontWeight: 'bold', color: '#7cce06' },

    // Empty state
    emptyState: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 32, paddingBottom: 40,
    },
    robotImage: { width: 220, height: 220, marginBottom: 28 },
    emptyTitle: {
        fontSize: 22, fontWeight: 'bold', color: '#ffffff',
        textAlign: 'center', lineHeight: 32, marginBottom: 12,
    },
    emptySubtitle: {
        fontSize: 14, color: 'rgba(255,255,255,0.45)',
        textAlign: 'center', lineHeight: 22,
    },

    // Scroll
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },

    // Message rows
    msgRow: { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-end' },
    msgRowBot: { alignSelf: 'flex-start', maxWidth: '80%' },
    msgRowUser: { alignSelf: 'flex-end', maxWidth: '78%', flexDirection: 'row-reverse' },
    botAvatarSmall: { width: 36, height: 36, marginRight: 8, marginBottom: 2 },

    // Bubbles
    bubble: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12 },
    bubbleBot: { backgroundColor: 'rgba(255,255,255,0.92)', borderBottomLeftRadius: 4 },
    bubbleUser: { backgroundColor: 'rgba(255,255,255,0.92)', borderBottomRightRadius: 4 },
    bubbleText: { fontSize: 15, lineHeight: 22 },
    bubbleTextBot: { color: '#1a1a2e' },
    bubbleTextUser: { color: '#1a1a2e' },

    // User time/tick
    timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 },
    timeText: { fontSize: 11, color: '#3b5bdb' },

    // Typing dots
    typingBubble: { paddingVertical: 16, paddingHorizontal: 18 },
    dotsRow: { flexDirection: 'row', gap: 5, alignItems: 'center' },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(100,100,140,0.5)' },

    // Input bar
    inputBar: {
        flexDirection: 'row', alignItems: 'flex-end',
        paddingHorizontal: 12, paddingVertical: 10, gap: 8,
        borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    },
    clipBtn: { paddingBottom: 10, paddingRight: 2 },
    inputWrap: {
        flex: 1, flexDirection: 'row', alignItems: 'flex-end',
        backgroundColor: 'rgba(255,255,255,0.92)',
        borderRadius: 26, paddingLeft: 18, paddingRight: 8,
        paddingVertical: 8, maxHeight: 100,
    },
    textInput: { flex: 1, fontSize: 15, color: '#1a1a2e', minHeight: 26, maxHeight: 80, paddingTop: 2 },
    inputIcon: { paddingHorizontal: 4, paddingBottom: 2 },
    sendBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: 'transparent',
        justifyContent: 'center', alignItems: 'center',
    },
});
