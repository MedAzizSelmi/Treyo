import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
    Image, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useRef, useEffect } from 'react';
import { BlurView } from 'expo-blur';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ScreenBackground } from '../../components/ScreenBackground';
import { authService } from '../../services/api';

// ── Gemini setup ──────────────────────────────────────────────────────────────
const GEMINI_API_KEY = 'AIzaSyCtcpjTLKse7DJ_AGtfRU9YV3pYEdqKmmw';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are Treyo AI, a friendly and knowledgeable assistant built into the Treyo app — a platform that connects students with professional trainers.

Your role is to help students with:
- Finding and enrolling in training sessions or courses
- Understanding their profile, bio, skills, and resume
- Navigating the app (Home, Profile, Sessions, Messages, Chatbot)
- Answering questions about training domains, education, and career development
- Motivating and guiding learners on their journey

Guidelines:
- Be concise, warm, and encouraging
- Use simple, clear language
- If asked about something outside the app's scope, politely redirect
- Address the user by their first name when you know it
- Keep responses under 150 words unless a detailed explanation is truly needed`;

// ── Types ─────────────────────────────────────────────────────────────────────
type Message = {
    id: string;
    text: string;
    isBot: boolean;
    timestamp: Date;
};

type RecordingStatus = 'idle' | 'recording' | 'transcribing';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fileToBase64(uri: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = (reader.result as string).split(',')[1];
                resolve(base64);
            };
            reader.readAsDataURL(xhr.response);
        };
        xhr.onerror = reject;
        xhr.open('GET', uri);
        xhr.responseType = 'blob';
        xhr.send();
    });
}

export default function ChatbotScreen() {
    const [userName, setUserName] = useState('');
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '0',
            text: "Hi! I'm Treyo AI, your personal learning assistant 🤖\nAsk me anything about your training journey, sessions, or the app!",
            isBot: true,
            timestamp: new Date(),
        },
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [autoSpeak, setAutoSpeak] = useState(false);

    const scrollRef = useRef<ScrollView>(null);
    const recordingRef = useRef<Audio.Recording | null>(null);
    const chatRef = useRef<any>(null);

    // Load user name + init Gemini chat session
    useEffect(() => {
        (async () => {
            const user = await authService.getCurrentUser();
            if (user?.name) setUserName(user.name.split(' ')[0]);
        })();

        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        chatRef.current = model.startChat({
            history: [
                { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
                { role: 'model', parts: [{ text: "Understood! I'm ready to assist Treyo students." }] },
            ],
        });
    }, []);

    const scrollToBottom = () => {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    };

    // ── Send text message ────────────────────────────────────────────────────
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
            const prompt = userName ? `[User's name: ${userName}]\n${trimmed}` : trimmed;
            const result = await chatRef.current.sendMessage(prompt);
            const reply = result.response.text();

            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                text: reply,
                isBot: true,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, botMsg]);
            scrollToBottom();

            if (autoSpeak) speakText(reply);
        } catch (err) {
            console.error('Gemini error:', err);
            const errMsg: Message = {
                id: (Date.now() + 1).toString(),
                text: "Sorry, I couldn't reach the AI service right now. Please check your connection and try again.",
                isBot: true,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, errMsg]);
            scrollToBottom();
        } finally {
            setLoading(false);
        }
    };

    // ── Text-to-Speech ───────────────────────────────────────────────────────
    const speakText = (text: string) => {
        Speech.stop();
        setIsSpeaking(true);
        Speech.speak(text, {
            language: 'en-US',
            pitch: 1.0,
            rate: 0.95,
            onDone: () => setIsSpeaking(false),
            onStopped: () => setIsSpeaking(false),
            onError: () => setIsSpeaking(false),
        });
    };

    const stopSpeaking = () => {
        Speech.stop();
        setIsSpeaking(false);
    };

    // ── Voice Recording → Gemini Audio → Transcribe ──────────────────────────
    const startRecording = async () => {
        try {
            const { granted } = await Audio.requestPermissionsAsync();
            if (!granted) {
                Alert.alert('Permission needed', 'Microphone access is required for voice input.');
                return;
            }

            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            recordingRef.current = recording;
            setRecordingStatus('recording');
        } catch (err) {
            console.error('Start recording error:', err);
            Alert.alert('Error', 'Could not start recording. Please try again.');
        }
    };

    const stopRecording = async () => {
        if (!recordingRef.current) return;
        setRecordingStatus('transcribing');

        try {
            await recordingRef.current.stopAndUnloadAsync();
            await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

            const uri = recordingRef.current.getURI();
            recordingRef.current = null;

            if (!uri) throw new Error('No recording URI');

            // Convert audio to base64 and send to Gemini for transcription
            const base64Audio = await fileToBase64(uri);

            const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
            const transcribeResult = await model.generateContent([
                {
                    inlineData: {
                        mimeType: 'audio/m4a',
                        data: base64Audio,
                    },
                },
                { text: 'Transcribe this audio exactly. Return ONLY the spoken words, nothing else.' },
            ]);

            const transcript = transcribeResult.response.text().trim();
            setRecordingStatus('idle');

            if (transcript) {
                setInput(transcript);
                // Auto-send after short delay so user can see the transcript
                setTimeout(() => sendMessage(transcript), 300);
            } else {
                Alert.alert('Could not understand', 'Please try speaking more clearly or type your message.');
            }
        } catch (err) {
            console.error('Stop recording error:', err);
            setRecordingStatus('idle');
            recordingRef.current = null;
            Alert.alert('Error', 'Could not process voice input. Please try again.');
        }
    };

    const handleMicPress = () => {
        if (recordingStatus === 'recording') {
            stopRecording();
        } else if (recordingStatus === 'idle') {
            startRecording();
        }
    };

    // ── Suggested prompts ────────────────────────────────────────────────────
    const suggestions = [
        'What sessions do I have coming up?',
        'How do I edit my profile?',
        'Can you suggest a training domain?',
        'What skills should I add to my resume?',
    ];

    const showSuggestions = messages.length <= 1;

    return (
        <ScreenBackground>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                {/* ── Header ── */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Image
                            source={require('../../assets/images/AI_Robot_small.png')}
                            style={styles.botAvatar}
                            resizeMode="contain"
                        />
                        <View>
                            <Text style={styles.headerTitle}>Treyo AI</Text>
                            <Text style={styles.headerStatus}>
                                {loading ? 'Thinking...' : recordingStatus === 'recording' ? '🔴 Listening...' : recordingStatus === 'transcribing' ? 'Processing voice...' : 'Online'}
                            </Text>
                        </View>
                    </View>
                    {/* Auto-speak toggle */}
                    <TouchableOpacity
                        style={[styles.speakToggle, autoSpeak && styles.speakToggleActive]}
                        onPress={() => setAutoSpeak(v => !v)}
                        activeOpacity={0.8}
                    >
                        <Ionicons
                            name={autoSpeak ? 'volume-high' : 'volume-mute'}
                            size={18}
                            color={autoSpeak ? '#000' : '#ffffff'}
                        />
                    </TouchableOpacity>
                </View>

                {/* ── Messages ── */}
                <ScrollView
                    ref={scrollRef}
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Suggestions */}
                    {showSuggestions && (
                        <View style={styles.suggestionsWrap}>
                            <Text style={styles.suggestLabel}>Try asking:</Text>
                            {suggestions.map((s, i) => (
                                <TouchableOpacity
                                    key={i}
                                    style={styles.suggestionChip}
                                    onPress={() => sendMessage(s)}
                                    activeOpacity={0.75}
                                >
                                    <BlurView intensity={16} tint="dark" style={StyleSheet.absoluteFill} />
                                    <Text style={styles.suggestionText}>{s}</Text>
                                    <Ionicons name="arrow-forward" size={14} color="#7cce06" />
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {messages.map((msg) => (
                        <View
                            key={msg.id}
                            style={[
                                styles.row,
                                msg.isBot ? styles.rowBot : styles.rowUser,
                            ]}
                        >
                            {msg.isBot && (
                                <View style={styles.botIcon}>
                                    <Ionicons name="hardware-chip-outline" size={16} color="#7cce06" />
                                </View>
                            )}
                            <View style={[styles.bubble, msg.isBot ? styles.bubbleBot : styles.bubbleUser]}>
                                {msg.isBot && (
                                    <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
                                )}
                                <Text style={[styles.bubbleText, !msg.isBot && styles.bubbleTextUser]}>
                                    {msg.text}
                                </Text>
                                {/* Speak button for bot messages */}
                                {msg.isBot && (
                                    <TouchableOpacity
                                        style={styles.speakBtn}
                                        onPress={() => isSpeaking ? stopSpeaking() : speakText(msg.text)}
                                    >
                                        <Ionicons
                                            name={isSpeaking ? 'stop-circle-outline' : 'volume-medium-outline'}
                                            size={15}
                                            color="rgba(124,206,6,0.7)"
                                        />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    ))}

                    {/* Typing indicator */}
                    {loading && (
                        <View style={[styles.row, styles.rowBot]}>
                            <View style={styles.botIcon}>
                                <Ionicons name="hardware-chip-outline" size={16} color="#7cce06" />
                            </View>
                            <View style={[styles.bubble, styles.bubbleBot, styles.typingBubble]}>
                                <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
                                <View style={styles.dotsRow}>
                                    <ActivityIndicator size="small" color="#7cce06" />
                                    <Text style={styles.typingText}>Thinking...</Text>
                                </View>
                            </View>
                        </View>
                    )}
                </ScrollView>

                {/* ── Input bar ── */}
                <View style={styles.inputBar}>
                    <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />

                    <View style={styles.inputRow}>
                        <View style={styles.inputWrap}>
                            <TextInput
                                style={styles.textInput}
                                value={input}
                                onChangeText={setInput}
                                placeholder={recordingStatus === 'recording' ? 'Listening...' : 'Ask Treyo AI...'}
                                placeholderTextColor="rgba(255,255,255,0.35)"
                                multiline
                                maxLength={500}
                                onSubmitEditing={() => sendMessage(input)}
                                editable={recordingStatus === 'idle'}
                            />
                        </View>

                        {/* Mic button */}
                        <TouchableOpacity
                            style={[
                                styles.iconBtn,
                                recordingStatus === 'recording' && styles.iconBtnRecording,
                                recordingStatus === 'transcribing' && styles.iconBtnProcessing,
                            ]}
                            onPress={handleMicPress}
                            disabled={recordingStatus === 'transcribing' || loading}
                            activeOpacity={0.8}
                        >
                            {recordingStatus === 'transcribing' ? (
                                <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                                <Ionicons
                                    name={recordingStatus === 'recording' ? 'stop' : 'mic'}
                                    size={20}
                                    color="#ffffff"
                                />
                            )}
                        </TouchableOpacity>

                        {/* Send button */}
                        <TouchableOpacity
                            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
                            onPress={() => sendMessage(input)}
                            disabled={!input.trim() || loading}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="send" size={18} color="#000000" />
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },

    // Header
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    botAvatar: { width: 40, height: 40, borderRadius: 20 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#ffffff' },
    headerStatus: { fontSize: 12, color: '#7cce06', marginTop: 2 },
    speakToggle: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    },
    speakToggleActive: { backgroundColor: '#7cce06', borderColor: '#7cce06' },

    // Scroll
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },

    // Suggestions
    suggestionsWrap: { marginBottom: 20 },
    suggestLabel: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
    suggestionChip: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderRadius: 12, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.25)',
        paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
    },
    suggestionText: { fontSize: 14, color: '#dddddd', flex: 1 },

    // Message rows
    row: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
    rowBot: { alignSelf: 'flex-start', maxWidth: '85%' },
    rowUser: { alignSelf: 'flex-end', maxWidth: '80%', flexDirection: 'row-reverse' },
    botIcon: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: 'rgba(124,206,6,0.12)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.25)',
        justifyContent: 'center', alignItems: 'center',
        marginRight: 8, marginBottom: 2,
    },

    // Bubbles
    bubble: {
        borderRadius: 18, overflow: 'hidden',
        paddingHorizontal: 14, paddingVertical: 10, paddingBottom: 8,
    },
    bubbleBot: {
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.2)',
        borderBottomLeftRadius: 4,
    },
    bubbleUser: {
        backgroundColor: '#7cce06',
        borderBottomRightRadius: 4,
    },
    bubbleText: { fontSize: 15, color: '#e8e8e8', lineHeight: 22 },
    bubbleTextUser: { color: '#000000', fontWeight: '500' },
    speakBtn: { marginTop: 6, alignSelf: 'flex-end' },

    // Typing
    typingBubble: { paddingVertical: 12 },
    dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    typingText: { fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' },

    // Input bar
    inputBar: {
        overflow: 'hidden',
        borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 16, paddingVertical: 12,
        paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    },
    inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
    inputWrap: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 22, borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        paddingHorizontal: 16, paddingVertical: 10,
        maxHeight: 100,
    },
    textInput: { fontSize: 15, color: '#ffffff', minHeight: 22 },

    // Icon + Send buttons
    iconBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
        justifyContent: 'center', alignItems: 'center',
    },
    iconBtnRecording: { backgroundColor: '#ff4444', borderColor: '#ff4444' },
    iconBtnProcessing: { backgroundColor: 'rgba(255,165,0,0.4)', borderColor: 'rgba(255,165,0,0.6)' },
    sendBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: '#7cce06',
        justifyContent: 'center', alignItems: 'center',
    },
    sendBtnDisabled: { opacity: 0.4 },
});
