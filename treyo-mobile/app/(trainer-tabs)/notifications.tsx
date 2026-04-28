import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { ScreenBackground } from '../../components/ScreenBackground';
import { authService, notificationService } from '../../services/api';

export default function TrainerNotificationsScreen() {
    const router = useRouter();
    const [notifications, setNotifications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

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
            console.log('Trainer notifications load error', e);
        } finally {
            setLoading(false);
        }
    };

    const handleMarkRead = async (notificationId: string) => {
        try {
            await notificationService.markAsRead(notificationId);
            setNotifications(prev =>
                prev.map(n => n.notificationId === notificationId ? { ...n, isRead: true } : n)
            );
        } catch (e) {
            console.log('Mark read error', e);
        }
    };

    const getIconName = (type: string) => {
        switch (type) {
            case 'NEW_STUDENT_REQUEST': return 'person-add';
            case 'GROUP_FORMING': return 'people';
            case 'GROUP_READY': return 'checkmark-circle';
            case 'SESSION_CONFIRMED': return 'calendar';
            case 'NEW_MESSAGE': return 'mail';
            case 'ENROLLMENT_CONFIRMED': return 'school';
            case 'ADMIN_BROADCAST': return 'megaphone';
            default: return 'notifications';
        }
    };

    const getIconColor = (type: string) => {
        switch (type) {
            case 'NEW_STUDENT_REQUEST': return '#7cce06';
            case 'GROUP_FORMING': return '#7cce06';
            case 'GROUP_READY': return '#7cce06';
            case 'SESSION_CONFIRMED': return '#3b5bdb';
            case 'NEW_MESSAGE': return '#FFA500';
            case 'ENROLLMENT_CONFIRMED': return '#FFA500';
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

    return (
        <ScreenBackground>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Header ── */}
                <View style={styles.header}>
                    <View style={styles.headerRow}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                            <Ionicons name="arrow-back" size={22} color="#ffffff" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Notifications</Text>
                    </View>
                </View>

                {loading ? (
                    <View style={{ paddingTop: 60, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#7cce06" />
                    </View>
                ) : notifications.length > 0 ? notifications.map((notif: any) => (
                    <TouchableOpacity
                        key={notif.notificationId}
                        style={[styles.notifCard, !notif.isRead && styles.notifCardUnread]}
                        activeOpacity={0.85}
                        onPress={() => !notif.isRead && handleMarkRead(notif.notificationId)}
                    >
                        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                        <View style={[styles.notifIconWrap, { backgroundColor: getIconColor(notif.notificationType) + '20' }]}>
                            <Ionicons
                                name={getIconName(notif.notificationType) as any}
                                size={22}
                                color={getIconColor(notif.notificationType)}
                            />
                        </View>
                        <View style={styles.notifContent}>
                            <Text style={styles.notifTitle}>{notif.title}</Text>
                            <Text style={styles.notifDesc}>{notif.message}</Text>
                            <Text style={styles.notifTime}>{formatTime(notif.createdAt)}</Text>
                        </View>
                        {!notif.isRead && <View style={styles.unreadDot} />}
                    </TouchableOpacity>
                )) : (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <Ionicons name="notifications-off-outline" size={48} color="rgba(124,206,6,0.4)" />
                        </View>
                        <Text style={styles.emptyTitle}>No notifications</Text>
                        <Text style={styles.emptySubtitle}>You're all caught up!</Text>
                    </View>
                )}
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 120, paddingHorizontal: 20 },

    header: { paddingTop: 56, marginBottom: 20 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    backBtn: { padding: 2 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff' },

    notifCard: {
        flexDirection: 'row', alignItems: 'center',
        borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        padding: 14, marginBottom: 10,
    },
    notifCardUnread: { borderColor: 'rgba(124,206,6,0.3)' },
    notifIconWrap: {
        width: 46, height: 46, borderRadius: 23,
        justifyContent: 'center', alignItems: 'center', marginRight: 14,
    },
    notifContent: { flex: 1 },
    notifTitle: { fontSize: 15, fontWeight: '700', color: '#ffffff', marginBottom: 3 },
    notifDesc: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 3, lineHeight: 19 },
    notifTime: { fontSize: 11, color: 'rgba(255,255,255,0.3)' },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#7cce06', marginLeft: 8 },

    emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 24 },
    emptyIconWrap: {
        width: 88, height: 88, borderRadius: 44,
        backgroundColor: 'rgba(124,206,6,0.06)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.12)',
        justifyContent: 'center', alignItems: 'center', marginBottom: 20,
    },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff', marginBottom: 8 },
    emptySubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 22 },
});
