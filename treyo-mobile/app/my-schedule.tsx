import {
    View, Text, TouchableOpacity, StyleSheet, ScrollView,
    ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenBackground } from '../components/ScreenBackground';
import { authService, groupService } from '../services/api';

/**
 * My Schedule — flat list of every upcoming session across all the
 * groups the student is enrolled in. Sessions come back already
 * sorted soonest-first from the backend and bucketed here under
 * "Today / This week / Later" so the student can scan their next
 * few weeks at a glance.
 *
 * Tapping a session card opens course-detail for that course (which
 * also surfaces its own per-course schedule section).
 *
 * useFocusEffect — refreshes when the user comes back from any course
 * detail / chat / etc. so newly scheduled groups appear without a manual
 * pull-to-refresh.
 */
export default function MyScheduleScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const [sessions, setSessions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useFocusEffect(
        useCallback(() => {
            load();
        }, [])
    );

    const load = async () => {
        try {
            const user = await authService.getCurrentUser();
            if (!user?.userId) {
                setSessions([]);
                return;
            }
            const data = await groupService.getStudentSessions(user.userId);
            setSessions(Array.isArray(data) ? data : []);
        } catch (_) {
            setSessions([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        load();
    };

    // Bucket by relative date so users can mentally chunk their week
    // without scrolling through 20+ raw rows. Buckets:
    //   - Today
    //   - This week (next 7 days, excluding today)
    //   - Later (anything beyond that)
    const buckets = bucketSessions(sessions);

    return (
        <ScreenBackground>
            {/* ── Header ── */}
            <LinearGradient
                colors={['rgba(124,206,6,0.15)', 'rgba(10,5,32,0)']}
                style={styles.headerGradient}
            />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                    <Ionicons name="arrow-back" size={20} color="#ffffff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('schedule.myScheduleTitle')}</Text>
                <View style={{ width: 40 }} />
            </View>

            {loading ? (
                <View style={styles.loading}>
                    <ActivityIndicator size="large" color="#7cce06" />
                </View>
            ) : sessions.length === 0 ? (
                <View style={styles.empty}>
                    <Ionicons name="calendar-outline" size={42} color="rgba(255,255,255,0.25)" />
                    <Text style={styles.emptyTitle}>{t('schedule.noSessions')}</Text>
                    <Text style={styles.emptyBody}>{t('schedule.noSessionsBody')}</Text>
                </View>
            ) : (
                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor="#7cce06"
                        />
                    }
                >
                    {(['today', 'thisWeek', 'later'] as const).map(key => {
                        const list = buckets[key];
                        if (list.length === 0) return null;
                        return (
                            <View key={key} style={styles.bucket}>
                                <Text style={styles.bucketTitle}>{t(`schedule.${key}`)}</Text>
                                {list.map((s, i) => (
                                    <SessionCard
                                        key={`${s.groupId}-${s.date}-${s.time}-${i}`}
                                        session={s}
                                        onPress={() => s.courseId && router.push({
                                            pathname: '/course-detail' as any,
                                            params: { courseId: s.courseId },
                                        })}
                                    />
                                ))}
                            </View>
                        );
                    })}
                    <View style={{ height: 30 }} />
                </ScrollView>
            )}
        </ScreenBackground>
    );
}

/** Splits a sorted list of sessions into today / this week / later
 *  buckets relative to the device's current date. */
function bucketSessions(sessions: any[]) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const out = { today: [] as any[], thisWeek: [] as any[], later: [] as any[] };

    for (const s of sessions) {
        if (!s?.date) continue;
        const d = new Date(`${s.date}T00:00:00`);
        if (Number.isNaN(d.getTime())) continue;

        if (d.getTime() === today.getTime()) out.today.push(s);
        else if (d.getTime() < weekEnd.getTime()) out.thisWeek.push(s);
        else out.later.push(s);
    }
    return out;
}

function SessionCard({ session, onPress }: { session: any; onPress: () => void }) {
    const { t, i18n } = useTranslation();
    const dt = session?.date && session?.time
        ? new Date(`${session.date}T${String(session.time).length === 5 ? session.time + ':00' : session.time}`)
        : null;
    const dayLabel = dt
        ? dt.toLocaleDateString(i18n.language || undefined, { weekday: 'short' })
        : '';
    const dateLabel = dt
        ? dt.toLocaleDateString(i18n.language || undefined, { month: 'short', day: 'numeric' })
        : session?.date || '';
    const timeLabel = session?.time ? String(session.time).slice(0, 5) : '';
    const isOnline = !!session?.isOnline;

    return (
        <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />

            {/* Left date block — visual anchor for the row */}
            <View style={styles.dateBlock}>
                <Text style={styles.dateBlockDay}>{dayLabel}</Text>
                <Text style={styles.dateBlockDate}>{dateLabel}</Text>
            </View>

            <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                    {session.courseTitle || session.groupName || t('home.session')}
                </Text>
                {session.groupName && session.courseTitle && (
                    <Text style={styles.cardGroup} numberOfLines={1}>{session.groupName}</Text>
                )}
                <View style={styles.cardMetaRow}>
                    <View style={styles.metaChip}>
                        <Ionicons name="time-outline" size={12} color="#aaaaaa" />
                        <Text style={styles.metaText}>{timeLabel}{session.hours ? ` · ${session.hours}${t('common.hours')}` : ''}</Text>
                    </View>
                    <View style={[styles.modePill, isOnline ? styles.modeOnline : styles.modeOnsite]}>
                        <Ionicons
                            name={isOnline ? 'videocam-outline' : 'location-outline'}
                            size={11}
                            color={isOnline ? '#7cce06' : '#FFD700'}
                        />
                        <Text style={[styles.modeText, { color: isOnline ? '#7cce06' : '#FFD700' }]}>
                            {isOnline ? t('common.online') : t('common.onSite')}
                        </Text>
                    </View>
                </View>
            </View>

            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.2)" />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    headerGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 180 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 20, overflow: 'hidden',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: 17, color: '#ffffff', fontWeight: '700' },

    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    empty: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 32, gap: 12,
    },
    emptyTitle: { fontSize: 16, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
    emptyBody: { fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 19 },

    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 8 },

    bucket: { marginBottom: 18 },
    bucketTitle: {
        fontSize: 12, color: 'rgba(255,255,255,0.55)',
        fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase',
        marginBottom: 8, marginLeft: 4,
    },

    card: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        padding: 14, marginBottom: 10,
    },
    dateBlock: {
        width: 54, alignItems: 'center', justifyContent: 'center',
        paddingVertical: 8, borderRadius: 12,
        backgroundColor: 'rgba(124,206,6,0.12)',
    },
    dateBlockDay: {
        fontSize: 10, color: '#7cce06', fontWeight: '700',
        textTransform: 'uppercase', letterSpacing: 0.5,
    },
    dateBlockDate: { fontSize: 13, color: '#ffffff', fontWeight: '700', marginTop: 2 },

    cardTitle: { fontSize: 14, color: '#ffffff', fontWeight: '600' },
    cardGroup: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 },

    cardMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    metaChip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    metaText: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },

    modePill: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
        borderWidth: 1,
    },
    modeOnline: { backgroundColor: 'rgba(124,206,6,0.10)', borderColor: 'rgba(124,206,6,0.30)' },
    modeOnsite: { backgroundColor: 'rgba(255,215,0,0.10)', borderColor: 'rgba(255,215,0,0.30)' },
    modeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
});
