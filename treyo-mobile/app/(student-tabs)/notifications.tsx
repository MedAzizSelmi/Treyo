import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Alert, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as WebBrowser from 'expo-web-browser';
import { ScreenBackground } from '../../components/ScreenBackground';
import { authService, notificationService, enrollmentService, interactionService, paymentService } from '../../services/api';

export default function NotificationsScreen() {
    const { t } = useTranslation();
    const [notifications, setNotifications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [userId, setUserId] = useState<string>('');
    // When set, a modal renders the full title + message of this
    // notification so the user can read past the 2-line preview.
    const [openNotif, setOpenNotif] = useState<any | null>(null);

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
        if (mins < 1) return t('common.now');
        if (mins < 60) return t('common.minAgo', { count: mins });
        const hours = Math.floor(mins / 60);
        if (hours < 24) return t('common.hourAgo', { count: hours });
        return t('common.dayAgo', { count: Math.floor(hours / 24) });
    };

    /** Translate the notification's title + message based on its type.
     *
     *  Two sources of params:
     *    1. `actionData` JSON on the row (set by NotificationService for
     *       every new notification — clean, structured).
     *    2. Regex extraction from the stored English title/message — used
     *       as a backfill for notifications created BEFORE we added the
     *       actionData field, so they still translate cleanly instead of
     *       showing literal "{{course}}" placeholders.
     *
     *  Falls back to the original English title/message if both routes
     *  fail (unknown type, malformed JSON, regex miss). No notification
     *  disappears just because translation fails. */
    const translateNotification = (notif: any) => {
        let params: any = {};
        try {
            if (notif.actionData) {
                params = typeof notif.actionData === 'string'
                    ? JSON.parse(notif.actionData)
                    : notif.actionData;
            }
        } catch (_) {}

        // Regex backfill — only runs if actionData didn't already give
        // us what we need. The patterns match the English strings the
        // backend has historically written, so this keeps old rows
        // working without a migration.
        const title = String(notif.title || '');
        const message = String(notif.message || '');
        const fillFromText = () => {
            switch (notif.notificationType) {
                case 'GROUP_FORMING': {
                    // Two backend variants share the same type code.
                    // Trainer message: "N students are interested in '<course>'"
                    const trainerMsg = message.match(/^(\d+) students? are interested in '([^']+)'/);
                    if (trainerMsg) {
                        if (params.count == null) params.count = Number(trainerMsg[1]);
                        if (!params.course) params.course = trainerMsg[2];
                        return;
                    }
                    // Student message: "We have X/Y students interested in '<course>'"
                    const studentMsg = message.match(/We have (\d+)\/(\d+) students? interested in '([^']+)'/);
                    if (studentMsg) {
                        if (params.current == null) params.current = Number(studentMsg[1]);
                        if (params.min == null) params.min = Number(studentMsg[2]);
                        if (!params.course) params.course = studentMsg[3];
                        return;
                    }
                    // Title: "Group Forming for <course>"
                    const titleMatch = title.match(/Group Forming for (.+)$/);
                    if (titleMatch && !params.course) params.course = titleMatch[1];
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
        };
        fillFromText();

        const typeMap: Record<string, { titleKey: string; messageKey: string }> = {
            GROUP_FORMING: {
                titleKey: 'notifications.groupFormingTitle',
                messageKey: params?.count != null
                    ? 'notifications.groupFormingTrainerMessage'
                    : 'notifications.groupFormingMessage',
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

        // If we still don't have the required params after both lookups,
        // give up on translation for this row and show the original
        // English text — better than literal "{{course}}" placeholders.
        const needsCourse = ['GROUP_FORMING', 'GROUP_READY', 'ONE_TO_ONE_OFFER'].includes(notif.notificationType);
        if (needsCourse && !params.course) {
            return { title: notif.title, message: notif.message };
        }
        if (notif.notificationType === 'NEW_MESSAGE' && !params.sender) {
            return { title: notif.title, message: notif.message };
        }

        const translatedTitle = entry.titleKey ? t(entry.titleKey, params) : notif.title;
        // For NEW_MESSAGE the message is the actual preview text — keep
        // the original since it's user content, not a template.
        const translatedMessage = entry.messageKey ? t(entry.messageKey, params) : notif.message;
        return { title: translatedTitle, message: translatedMessage };
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
                        <Text style={styles.headerTitle}>{t('notifications.title')}</Text>
                        {unreadCount > 0 && (
                            <Text style={styles.headerSubtitle}>{t('notifications.unread', { count: unreadCount })}</Text>
                        )}
                    </View>
                    {unreadCount > 0 && (
                        <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllBtn} activeOpacity={0.7}>
                            <Text style={styles.markAllText}>{t('notifications.markAllRead')}</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {notifications.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <Ionicons name="notifications-off-outline" size={48} color="rgba(124,206,6,0.4)" />
                        </View>
                        <Text style={styles.emptyTitle}>{t('notifications.allCaughtUp')}</Text>
                        <Text style={styles.emptySubtitle}>{t('notifications.noNotificationsBody')}</Text>
                    </View>
                ) : (
                    notifications.map((notif: any) => {
                        const color = getIconColor(notif.notificationType);
                        const actionable = isActionable(notif.notificationType) && !notif.isRead;
                        const localized = translateNotification(notif);
                        return (
                            <TouchableOpacity
                                key={notif.notificationId}
                                style={[styles.card, !notif.isRead && styles.cardUnread]}
                                activeOpacity={0.85}
                                onPress={() => {
                                    // Tapping the card always opens the
                                    // detail modal, and silently marks the
                                    // notification as read if it isn't
                                    // already. Actionable ones keep their
                                    // Confirm / Can't Attend buttons inside
                                    // the modal so the user can decide
                                    // after reading the full message.
                                    setOpenNotif(notif);
                                    if (!notif.isRead && !actionable) {
                                        handleMarkRead(notif.notificationId);
                                    }
                                }}
                            >
                                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />

                                {!notif.isRead && <View style={styles.unreadBar} />}

                                <View style={[styles.iconWrap, { backgroundColor: color + '18' }]}>
                                    <Ionicons name={getIcon(notif.notificationType) as any} size={22} color={color} />
                                </View>

                                <View style={styles.body}>
                                    <View style={styles.titleRow}>
                                        <Text style={styles.title} numberOfLines={1}>{localized.title}</Text>
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
                                        {!notif.isRead && <View style={styles.unreadDot} />}
                                    </View>
                                    <Text style={styles.message} numberOfLines={2}>{localized.message}</Text>
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
                                                        <Text style={styles.confirmText}>{t('notifications.confirm')}</Text>
                                                    )}
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={[styles.declineBtn, isProcessing && { opacity: 0.6 }]}
                                                    onPress={onDecline}
                                                    disabled={isProcessing}
                                                    activeOpacity={0.85}
                                                >
                                                    <Text style={styles.declineText}>{t('notifications.cantAttend')}</Text>
                                                </TouchableOpacity>
                                            </View>
                                        );
                                    })()}

                                    {notif.isRead && (
                                        <Text style={styles.readLabel}>{t('notifications.read')}</Text>
                                    )}
                                </View>
                            </TouchableOpacity>
                        );
                    })
                )}
            </ScrollView>

            {/* ── Notification detail modal ──
                Tapping a card opens this with the full title + message
                + time, so long messages don't get cut off at 2 lines.
                Actionable notifications (GROUP_FORMING etc.) keep their
                Confirm / Can't Attend buttons inside the modal. */}
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
                            const actionable = isActionable(openNotif.notificationType) && !openNotif.isRead;
                            const isGroupForming = openNotif.notificationType === 'GROUP_FORMING';
                            const isProcessing = processingId === openNotif.notificationId;
                            return (
                                <>
                                    <View style={modalStyles.headerRow}>
                                        <View style={[modalStyles.iconWrap, { backgroundColor: color + '18' }]}>
                                            <Ionicons name={getIcon(openNotif.notificationType) as any} size={24} color={color} />
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
                                    {actionable && (
                                        <View style={modalStyles.actions}>
                                            <TouchableOpacity
                                                style={[modalStyles.confirmBtn, isProcessing && { opacity: 0.6 }]}
                                                onPress={() => {
                                                    const n = openNotif;
                                                    setOpenNotif(null);
                                                    if (isGroupForming) handleConfirmGroupForming(n);
                                                    else handleMarkRead(n.notificationId);
                                                }}
                                                disabled={isProcessing}
                                                activeOpacity={0.85}
                                            >
                                                {isProcessing
                                                    ? <ActivityIndicator size="small" color="#000" />
                                                    : <Text style={modalStyles.confirmText}>{t('notifications.confirm')}</Text>}
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[modalStyles.declineBtn, isProcessing && { opacity: 0.6 }]}
                                                onPress={() => {
                                                    const n = openNotif;
                                                    setOpenNotif(null);
                                                    if (isGroupForming) handleDeclineGroupForming(n);
                                                    else handleMarkRead(n.notificationId);
                                                }}
                                                disabled={isProcessing}
                                                activeOpacity={0.85}
                                            >
                                                <Text style={modalStyles.declineText}>{t('notifications.cantAttend')}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
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
    messageScroll: { maxHeight: 260 },
    message: { fontSize: 14, lineHeight: 21, color: 'rgba(255,255,255,0.85)' },
    actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
    confirmBtn: {
        flex: 1, backgroundColor: '#7cce06', borderRadius: 14,
        paddingVertical: 14, alignItems: 'center',
    },
    confirmText: { fontSize: 14, fontWeight: '700', color: '#000' },
    declineBtn: {
        flex: 1, borderRadius: 14, borderWidth: 1, borderColor: '#ff5454',
        paddingVertical: 14, alignItems: 'center',
    },
    declineText: { fontSize: 14, fontWeight: '700', color: '#ff5454' },
});

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
    // "high" sits between normal and urgent — amber rather than red, so
    // the two priorities stay visually distinguishable at a glance.
    highBadge: {
        backgroundColor: 'rgba(255,165,0,0.15)',
        borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
        borderWidth: 1, borderColor: 'rgba(255,165,0,0.3)',
    },
    highText: { fontSize: 10, color: '#ffa500', fontWeight: '700' },
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
