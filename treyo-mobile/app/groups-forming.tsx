import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ScreenBackground } from '../components/ScreenBackground';
import { courseService } from '../services/api';

type SortMode = 'progress' | 'newest' | 'name';

// Same threshold as the home screen's mini-section: a course only appears
// in "Groups Forming Now" once it's at least 75% of the way to its minimum
// student requirement. Keeps this page focused on near-launching groups
// rather than dumping every published course with low signups into the view.
const GROUP_FORMING_THRESHOLD = 0.75;

export default function GroupsFormingScreen() {
    const router = useRouter();
    const [courses, setCourses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [sort, setSort] = useState<SortMode>('progress');

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            // All published courses come back from /courses. We don't need
            // the student's enrollments here anymore because tapping a card
            // just navigates to course-detail (no inline join action).
            const data = await courseService.getAllCourses();
            setCourses(Array.isArray(data) ? data : []);
        } catch (e) {
            setCourses([]);
        } finally {
            setLoading(false);
        }
    };

    /**
     * Filter to courses that are at least 75% of the way to forming but not
     * yet over the min. Once enrolled >= min, the admin promotes the group
     * and it's no longer "forming". This page shows ALL qualifying groups —
     * the home-screen peek caps to 5; this is the full list.
     */
    const formingGroups = useMemo(() => {
        const list = courses
            .map(c => {
                const min = c.minStudentsRequired || 5;
                const enrolled = c.interestedStudentsCount ?? c.totalEnrolled ?? 0;
                const pct = Math.min(Math.round((enrolled / min) * 100), 100);
                return { ...c, _min: min, _enrolled: enrolled, _pct: pct };
            })
            .filter(c =>
                c._enrolled >= c._min * GROUP_FORMING_THRESHOLD && c._enrolled < c._min
            );

        switch (sort) {
            case 'progress':
                return list.sort((a, b) => b._pct - a._pct);
            case 'newest':
                return list.sort((a, b) => {
                    const ad = new Date(a.createdAt || 0).getTime();
                    const bd = new Date(b.createdAt || 0).getTime();
                    return bd - ad;
                });
            case 'name':
                return list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
            default:
                return list;
        }
    }, [courses, sort]);

    const SortPill = ({ mode, label }: { mode: SortMode; label: string }) => {
        const active = sort === mode;
        return (
            <TouchableOpacity
                style={[styles.sortPill, active && styles.sortPillActive]}
                onPress={() => setSort(mode)}
                activeOpacity={0.8}
            >
                <Text style={[styles.sortPillText, active && styles.sortPillTextActive]}>{label}</Text>
            </TouchableOpacity>
        );
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
                        <Text style={styles.headerTitle}>Groups Forming Now</Text>
                        <Text style={styles.headerSubtitle}>Join before they fill up</Text>
                    </View>
                </View>

                {/* ── Sort row ── */}
                <View style={styles.sortRow}>
                    <SortPill mode="progress" label="Almost full" />
                    <SortPill mode="newest" label="Newest" />
                    <SortPill mode="name" label="A–Z" />
                </View>

                {loading ? (
                    <View style={{ paddingTop: 60, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#7cce06" />
                    </View>
                ) : formingGroups.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <Ionicons name="people-outline" size={48} color="rgba(124,206,6,0.4)" />
                        </View>
                        <Text style={styles.emptyTitle}>No groups forming</Text>
                        <Text style={styles.emptySubtitle}>
                            Groups appear here once they&apos;re at least 75% of the way to their minimum
                            student count. Check back soon — interest is building.
                        </Text>
                    </View>
                ) : (
                    formingGroups.map(course => {
                        const cId = course.courseId || course.id;
                        return (
                            <TouchableOpacity
                                key={cId}
                                style={styles.card}
                                activeOpacity={0.92}
                                onPress={() => router.push({ pathname: '/course-detail' as any, params: { courseId: cId } })}
                            >
                                <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />

                                {/* Top row: domain badge + spots-left */}
                                <View style={styles.cardTop}>
                                    <View style={styles.domainBadge}>
                                        <Ionicons name="people" size={14} color="#7cce06" />
                                        <Text style={styles.domainText}>{course.domain || course.level || 'Course'}</Text>
                                    </View>
                                    <View style={styles.spotsBadge}>
                                        <Text style={styles.spotsText}>
                                            {course._min - course._enrolled === 1
                                                ? '1 spot left'
                                                : `${course._min - course._enrolled} spots left`}
                                        </Text>
                                    </View>
                                </View>

                                <Text style={styles.cardTitle} numberOfLines={2}>{course.title}</Text>
                                <Text style={styles.cardTrainer}>{course.trainerName || 'Trainer'}</Text>

                                {/* Progress */}
                                <View style={styles.progressRow}>
                                    <View style={styles.progressTrack}>
                                        <View style={[styles.progressFill, { width: `${course._pct}%` }]} />
                                    </View>
                                    <Text style={styles.progressLabel}>{course._enrolled}/{course._min}</Text>
                                </View>

                                {/* Meta chips */}
                                <View style={styles.metaRow}>
                                    {course.level && (
                                        <View style={styles.metaChip}>
                                            <Ionicons name="bar-chart-outline" size={12} color="#aaaaaa" />
                                            <Text style={styles.metaText}>{course.level}</Text>
                                        </View>
                                    )}
                                    {course.durationHours && (
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

                                {/* "Tap to view" affordance — replaces the old Join button.
                                    The request action lives on the course-detail page now,
                                    so we don't have two paths into the funnel to keep in sync. */}
                                <View style={styles.viewHintRow}>
                                    <Text style={styles.viewHintText}>View course details</Text>
                                    <Ionicons name="chevron-forward" size={16} color="#7cce06" />
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

    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, marginBottom: 16 },
    backBtn: { padding: 2 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff' },
    headerSubtitle: { fontSize: 13, color: '#aaaaaa', marginTop: 2 },

    sortRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
    sortPill: {
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    sortPillActive: { borderColor: '#7cce06', backgroundColor: 'rgba(124,206,6,0.15)' },
    sortPillText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
    sortPillTextActive: { color: '#7cce06' },

    card: {
        borderRadius: 18, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        padding: 16, marginBottom: 12,
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    domainBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(124,206,6,0.12)',
        borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4,
    },
    domainText: { fontSize: 11, color: '#7cce06', fontWeight: '700', textTransform: 'uppercase' },
    spotsBadge: {
        backgroundColor: 'rgba(255,165,0,0.12)',
        borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4,
        borderWidth: 1, borderColor: 'rgba(255,165,0,0.3)',
    },
    spotsText: { fontSize: 11, color: '#FFA500', fontWeight: '600' },

    cardTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 4, lineHeight: 22 },
    cardTrainer: { fontSize: 12, color: '#aaaaaa', marginBottom: 12 },

    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)' },
    progressFill: { height: 6, borderRadius: 3, backgroundColor: '#7cce06' },
    progressLabel: { fontSize: 12, color: '#aaaaaa', fontWeight: '600' },

    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
    metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { fontSize: 11, color: '#aaaaaa' },

    // viewHintRow replaces the old Join button — tapping the card now
    // navigates to course-detail, so we only need a "tap to view" affordance.
    viewHintRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4,
    },
    viewHintText: { fontSize: 13, fontWeight: '600', color: '#7cce06' },

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
