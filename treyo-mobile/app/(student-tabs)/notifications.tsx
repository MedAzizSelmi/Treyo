import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ScreenBackground } from '../../components/ScreenBackground';
import { authService, notificationService, enrollmentService, interactionService, paymentService } from '../../services/api';

export default function NotificationsScreen() {
    const [notifications, setNotifications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [userId, setUserId] = useState<string>('');

    useFocusEffect(useCallback(() => { loadNotifications(); }, []));

    const loadNotifications = async () => {
        try {
            const user = await authService.getCurrentUser();
            if (user?.userId) {
                setUserId(user.userId);
                const data = await notificationService.getNotifications(user.userId);
                setNotifications(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.log('Notifications load error', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleMarkRead = async (id: string) => {
        try {
            await notificationService.markAsRead(id);
            setNotifications(prev => prev.map(n => n.notificationId === id ? { ...n, isRead: true } : n));
        } catch (_) {}
    };

    /** Student confirms joining the forming group.
     *
     *  Flow:
     *    1. Ask the backend to create a Konnect payment for (student,
     *       course) — returns payUrl + paymentRef.
     *    2. If the course is free (`free: true`), skip the redirect and
     *       call confirmEnrollment with no paymentRef.
     *    3. Otherwise open Konnect's hosted payment page via expo-web-
     *       browser's openAuthSessionAsync, which auto-closes when the
     *       page redirects back to our custom scheme (treyomobile://).
     *    4. Regardless of what the redirect URL claims, call
     *       confirmEnrollment with the paymentRef. The BACKEND verifies
     *       status server-to-server against Konnect's API before creating
     *       the enrollment, so we never trust the client's word for it.
     *
     *  If the user dismisses the browser or Konnect reports a non-completed
     *  status, confirmEnrollment will fail and the notification stays in
     *  its pending state — they can retry.
     */
    const handleConfirmGroupForming = async (notif: any) => {
        const courseId = notif.relatedEntityId;
        if (!userId || !courseId) return;
        setProcessingId(notif.notificationId);
        try {
            // 1. Create the Konnect payment server-side. Even for free
            // courses we call this — the response's `free` flag tells us
            // whether to skip the redirect entirely.
            const payment = await paymentService.createEnrollmentPayment(userId, courseId);

            let paidRef: string | undefined;

            if (!payment.free && payment.payUrl) {
                // 2. Open the Konnect-hosted payment page. openAuthSessionAsync
                // is the right primitive here because:
                //   - it opens a system browser (Chrome Custom Tabs / SFSafariViewController)
                //     for a trusted payment experience
                //   - it watches for the return-url custom scheme and auto-closes
                //     so the user lands back in our app without a manual "done" tap
                //   - the returned result tells us why the browser closed
                //     (success redirect / user dismissal / error)
                const result = await WebBrowser.openAuthSessionAsync(
                    payment.payUrl,
                    'treyomobile://payment-return',
                );

                // User backed out of the browser — silently bail.
                // They can retap "Confirm" to retry.
                if (result.type === 'cancel' || result.type === 'dismiss') {
                    return;
                }
                if (result.type !== 'success') {
                    throw new Error('Payment was not completed');
                }

                paidRef = payment.paymentRef ?? undefined;
            }

            // 3. Confirm the enrollment. For paid courses this triggers
            // a Konnect API lookup on the backend; only "completed"
            // payments whose orderId matches student+course will pass.
            await enrollmentService.confirmEnrollment(userId, courseId, undefined, paidRef);
            await notificationService.markAsRead(notif.notificationId);
            setNotifications(prev => prev.map(n =>
                n.notificationId === notif.notificationId ? { ...n, isRead: true } : n
            ));
            Alert.alert(
                'Confirmed!',
                payment.free
                    ? "You're all set. Once the admin finalises the group, you'll get a notification with the schedule."
                    : "Payment received and your spot is confirmed. You'll get a notification with the schedule once the admin finalises the group.",
            );
        } catch (e: any) {
            const msg = e?.response?.data?.message || e?.message || 'Could not confirm enrollment';
            if (msg.toLowerCase().includes('already enrolled')) {
                await notificationService.markAsRead(notif.notificationId);
                setNotifications(prev => prev.map(n =>
                    n.notificationId === notif.notificationId ? { ...n, isRead: true } : n
                ));
                Alert.alert('Already Confirmed', 'You have already confirmed your spot in this group.');
            } else {
                Alert.alert('Error', msg);
            }
        } finally {
            setProcessingId(null);
        }
    };

    /** Student declines: cancels their interest and marks the notification read. */
    const handleDeclineGroupForming = async (notif: any) => {
        const courseId = notif.relatedEntityId;
        if (!userId || !courseId) return;
        setProcessingId(notif.notificationId);
        try {
            await interactionService.cancelInterest(userId, courseId);
            await notificationService.markAsRead(notif.notificationId);
            setNotifications(prev => prev.map(n =>
                n.notificationId === notif.notificationId ? { ...n, isRead: true } : n
            ));
        } catch (e) {
            console.log('Decline error', e);
        } finally {
            setProcessingId(null);
        }
    };

    const handleMarkAllRead = async () => {
        const unread = notifications.filter(n => !n.isRead);
        await Promise.allSettled(unread.map(n => notificationService.markAsRead(n.notificationId)));
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
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
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 3600000 * 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    };

    const isActionable = (type: string) =>
        ['GROUP_FORMING', 'ONE_TO_ONE_OFFER', 'GROUP_READY'].includes(type);

    const unreadCount = notifications.filter(n => !n.isRead).length;

    if (loading) {
        return (
            <ScreenBackground>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#7cce06" />
                </View>
            </ScreenBackground>
        );
    }

    return (
        <ScreenBackground>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadNotifications(); }} tintColor="#7cce06" colors={['#7cce06']} />
                }
            >
                {/* Header */}
                <View style={styles.header}>
                    <View>
                        <Text style={styles.headerTitle}>Notifications</Text>
                        {unreadCount > 0 && (
                            <Text style={styles.headerSubtitle}>{unreadCount} unread</Text>
                        )}
                    </View>
                    {unreadCount > 0 && (
                        <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllBtn} activeOpacity={0.7}>
                            <Text style={styles.markAllText}>Mark all read</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {notifications.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <Ionicons name="notifications-off-outline" size={48} color="rgba(124,206,6,0.4)" />
                        </View>
                        <Text style={styles.emptyTitle}>You're all caught up!</Text>
                        <Text style={styles.emptySubtitle}>No notifications right now. Pull down to refresh.</Text>
                    </View>
                ) : (
                    notifications.map((notif: any) => {
                        const color = getIconColor(notif.notificationType);
                        const actionable = isActionable(notif.notificationType) && !notif.isRead;
                        return (
                            <TouchableOpacity
                                key={notif.notificationId}
                                style={[styles.card, !notif.isRead && styles.cardUnread]}
                                activeOpacity={notif.isRead ? 1 : 0.85}
                                onPress={() => !notif.isRead && !actionable && handleMarkRead(notif.notificationId)}
                            >
                                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />

                                {!notif.isRead && <View style={styles.unreadBar} />}

                                <View style={[styles.iconWrap, { backgroundColor: color + '18' }]}>
                                    <Ionicons name={getIcon(notif.notificationType) as any} size={22} color={color} />
                                </View>

                                <View style={styles.body}>
                                    <View style={styles.titleRow}>
                                        <Text style={styles.title} numberOfLines={1}>{notif.title}</Text>
                                        {notif.priority === 'urgent' && (
                                            <View style={styles.urgentBadge}>
                                                <Text style={styles.urgentText}>Urgent</Text>
                                            </View>
                                        )}
                                        {!notif.isRead && <View style={styles.unreadDot} />}
                                    </View>
                                    <Text style={styles.message} numberOfLines={2}>{notif.message}</Text>
                                    <Text style={styles.time}>{formatTime(notif.createdAt)}</Text>

                                    {actionable && (() => {
                                        const isGroupForming = notif.notificationType === 'GROUP_FORMING';
                                        const isProcessing = processingId === notif.notificationId;
                                        const onConfirm = isGroupForming
                                            ? () => handleConfirmGroupForming(notif)
                                            : () => handleMarkRead(notif.notificationId);
                                        const onDecline = isGroupForming
                                            ? () => handleDeclineGroupForming(notif)
                                            : () => handleMarkRead(notif.notificationId);
                                        return (
                                            <View style={styles.actions}>
                                                <TouchableOpacity
                                                    style={[styles.confirmBtn, isProcessing && { opacity: 0.6 }]}
                                                    onPress={onConfirm}
                                                    disabled={isProcessing}
                                                    activeOpacity={0.85}
                                                >
                                                    {isProcessing ? (
                                                        <ActivityIndicator size="small" color="#000" />
                                                    ) : (
                                                        <Text style={styles.confirmText}>Confirm</Text>
                                                    )}
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={[styles.declineBtn, isProcessing && { opacity: 0.6 }]}
                                                    onPress={onDecline}
                                                    disabled={isProcessing}
                                                    activeOpacity={0.85}
                                                >
                                                    <Text style={styles.declineText}>Can't Attend</Text>
                                                </TouchableOpacity>
                                            </View>
                                        );
                                    })()}

                                    {notif.isRead && (
                                        <Text style={styles.readLabel}>✓ Read</Text>
                                    )}
                                </View>
                            </TouchableOpacity>
                        );
                    })
                )}
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 120, paddingHorizontal: 20 },

    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
        paddingTop: 60, marginBottom: 20,
    },
    headerTitle: { fontSize: 26, fontWeight: '800', color: '#ffffff' },
    headerSubtitle: { fontSize: 13, color: '#7cce06', marginTop: 2 },
    markAllBtn: {
        paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: 10, borderWidth: 1, borderColor: 'rgba(124,206,6,0.3)',
        backgroundColor: 'rgba(124,206,6,0.08)',
    },
    markAllText: { fontSize: 12, color: '#7cce06', fontWeight: '600' },

    card: {
        flexDirection: 'row', alignItems: 'flex-start',
        borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        padding: 14, marginBottom: 10,
    },
    cardUnread: { borderColor: 'rgba(124,206,6,0.25)' },
    unreadBar: {
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: 3, backgroundColor: '#7cce06',
    },
    iconWrap: {
        width: 44, height: 44, borderRadius: 22,
        justifyContent: 'center', alignItems: 'center',
        marginRight: 12, flexShrink: 0,
    },
    body: { flex: 1 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
    title: { flex: 1, fontSize: 14, fontWeight: '700', color: '#ffffff' },
    urgentBadge: {
        backgroundColor: 'rgba(255,68,68,0.15)',
        borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
        borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)',
    },
    urgentText: { fontSize: 10, color: '#ff4444', fontWeight: '700' },
    unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#7cce06' },
    message: { fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 19, marginBottom: 4 },
    time: { fontSize: 11, color: 'rgba(255,255,255,0.3)' },
    readLabel: { fontSize: 11, color: '#7cce06', marginTop: 4, fontWeight: '600' },

    actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
    confirmBtn: {
        flex: 1, backgroundColor: '#7cce06',
        borderRadius: 10, paddingVertical: 8, alignItems: 'center',
    },
    confirmText: { fontSize: 13, fontWeight: '700', color: '#000' },
    declineBtn: {
        flex: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center',
        borderWidth: 1, borderColor: 'rgba(255,107,107,0.4)',
        backgroundColor: 'rgba(255,107,107,0.08)',
    },
    declineText: { fontSize: 13, fontWeight: '600', color: '#ff6b6b' },

    emptyState: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 24 },
    emptyIconWrap: {
        width: 88, height: 88, borderRadius: 44,
        backgroundColor: 'rgba(124,206,6,0.06)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.12)',
        justifyContent: 'center', alignItems: 'center', marginBottom: 20,
    },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff', marginBottom: 8 },
    emptySubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 22 },
});
