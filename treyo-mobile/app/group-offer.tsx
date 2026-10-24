import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as WebBrowser from 'expo-web-browser';
import { ScreenBackground } from '../components/ScreenBackground';
import { formatAmount, isPricedExclVat } from '../utils/price';
import {
    authService, courseService, groupService, enrollmentService, paymentService, notificationService,
} from '../services/api';

type Session = { date: string; time: string; hours: number };

/**
 * A group is open for payment: its dates, its price, and the button that
 * joins it.
 *
 * Reached from the GROUP_PAYMENT_OPEN notification of the automated group
 * flow (October 2026). Learners now see the schedule before they pay,
 * rather than paying for a group whose dates the trainer had not set yet.
 * Payment is final — LeanConsulting does not refund — so the screen says
 * so before the button, not after.
 *
 * Whether the group can still be joined (approved, not started, not full)
 * is decided by the server when the payment is created; its message is
 * shown as it is.
 */
export default function GroupOfferScreen() {
    const router = useRouter();
    const { t, i18n } = useTranslation();
    const { groupId, courseId: courseParam, notificationId } = useLocalSearchParams<{
        groupId: string; courseId?: string; notificationId?: string;
    }>();

    const [group, setGroup] = useState<any>(null);
    const [course, setCourse] = useState<any>(null);
    const [userId, setUserId] = useState('');
    const [loading, setLoading] = useState(true);
    const [paying, setPaying] = useState(false);
    const courseId = courseParam || group?.courseId;

    useEffect(() => {
        (async () => {
            try {
                const [user, g] = await Promise.all([
                    authService.getCurrentUser(),
                    groupService.getGroup(String(groupId)),
                ]);
                setUserId(user?.userId || '');
                setGroup(g);
                setCourse(await courseService.getCourseById(String(courseId || g?.courseId)));
            } catch (e) {
                console.log('Group offer load error', e);
            } finally {
                setLoading(false);
            }
        })();
    }, [groupId, courseParam]);

    const sessions: Session[] = (() => {
        try {
            const parsed = group?.meetingSchedule ? JSON.parse(group.meetingSchedule) : null;
            const list: Session[] = Array.isArray(parsed?.sessions) ? parsed.sessions : [];
            return [...list].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
        } catch {
            return [];
        }
    })();

    const formatDay = (date: string) => {
        const d = new Date(`${date}T00:00:00`);
        return isNaN(d.getTime())
            ? date
            : d.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
    };

    const markDone = async () => {
        if (notificationId) {
            try { await notificationService.markAsRead(String(notificationId)); } catch (_) {}
        }
    };

    /** Same order as every other payment in the app: the server creates
     *  the payment (refusing it if the group can no longer be joined), the
     *  card is typed on ClicToPay's page, and the server asks the gateway
     *  whether it was paid before enrolling. How the browser closed is not
     *  evidence either way. */
    const handlePay = async () => {
        if (!userId || !courseId || paying) return;
        setPaying(true);
        try {
            const payment = await paymentService.createEnrollmentPayment(userId, String(courseId), String(groupId));
            let paidRef: string | undefined;
            if (!payment.free && payment.payUrl) {
                await WebBrowser.openAuthSessionAsync(payment.payUrl, 'treyomobile://payment-return');
                paidRef = payment.paymentRef ?? undefined;
            }
            await enrollmentService.confirmEnrollment(userId, String(courseId), String(groupId), paidRef);
            await markDone();
            Alert.alert(t('groupOffer.joinedTitle'), t('groupOffer.joinedBody'), [
                { text: t('common.ok'), onPress: () => router.replace({ pathname: '/course-detail' as any, params: { courseId } }) },
            ]);
        } catch (e: any) {
            const msg: string = e?.response?.data?.message || e?.response?.data?.error || e?.message || '';
            const low = msg.toLowerCase();
            if (low.includes('payment not completed') || low.includes('payment not found') || low.includes('payment required')) {
                Alert.alert(t('groupOffer.notPaidTitle'), t('groupOffer.notPaidBody'));
            } else if (low.includes('already enrolled')) {
                await markDone();
                Alert.alert(t('groupOffer.joinedTitle'), t('groupOffer.alreadyJoined'));
            } else if (low.includes('is full')) {
                Alert.alert(t('common.error'), t('groupOffer.full'));
            } else if (low.includes('already started')) {
                Alert.alert(t('common.error'), t('groupOffer.alreadyStarted'));
            } else if (low.includes('not open for enrollment')) {
                Alert.alert(t('common.error'), t('groupOffer.notOpen'));
            } else {
                Alert.alert(t('common.error'), msg || t('groupOffer.payFailed'));
            }
        } finally {
            setPaying(false);
        }
    };

    if (loading) {
        return (
            <ScreenBackground>
                <View style={styles.center}><ActivityIndicator size="large" color="#7cce06" /></View>
            </ScreenBackground>
        );
    }

    if (!group || !course) {
        return (
            <ScreenBackground>
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={56} color="rgba(255,255,255,0.3)" />
                    <Text style={styles.emptyText}>{t('groupOffer.notFound')}</Text>
                    <TouchableOpacity onPress={() => router.back()}>
                        <Text style={styles.link}>{t('course.goBack')}</Text>
                    </TouchableOpacity>
                </View>
            </ScreenBackground>
        );
    }

    const price = Number(course.price ?? 0);
    const currency = course.currency || 'TND';
    const exclVat = isPricedExclVat(course);
    const total = course.priceInclVat != null ? Number(course.priceInclVat) : price;
    const open = group.stage === 'open_for_payment';
    const totalHours = sessions.reduce((sum, s) => sum + Number(s.hours || 0), 0);
    const seatsLeft = group.maxSize != null && group.currentSize != null
        ? Math.max(Number(group.maxSize) - Number(group.currentSize), 0)
        : null;

    return (
        <ScreenBackground>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={20} color="#ffffff" />
                </TouchableOpacity>

                <Text style={styles.kicker}>{t('groupOffer.kicker')}</Text>
                <Text style={styles.title}>{course.title}</Text>
                <Text style={styles.subtitle}>
                    {t('groupOffer.summary', { count: sessions.length, hours: totalHours })}
                    {seatsLeft != null ? ` · ${t('groupOffer.seatsLeft', { count: seatsLeft })}` : ''}
                </Text>

                <View style={styles.card}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <Text style={styles.cardTitle}>{t('groupOffer.sessions')}</Text>
                    {sessions.length === 0 ? (
                        <Text style={styles.muted}>{t('groupOffer.noSessions')}</Text>
                    ) : sessions.map((s, i) => (
                        <View key={`${s.date}-${s.time}`} style={[styles.sessionRow, i > 0 && styles.sessionDivider]}>
                            <View style={styles.sessionNum}>
                                <Text style={styles.sessionNumText}>{i + 1}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.sessionDay}>{formatDay(s.date)}</Text>
                                <Text style={styles.sessionTime}>
                                    {s.time} · {t('groupOffer.hours', { count: Number(s.hours || 0) })}
                                </Text>
                            </View>
                        </View>
                    ))}
                </View>

                <View style={styles.card}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <Text style={styles.cardTitle}>{t('groupOffer.price')}</Text>
                    <Text style={styles.priceValue}>
                        {price === 0 ? t('common.free') : `${formatAmount(price)} ${currency}`}
                        {exclVat && <Text style={styles.priceTax}> {t('course.priceExclVat')}</Text>}
                    </Text>
                    {exclVat && (
                        <Text style={styles.muted}>
                            {t('course.priceInclVat', { amount: formatAmount(total), currency })}
                        </Text>
                    )}
                    {price > 0 && (
                        <View style={styles.notice}>
                            <Ionicons name="information-circle-outline" size={18} color="#ffa500" />
                            <Text style={styles.noticeText}>{t('groupOffer.noRefund')}</Text>
                        </View>
                    )}
                </View>

                {!open && (
                    <Text style={styles.closedText}>
                        {group.stage === 'started' ? t('groupOffer.alreadyStarted') : t('groupOffer.notOpen')}
                    </Text>
                )}

                <TouchableOpacity
                    style={[styles.payBtn, (!open || paying) && { opacity: 0.5 }]}
                    onPress={handlePay}
                    disabled={!open || paying}
                    activeOpacity={0.85}
                >
                    {paying ? (
                        <ActivityIndicator size="small" color="#000" />
                    ) : (
                        <Text style={styles.payText}>
                            {price === 0
                                ? t('groupOffer.joinFree')
                                : t('groupOffer.payAndJoin', { amount: formatAmount(total), currency })}
                        </Text>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 24 },
    emptyText: { color: 'rgba(255,255,255,0.6)', fontSize: 15, textAlign: 'center' },
    link: { color: '#7cce06', fontSize: 14, fontWeight: '600' },

    scrollContent: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 48 },
    backBtn: {
        width: 40, height: 40, borderRadius: 20, marginBottom: 18,
        backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center',
    },
    kicker: { color: '#7cce06', fontSize: 13, fontWeight: '700', marginBottom: 6 },
    title: { color: '#ffffff', fontSize: 24, fontWeight: '800', marginBottom: 6 },
    subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 20 },

    card: {
        borderRadius: 18, overflow: 'hidden', padding: 16, marginBottom: 14,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },
    cardTitle: { color: '#ffffff', fontSize: 15, fontWeight: '700', marginBottom: 12 },
    muted: { color: 'rgba(255,255,255,0.55)', fontSize: 13 },

    sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    sessionDivider: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
    sessionNum: {
        width: 30, height: 30, borderRadius: 15,
        backgroundColor: 'rgba(124,206,6,0.15)', alignItems: 'center', justifyContent: 'center',
    },
    sessionNumText: { color: '#7cce06', fontWeight: '700', fontSize: 13 },
    sessionDay: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
    sessionTime: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 2 },

    priceValue: { color: '#ffffff', fontSize: 22, fontWeight: '800', marginBottom: 4 },
    priceTax: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '600' },
    notice: {
        flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 14,
        padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,165,0,0.08)',
        borderWidth: 1, borderColor: 'rgba(255,165,0,0.25)',
    },
    noticeText: { flex: 1, color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 19 },

    closedText: { color: '#ff8a8a', fontSize: 13, textAlign: 'center', marginBottom: 12 },
    payBtn: {
        backgroundColor: '#7cce06', borderRadius: 16, paddingVertical: 16,
        alignItems: 'center', marginTop: 6,
    },
    payText: { color: '#000', fontSize: 16, fontWeight: '800' },
});
