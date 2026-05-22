import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ScreenBackground } from '../components/ScreenBackground';
import { authService, enrollmentService } from '../services/api';

/**
 * Payment history.
 * The platform doesn't yet have a transactions table or a payment processor,
 * so we surface the closest proxy we have: the student's enrollments,
 * each priced from the underlying course. Anything with price = 0 is shown
 * as "Free" — the rest is treated as a billable receipt placeholder.
 */
export default function PaymentsScreen() {
    const router = useRouter();
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

    const totalSpent = items.reduce((sum, e) => sum + (Number(e.coursePrice ?? e.price ?? 0)), 0);
    const paidCount = items.filter(e => Number(e.coursePrice ?? e.price ?? 0) > 0).length;

    return (
        <ScreenBackground>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color="#ffffff" />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>Payment History</Text>
                        <Text style={styles.headerSubtitle}>Your enrollments and transactions</Text>
                    </View>
                </View>

                {/* Summary card */}
                <View style={styles.summaryCard}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.summaryItem}>
                        <Text style={styles.summaryLabel}>Total spent</Text>
                        <Text style={styles.summaryValue}>${totalSpent.toFixed(2)}</Text>
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryItem}>
                        <Text style={styles.summaryLabel}>Paid courses</Text>
                        <Text style={styles.summaryValue}>{paidCount}</Text>
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryItem}>
                        <Text style={styles.summaryLabel}>Total courses</Text>
                        <Text style={styles.summaryValue}>{items.length}</Text>
                    </View>
                </View>

                {/* Payment methods (placeholder section) */}
                <Text style={styles.sectionLabel}>PAYMENT METHODS</Text>
                <View style={styles.card}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <TouchableOpacity style={styles.methodRow} activeOpacity={0.7}
                        onPress={() => Alert.alert('Payment methods', 'This will be available once payment processing is enabled.')}>
                        <View style={styles.methodIconWrap}>
                            <Ionicons name="add" size={20} color="#7cce06" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.methodTitle}>Add a payment method</Text>
                            <Text style={styles.methodSubtitle}>Card, PayPal, or bank transfer</Text>
                        </View>
                        <Text style={styles.soonBadge}>Soon</Text>
                    </TouchableOpacity>
                </View>

                {/* Transactions */}
                <Text style={styles.sectionLabel}>TRANSACTIONS</Text>

                {loading ? (
                    <View style={{ paddingTop: 40, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#7cce06" />
                    </View>
                ) : items.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <Ionicons name="card-outline" size={42} color="rgba(124,206,6,0.4)" />
                        </View>
                        <Text style={styles.emptyTitle}>No transactions yet</Text>
                        <Text style={styles.emptySubtitle}>
                            When you enroll in a paid course, your receipts will appear here.
                        </Text>
                    </View>
                ) : (
                    items.map((e: any, i: number) => {
                        const price = Number(e.coursePrice ?? e.price ?? 0);
                        const free = price === 0;
                        return (
                            <View key={e.enrollmentId || i} style={styles.txnCard}>
                                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                <View style={[styles.txnIconWrap, free && { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                                    <Ionicons name={free ? 'gift-outline' : 'card-outline'} size={22} color={free ? '#aaaaaa' : '#7cce06'} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.txnTitle} numberOfLines={1}>
                                        {e.courseTitle || e.courseName || 'Course'}
                                    </Text>
                                    <Text style={styles.txnDate}>
                                        {e.enrolledAt ? new Date(e.enrolledAt).toLocaleDateString() : ''}
                                        {e.enrollmentStatus ? ` · ${e.enrollmentStatus}` : ''}
                                    </Text>
                                </View>
                                <Text style={[styles.txnPrice, free && { color: '#aaaaaa' }]}>
                                    {free ? 'Free' : `$${price.toFixed(2)}`}
                                </Text>
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

    methodRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
    methodIconWrap: {
        width: 38, height: 38, borderRadius: 12,
        backgroundColor: 'rgba(124,206,6,0.12)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.25)',
        borderStyle: 'dashed',
        justifyContent: 'center', alignItems: 'center',
    },
    methodTitle: { fontSize: 14, fontWeight: '600', color: '#ffffff' },
    methodSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
    soonBadge: {
        fontSize: 10, fontWeight: '700', color: '#FFA500',
        backgroundColor: 'rgba(255,165,0,0.12)',
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
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
