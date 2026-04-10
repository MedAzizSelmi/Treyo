import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
    Image, Animated, Alert, ActionSheetIOS,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useRef, useEffect } from 'react';
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

// ── Helpers ───────────────────────────────────────────────────────────────────
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

    const formatTime = (date: Date) => {
        const h = date.getHours();
        const m = date.getMinutes().toString().padStart(2, '0');
        return `${h % 12 || 12}:${m}${h >= 12 ? 'pm' : 'am'}`;
    };

    const formatDuration = (s: number) =>
        `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

    // ── Pulse animation ───────────────────────────────────────────────────────
    const startPulse = () => {
        pulseLoop.current = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.35, duration: 550, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 550, useNativeDriver: true }),
            ])
        );
        pulseLoop.current.start();
    };

    const stopPulse = () => {
        pulseLoop.current?.stop();
        pulseAnim.setValue(1);
    };

    // ── Send message ──────────────────────────────────────────────────────────
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
            let reply = '';

            if (imgToSend) {
                // Image + optional text → vision endpoint
                const messageText = userName
                    ? `[User's name: ${userName}]\n${trimmed || 'What do you see in this image?'}`
                    : trimmed || 'What do you see in this image?';

                const res = await api.post('/chatbot/chat-with-image', {
                    imageBase64: imgToSend.base64,
                    mimeType: imgToSend.mimeType,
                    message: messageText,
                    history: chatHistory,
                });
                if (!res.data.success) throw new Error(res.data.error || 'No reply');
                reply = res.data.reply;
            } else {
                // Text only
                const messageText = userName
                    ? `[User's name: ${userName}]\n${trimmed}`
                    : trimmed;

                const res = await api.post('/chatbot/chat', {
                    history: chatHistory,
                    message: messageText,
                });
                if (!res.data.success) throw new Error(res.data.error || 'No reply');
                reply = res.data.reply;
            }

            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                text: reply,
                isBot: true,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, botMsg]);
            setChatHistory(prev => [
                ...prev,
                { role: 'user' as const, text: trimmed },
                { role: 'model' as const, text: reply },
            ].slice(-20) as ChatHistoryItem[]);
            scrollToBottom();

        } catch (err: any) {
            console.error('Chatbot error:', err?.response?.data || err?.message || err);
            const errorText = err?.response?.data?.error || err?.message
                || "Sorry, I couldn't reach the AI right now. Please try again.";
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                text: errorText,
                isBot: true,
                timestamp: new Date(),
            }]);
            scrollToBottom();
        } finally {
            setLoading(false);
        }
    };

    // ── Attachment ────────────────────────────────────────────────────────────
    const handleAttachment = () => {
        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                { options: ['Cancel', 'Take Photo', 'Choose from Gallery'], cancelButtonIndex: 0 },
                async (idx) => {
                    if (idx === 1) await pickImage('camera');
                    if (idx === 2) await pickImage('gallery');
                }
            );
        } else {
            Alert.alert('Attach Image', 'Choose a source', [
                { text: 'Camera', onPress: () => pickImage('camera') },
                { text: 'Gallery', onPress: () => pickImage('gallery') },
                { text: 'Cancel', style: 'cancel' },
            ]);
        }
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
                const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
                setPendingImage({ uri: asset.uri, base64, mimeType });
            }
        } catch (e) { console.error('Image pick error', e); }
    };

    // ── Voice recording ───────────────────────────────────────────────────────
    const startRecording = async () => {
        try {
            const { granted } = await Audio.requestPermissionsAsync();
            if (!granted) {
                Alert.alert('Permission needed', 'Microphone permission is required for voice input.');
                return;
            }
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
            else Alert.alert('Could not understand', 'Please speak more clearly or type your message.');
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

    // ── Speak bot message on long press ──────────────────────────────────────
    const speakText = (text: string) => {
        Speech.stop();
        Speech.speak(text, { language: 'en-US', pitch: 1.0, rate: 0.95 });
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

                {/* ── Recording bar ── */}
                {recordingStatus !== 'idle' && (
                    <View style={styles.recordingBar}>
                        <View style={styles.recordingDot} />
                        <Text style={styles.recordingText}>
                            {recordingStatus === 'recording'
                                ? `Recording... ${formatDuration(recordSeconds)}`
                                : 'Transcribing...'}
                        </Text>
                        {recordingStatus === 'recording' && (
                            <TouchableOpacity onPress={stopRecording} style={styles.recordingStop}>
                                <Ionicons name="stop-circle" size={22} color="#ff4444" />
                            </TouchableOpacity>
                        )}
                        {recordingStatus === 'transcribing' && (
                            <ActivityIndicator size="small" color="#7cce06" />
                        )}
                    </View>
                )}

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
                            <View key={msg.id} style={[styles.msgRow, msg.isBot ? styles.msgRowBot : styles.msgRowUser]}>
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
                                    onLongPress={() => msg.isBot && speakText(msg.text)}
                                >
                                    {/* Image attachment in bubble */}
                                    {msg.imageUri && (
                                        <Image
                                            source={{ uri: msg.imageUri }}
                                            style={styles.bubbleImage}
                                            resizeMode="cover"
                                        />
                                    )}
                                    {msg.text.length > 0 && (
                                        <Text style={[styles.bubbleText, msg.isBot ? styles.bubbleTextBot : styles.bubbleTextUser]}>
                                            {msg.text}
                                        </Text>
                                    )}
                                    {!msg.isBot && (
                                        <View style={styles.timeRow}>
                                            <Text style={styles.timeText}>{formatTime(msg.timestamp)}</Text>
                                            <Ionicons name="checkmark-done" size={14} color="#3b5bdb" />
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

                {/* ── Pending image preview ── */}
                {pendingImage && (
                    <View style={styles.imagePreviewBar}>
                        <Image source={{ uri: pendingImage.uri }} style={styles.imagePreviewThumb} />
                        <Text style={styles.imagePreviewLabel} numberOfLines={1}>Image attached</Text>
                        <TouchableOpacity onPress={() => setPendingImage(null)} style={styles.imagePreviewRemove}>
                            <Ionicons name="close-circle" size={20} color="#ff4444" />
                        </TouchableOpacity>
                    </View>
                )}

                {/* ── Input bar ── */}
                <View style={styles.inputBar}>
                    {/* Attachment button */}
                    <TouchableOpacity
                        style={styles.clipBtn}
                        onPress={handleAttachment}
                        activeOpacity={0.7}
                        disabled={recordingStatus !== 'idle'}
                    >
                        <Ionicons
                            name="attach-outline"
                            size={26}
                            color={pendingImage ? '#7cce06' : 'rgba(255,255,255,0.55)'}
                        />
                    </TouchableOpacity>

                    {/* Text input pill */}
                    <View style={styles.inputWrap}>
                        <TextInput
                            style={styles.textInput}
                            value={input}
                            onChangeText={setInput}
                            placeholder={
                                recordingStatus === 'recording'
                                    ? `🎙 ${formatDuration(recordSeconds)}`
                                    : recordingStatus === 'transcribing'
                                    ? 'Transcribing...'
                                    : "Ask Treyo's Chat Robot"
                            }
                            placeholderTextColor="rgba(80,90,120,0.9)"
                            multiline
                            maxLength={500}
                            editable={recordingStatus === 'idle'}
                        />

                        {/* Image icon (triggers attachment) */}
                        <TouchableOpacity
                            style={styles.inputIcon}
                            onPress={handleAttachment}
                            disabled={recordingStatus !== 'idle'}
                            activeOpacity={0.7}
                        >
                            <Ionicons
                                name="image-outline"
                                size={22}
                                color={pendingImage ? '#7cce06' : 'rgba(80,90,120,0.9)'}
                            />
                        </TouchableOpacity>

                        {/* Mic button */}
                        <Animated.View style={{ transform: [{ scale: recordingStatus === 'recording' ? pulseAnim : 1 }] }}>
                            <TouchableOpacity
                                style={[
                                    styles.inputIcon,
                                    recordingStatus === 'recording' && styles.micRecording,
                                ]}
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
                                        color={recordingStatus === 'recording' ? '#ff4444' : 'rgba(80,90,120,0.9)'}
                                    />
                                )}
                            </TouchableOpacity>
                        </Animated.View>
                    </View>

                    {/* Send button */}
                    <TouchableOpacity
                        style={[styles.sendBtn, (!input.trim() && !pendingImage || loading) && styles.sendBtnDim]}
                        onPress={() => sendMessage(input)}
                        disabled={(!input.trim() && !pendingImage) || loading}
                        activeOpacity={0.8}
                    >
                        <Ionicons
                            name="send"
                            size={18}
                            color={(input.trim() || pendingImage) ? '#3b5bdb' : 'rgba(120,130,160,0.5)'}
                        />
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
        backgroundColor: 'rgba(124,206,6,0.2)', borderWidth: 2, borderColor: 'rgba(124,206,6,0.4)',
        justifyContent: 'center', alignItems: 'center',
    },
    headerAvatarLetter: { fontSize: 16, fontWeight: 'bold', color: '#7cce06' },

    // Recording bar
    recordingBar: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 20, paddingVertical: 8,
        backgroundColor: 'rgba(255,68,68,0.12)',
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,68,68,0.2)',
    },
    recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff4444' },
    recordingText: { flex: 1, fontSize: 13, color: '#ff6666', fontWeight: '500' },
    recordingStop: {},

    // Empty state
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 40 },
    robotImage: { width: 220, height: 220, marginBottom: 28 },
    emptyTitle: { fontSize: 22, fontWeight: 'bold', color: '#ffffff', textAlign: 'center', lineHeight: 32, marginBottom: 12 },
    emptySubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 22 },

    // Scroll
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },

    // Message rows
    msgRow: { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-end' },
    msgRowBot: { alignSelf: 'flex-start', maxWidth: '82%' },
    msgRowUser: { alignSelf: 'flex-end', maxWidth: '80%', flexDirection: 'row-reverse' },
    botAvatarSmall: { width: 36, height: 36, marginRight: 8, marginBottom: 2 },

    // Bubbles
    bubble: { borderRadius: 20, overflow: 'hidden' },
    bubbleBot: {
        backgroundColor: 'rgba(255,255,255,0.93)',
        borderBottomLeftRadius: 4,
        paddingHorizontal: 16, paddingVertical: 12,
    },
    bubbleUser: {
        backgroundColor: 'rgba(255,255,255,0.93)',
        borderBottomRightRadius: 4,
        paddingHorizontal: 16, paddingVertical: 12,
    },
    bubbleImage: { width: 200, height: 160, borderRadius: 12, marginBottom: 8 },
    bubbleText: { fontSize: 15, lineHeight: 22 },
    bubbleTextBot: { color: '#1a1a2e' },
    bubbleTextUser: { color: '#1a1a2e' },

    // Time + tick
    timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 },
    timeText: { fontSize: 11, color: '#3b5bdb' },

    // Typing dots
    typingBubble: { paddingVertical: 16, paddingHorizontal: 18 },
    dotsRow: { flexDirection: 'row', gap: 5, alignItems: 'center' },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(80,90,140,0.5)' },

    // Pending image preview bar
    imagePreviewBar: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 16, paddingVertical: 8,
        borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
    },
    imagePreviewThumb: { width: 44, height: 44, borderRadius: 8 },
    imagePreviewLabel: { flex: 1, fontSize: 13, color: '#7cce06' },
    imagePreviewRemove: {},

    // Input bar
    inputBar: {
        flexDirection: 'row', alignItems: 'flex-end',
        paddingHorizontal: 12, paddingVertical: 10, gap: 8,
        borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    },
    clipBtn: { paddingBottom: 10, paddingRight: 2 },
    inputWrap: {
        flex: 1, flexDirection: 'row', alignItems: 'flex-end',
        backgroundColor: 'rgba(255,255,255,0.93)',
        borderRadius: 26, paddingLeft: 18, paddingRight: 6,
        paddingVertical: 8, maxHeight: 100,
    },
    textInput: { flex: 1, fontSize: 15, color: '#1a1a2e', minHeight: 26, maxHeight: 80, paddingTop: 2 },
    inputIcon: { paddingHorizontal: 5, paddingBottom: 2, borderRadius: 14 },
    micRecording: { backgroundColor: 'rgba(255,68,68,0.1)' },

    // Send
    sendBtn: {
        width: 44, height: 44, borderRadius: 22,
        justifyContent: 'center', alignItems: 'center',
    },
    sendBtnDim: { opacity: 0.5 },
});
