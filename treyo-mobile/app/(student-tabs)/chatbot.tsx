import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { ScreenBackground } from '../../components/ScreenBackground';
import {useSafeAreaInsets} from "react-native-safe-area-context";

export default function ChatbotScreen() {
    const { colors } = useTheme();
    const [messages, setMessages] = useState<any[]>([
        { text: 'Hi! I\'m your AI assistant. How can I help you today?', isBot: true },
    ]);
    const [input, setInput] = useState('');
    const insets = useSafeAreaInsets();

    const sendMessage = async () => {
        if (!input.trim()) return;

        const userMessage = { text: input, isBot: false };
        setMessages([...messages, userMessage]);
        setInput('');

        setTimeout(() => {
            const botResponse = {
                text: 'This is a demo response. Connect me to your AI backend to get real answers!',
                isBot: true
            };
            setMessages(prev => [...prev, botResponse]);
        }, 1000);
    };

    return (
        <ScreenBackground>
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>AI Assistant</Text>
                <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Ask me anything about your learning</Text>
            </View>

            <ScrollView
                style={styles.messagesContainer}
                contentContainerStyle={styles.messagesContent}
            >
                {messages.map((msg, idx) => (
                    <View
                        key={idx}
                        style={[
                            styles.messageBubble,
                            msg.isBot
                                ? [styles.botBubble, { backgroundColor: colors.card }]
                                : styles.userBubble
                        ]}
                    >
                        <Text style={[
                            styles.messageText,
                            { color: msg.isBot ? colors.text : '#ffffff' }
                        ]}>
                            {msg.text}
                        </Text>
                    </View>
                ))}
            </ScrollView>

            <View style={[styles.inputContainer, { borderTopColor: colors.border }]}>
                <TextInput
                    style={[styles.input, { backgroundColor: colors.backgroundSecondary, color: colors.text }]}
                    placeholder="Ask anything..."
                    placeholderTextColor={colors.textTertiary}
                    value={input}
                    onChangeText={setInput}
                    multiline
                />
                <TouchableOpacity
                    style={styles.sendButton}
                    onPress={sendMessage}
                >
                    <Ionicons name="send" size={20} color="#ffffff" />
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, paddingBottom: 100 },
    header: { paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, borderBottomWidth: 1 },
    headerTitle: { fontSize: 24, fontWeight: 'bold' },
    headerSubtitle: { fontSize: 14, marginTop: 4 },
    messagesContainer: { flex: 1 },
    messagesContent: { padding: 20 },
    messageBubble: { maxWidth: '80%', padding: 12, borderRadius: 16, marginBottom: 12 },
    botBubble: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
    userBubble: { backgroundColor: '#7cce06', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
    messageText: { fontSize: 15, lineHeight: 20 },
    inputContainer: { flexDirection: 'row', padding: 16, borderTopWidth: 1, gap: 12, alignItems: 'flex-end' },
    input: { flex: 1, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, maxHeight: 100 },
    sendButton: { width: 48, height: 48, backgroundColor: '#7cce06', borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
});