import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ScreenBackground } from '../components/ScreenBackground';
import { authService, trainerService } from '../services/api';

/**
 * Trainer earnings — day-by-day breakdown for a chosen month.
 *
 * Data model: the admin sets a trainerDailyRevenue on each course.
 * The backend derives earnings by scanning group meetingSchedule
 * entries: every unique (date × course) pair the trainer taught in
 * the requested month contributes one day's rate.
 *
 * The home screen shows the current month's total, so this screen
 * defaults to that month and lets the trainer step back through
 * history with a small month picker.
 */

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

export default function TrainerEarningsScreen() {
    const router = useRouter();
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
    const [trainerId, setTrainerId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [total, setTotal] = useState(0);
    const [currency, setCurrency] = useState('TND');
    const [days, setDays] = useState<{ date: string; courseId: string; courseTitle: string; amount: number }[]>([]);

    // Resolve the trainer id once. Subsequent loads read from state.
    useEffect(() => {
        (async () => {
            const user = await authService.getCurrentUser();
            setTrainerId(user?.userId ?? null);
        })();
    }, []);

    const load = useCallback(async (yr: number, mo: number, id: string) => {
        try {
            const res = await trainerService.getEarnings(id, yr, mo);
            setTotal(Number(res.total) || 0);
            setCurrency(res.currency || 'TND');
            setDays(Array.isArray(res.days) ? res.days : []);
        } catch (_) {
            setTotal(0);
            setDays([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (!trainerId) return;
        setLoading(true);
        load(year, month, trainerId);
    }, [trainerId, year, month, load]);

    const onRefresh = () => {
        if (!trainerId) return;
        setRefreshing(true);
        load(year, month, trainerId);
    };

    const stepMonth = (delta: number) => {
        let m = month + delta;
        let y = year;
        if (m < 1) { m = 12; y -= 1; }
        if (m > 12) { m = 1; y += 1; }
        setMonth(m);
        setYear(y);
    };

    // Same YM as now = current month. Disable "next" past it so the
    // trainer can't scroll into meaningless empty future months.
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
    const isFutureMonth = year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1);

    return (
        <ScreenBackground>
            <LinearGradient
                colors={['rgba(255,215,0,0.12)', 'rgba(10,5,32,0)']}
                style={styles.headerGradient}
            />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                    <Ionicons name="arrow-back" size={20} color="#ffffff" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>Earnings</Text>
                    <Text style={styles.headerSubtitle}>Your daily training revenue, month by month</Text>
                </View>
            </View>

            {/* Month picker */}
            <View style={styles.monthPicker}>
                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                <TouchableOpacity onPress={() => stepMonth(-1)} style={styles.monthArrow}>
                    <Ionicons name="chevron-back" size={20} color="#ffffff" />
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={styles.monthLabel}>{MONTH_NAMES[month - 1]} {year}</Text>
                </View>
                <TouchableOpacity
                    onPress={() => !isCurrentMonth && stepMonth(1)}
                    style={[styles.monthArrow, isCurrentMonth && { opacity: 0.3 }]}
                    disabled={isCurrentMonth || isFutureMonth}
                >
                    <Ionicons name="chevron-forward" size={20} color="#ffffff" />
                </TouchableOpacity>
            </View>

            {/* Total */}
            <View style={styles.totalCard}>
                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={styles.totalIcon}>
                    <Ionicons name="cash-outline" size={22} color="#FFD700" />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.totalLabel}>Total this month</Text>
                    <Text style={styles.totalValue}>{formatMoney(total, currency)}</Text>
                </View>
            </View>

            <ScrollView
                style={styles.list}
                contentContainerStyle={{ paddingBottom: 100 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7cce06" />}
            >
                {loading ? (
                    <View style={{ paddingTop: 60, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#7cce06" />
                    </View>
                ) : days.length === 0 ? (
                    <View style={styles.empty}>
                        <Ionicons name="cash-outline" size={40} color="rgba(255,255,255,0.25)" />
                        <Text style={styles.emptyTitle}>Nothing yet</Text>
                        <Text style={styles.emptyBody}>
                            {isCurrentMonth
                                ? "You haven't taught a session this month yet, or the admin hasn't set a daily rate for your courses."
                                : "No sessions were taught this month."}
                        </Text>
                    </View>
                ) : (
                    days.map((d, i) => (
                        <View key={`${d.date}-${d.courseId}-${i}`} style={styles.row}>
                            <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill} />
                            <View style={styles.rowDate}>
                                <Text style={styles.rowDateDay}>{formatDay(d.date)}</Text>
                                <Text style={styles.rowDateWeekday}>{formatWeekday(d.date)}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.rowCourse} numberOfLines={1}>{d.courseTitle || '—'}</Text>
                                <Text style={styles.rowMeta}>Daily rate</Text>
                            </View>
                            <Text style={styles.rowAmount}>+ {formatMoney(d.amount, currency)}</Text>
                        </View>
                    ))
                )}
            </ScrollView>
        </ScreenBackground>
    );
}

function formatMoney(v: number, currency: string): string {
    const n = Number(v) || 0;
    return `${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

function formatDay(iso: string): string {
    // "2026-07-15" → "15"
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return String(d.getDate());
}

function formatWeekday(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}

const styles = StyleSheet.create({
    headerGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 180 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, paddingHorizontal: 20, marginBottom: 20 },
    backBtn: {
        width: 40, height: 40, borderRadius: 12, overflow: 'hidden',
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },
    headerTitle: { fontSize: 22, fontWeight: '700', color: '#ffffff' },
    headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },

    monthPicker: {
        flexDirection: 'row', alignItems: 'center',
        marginHorizontal: 20, marginBottom: 12,
        borderRadius: 14, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        paddingVertical: 10, paddingHorizontal: 8,
    },
    monthArrow: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
    monthLabel: { fontSize: 15, fontWeight: '700', color: '#ffffff' },

    totalCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        marginHorizontal: 20, marginBottom: 16,
        padding: 14, borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,215,0,0.25)',
    },
    totalIcon: {
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: 'rgba(255,215,0,0.15)',
        justifyContent: 'center', alignItems: 'center',
    },
    totalLabel: { fontSize: 11, color: 'rgba(255,255,255,0.55)', letterSpacing: 0.4 },
    totalValue: { fontSize: 20, fontWeight: '700', color: '#ffffff', marginTop: 2 },

    list: { paddingHorizontal: 20 },
    row: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 12, marginBottom: 8,
        borderRadius: 14, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    },
    rowDate: {
        width: 44, height: 44, borderRadius: 12,
        backgroundColor: 'rgba(124,206,6,0.12)',
        justifyContent: 'center', alignItems: 'center',
    },
    rowDateDay: { fontSize: 16, fontWeight: '700', color: '#7cce06' },
    rowDateWeekday: { fontSize: 9, color: 'rgba(124,206,6,0.7)', textTransform: 'uppercase', letterSpacing: 0.5 },
    rowCourse: { fontSize: 14, fontWeight: '600', color: '#ffffff' },
    rowMeta: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
    rowAmount: { fontSize: 14, fontWeight: '700', color: '#7cce06' },

    empty: { paddingTop: 60, alignItems: 'center', paddingHorizontal: 30 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginTop: 12 },
    emptyBody: { fontSize: 12, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 6, lineHeight: 18 },
});
