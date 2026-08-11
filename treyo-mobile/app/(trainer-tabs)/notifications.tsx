import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenBackground } from '../../components/ScreenBackground';
import { authService, notificationService } from '../../services/api';

export default function TrainerNotificationsScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const [notifications, setNotifications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    // Tapping a card opens this modal with the full title + message
    // so long descriptions aren't truncated.
    const [openNotif, setOpenNotif] = useState<any | null>(null);

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
        if (mins < 1) return t('common.now');
        if (mins < 60) return t('common.minAgo', { count: mins });
        const hours = Math.floor(mins / 60);
        if (hours < 24) return t('common.hourAgo', { count: hours });
        return t('common.dayAgo', { count: Math.floor(hours / 24) });
    };

    /** See student notifications screen for full explanation. Same
     *  actionData + regex-backfill fallback strategy. */
    const translateNotification = (notif: any) => {
        let params: any = {};
        try {
            if (notif.actionData) {
                params = typeof notif.actionData === 'string'
                    ? JSON.parse(notif.actionData)
                    : notif.actionData;
            }
        } catch (_) {}

        const title = String(notif.title || '');
        const message = String(notif.message || '');
        switch (notif.notificationType) {
            case 'GROUP_FORMING': {
                const m = message.match(/^(\d+) students? are interested in '([^']+)'/);
                if (m) {
                    if (params.count == null) params.count = Number(m[1]);
                    if (!params.course) params.course = m[2];
                }
                break;
            }
            case 'GROUP_READY': {
                const m = message.match(/Your group for '([^']+)'/);
                if (m && !params.course) params.course = m[1];
                break;
            }
            case 'ONE_TO_ONE_OFFER': {
                const m = message.match(/one-to-one sessions for '([^']+)'/);
                if (m && !params.course) params.course = m[1];
                break;
            }
            case 'NEW_MESSAGE': {
                const m = title.match(/New Message from (.+)$/);
                if (m && !params.sender) params.sender = m[1];
                break;
            }
        }

        const typeMap: Record<string, { titleKey: string; messageKey: string }> = {
            GROUP_FORMING: {
                titleKey: 'notifications.groupFormingTrainerTitle',
                messageKey: 'notifications.groupFormingTrainerMessage',
            },
            GROUP_READY: {
                titleKey: 'notifications.groupReadyTitle',
                messageKey: 'notifications.groupReadyMessage',
            },
            ONE_TO_ONE_OFFER: {
                titleKey: 'notifications.oneToOneTitle',
                messageKey: 'notifications.oneToOneMessage',
            },
            NEW_MESSAGE: {
                titleKey: 'notifications.newMessageTitle',
                messageKey: '',
            },
        };
        const entry = typeMap[notif.notificationType];
        if (!entry) return { title: notif.title, message: notif.message };

        const needsCourse = ['GROUP_FORMING', 'GROUP_READY', 'ONE_TO_ONE_OFFER'].includes(notif.notificationType);
        if (needsCourse && !params.course) {
            return { title: notif.title, message: notif.message };
        }
        if (notif.notificationType === 'NEW_MESSAGE' && !params.sender) {
            return { title: notif.title, message: notif.message };
        }

        return {
            title: entry.titleKey ? t(entry.titleKey, params) : notif.title,
            message: entry.messageKey ? t(entry.messageKey, params) : notif.message,
        };
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
                        <Text style={styles.headerTitle}>{t('notifications.title')}</Text>
                    </View>
                </View>

                {loading ? (
                    <View style={{ paddingTop: 60, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#7cce06" />
                    </View>
                ) : notifications.length > 0 ? notifications.map((notif: any) => {
                    const localized = translateNotification(notif);
                    return (
                    <TouchableOpacity
                        key={notif.notificationId}
                        style={[styles.notifCard, !notif.isRead && styles.notifCardUnread]}
                        activeOpacity={0.85}
                        onPress={() => {
                            setOpenNotif(notif);
                            if (!notif.isRead) handleMarkRead(notif.notificationId);
                        }}
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
                            <View style={styles.notifTitleRow}>
                                <Text style={styles.notifTitle} numberOfLines={1}>{localized.title}</Text>
                                {notif.priority === 'urgent' && (
                                    <View style={styles.urgentBadge}>
                                        <Text style={styles.urgentText}>{t('notifications.urgent')}</Text>
                                    </View>
                                )}
                                {notif.priority === 'high' && (
                                    <View style={styles.highBadge}>
                                        <Text style={styles.highText}>{t('notifications.high')}</Text>
                                    </View>
                                )}
                            </View>
                            <Text style={styles.notifDesc}>{localized.message}</Text>
                            <Text style={styles.notifTime}>{formatTime(notif.createdAt)}</Text>
                        </View>
                        {!notif.isRead && <View style={styles.unreadDot} />}
                    </TouchableOpacity>
                    );
                }) : (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <Ionicons name="notifications-off-outline" size={48} color="rgba(124,206,6,0.4)" />
                        </View>
                        <Text style={styles.emptyTitle}>{t('notifications.noNotifications')}</Text>
                        <Text style={styles.emptySubtitle}>{t('notifications.allCaughtUp')}</Text>
                    </View>
                )}
            </ScrollView>

            {/* Detail modal — opens on tap so the full message is visible
                instead of being truncated to two lines on the card. */}
            <Modal
                visible={!!openNotif}
                transparent
                animationType="fade"
                onRequestClose={() => setOpenNotif(null)}
            >
                <TouchableOpacity
                    style={modalStyles.backdrop}
                    activeOpacity={1}
                    onPress={() => setOpenNotif(null)}
                >
                    <TouchableOpacity activeOpacity={1} onPress={() => {}} style={modalStyles.cardWrap}>
                        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                        {openNotif && (() => {
                            const localized = translateNotification(openNotif);
                            const color = getIconColor(openNotif.notificationType);
                            return (
                                <>
                                    <View style={modalStyles.headerRow}>
                                        <View style={[modalStyles.iconWrap, { backgroundColor: color + '18' }]}>
                                            <Ionicons name={getIconName(openNotif.notificationType) as any} size={24} color={color} />
                                        </View>
                                        <TouchableOpacity onPress={() => setOpenNotif(null)} style={modalStyles.closeBtn}>
                                            <Ionicons name="close" size={20} color="#ffffff" />
                                        </TouchableOpacity>
                                    </View>
                                    <Text style={modalStyles.title}>{localized.title}</Text>
                                    <Text style={modalStyles.time}>{formatTime(openNotif.createdAt)}</Text>
                                    <ScrollView style={modalStyles.messageScroll} showsVerticalScrollIndicator={false}>
                                        <Text style={modalStyles.message}>{localized.message}</Text>
                                    </ScrollView>
                                </>
                            );
                        })()}
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
        </ScreenBackground>
    );
}

const modalStyles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
    cardWrap: {
        width: '100%',
        maxWidth: 420,
        borderRadius: 22,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        padding: 20,
        maxHeight: '80%',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    iconWrap: {
        width: 48, height: 48, borderRadius: 24,
        alignItems: 'center', justifyContent: 'center',
    },
    closeBtn: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center', justifyContent: 'center',
    },
    title: { fontSize: 17, fontWeight: '700', color: '#ffffff', marginBottom: 6 },
    time: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 14 },
    messageScroll: { maxHeight: 280 },
    message: { fontSize: 14, lineHeight: 21, color: 'rgba(255,255,255,0.85)' },
});

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
    notifTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    urgentBadge: {
        backgroundColor: 'rgba(255,68,68,0.15)',
        borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
        borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)',
    },
    urgentText: { fontSize: 10, color: '#ff4444', fontWeight: '700' },
    highBadge: {
        backgroundColor: 'rgba(255,165,0,0.15)',
        borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
        borderWidth: 1, borderColor: 'rgba(255,165,0,0.3)',
    },
    highText: { fontSize: 10, color: '#ffa500', fontWeight: '700' },

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
