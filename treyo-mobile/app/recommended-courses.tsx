import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { ScreenBackground } from '../components/ScreenBackground';
import { courseService, authService } from '../services/api';

const PAGE_SIZE = 30; // request a generous batch from the ML service

export default function RecommendedCoursesScreen() {
    const router = useRouter();
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => { loadData(); }, []);

    const loadData = useCallback(async () => {
        try {
            const user = await authService.getCurrentUser();
            if (!user?.userId) {
                setRecommendations([]);
                return;
            }
            const data = await courseService.getRecommendations(user.userId, PAGE_SIZE);
            setRecommendations(Array.isArray(data) ? data : []);
        } catch (e) {
            console.log('Recommendations load error', e);
            setRecommendations([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    return (
        <ScreenBackground>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={['#7cce06']} tintColor="#7cce06" />
                }
            >
                {/* ── Header ── */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color="#ffffff" />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>Recommended For You</Text>
                        <Text style={styles.headerSubtitle}>Curated by our AI based on your interests</Text>
                    </View>
                </View>

                {loading ? (
                    <View style={{ paddingTop: 60, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#7cce06" />
                    </View>
                ) : recommendations.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <Ionicons name="sparkles-outline" size={48} color="rgba(124,206,6,0.4)" />
                        </View>
                        <Text style={styles.emptyTitle}>No recommendations yet</Text>
                        <Text style={styles.emptySubtitle}>
                            We'll have suggestions for you once you've browsed a few courses or completed onboarding.
                        </Text>
                    </View>
                ) : (
                    <>
                        <Text style={styles.countLabel}>{recommendations.length} courses for you</Text>
                        {recommendations.map((course: any, idx: number) => (
                            <TouchableOpacity
                                key={course.courseId || course.id || idx}
                                style={styles.card}
                                activeOpacity={0.85}
                                onPress={() => router.push({ pathname: '/course-detail' as any, params: { courseId: course.courseId || course.id } })}
                            >
                                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />

                                {/* Rank badge for top 3 */}
                                {idx < 3 && (
                                    <View style={styles.rankBadge}>
                                        <Ionicons name="sparkles" size={11} color="#000" />
                                        <Text style={styles.rankText}>#{idx + 1}</Text>
                                    </View>
                                )}

                                <View style={styles.iconWrap}>
                                    <Ionicons name="school" size={28} color="#7cce06" />
                                </View>

                                <View style={styles.body}>
                                    <Text style={styles.title} numberOfLines={2}>{course.title}</Text>
                                    <Text style={styles.trainer} numberOfLines={1}>
                                        {course.trainerName || course.trainer || 'Trainer'}
                                    </Text>

                                    <View style={styles.metaRow}>
                                        {course.averageRating != null && (
                                            <View style={styles.metaChip}>
                                                <Ionicons name="star" size={13} color="#FFD700" />
                                                <Text style={styles.metaText}>{Number(course.averageRating).toFixed(1)}</Text>
                                            </View>
                                        )}
                                        <View style={styles.metaChip}>
                                            <Ionicons name="people-outline" size={13} color="#aaaaaa" />
                                            <Text style={styles.metaText}>{course.totalEnrolled || 0}</Text>
                                        </View>
                                        {course.durationHours && (
                                            <View style={styles.metaChip}>
                                                <Ionicons name="time-outline" size={13} color="#aaaaaa" />
                                                <Text style={styles.metaText}>{course.durationHours}h</Text>
                                            </View>
                                        )}
                                        {course.level && (
                                            <View style={styles.metaChip}>
                                                <Ionicons name="bar-chart-outline" size={13} color="#aaaaaa" />
                                                <Text style={styles.metaText}>{course.level}</Text>
                                            </View>
                                        )}
                                    </View>

                                    {/* The recommendation engine ships a `reason` string when available. */}
                                    {course.reason && (
                                        <View style={styles.reasonRow}>
                                            <Ionicons name="bulb-outline" size={12} color="#7cce06" />
                                            <Text style={styles.reasonText} numberOfLines={2}>{course.reason}</Text>
                                        </View>
                                    )}
                                </View>

                                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
                            </TouchableOpacity>
                        ))}
                    </>
                )}
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

    countLabel: { fontSize: 13, color: '#aaaaaa', marginBottom: 14 },

    card: {
        flexDirection: 'row', alignItems: 'flex-start',
        borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        padding: 14, marginBottom: 10,
    },
    rankBadge: {
        position: 'absolute', top: 10, right: 10, zIndex: 2,
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: '#7cce06',
        borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
    },
    rankText: { fontSize: 10, fontWeight: '700', color: '#000' },

    iconWrap: {
        width: 52, height: 52, borderRadius: 14,
        backgroundColor: 'rgba(124,206,6,0.12)',
        justifyContent: 'center', alignItems: 'center', marginRight: 14,
    },
    body: { flex: 1 },
    title: { fontSize: 15, fontWeight: '600', color: '#ffffff', marginBottom: 2, paddingRight: 36 },
    trainer: { fontSize: 12, color: '#aaaaaa', marginBottom: 8 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
    metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { fontSize: 11, color: '#aaaaaa' },

    reasonRow: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 6,
        marginTop: 8, paddingTop: 8,
        borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    },
    reasonText: { flex: 1, fontSize: 11, color: 'rgba(124,206,6,0.85)', fontStyle: 'italic', lineHeight: 16 },

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
