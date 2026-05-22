import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenBackground } from '../components/ScreenBackground';
import { authService, interactionService } from '../services/api';

/**
 * Favourites screen — list of courses the student has saved via the heart
 * icon on course-detail. Reuses the saved-courses endpoint which returns
 * full CourseResponse objects so we can render cards without follow-up
 * fetches.
 *
 * Tapping a card → course-detail (same flow as Groups Forming Now).
 * The heart icon on each card un-saves the course right from this list —
 * no need to drill into detail just to remove something you no longer want.
 */
export default function FavoritesScreen() {
    const router = useRouter();
    const [courses, setCourses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState<string | null>(null);
    // Per-course in-flight flag so we can disable a single card's heart
    // while the unsave POST is round-tripping, without blocking the others.
    const [removing, setRemoving] = useState<Set<string>>(new Set());

    // useFocusEffect refreshes when the user navigates back here after
    // saving/unsaving from course-detail, so the list always reflects
    // the current state of their favourites.
    useFocusEffect(
        useCallback(() => {
            loadFavorites();
        }, [])
    );

    const loadFavorites = async () => {
        try {
            const user = await authService.getCurrentUser();
            if (!user?.userId) {
                setCourses([]);
                return;
            }
            setUserId(user.userId);
            const list = await interactionService.getSavedCourses(user.userId);
            setCourses(Array.isArray(list) ? list : []);
        } catch (e) {
            console.log('Favorites load error', e);
            setCourses([]);
        } finally {
            setLoading(false);
        }
    };

    const handleUnsave = async (courseId: string) => {
        if (!userId || removing.has(courseId)) return;
        setRemoving(prev => new Set(prev).add(courseId));
        // Optimistic remove — the card disappears immediately. If the
        // backend rejects, we restore by refetching the list.
        const removedCourse = courses.find(c => (c.courseId || c.id) === courseId);
        setCourses(prev => prev.filter(c => (c.courseId || c.id) !== courseId));
        try {
            const stillSaved = await interactionService.toggleSaveCourse(userId, courseId);
            if (stillSaved) {
                // Backend says it's still saved (e.g. it was already unsaved
                // and toggle just re-saved it). Refetch to reconcile rather
                // than keep an out-of-sync UI.
                await loadFavorites();
            }
        } catch (e: any) {
            // Restore the card we optimistically removed.
            if (removedCourse) setCourses(prev => [removedCourse, ...prev]);
            Alert.alert('Could not unsave', e?.response?.data?.message || 'Please try again.');
        } finally {
            setRemoving(prev => {
                const next = new Set(prev);
                next.delete(courseId);
                return next;
            });
        }
    };

    return (
        <ScreenBackground>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* ── Header ── */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color="#ffffff" />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>Favourites</Text>
                        <Text style={styles.headerSubtitle}>
                            {loading
                                ? 'Loading…'
                                : courses.length === 0
                                    ? 'Save courses you want to revisit'
                                    : `${courses.length} saved course${courses.length === 1 ? '' : 's'}`}
                        </Text>
                    </View>
                </View>

                {loading ? (
                    <View style={{ paddingTop: 60, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#7cce06" />
                    </View>
                ) : courses.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <Ionicons name="heart-outline" size={48} color="rgba(124,206,6,0.4)" />
                        </View>
                        <Text style={styles.emptyTitle}>No favourites yet</Text>
                        <Text style={styles.emptySubtitle}>
                            Tap the heart icon on a course to save it here for later.
                        </Text>
                    </View>
                ) : (
                    courses.map((course: any) => {
                        const cId = course.courseId || course.id;
                        const isRemoving = removing.has(cId);
                        return (
                            <TouchableOpacity
                                key={cId}
                                style={styles.card}
                                activeOpacity={0.9}
                                onPress={() => router.push({ pathname: '/course-detail' as any, params: { courseId: cId } })}
                            >
                                <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />

                                <View style={styles.cardTop}>
                                    <View style={styles.domainBadge}>
                                        <Ionicons name="school" size={13} color="#7cce06" />
                                        <Text style={styles.domainText} numberOfLines={1}>
                                            {course.domain || course.level || 'Course'}
                                        </Text>
                                    </View>
                                    {/* Heart toggle right on the card — drops the course from
                                        favourites without making the user drill into detail. */}
                                    <TouchableOpacity
                                        onPress={(e) => {
                                            e.stopPropagation();
                                            handleUnsave(cId);
                                        }}
                                        disabled={isRemoving}
                                        style={styles.heartBtn}
                                        activeOpacity={0.6}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    >
                                        {isRemoving ? (
                                            <ActivityIndicator size="small" color="#ff4d6d" />
                                        ) : (
                                            <Ionicons name="heart" size={20} color="#ff4d6d" />
                                        )}
                                    </TouchableOpacity>
                                </View>

                                <Text style={styles.cardTitle} numberOfLines={2}>
                                    {course.title || 'Untitled course'}
                                </Text>
                                <Text style={styles.cardTrainer} numberOfLines={1}>
                                    {course.trainerName || 'Trainer'}
                                </Text>

                                {/* Meta chips — keep the card informative without dragging in
                                    a price/rating row that we don't actually want to surface here. */}
                                <View style={styles.metaRow}>
                                    {course.level && (
                                        <View style={styles.metaChip}>
                                            <Ionicons name="bar-chart-outline" size={12} color="#aaaaaa" />
                                            <Text style={styles.metaText}>{course.level}</Text>
                                        </View>
                                    )}
                                    {course.durationHours != null && (
                                        <View style={styles.metaChip}>
                                            <Ionicons name="time-outline" size={12} color="#aaaaaa" />
                                            <Text style={styles.metaText}>{course.durationHours}h</Text>
                                        </View>
                                    )}
                                    {course.format && (
                                        <View style={styles.metaChip}>
                                            <Ionicons name="globe-outline" size={12} color="#aaaaaa" />
                                            <Text style={styles.metaText}>{course.format}</Text>
                                        </View>
                                    )}
                                </View>

                                <View style={styles.viewHintRow}>
                                    <Text style={styles.viewHintText}>View course details</Text>
                                    <Ionicons name="chevron-forward" size={15} color="#7cce06" />
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
    scrollContent: { paddingBottom: 60, paddingHorizontal: 20 },

    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, marginBottom: 20 },
    backBtn: { padding: 2 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff' },
    headerSubtitle: { fontSize: 13, color: '#aaaaaa', marginTop: 2 },

    card: {
        borderRadius: 18, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        padding: 16, marginBottom: 12,
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    domainBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(124,206,6,0.12)',
        borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
        maxWidth: '70%',
    },
    domainText: { fontSize: 11, color: '#7cce06', fontWeight: '700', textTransform: 'uppercase' },
    heartBtn: {
        width: 32, height: 32, borderRadius: 16,
        justifyContent: 'center', alignItems: 'center',
        backgroundColor: 'rgba(255,77,109,0.1)',
        borderWidth: 1, borderColor: 'rgba(255,77,109,0.3)',
    },

    cardTitle: { fontSize: 17, fontWeight: '700', color: '#ffffff', marginBottom: 4, lineHeight: 22 },
    cardTrainer: { fontSize: 13, color: '#aaaaaa', marginBottom: 12 },

    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
    metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { fontSize: 11, color: '#aaaaaa' },

    viewHintRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4,
        paddingTop: 4, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    },
    viewHintText: { fontSize: 12, fontWeight: '600', color: '#7cce06' },

    emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
    emptyIconWrap: {
        width: 88, height: 88, borderRadius: 44,
        backgroundColor: 'rgba(124,206,6,0.06)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.12)',
        justifyContent: 'center', alignItems: 'center', marginBottom: 20,
    },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff', marginBottom: 8 },
    emptySubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 22 },
});
