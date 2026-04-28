import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { ScreenBackground } from '../../components/ScreenBackground';
import { authService, notificationService } from '../../services/api';

export default function NotificationsScreen() {
    const { colors } = useTheme();
    const [notifications, setNotifications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showReasonInput, setShowReasonInput] = useState<string | null>(null);
    const [reason, setReason] = useState('');

    useFocusEffect(
        useCallback(() => {
            loadNotifications();
        }, [])
    );

    const loadNotifications = async () => {
        try {
            const user = await authService.getCurrentUser();
            if (user?.userId) {
                const data = await notificationService.getNotifications(user.userId);
                setNotifications(data || []);
            }
        } catch (e) {
            console.log('Notifications load error', e);
        } finally {
            setLoading(false);
        }
    };

    const handleMarkRead = async (notificationId: string) => {
        try {
            await notificationService.markAsRead(notificationId);
            setNotifications(prev => prev.map(n =>
                n.notificationId === notificationId ? { ...n, isRead: true } : n
            ));
        } catch (e) {
            console.log('Mark read error', e);
        }
    };

    const handleConfirm = (notificationId: string) => {
        Alert.alert('Success', 'Your spot has been confirmed!');
        handleMarkRead(notificationId);
    };

    const handleDecline = (notificationId: string) => {
        setShowReasonInput(notificationId);
    };

    const submitDecline = (notificationId: string) => {
        Alert.alert('Declined', reason ? 'Your reason has been recorded' : 'Declined without reason');
        handleMarkRead(notificationId);
        setShowReasonInput(null);
        setReason('');
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'GROUP_FORMING': return 'people';
            case 'GROUP_READY': return 'checkmark-circle';
            case 'ONE_TO_ONE_OFFER': return 'person';
            case 'ENROLLMENT_CONFIRMED': return 'school';
            case 'NEW_MESSAGE': return 'mail';
            case 'ADMIN_BROADCAST': return 'megaphone';
            default: return 'notifications';
        }
    };

    const getIconColor = (type: string) => {
        switch (type) {
            case 'GROUP_FORMING': return '#7cce06';
            case 'GROUP_READY': return '#7cce06';
            case 'ONE_TO_ONE_OFFER': return '#3b5bdb';
            case 'ENROLLMENT_CONFIRMED': return '#FFA500';
            case 'NEW_MESSAGE': return '#FFA500';
            case 'ADMIN_BROADCAST': return '#ff4444';
            default: return '#aaaaaa';
        }
    };

    const formatTime = (dateStr: string) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    };

    const isActionable = (type: string) =>
        ['GROUP_FORMING', 'ONE_TO_ONE_OFFER', 'GROUP_READY'].includes(type);

    if (loading) {
        return (
            <ScreenBackground style={styles.container}>
                <View style={[styles.header, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
                </View>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#7cce06" />
                </View>
            </ScreenBackground>
        );
    }

    return (
        <ScreenBackground style={styles.container}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
            </View>

            <ScrollView style={styles.content}>
                {notifications.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <Ionicons name="notifications-off-outline" size={48} color="rgba(124,206,6,0.4)" />
                        </View>
                        <Text style={styles.emptyTitle}>No notifications</Text>
                        <Text style={styles.emptySubtitle}>You're all caught up!</Text>
                    </View>
                ) : (
                    notifications.map((notif: any) => (
                        <View
                            key={notif.notificationId}
                            style={[
                                styles.notificationCard,
                                { backgroundColor: colors.card, borderColor: colors.border },
                                !notif.isRead && styles.unreadCard,
                            ]}
                        >
                            <View style={[styles.iconContainer, { backgroundColor: getIconColor(notif.notificationType) + '20' }]}>
                                <Ionicons name={getIcon(notif.notificationType) as any} size={24} color={getIconColor(notif.notificationType)} />
                            </View>

                            <View style={styles.notifContent}>
                                <Text style={[styles.notifTitle, { color: colors.text }]}>{notif.title}</Text>
                                <Text style={[styles.notifDescription, { color: colors.textSecondary }]}>{notif.message}</Text>
                                <Text style={[styles.notifTime, { color: colors.textTertiary }]}>
                                    {formatTime(notif.createdAt)}
                                    {notif.priority === 'high' && '  🔴'}
                                    {notif.priority === 'urgent' && '  🔴🔴'}
                                </Text>

                                {!notif.isRead && isActionable(notif.notificationType) && (
                                    <>
                                        {showReasonInput === notif.notificationId ? (
                                            <View style={styles.reasonContainer}>
                                                <TextInput
                                                    style={[styles.reasonInput, { backgroundColor: colors.backgroundSecondary, color: colors.text }]}
                                                    placeholder="Optional: Tell us why (or leave blank)"
                                                    placeholderTextColor={colors.textTertiary}
                                                    value={reason}
                                                    onChangeText={setReason}
                                                    multiline
                                                />
                                                <View style={styles.reasonButtons}>
                                                    <TouchableOpacity
                                                        style={[styles.button, styles.cancelButton, { backgroundColor: colors.backgroundTertiary }]}
                                                        onPress={() => setShowReasonInput(null)}
                                                    >
                                                        <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Cancel</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={[styles.button, styles.submitButton]}
                                                        onPress={() => submitDecline(notif.notificationId)}
                                                    >
                                                        <Text style={styles.buttonText}>Submit</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        ) : (
                                            <View style={styles.actions}>
                                                <TouchableOpacity
                                                    style={[styles.button, styles.confirmButton]}
                                                    onPress={() => handleConfirm(notif.notificationId)}
                                                >
                                                    <Text style={styles.buttonText}>Confirm</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={[styles.button, styles.declineButton, { backgroundColor: colors.background, borderColor: '#ff6b6b' }]}
                                                    onPress={() => handleDecline(notif.notificationId)}
                                                >
                                                    <Text style={styles.declineButtonText}>Can't Attend</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </>
                                )}

                                {!notif.isRead && !isActionable(notif.notificationType) && (
                                    <TouchableOpacity
                                        style={styles.markReadBtn}
                                        onPress={() => handleMarkRead(notif.notificationId)}
                                    >
                                        <Text style={styles.markReadText}>Mark as read</Text>
                                    </TouchableOpacity>
                                )}

                                {notif.isRead && (
                                    <Text style={styles.respondedText}>✓ Read</Text>
                                )}
                            </View>
                        </View>
                    ))
                )}
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, paddingBottom: 100 },
    header: { paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, borderBottomWidth: 1 },
    headerTitle: { fontSize: 24, fontWeight: 'bold' },
    content: { flex: 1, padding: 20 },
    notificationCard: { flexDirection: 'row', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    unreadCard: { borderColor: 'rgba(124,206,6,0.3)' },
    iconContainer: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    notifContent: { flex: 1 },
    notifTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
    notifDescription: { fontSize: 14, marginBottom: 4 },
    notifTime: { fontSize: 12, marginBottom: 12 },
    actions: { flexDirection: 'row', gap: 8 },
    button: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
    confirmButton: { backgroundColor: '#7cce06' },
    declineButton: { borderWidth: 1 },
    buttonText: { fontSize: 14, fontWeight: '600', color: '#ffffff' },
    declineButtonText: { fontSize: 14, fontWeight: '600', color: '#ff6b6b' },
    respondedText: { fontSize: 14, color: '#7cce06', fontWeight: '600' },
    markReadBtn: { marginTop: 4 },
    markReadText: { fontSize: 13, color: '#7cce06', fontWeight: '600' },
    reasonContainer: { marginTop: 8 },
    reasonInput: { borderRadius: 8, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginBottom: 8 },
    reasonButtons: { flexDirection: 'row', gap: 8 },
    cancelButton: {},
    submitButton: { backgroundColor: '#7cce06' },
    cancelButtonText: { fontSize: 14, fontWeight: '600' },
    emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 24 },
    emptyIconWrap: { width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(124,206,6,0.06)', borderWidth: 1, borderColor: 'rgba(124,206,6,0.12)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff', marginBottom: 8 },
    emptySubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 22 },
});
