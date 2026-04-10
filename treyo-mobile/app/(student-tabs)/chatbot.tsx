import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
    Image, Animated, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useRef, useEffect } from 'react';
import { BlurView } from 'expo-blur';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { ScreenBackground } from '../../components/ScreenBackground';
import { authService } from '../../services/api';
import { useRouter } from 'expo-router';
import api from '../../services/api';

// ── Types ─────────────────────────────────────────────────────────────────────
type Message = {
    id: string;
    text: string;
    imageUri?: string;
    isBot: boolean;
    timestamp: Date;
};

type ChatHistoryItem = {
    role: 'user' | 'model';
    text: string;
};

type RecordingStatus = 'idle' | 'recording' | 'transcribing';

type PendingImage = {
    uri: string;
    base64: string;
    mimeType: string;
};

async function uriToBase64(uri: string): Promise<string> {
    const res = await fetch(uri);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ── Animated typing dots ──────────────────────────────────────────────────────
function TypingDots() {
    const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

    useEffect(() => {
        const animate = (dot: Animated.Value, delay: number) =>
            Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(dot, { toValue: -6, duration: 300, useNativeDriver: true }),
                    Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
                    Animated.delay(600),
                ])
            ).start();
        dots.forEach((d, i) => animate(d, i * 150));
    }, []);

    return (
        <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', paddingVertical: 4 }}>
            {dots.map((d, i) => (
                <Animated.View
                    key={i}
                    style={{
                        width: 7, height: 7, borderRadius: 3.5,
                        backgroundColor: 'rgba(124,206,6,0.7)',
                        transform: [{ translateY: d }],
                    }}
                />
            ))}
        </View>
    );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ChatbotScreen() {
    const router = useRouter();
    const [userName, setUserName] = useState('');
    const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
    const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
    const [recordSeconds, setRecordSeconds] = useState(0);

    const scrollRef = useRef<ScrollView>(null);
    const recordingRef = useRef<Audio.Recording | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

    const isEmptyState = messages.length === 0 && !loading;

    useEffect(() => {
        (async () => {
            const user = await authService.getCurrentUser();
            if (user?.name) setUserName(user.name.split(' ')[0]);
            try {
                const res = await api.get('/students/me');
                setProfilePicUrl(res.data.profilePictureUrl || null);
            } catch (_) {}
        })();
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, []);

    const scrollToBottom = () =>
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    const formatTime = (d: Date) => {
        const h = d.getHours(), m = d.getMinutes().toString().padStart(2, '0');
        return `${h % 12 || 12}:${m}${h >= 12 ? 'pm' : 'am'}`;
    };

    const formatDuration = (s: number) =>
        `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

    const startPulse = () => {
        pulseLoop.current = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.4, duration: 500, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
            ])
        );
        pulseLoop.current.start();
    };

    const stopPulse = () => { pulseLoop.current?.stop(); pulseAnim.setValue(1); };

    // ── Send ──────────────────────────────────────────────────────────────────
    const sendMessage = async (text: string) => {
        const trimmed = text.trim();
        if ((!trimmed && !pendingImage) || loading) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            text: trimmed,
            imageUri: pendingImage?.uri,
            isBot: false,
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        const imgToSend = pendingImage;
        setPendingImage(null);
        setLoading(true);
        scrollToBottom();

        try {
            const msgText = userName ? `[User's name: ${userName}]\n${trimmed}` : trimmed;
            let reply = '';

            if (imgToSend) {
                const res = await api.post('/chatbot/chat-with-image', {
                    imageBase64: imgToSend.base64,
                    mimeType: imgToSend.mimeType,
                    message: msgText || 'What do you see in this image?',
                    history: chatHistory,
                });
                if (!res.data.success) throw new Error(res.data.error || 'No reply');
                reply = res.data.reply;
            } else {
                const res = await api.post('/chatbot/chat', { history: chatHistory, message: msgText });
                if (!res.data.success) throw new Error(res.data.error || 'No reply');
                reply = res.data.reply;
            }

            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(), text: reply, isBot: true, timestamp: new Date(),
            }]);
            setChatHistory(prev => [
                ...prev,
                { role: 'user' as const, text: trimmed },
                { role: 'model' as const, text: reply },
            ].slice(-20) as ChatHistoryItem[]);
            scrollToBottom();
        } catch (err: any) {
            console.error('Chatbot error:', err?.response?.data || err?.message || err);
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                text: err?.response?.data?.error || err?.message || "Sorry, I couldn't reach the AI. Please try again.",
                isBot: true, timestamp: new Date(),
            }]);
            scrollToBottom();
        } finally {
            setLoading(false);
        }
    };

    // ── Attachment ────────────────────────────────────────────────────────────
    const handleAttachment = () => {
        Alert.alert('Attach Image', 'Choose a source', [
            { text: 'Camera', onPress: () => pickImage('camera') },
            { text: 'Gallery', onPress: () => pickImage('gallery') },
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    const pickImage = async (source: 'camera' | 'gallery') => {
        try {
            let result: ImagePicker.ImagePickerResult;
            if (source === 'camera') {
                const perm = await ImagePicker.requestCameraPermissionsAsync();
                if (!perm.granted) return;
                result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7 });
            } else {
                const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (!perm.granted) return;
                result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.7 });
            }
            if (!result.canceled && result.assets?.[0]) {
                const asset = result.assets[0];
                const base64 = await uriToBase64(asset.uri);
                const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
                setPendingImage({ uri: asset.uri, base64, mimeType: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
            }
        } catch (e) { console.error(e); }
    };

    // ── Voice ─────────────────────────────────────────────────────────────────
    const startRecording = async () => {
        try {
            const { granted } = await Audio.requestPermissionsAsync();
            if (!granted) { Alert.alert('Permission needed', 'Microphone permission is required.'); return; }
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
            const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
            recordingRef.current = recording;
            setRecordingStatus('recording');
            setRecordSeconds(0);
            startPulse();
            timerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000);
        } catch (err) { console.error(err); }
    };

    const stopRecording = async () => {
        if (!recordingRef.current) return;
        stopPulse();
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setRecordingStatus('transcribing');
        setRecordSeconds(0);
        try {
            await recordingRef.current.stopAndUnloadAsync();
            await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
            const uri = recordingRef.current.getURI();
            recordingRef.current = null;
            if (!uri) throw new Error('No URI');

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
                            <Ionicons name="arrow-back" size={22} color="#ffffff" />
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

                {/* ── Recording banner ── */}
                {recordingStatus !== 'idle' && (
                    <View style={styles.recordingBanner}>
                        <View style={styles.recDot} />
                        <Text style={styles.recText}>
                            {recordingStatus === 'recording'
                                ? `Listening  ${formatDuration(recordSeconds)}`
                                : 'Transcribing your voice...'}
                        </Text>
                        {recordingStatus === 'recording'
                            ? <TouchableOpacity onPress={stopRecording}><Ionicons name="stop-circle" size={22} color="#ff4444" /></TouchableOpacity>
                            : <ActivityIndicator size="small" color="#7cce06" />}
                    </View>
                )}

                {/* ── Empty state ── */}
                {isEmptyState ? (
                    <View style={styles.emptyState}>
                        <Image source={require('../../assets/images/AI_Robot.png')} style={styles.robotBig} resizeMode="contain" />
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
                            <View key={msg.id} style={[styles.row, msg.isBot ? styles.rowBot : styles.rowUser]}>

                                {/* Bot avatar */}
                                {msg.isBot && (
                                    <View style={styles.botAvatarWrap}>
                                        <Image source={require('../../assets/images/AI_Robot_small.png')} style={styles.botAvatar} resizeMode="contain" />
                                    </View>
                                )}

                                {/* Bubble */}
                                <TouchableOpacity
                                    activeOpacity={0.92}
                                    style={[styles.bubble, msg.isBot ? styles.bubbleBot : styles.bubbleUser]}
                                    onLongPress={() => msg.isBot && Speech.speak(msg.text, { language: 'en-US' })}
                                >
                                    {msg.isBot && <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />}

                                    {msg.imageUri && (
                                        <Image source={{ uri: msg.imageUri }} style={styles.bubbleImg} resizeMode="cover" />
                                    )}

                                    {msg.text.length > 0 && (
                                        <Text style={[styles.bubbleText, msg.isBot ? styles.bubbleTextBot : styles.bubbleTextUser]}>
                                            {msg.text}
                                        </Text>
                                    )}

                                    {!msg.isBot && (
                                        <View style={styles.timeRow}>
                                            <Text style={styles.timeText}>{formatTime(msg.timestamp)}</Text>
                                            <Ionicons name="checkmark-done" size={13} color="rgba(255,255,255,0.7)" />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            </View>
                        ))}

                        {/* Typing indicator */}
                        {loading && (
                            <View style={[styles.row, styles.rowBot]}>
                                <View style={styles.botAvatarWrap}>
                                    <Image source={require('../../assets/images/AI_Robot_small.png')} style={styles.botAvatar} resizeMode="contain" />
                                </View>
                                <View style={[styles.bubble, styles.bubbleBot, styles.typingBubble]}>
                                    <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
                                    <TypingDots />
                                </View>
                            </View>
                        )}
                    </ScrollView>
                )}

                {/* ── Pending image preview ── */}
                {pendingImage && (
                    <View style={styles.previewBar}>
                        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                        <Image source={{ uri: pendingImage.uri }} style={styles.previewThumb} />
                        <Text style={styles.previewLabel}>Image ready to send</Text>
                        <TouchableOpacity onPress={() => setPendingImage(null)}>
                            <Ionicons name="close-circle" size={22} color="#ff4444" />
                        </TouchableOpacity>
                    </View>
                )}

                {/* ── Input bar ── */}
                <View style={styles.inputBar}>
                    {/* Clip */}
                    <TouchableOpacity onPress={handleAttachment} disabled={recordingStatus !== 'idle'} style={styles.clipBtn}>
                        <Ionicons name="attach-outline" size={26} color={pendingImage ? '#7cce06' : 'rgba(255,255,255,0.5)'} />
                    </TouchableOpacity>

                    {/* Pill input */}
                    <View style={styles.pill}>
                        <TextInput
                            style={styles.textInput}
                            value={input}
                            onChangeText={setInput}
                            placeholder={
                                recordingStatus === 'recording' ? `🎙  ${formatDuration(recordSeconds)}`
                                : recordingStatus === 'transcribing' ? 'Transcribing...'
                                : "Ask Treyo's Chat Robot"
                            }
                            placeholderTextColor="rgba(80,90,120,0.85)"
                            multiline
                            maxLength={500}
                            editable={recordingStatus === 'idle'}
                        />

                        {/* Image icon */}
                        <TouchableOpacity onPress={handleAttachment} disabled={recordingStatus !== 'idle'} style={styles.pillIcon}>
                            <Ionicons name="image-outline" size={22} color={pendingImage ? '#7cce06' : 'rgba(80,90,120,0.85)'} />
                        </TouchableOpacity>

                        {/* Mic */}
                        <Animated.View style={{ transform: [{ scale: recordingStatus === 'recording' ? pulseAnim : 1 }] }}>
                            <TouchableOpacity
                                onPress={handleMicPress}
                                disabled={recordingStatus === 'transcribing' || loading}
                                style={[styles.pillIcon, recordingStatus === 'recording' && styles.pillIconRec]}
                            >
                                {recordingStatus === 'transcribing'
                                    ? <ActivityIndicator size="small" color="#7cce06" />
                                    : <Ionicons
                                        name={recordingStatus === 'recording' ? 'stop-circle' : 'mic-outline'}
                                        size={22}
                                        color={recordingStatus === 'recording' ? '#ff4444' : 'rgba(80,90,120,0.85)'}
                                      />}
                            </TouchableOpacity>
                        </Animated.View>
                    </View>

                    {/* Send */}
                    <TouchableOpacity
                        style={[styles.sendBtn, (input.trim() || pendingImage) && !loading ? styles.sendActive : styles.sendDim]}
                        onPress={() => sendMessage(input)}
                        disabled={(!input.trim() && !pendingImage) || loading}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="send" size={18} color={(input.trim() || pendingImage) ? '#ffffff' : 'rgba(255,255,255,0.3)'} />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, paddingBottom: 90 },

    // ── Header
    header: { paddingTop: 52, paddingHorizontal: 20, marginBottom: 6 },
    logo: { width: 36, height: 36, marginBottom: 10 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    backBtn: { padding: 2 },
    headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: '#ffffff' },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    bellWrap: { position: 'relative' },
    badge: {
        position: 'absolute', top: -4, right: -6,
        width: 16, height: 16, borderRadius: 8,
        backgroundColor: '#7cce06', justifyContent: 'center', alignItems: 'center',
    },
    badgeText: { fontSize: 9, fontWeight: 'bold', color: '#000' },
    headerAvatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)' },
    headerAvatarFallback: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(124,206,6,0.2)', borderWidth: 2, borderColor: 'rgba(124,206,6,0.4)',
        justifyContent: 'center', alignItems: 'center',
    },
    headerAvatarLetter: { fontSize: 15, fontWeight: 'bold', color: '#7cce06' },

    // ── Recording banner
    recordingBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        marginHorizontal: 16, marginBottom: 6,
        backgroundColor: 'rgba(255,68,68,0.1)',
        borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8,
        borderWidth: 1, borderColor: 'rgba(255,68,68,0.25)',
    },
    recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff4444' },
    recText: { flex: 1, fontSize: 13, color: '#ff6666', fontWeight: '500' },

    // ── Empty state
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 20 },
    robotBig: { width: 200, height: 200, marginBottom: 24 },
    emptyTitle: { fontSize: 24, fontWeight: '800', color: '#ffffff', textAlign: 'center', lineHeight: 34, marginBottom: 10 },
    emptySubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 22 },

    // ── Scroll
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 },

    // ── Message rows
    row: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-end' },
    rowBot: { alignSelf: 'flex-start', maxWidth: '84%' },
    rowUser: { alignSelf: 'flex-end', maxWidth: '78%', flexDirection: 'row-reverse' },

    // Bot avatar circle
    botAvatarWrap: {
        width: 34, height: 34, borderRadius: 17,
        backgroundColor: 'rgba(124,206,6,0.1)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.2)',
        justifyContent: 'center', alignItems: 'center',
        marginRight: 8, marginBottom: 2,
        overflow: 'hidden',
    },
    botAvatar: { width: 28, height: 28 },

    // Bubbles
    bubble: { borderRadius: 20, overflow: 'hidden' },

    // Bot — dark glass
    bubbleBot: {
        borderBottomLeftRadius: 4,
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.15)',
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: 'transparent',
    },

    // User — brand green gradient feel
    bubbleUser: {
        borderBottomRightRadius: 4,
        backgroundColor: '#7cce06',
        paddingHorizontal: 16, paddingVertical: 12,
        shadowColor: '#7cce06', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
    },

    bubbleImg: { width: 200, height: 155, borderRadius: 12, marginBottom: 10 },

    bubbleText: { fontSize: 15, lineHeight: 23 },
    bubbleTextBot: { color: '#e8e8e8' },
    bubbleTextUser: { color: '#000000', fontWeight: '500' },

    timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 5 },
    timeText: { fontSize: 11, color: 'rgba(0,0,0,0.55)' },

    // Typing
    typingBubble: { paddingVertical: 14, paddingHorizontal: 16 },

    // Pending image preview
    previewBar: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        marginHorizontal: 16, marginBottom: 4,
        borderRadius: 14, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.25)',
        paddingHorizontal: 12, paddingVertical: 8,
    },
    previewThumb: { width: 42, height: 42, borderRadius: 8 },
    previewLabel: { flex: 1, fontSize: 13, color: '#7cce06', fontWeight: '500' },

    // ── Input bar
    inputBar: {
        flexDirection: 'row', alignItems: 'flex-end',
        paddingHorizontal: 14, paddingVertical: 10, gap: 8,
        borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    },
    clipBtn: { paddingBottom: 10 },

    pill: {
        flex: 1, flexDirection: 'row', alignItems: 'flex-end',
        backgroundColor: 'rgba(255,255,255,0.94)',
        borderRadius: 28, paddingLeft: 18, paddingRight: 6,
        paddingVertical: 8, maxHeight: 110,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
    },
    textInput: {
        flex: 1, fontSize: 15, color: '#1a1a2e',
        minHeight: 26, maxHeight: 80, paddingTop: 2,
    },
    pillIcon: { paddingHorizontal: 4, paddingBottom: 2, borderRadius: 14 },
    pillIconRec: { backgroundColor: 'rgba(255,68,68,0.08)' },

    sendBtn: {
        width: 46, height: 46, borderRadius: 23,
        justifyContent: 'center', alignItems: 'center',
    },
    sendActive: {
        backgroundColor: '#3b5bdb',
        shadowColor: '#3b5bdb', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
    },
    sendDim: { backgroundColor: 'rgba(255,255,255,0.1)' },
});
