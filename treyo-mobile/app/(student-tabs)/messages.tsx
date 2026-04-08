import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { ScreenBackground } from '../../components/ScreenBackground';
import {useSafeAreaInsets} from "react-native-safe-area-context";

export default function MessagesScreen() {
    const { colors } = useTheme();
    const conversations = [
        { id: 1, trainer: 'John Doe', message: 'See you in class tomorrow!', time: '2h ago', unread: 2, avatar: 'J' },
        { id: 2, trainer: 'Jane Smith', message: 'Great progress on your project!', time: '1d ago', unread: 0, avatar: 'J' },
        { id: 3, trainer: 'Alex Brown', message: 'Don\'t forget the assignment', time: '2d ago', unread: 1, avatar: 'A' },
    ];
    const insets = useSafeAreaInsets();

    return (
        <ScreenBackground style={styles.container}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Messages</Text>
                <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Chat with your trainers</Text>
            </View>

            <ScrollView style={styles.content}>
                {conversations.map(conv => (
                    <TouchableOpacity key={conv.id} style={[styles.conversationCard, { borderBottomColor: colors.border }]}>
                        <View style={styles.avatarContainer}>
                            <Text style={styles.avatarText}>{conv.avatar}</Text>
                        </View>

                        <View style={styles.conversationInfo}>
                            <View style={styles.conversationHeader}>
                                <Text style={[styles.trainerName, { color: colors.text }]}>{conv.trainer}</Text>
                                <Text style={[styles.time, { color: colors.textTertiary }]}>{conv.time}</Text>
                            </View>
                            <View style={styles.messageRow}>
                                <Text style={[styles.lastMessage, { color: colors.textSecondary }]} numberOfLines={1}>
                                    {conv.message}
                                </Text>
                                {conv.unread > 0 && (
                                    <View style={styles.unreadBadge}>
                                        <Text style={styles.unreadText}>{conv.unread}</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    </TouchableOpacity>
                ))}

                {conversations.length === 0 && (
                    <View style={styles.emptyState}>
                        <Ionicons name="mail-outline" size={64} color={colors.textTertiary} />
                        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No messages yet</Text>
                        <Text style={[styles.emptySubtext, { color: colors.textTertiary }]}>Start a conversation with your trainers</Text>
                    </View>
                )}
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, paddingBottom: 100 },
    header: { paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, borderBottomWidth: 1 },
    headerTitle: { fontSize: 24, fontWeight: 'bold' },
    headerSubtitle: { fontSize: 14, marginTop: 4 },
    content: { flex: 1 },
    conversationCard: { flexDirection: 'row', padding: 16, borderBottomWidth: 1 },
    avatarContainer: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#f0fde4', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    avatarText: { fontSize: 20, fontWeight: 'bold', color: '#7cce06' },
    conversationInfo: { flex: 1 },
    conversationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    trainerName: { fontSize: 16, fontWeight: 'bold' },
    time: { fontSize: 12 },
    messageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    lastMessage: { fontSize: 14, flex: 1, marginRight: 8 },
    unreadBadge: { backgroundColor: '#7cce06', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, minWidth: 20, alignItems: 'center' },
    unreadText: { fontSize: 12, color: '#ffffff', fontWeight: 'bold' },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
    emptyText: { fontSize: 18, fontWeight: 'bold', marginTop: 16 },
    emptySubtext: { fontSize: 14, marginTop: 8 },
});