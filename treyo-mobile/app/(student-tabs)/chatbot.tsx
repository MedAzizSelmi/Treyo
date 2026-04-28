import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
    Image, Animated, Alert, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useRef, useEffect } from 'react';
import { BlurView } from 'expo-blur';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { ScreenBackground } from '../../components/ScreenBackground';
import { authService } from '../../services/api';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import api from '../../services/api';

const { width: SCREEN_W } = Dimensions.get('window');

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
    const dots = [
        useRef(new Animated.Value(0)).current,
        useRef(new Animated.Value(0)).current,
        useRef(new Animated.Value(0)).current,
    ];

    useEffect(() => {
        const animate = (dot: Animated.Value, delay: number) =>
            Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(dot, { toValue: -5, duration: 280, useNativeDriver: true }),
                    Animated.timing(dot, { toValue: 0, duration: 280, useNativeDriver: true }),
                    Animated.delay(500),
                ])
            ).start();
        dots.forEach((d, i) => animate(d, i * 160));
    }, []);

    return (
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', paddingVertical: 2 }}>
            {dots.map((d, i) => (
                <Animated.View
                    key={i}
                    style={{
                        width: 6.5, height: 6.5, borderRadius: 3.25,
                        backgroundColor: '#7cce06',
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
    const [imageTs, setImageTs] = useState(Date.now());
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
        })();
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, []);

    // Reload profile picture every time this tab comes into focus
    useFocusEffect(
        useCallback(() => {
            (async () => {
                try {
                    const res = await api.get('/students/me');
                    setProfilePicUrl(res.data.profilePictureUrl || null);
                    setImageTs(Date.now());
                } catch (_) {}
            })();
        }, [])
    );

    const scrollToBottom = () =>
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    const formatTime = (d: Date) => {
        const h = d.getHours(), m = d.getMinutes().toString().padStart(2, '0');
        return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
    };

    const formatDuration = (s: number) =>
        `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

    const startPulse = () => {
        pulseLoop.current = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.35, duration: 500, useNativeDriver: true }),
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
            if (!uri) throw new Error('No recording URI');

            // Use expo-file-system — the only reliable way to read files as base64 in RN/Hermes
            // (FileReader is a browser API and doesn't work in React Native)
            const audioBase64 = await FileSystem.readAsStringAsync(uri, {
                encoding: 'base64' as any,
            });
            console.log('Audio base64 ready, size:', Math.round(audioBase64.length / 1024), 'KB');

            const ext = (uri.split('.').pop()?.toLowerCase()) || 'm4a';
            const mimeMap: Record<string, string> = {
                m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac',
                wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg',
                '3gp': 'audio/3gpp', amr: 'audio/amr',
            };
            const mimeType = mimeMap[ext] || 'audio/mp4';

            const res = await api.post('/chatbot/transcribe', {
                audioBase64,
                mimeType,
            }, { timeout: 30000 });

            const transcript = res.data?.transcript?.trim();
            setRecordingStatus('idle');
            if (transcript) {
                sendMessage(transcript);
            } else {
                Alert.alert('Voice', "Couldn't understand the audio. Please try again.");
            }
        } catch (err: any) {
            console.error('Transcribe error:', err?.response?.data || err?.message || err);
            setRecordingStatus('idle');
            recordingRef.current = null;
            Alert.alert('Voice Error', 'Failed to transcribe audio. Please try again.');
        }
    };

    const handleMicPress = () => {
        if (recordingStatus === 'recording') stopRecording();
        else if (recordingStatus === 'idle') startRecording();
    };

    const canSend = (input.trim() || pendingImage) && !loading;

    return (
        <ScreenBackground>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
            >
                {/* ── Header ── */}
                <View style={styles.header}>
                    <View style={styles.headerInner}>
                        <View style={styles.headerLeft}>
                            <View style={styles.aiIconWrap}>
                                <Image source={require('../../assets/images/AI_Robot_small.png')} style={styles.aiIcon} resizeMode="contain" />
                            </View>
                            <View>
                                <Text style={styles.headerTitle}>Treyo AI</Text>
                                <Text style={styles.headerSubtitle}>Always here to help</Text>
                            </View>
                        </View>
                        <View style={styles.headerRight}>
                            <TouchableOpacity
                                onPress={() => router.push('/(student-tabs)/notifications' as any)}
                                style={styles.headerIconBtn}
                            >
                                <Ionicons name="notifications-outline" size={24} color="rgba(255,255,255,0.7)" />
                                <View style={styles.badge}><Text style={styles.badgeText}>2</Text></View>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => router.push('/(student-tabs)/profile' as any)}>
                                {profilePicUrl ? (
                                    <Image source={{ uri: `${profilePicUrl}?t=${imageTs}` }} style={styles.headerAvatar} />
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
                        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                        <View style={styles.recDot} />
                        <Text style={styles.recText}>
                            {recordingStatus === 'recording'
                                ? `Listening  ${formatDuration(recordSeconds)}`
                                : 'Transcribing...'}
                        </Text>
                        {recordingStatus === 'recording'
                            ? <TouchableOpacity onPress={stopRecording} style={styles.recStopBtn}>
                                <Ionicons name="stop" size={14} color="#fff" />
                              </TouchableOpacity>
                            : <ActivityIndicator size="small" color="#7cce06" />}
                    </View>
                )}

                {/* ── Empty state ── */}
                {isEmptyState ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyRobotGlow}>
                            <Image source={require('../../assets/images/AI_Robot.png')} style={styles.robotBig} resizeMode="contain" />
                        </View>
                        <Text style={styles.emptyTitle}>
                            {userName ? `Hey ${userName}!` : 'Hello!'}
                        </Text>
                        <Text style={styles.emptySubtitle}>
                            I'm your AI assistant. Ask me anything{'\n'}about training, courses, or your profile.
                        </Text>

                        {/* Quick action chips */}
                        <View style={styles.chipRow}>
                            {['What can you do?', 'Help with profile', 'Find a course'].map(chip => (
                                <TouchableOpacity
                                    key={chip}
                                    style={styles.chip}
                                    onPress={() => sendMessage(chip)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.chipText}>{chip}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
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
                                    activeOpacity={0.85}
                                    style={[styles.bubble, msg.isBot ? styles.bubbleBot : styles.bubbleUser]}
                                    onLongPress={() => msg.isBot && Speech.speak(msg.text, { language: 'en-US' })}
                                >
                                    {msg.imageUri && (
                                        <Image source={{ uri: msg.imageUri }} style={styles.bubbleImg} resizeMode="cover" />
                                    )}

                                    {msg.text.length > 0 && (
                                        <Text style={[styles.bubbleText, msg.isBot ? styles.bubbleTextBot : styles.bubbleTextUser]}>
                                            {msg.text}
                                        </Text>
                                    )}

                                    <Text style={[styles.timeText, msg.isBot ? styles.timeBot : styles.timeUser]}>
                                        {formatTime(msg.timestamp)}
                                    </Text>
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
                                    <TypingDots />
                                </View>
                            </View>
                        )}
                    </ScrollView>
                )}

                {/* ── Pending image preview ── */}
                {pendingImage && (
                    <View style={styles.previewBar}>
                        <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
                        <Image source={{ uri: pendingImage.uri }} style={styles.previewThumb} />
                        <Text style={styles.previewLabel}>Image attached</Text>
                        <TouchableOpacity onPress={() => setPendingImage(null)} style={styles.previewClose}>
                            <Ionicons name="close" size={16} color="#fff" />
                        </TouchableOpacity>
                    </View>
                )}

                {/* ── Input bar ── */}
                <View style={styles.inputBar}>
                    <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />

                    <View style={styles.inputRow}>
                        {/* Text field */}
                        <View style={styles.inputField}>
                            <TextInput
                                style={styles.textInput}
                                value={input}
                                onChangeText={setInput}
                                placeholder={
                                    recordingStatus === 'recording' ? `Recording  ${formatDuration(recordSeconds)}`
                                    : recordingStatus === 'transcribing' ? 'Transcribing...'
                                    : 'Message Treyo AI...'
                                }
                                placeholderTextColor="rgba(255,255,255,0.35)"
                                multiline
                                maxLength={500}
                                editable={recordingStatus === 'idle'}
                            />

                            {/* Inline actions */}
                            <View style={styles.inlineActions}>
                                <TouchableOpacity
                                    onPress={handleAttachment}
                                    disabled={recordingStatus !== 'idle'}
                                    style={styles.inlineBtn}
                                    activeOpacity={0.6}
                                >
                                    <Ionicons
                                        name="image-outline"
                                        size={20}
                                        color={pendingImage ? '#7cce06' : 'rgba(255,255,255,0.4)'}
                                    />
                                </TouchableOpacity>

                                <Animated.View style={{ transform: [{ scale: recordingStatus === 'recording' ? pulseAnim : 1 }] }}>
                                    <TouchableOpacity
                                        onPress={handleMicPress}
                                        disabled={recordingStatus === 'transcribing' || loading}
                                        style={[styles.inlineBtn, recordingStatus === 'recording' && styles.inlineBtnRec]}
                                        activeOpacity={0.6}
                                    >
                                        {recordingStatus === 'transcribing'
                                            ? <ActivityIndicator size="small" color="#7cce06" />
                                            : <Ionicons
                                                name={recordingStatus === 'recording' ? 'stop' : 'mic-outline'}
                                                size={recordingStatus === 'recording' ? 16 : 20}
                                                color={recordingStatus === 'recording' ? '#fff' : 'rgba(255,255,255,0.4)'}
                                              />}
                                    </TouchableOpacity>
                                </Animated.View>
                            </View>
                        </View>

                        {/* Send */}
                        <TouchableOpacity
                            style={[styles.sendBtn, canSend ? styles.sendActive : styles.sendDim]}
                            onPress={() => sendMessage(input)}
                            disabled={!canSend}
                            activeOpacity={0.75}
                        >
                            <Ionicons name="arrow-up" size={20} color={canSend ? '#fff' : 'rgba(255,255,255,0.2)'} />
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, paddingBottom: 90 },

    // ── Header ──
    header: {
        paddingTop: 56, paddingBottom: 14,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    headerInner: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    aiIconWrap: {
        width: 42, height: 42, borderRadius: 21,
        backgroundColor: 'rgba(124,206,6,0.12)',
        borderWidth: 1.5, borderColor: 'rgba(124,206,6,0.25)',
        justifyContent: 'center', alignItems: 'center',
        overflow: 'hidden',
    },
    aiIcon: { width: 30, height: 30 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
    headerSubtitle: { fontSize: 12, color: 'rgba(124,206,6,0.7)', marginTop: 1 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    headerIconBtn: { position: 'relative', padding: 4 },
    badge: {
        position: 'absolute', top: 0, right: -2,
        width: 15, height: 15, borderRadius: 7.5,
        backgroundColor: '#ff4444', justifyContent: 'center', alignItems: 'center',
    },
    badgeText: { fontSize: 8, fontWeight: 'bold', color: '#fff' },
    headerAvatar: {
        width: 40, height: 40, borderRadius: 20,
        borderWidth: 2, borderColor: 'rgba(124,206,6,0.6)',
    },
    headerAvatarFallback: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(124,206,6,0.2)', borderWidth: 2, borderColor: 'rgba(124,206,6,0.5)',
        justifyContent: 'center', alignItems: 'center',
    },
    headerAvatarLetter: { fontSize: 15, fontWeight: '700', color: '#7cce06' },

    // ── Recording banner ──
    recordingBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        marginHorizontal: 16, marginTop: 8, marginBottom: 4,
        borderRadius: 14, overflow: 'hidden',
        paddingHorizontal: 14, paddingVertical: 10,
        borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)',
    },
    recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff4444' },
    recText: { flex: 1, fontSize: 13, color: '#ff8888', fontWeight: '600', letterSpacing: 0.3 },
    recStopBtn: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: '#ff4444', justifyContent: 'center', alignItems: 'center',
    },

    // ── Empty state ──
    emptyState: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 32, paddingBottom: 30,
    },
    emptyRobotGlow: {
        marginBottom: 28,
        shadowColor: '#7cce06', shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3, shadowRadius: 40,
    },
    robotBig: { width: 160, height: 160 },
    emptyTitle: {
        fontSize: 26, fontWeight: '800', color: '#ffffff',
        textAlign: 'center', letterSpacing: -0.5, marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14, color: 'rgba(255,255,255,0.45)',
        textAlign: 'center', lineHeight: 22, marginBottom: 28,
    },
    chipRow: {
        flexDirection: 'row', flexWrap: 'wrap',
        justifyContent: 'center', gap: 8,
    },
    chip: {
        borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9,
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.25)',
        backgroundColor: 'rgba(124,206,6,0.06)',
    },
    chipText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },

    // ── Scroll ──
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },

    // ── Message rows ──
    row: { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-end' },
    rowBot: { alignSelf: 'flex-start', maxWidth: '85%' },
    rowUser: { alignSelf: 'flex-end', maxWidth: '80%', flexDirection: 'row-reverse' },

    // Bot avatar
    botAvatarWrap: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: 'rgba(124,206,6,0.1)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.18)',
        justifyContent: 'center', alignItems: 'center',
        marginRight: 8,
        overflow: 'hidden',
    },
    botAvatar: { width: 22, height: 22 },

    // Bubbles
    bubble: { borderRadius: 20, overflow: 'hidden' },

    bubbleBot: {
        borderBottomLeftRadius: 6,
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 14, paddingVertical: 10,
    },

    bubbleUser: {
        borderBottomRightRadius: 6,
        backgroundColor: '#7cce06',
        paddingHorizontal: 14, paddingVertical: 10,
    },

    bubbleImg: { width: 200, height: 150, borderRadius: 12, marginBottom: 8 },

    bubbleText: { fontSize: 14.5, lineHeight: 21 },
    bubbleTextBot: { color: 'rgba(255,255,255,0.88)' },
    bubbleTextUser: { color: '#0a1a00' },

    timeText: { fontSize: 10.5, marginTop: 4 },
    timeBot: { color: 'rgba(255,255,255,0.3)' },
    timeUser: { color: 'rgba(10,26,0,0.5)', textAlign: 'right' },

    typingBubble: { paddingVertical: 14, paddingHorizontal: 16 },

    // Pending image preview
    previewBar: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        marginHorizontal: 16, marginBottom: 4,
        borderRadius: 14, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.2)',
        paddingHorizontal: 12, paddingVertical: 8,
    },
    previewThumb: { width: 40, height: 40, borderRadius: 8 },
    previewLabel: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
    previewClose: {
        width: 24, height: 24, borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.12)',
        justifyContent: 'center', alignItems: 'center',
    },

    // ── Input bar ──
    inputBar: {
        paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10,
        borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
    },
    inputRow: {
        flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    },
    inputField: {
        flex: 1, flexDirection: 'row', alignItems: 'flex-end',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        paddingLeft: 16, paddingRight: 6,
        paddingVertical: Platform.OS === 'ios' ? 10 : 4,
        maxHeight: 120,
    },
    textInput: {
        flex: 1, fontSize: 15, color: '#ffffff',
        minHeight: 24, maxHeight: 80,
        paddingTop: Platform.OS === 'ios' ? 0 : 6,
        paddingBottom: Platform.OS === 'ios' ? 0 : 6,
    },
    inlineActions: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 4 },
    inlineBtn: { padding: 6, borderRadius: 16 },
    inlineBtnRec: {
        backgroundColor: '#ff4444', borderRadius: 14,
        width: 28, height: 28,
        justifyContent: 'center', alignItems: 'center',
        padding: 0,
    },

    sendBtn: {
        width: 44, height: 44, borderRadius: 22,
        justifyContent: 'center', alignItems: 'center',
    },
    sendActive: {
        backgroundColor: '#7cce06',
    },
    sendDim: { backgroundColor: 'rgba(255,255,255,0.06)' },
});
