import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenBackground } from '../components/ScreenBackground';
import { authService, enrollmentService, downloadReceipt } from '../services/api';

/**
 * Payment history.
 *
 * There is no transactions table: an enrollment IS the receipt. It carries
 * amountPaid and paidAt, written only after the backend verified the
 * payment with ClicToPay, so that is what a row displays. The course price
 * is the fallback for rows created before the gateway existed, and the
 * currency comes from the course — never hard-coded, since the platform
 * bills in TND.
 */
export default function PaymentsScreen() {
    const router = useRouter();
    const { t, i18n } = useTranslation();
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const user = await authService.getCurrentUser();
                if (!user?.userId) { setLoading(false); return; }
                const data = await enrollmentService.getStudentEnrollments(user.userId);
                setItems(Array.isArray(data) ? data : []);
            } catch (_) {
                setItems([]);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    /** What this enrollment cost: what was charged, or the listed price. */
    const amountOf = (e: any) =>
        Number(e.amountPaid ?? 0) > 0 ? Number(e.amountPaid) : Number(e.coursePrice ?? 0);
    /** All courses are priced in one currency today; fall back to TND. */
    const currency = items.find(e => e.courseCurrency)?.courseCurrency ?? 'TND';
    const money = (n: number) => `${n.toFixed(2)} ${currency}`;

    // Which receipt is being fetched, so only that row spins.
    const [receiptFor, setReceiptFor] = useState<string | null>(null);

    /**
     * Fetch and share the PDF. The same document was emailed when the
     * payment completed; this is for the day they need it again and
     * cannot find the email.
     */
    const getReceipt = async (enrollmentId: string) => {
        setReceiptFor(enrollmentId);
        try {
            const shared = await downloadReceipt(enrollmentId);
            if (!shared) {
                Alert.alert(t('payments.receipt'), t('payments.receiptNoShare'));
            }
        } catch (e: any) {
            Alert.alert(t('payments.receipt'), e?.message || t('payments.receiptFailed'));
        } finally {
            setReceiptFor(null);
        }
    };

    /**
     * A receipt is dated by when the money moved, so paidAt wins and
     * enrolledAt is the fallback for free courses, which never have one.
     */
    const dateOf = (e: any) => {
        const when = e.paidAt || e.enrolledAt;
        return when ? new Date(when).toLocaleDateString(i18n.language || undefined) : '';
    };

    /**
     * The payment's status, not the enrolment's.
     *
     * This row used to show enrollmentStatus, so a refunded payment still
     * read "confirmed" — the enrolment was, the payment was not. Only
     * states other than a plain "paid" are worth the pixels.
     */
    const statusLabel = (e: any) => {
        const status = String(e.paymentStatus || '').toLowerCase();
        if (!status || status === 'paid' || status === 'unpaid') return '';
        return t(`payments.status.${status}`, { defaultValue: status });
    };

    /**
     * "VISA ••••1234", from the only two card fields the server keeps.
     * Null for free enrolments, and for payments taken before these were
     * captured — in which case nothing is shown rather than a guess.
     */
    const methodOf = (e: any) => {
        const brand = e.cardBrand ? String(e.cardBrand) : '';
        const last4 = e.cardLast4 ? String(e.cardLast4) : '';
        if (!brand && !last4) return '';
        return `${brand}${brand && last4 ? ' ' : ''}${last4 ? `••••${last4}` : ''}`.trim();
    };

    const totalSpent = items.reduce((sum, e) => sum + amountOf(e), 0);
    const paidCount = items.filter(e => amountOf(e) > 0).length;

    return (
        <ScreenBackground>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color="#ffffff" />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>{t('settings.paymentHistory')}</Text>
                        <Text style={styles.headerSubtitle}>{t('payments.subtitle')}</Text>
                    </View>
                </View>

                {/* Summary card */}
                <View style={styles.summaryCard}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.summaryItem}>
                        <Text style={styles.summaryLabel}>{t('payments.totalSpent')}</Text>
                        <Text style={styles.summaryValue}>{money(totalSpent)}</Text>
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryItem}>
                        <Text style={styles.summaryLabel}>{t('payments.paidCourses')}</Text>
                        <Text style={styles.summaryValue}>{paidCount}</Text>
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryItem}>
                        <Text style={styles.summaryLabel}>{t('payments.totalCourses')}</Text>
                        <Text style={styles.summaryValue}>{items.length}</Text>
                    </View>
                </View>

                {/* There is deliberately no "add a payment method" here.
                    It used to offer one, badged "Soon", opening an alert
                    saying it would arrive with payment processing — but
                    saving a card is not something this app can ever do.
                    Cards are typed on ClicToPay's hosted page and never
                    reach our servers, and their anti-fraud terms forbid
                    storing the number, the CVV or the expiry date. A
                    card on file would need the gateway's own tokenisation
                    feature, contracted separately. Promising it on a
                    settings screen was promising the wrong thing. */}

                {/* Transactions */}
                <Text style={styles.sectionLabel}>{t('payments.transactions')}</Text>

                {loading ? (
                    <View style={{ paddingTop: 40, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#7cce06" />
                    </View>
                ) : items.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <Ionicons name="card-outline" size={42} color="rgba(124,206,6,0.4)" />
                        </View>
                        <Text style={styles.emptyTitle}>{t('payments.noTransactions')}</Text>
                        <Text style={styles.emptySubtitle}>{t('payments.noTransactionsBody')}</Text>
                    </View>
                ) : (
                    items.map((e: any, i: number) => {
                        const price = amountOf(e);
                        const free = price === 0;
                        return (
                            <View key={e.enrollmentId || i} style={styles.txnCard}>
                                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                <View style={[styles.txnIconWrap, free && { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                                    <Ionicons name={free ? 'gift-outline' : 'card-outline'} size={22} color={free ? '#aaaaaa' : '#7cce06'} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.txnTitle} numberOfLines={1}>
                                        {e.courseTitle || e.courseName || t('home.course')}
                                    </Text>
                                    {/* paidAt, not enrolledAt: this is a
                                        receipt, so the date that matters is
                                        when the money moved. Free courses
                                        have no paidAt and fall back. */}
                                    <Text style={styles.txnDate}>
                                        {dateOf(e)}
                                        {statusLabel(e) ? ` · ${statusLabel(e)}` : ''}
                                    </Text>
                                    {/* Brand and last four are all we hold —
                                        see the note above on why. Absent for
                                        free enrolments and for payments made
                                        before this was captured. */}
                                    {!free && methodOf(e) && (
                                        <Text style={styles.txnMethod}>{methodOf(e)}</Text>
                                    )}
                                    {/* The reference a learner needs to quote
                                        to support, and the one piece of
                                        evidence a chargeback turns on. */}
                                    {!!e.paymentRef && (
                                        <Text style={styles.txnRef} selectable numberOfLines={1}>
                                            {t('payments.reference')}: {e.paymentRef}
                                        </Text>
                                    )}
                                </View>
                                <View style={styles.txnRight}>
                                    <Text style={[styles.txnPrice, free && { color: '#aaaaaa' }]}>
                                        {free ? t('payments.free') : money(price)}
                                    </Text>
                                    {/* Only paid rows have a receipt. The same
                                        PDF was emailed when the payment went
                                        through; this is for when that email
                                        cannot be found. */}
                                    {!free && !!e.enrollmentId && (
                                        <TouchableOpacity
                                            style={styles.receiptBtn}
                                            onPress={() => getReceipt(e.enrollmentId)}
                                            disabled={receiptFor === e.enrollmentId}
                                            hitSlop={8}
                                        >
                                            {receiptFor === e.enrollmentId ? (
                                                <ActivityIndicator size="small" color="#7cce06" />
                                            ) : (
                                                <>
                                                    <Ionicons name="download-outline" size={13} color="#7cce06" />
                                                    <Text style={styles.receiptBtnText}>
                                                        {t('payments.receipt')}
                                                    </Text>
                                                </>
                                            )}
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        );
                    })
                )}

                <View style={styles.noteWrap}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <Ionicons name="lock-closed-outline" size={16} color="#7cce06" />
                    <Text style={styles.noteText}>
                        All transactions will be processed securely once a payment processor is connected. You'll always receive an email receipt.
                    </Text>
                </View>
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 60, paddingHorizontal: 20 },

    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, marginBottom: 20 },
    backBtn: { padding: 2 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff' },
    headerSubtitle: { fontSize: 13, color: '#aaaaaa', marginTop: 2 },

    summaryCard: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderRadius: 18, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.25)',
        paddingVertical: 16, paddingHorizontal: 12,
        marginBottom: 8,
    },
    summaryItem: { flex: 1, alignItems: 'center' },
    summaryLabel: { fontSize: 11, color: '#aaaaaa', marginBottom: 4 },
    summaryValue: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
    summaryDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.1)' },

    sectionLabel: { fontSize: 11, fontWeight: '700', color: '#7cce06', letterSpacing: 0.6, marginBottom: 8, marginTop: 16 },
    card: {
        borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },

    txnCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        borderRadius: 14, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 14, paddingVertical: 12,
        marginBottom: 8,
    },
    txnIconWrap: {
        width: 42, height: 42, borderRadius: 12,
        backgroundColor: 'rgba(124,206,6,0.12)',
        justifyContent: 'center', alignItems: 'center',
    },
    txnTitle: { fontSize: 14, fontWeight: '600', color: '#ffffff' },
    txnDate: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
    txnRight: { alignItems: 'flex-end', gap: 6 },
    receiptBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    receiptBtnText: { fontSize: 11, color: '#7cce06', fontWeight: '600' },
    txnMethod: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 3, letterSpacing: 0.4 },
    txnRef: { fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 },
    txnPrice: { fontSize: 15, fontWeight: '700', color: '#7cce06' },

    emptyState: { alignItems: 'center', paddingTop: 40, paddingBottom: 20, paddingHorizontal: 24 },
    emptyIconWrap: {
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: 'rgba(124,206,6,0.06)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.12)',
        justifyContent: 'center', alignItems: 'center', marginBottom: 16,
    },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 6 },
    emptySubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 19 },

    noteWrap: {
        flexDirection: 'row', gap: 10, alignItems: 'flex-start',
        marginTop: 16, padding: 14,
        borderRadius: 14, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.18)',
    },
    noteText: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 18 },
});
