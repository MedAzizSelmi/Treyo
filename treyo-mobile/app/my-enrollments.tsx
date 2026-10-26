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
import { authService, enrollmentService } from '../services/api';

/**
 * My Enrollments — every course the learner is enrolled in, which the home
 * screen only shows the first four of. Current ones first (pending,
 * confirmed, active), then finished ones (completed, dropped, cancelled).
 *
 * Tapping a card opens course-detail, where the group, schedule and chat
 * live. The learner's sessions have their own screen, My Schedule.
 */
const CURRENT = ['active', 'confirmed', 'pending'];

export default function MyEnrollmentsScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const [enrollments, setEnrollments] = useState<any[]>([]);
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
                setEnrollments([]);
                return;
            }
            const data = await enrollmentService.getStudentEnrollments(user.userId);
            setEnrollments(Array.isArray(data) ? data : []);
        } catch (_) {
            setEnrollments([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        load();
    };

    // Newest first within each part.
    const byDate = (a: any, b: any) =>
        String(b.enrolledAt || '').localeCompare(String(a.enrolledAt || ''));
    const isCurrent = (e: any) => CURRENT.includes(String(e.enrollmentStatus || 'pending').toLowerCase());
    const parts = {
        current: enrollments.filter(isCurrent).sort(byDate),
        past: enrollments.filter(e => !isCurrent(e)).sort(byDate),
    };

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
                <Text style={styles.headerTitle}>{t('myEnrollments.title')}</Text>
                <View style={{ width: 40 }} />
            </View>

            {loading ? (
                <View style={styles.loading}>
                    <ActivityIndicator size="large" color="#7cce06" />
                </View>
            ) : enrollments.length === 0 ? (
                <View style={styles.empty}>
                    <Ionicons name="school-outline" size={42} color="rgba(255,255,255,0.25)" />
                    <Text style={styles.emptyTitle}>{t('myEnrollments.empty')}</Text>
                    <Text style={styles.emptyBody}>{t('myEnrollments.emptyBody')}</Text>
                    <TouchableOpacity style={styles.browseBtn} activeOpacity={0.85}
                        onPress={() => router.push('/course-search' as any)}>
                        <Text style={styles.browseText}>{t('myEnrollments.browse')}</Text>
                    </TouchableOpacity>
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
                    {(['current', 'past'] as const).map(key => {
                        const list = parts[key];
                        if (list.length === 0) return null;
                        return (
                            <View key={key} style={styles.bucket}>
                                <Text style={styles.bucketTitle}>{t(`myEnrollments.${key}`)}</Text>
                                {list.map((e, i) => (
                                    <EnrollmentCard
                                        key={e.enrollmentId || i}
                                        enrollment={e}
                                        onPress={() => e.courseId && router.push({
                                            pathname: '/course-detail' as any,
                                            params: { courseId: e.courseId },
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

function EnrollmentCard({ enrollment, onPress }: { enrollment: any; onPress: () => void }) {
    const { t, i18n } = useTranslation();
    const status = String(enrollment.enrollmentStatus || 'pending').toLowerCase();
    const current = CURRENT.includes(status);
    const progress = enrollment.progressPercentage != null ? Math.round(Number(enrollment.progressPercentage)) : null;
    const enrolledOn = enrollment.enrolledAt
        ? new Date(enrollment.enrolledAt).toLocaleDateString(i18n.language || undefined,
            { day: 'numeric', month: 'short', year: 'numeric' })
        : null;

    return (
        <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[styles.accent, {
                backgroundColor: status === 'active' ? '#7cce06' : current ? 'rgba(124,206,6,0.35)' : 'rgba(255,255,255,0.15)',
            }]} />

            <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                    {enrollment.courseTitle || enrollment.courseName || t('home.course')}
                </Text>
                {!!enrollment.trainerName && (
                    <Text style={styles.cardTrainer} numberOfLines={1}>{enrollment.trainerName}</Text>
                )}
                <View style={styles.cardMetaRow}>
                    <View style={[styles.statusPill, current ? styles.statusCurrent : styles.statusPast]}>
                        <Text style={[styles.statusText, { color: current ? '#7cce06' : 'rgba(255,255,255,0.6)' }]}>
                            {t(`enrollmentStatus.${status}`, { defaultValue: status })}
                        </Text>
                    </View>
                    {progress != null && progress > 0 && (
                        <View style={styles.metaChip}>
                            <Ionicons name="analytics-outline" size={12} color="#aaaaaa" />
                            <Text style={styles.metaText}>{progress}%</Text>
                        </View>
                    )}
                    {enrolledOn && (
                        <View style={styles.metaChip}>
                            <Ionicons name="calendar-outline" size={12} color="#aaaaaa" />
                            <Text style={styles.metaText}>{t('myEnrollments.enrolledOn', { date: enrolledOn })}</Text>
                        </View>
                    )}
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
    browseBtn: {
        marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999,
        backgroundColor: '#7cce06',
    },
    browseText: { fontSize: 14, color: '#0a0520', fontWeight: '700' },

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
    accent: { width: 4, alignSelf: 'stretch', borderRadius: 2 },

    cardTitle: { fontSize: 14, color: '#ffffff', fontWeight: '600' },
    cardTrainer: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },

    cardMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    metaChip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    metaText: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },

    statusPill: {
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
    },
    statusCurrent: { backgroundColor: 'rgba(124,206,6,0.10)', borderColor: 'rgba(124,206,6,0.30)' },
    statusPast: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.12)' },
    statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
});
