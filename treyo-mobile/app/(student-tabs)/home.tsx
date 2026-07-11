import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, RefreshControl, ActivityIndicator, Dimensions, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { courseService, authService, enrollmentService, notificationService, trainerService, groupService, reviewService } from '../../services/api';
import api from '../../services/api';
import { useTheme } from '../../contexts/ThemeContext';
import { ScreenBackground } from '../../components/ScreenBackground';
import { useTranslation } from 'react-i18next';

// A course shows up in "Groups Forming Now" only once it has reached this
// fraction of its minimum-students requirement. So a course with min=100
// needs >= 75 requests to surface; with min=8 it needs >= 6 requests. This
// keeps the section focused on groups that are realistically close to
// forming, instead of cluttering it with courses that just opened.
const GROUP_FORMING_THRESHOLD = 0.75;
// Home only shows a peek of 5 — the rest live behind "See All".
const HOME_FORMING_LIMIT = 5;

const { width } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_HALF = (width - 40 - CARD_GAP) / 2;

export default function StudentHomeScreen() {
    const { colors } = useTheme();
    const router = useRouter();
    const { t, i18n } = useTranslation();
    const [user, setUser] = useState<any>(null);
    const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
    const [imageTs, setImageTs] = useState(Date.now());
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [enrolledCourses, setEnrolledCourses] = useState<any[]>([]);
    // Flat list of all upcoming sessions across the student's enrolled
    // groups — powers the "Upcoming Sessions" strip at the top. Empty
    // until at least one trainer has scheduled the group.
    const [upcomingSessions, setUpcomingSessions] = useState<any[]>([]);
    const [trainers, setTrainers] = useState<any[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Derived: groups that are actually close to forming.
    // Filtering rules:
    //   - must have a min-students gate
    //   - interest count must be >= 75% of the gate (close to launching)
    //   - and still below the gate (otherwise group is already formed and
    //     admin will promote it — no longer "forming")
    // Within those, we rank by progress so the closest-to-launching groups
    // surface first.
    const formingGroups = useMemo(() => {
        return recommendations
            .map((c: any) => {
                const min = c.minStudentsRequired || 5;
                const enrolled = c.interestedStudentsCount ?? c.totalEnrolled ?? 0;
                const pct = Math.min(Math.round((enrolled / min) * 100), 100);
                return { ...c, _min: min, _enrolled: enrolled, _pct: pct };
            })
            .filter((c: any) =>
                c._enrolled >= c._min * GROUP_FORMING_THRESHOLD && c._enrolled < c._min
            )
            .sort((a: any, b: any) => b._pct - a._pct)
            .slice(0, HOME_FORMING_LIMIT);
    }, [recommendations]);

    useEffect(() => { loadData(); }, []);

    useFocusEffect(
        useCallback(() => {
            loadProfilePic();
            loadUnreadCount();
        }, [])
    );

    const loadProfilePic = async () => {
        try {
            const res = await api.get('/students/me');
            setProfilePicUrl(res.data.profilePictureUrl || null);
            setImageTs(Date.now());
        } catch (e) { /* fallback to icon */ }
    };

    const loadUnreadCount = async () => {
        try {
            const currentUser = await authService.getCurrentUser();
            if (currentUser?.userId) {
                const count = await notificationService.getUnreadCount(currentUser.userId);
                setUnreadCount(typeof count === 'number' ? count : 0);
            }
        } catch (_) {}
    };

    const loadData = async () => {
        try {
            const currentUser = await authService.getCurrentUser();
            setUser(currentUser);

            try {
                const res = await api.get('/students/me');
                setProfilePicUrl(res.data.profilePictureUrl || null);
            } catch (_) {}

            // Load real data in parallel
            const promises: Promise<any>[] = [];

            // Recommendations
            promises.push(
                courseService.getRecommendations(currentUser.userId, 10)
                    .then(r => setRecommendations(r || []))
                    .catch(() => setRecommendations([]))
            );

            // Enrolled courses (used for the "Your courses" section)
            promises.push(
                enrollmentService.getStudentEnrollments(currentUser.userId)
                    .then(e => setEnrolledCourses(e || []))
                    .catch(() => setEnrolledCourses([]))
            );

            // Scheduled sessions across all the student's groups
            promises.push(
                groupService.getStudentSessions(currentUser.userId)
                    .then(s => setUpcomingSessions(s || []))
                    .catch(() => setUpcomingSessions([]))
            );

            // Top trainers
            promises.push(
                trainerService.getAllTrainers()
                    .then(t => setTrainers(t || []))
                    .catch(() => setTrainers([]))
            );

            // Unread notification count
            promises.push(
                notificationService.getUnreadCount(currentUser.userId)
                    .then(c => setUnreadCount(typeof c === 'number' ? c : 0))
                    .catch(() => setUnreadCount(0))
            );

            await Promise.all(promises);

            // ── Review prompt for newly-completed courses ──
            // If any enrolled course has finished (status === 'completed'
            // or completedAt set) AND we haven't already collected a
            // review, surface a one-shot alert offering to leave one.
            // We only ask about the first match — no need to stack
            // dialogs on a fresh login. The /reviews/check call is cheap
            // and dedupes against double-prompts.
            try {
                await maybePromptReview(currentUser?.userId);
            } catch (_) {}
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const maybePromptReview = async (uid?: string | null) => {
        if (!uid) return;
        try {
            const enrollments = await enrollmentService.getStudentEnrollments(uid);
            const completed = (enrollments || []).filter((e: any) =>
                (e.enrollmentStatus || '').toLowerCase() === 'completed'
                || !!e.completedAt
            );
            for (const e of completed) {
                if (!e.courseId) continue;
                try {
                    const status = await reviewService.check(uid, e.courseId);
                    if (!status?.reviewed) {
                        Alert.alert(
                            t('review.ratePromptTitle'),
                            t('review.ratePromptBody', { title: e.courseTitle || t('home.course') }),
                            [
                                { text: t('common.later'), style: 'cancel' },
                                {
                                    text: t('common.rateNow'),
                                    onPress: () => router.push({
                                        pathname: '/course-review' as any,
                                        params: { courseId: e.courseId },
                                    }),
                                },
                            ],
                        );
                        return; // only ask once per home load
                    }
                } catch (_) {}
            }
        } catch (_) {}
    };

    if (loading) {
        return (
            <ScreenBackground style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Loading...</Text>
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
                    <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} />
                }
            >
                {/* ── HEADER ── */}
                <View style={styles.header}>
                    <Image source={require('../../assets/images/logo-white.png')} style={styles.logo} resizeMode="contain" />
                    <View style={styles.headerRight}>
                        <TouchableOpacity onPress={() => router.push('/(student-tabs)/notifications' as any)} style={styles.bellWrap}>
                            <Ionicons name="notifications-outline" size={24} color="#ffffff" />
                            {unreadCount > 0 && (
                                <View style={styles.badge}><Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text></View>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => router.push('/(student-tabs)/profile' as any)} style={styles.avatarWrap}>
                            {profilePicUrl ? (
                                <Image source={{ uri: `${profilePicUrl}?t=${imageTs}` }} style={styles.avatarImg} />
                            ) : (
                                <View style={styles.avatarPlaceholder}>
                                    <Text style={styles.avatarPlaceholderText}>{user?.name?.charAt(0) || 'S'}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                <Text style={styles.greeting}>
                    {t('home.greeting', { name: user?.name?.split(' ')[0] || t('home.studentFallback') })}
                </Text>
                <Text style={styles.subtitle}>{t('home.subtitle')}</Text>

                {/* ── QUICK ACTIONS ── */}
                <View style={styles.quickRow}>
                    <TouchableOpacity style={[styles.quickCard, { width: CARD_HALF, height: CARD_HALF * 0.85 }]} onPress={() => router.push('/course-search' as any)} activeOpacity={0.8}>
                        <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
                        <View style={styles.quickTop}>
                            <View style={styles.quickIconWrap}><Ionicons name="search-outline" size={22} color="rgba(255,255,255,0.7)" /></View>
                            <Ionicons name="arrow-up-outline" size={18} color="rgba(255,255,255,0.4)" style={{ transform: [{ rotate: '45deg' }] }} />
                        </View>
                        <Text style={styles.quickLabel}>{t('home.quickTrainings')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.quickCard, { width: CARD_HALF, height: CARD_HALF * 0.85 }]} onPress={() => router.push('/(student-tabs)/chatbot' as any)} activeOpacity={0.8}>
                        <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
                        <View style={styles.quickTop}>
                            <View style={styles.quickIconWrap}><Ionicons name="chatbubble-ellipses-outline" size={22} color="rgba(255,255,255,0.7)" /></View>
                            <Ionicons name="arrow-up-outline" size={18} color="rgba(255,255,255,0.4)" style={{ transform: [{ rotate: '45deg' }] }} />
                        </View>
                        <Text style={styles.quickLabel}>{t('home.quickAiChat')}</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity style={[styles.quickCard, { width: '100%', height: CARD_HALF * 0.7 }]} onPress={() => router.push('/feed' as any)} activeOpacity={0.8}>
                    <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.quickTop}>
                        <View style={styles.quickIconWrap}><Ionicons name="list-outline" size={22} color="rgba(255,255,255,0.7)" /></View>
                        <Ionicons name="arrow-up-outline" size={18} color="rgba(255,255,255,0.4)" style={{ transform: [{ rotate: '45deg' }] }} />
                    </View>
                    <Text style={styles.quickLabel}>{t('home.quickFeed')}</Text>
                </TouchableOpacity>

                {/* ── UPCOMING SESSIONS ──
                    Flat list of every scheduled future session across all
                    the student's groups, sorted soonest-first. Shows the
                    next 3 inline + a See All into /my-schedule. Hidden
                    entirely if no trainer has scheduled anything yet so
                    we don't render an empty header. */}
                {upcomingSessions.length > 0 && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>{t('home.upcomingSessions')}</Text>
                            <TouchableOpacity onPress={() => router.push('/my-schedule' as any)}>
                                <Text style={styles.seeAll}>{t('common.seeAll')}</Text>
                            </TouchableOpacity>
                        </View>
                        {upcomingSessions.slice(0, 3).map((s: any, i: number) => {
                            const dt = s?.date && s?.time
                                ? new Date(`${s.date}T${String(s.time).length === 5 ? s.time + ':00' : s.time}`)
                                : null;
                            const dateLabel = dt
                                ? dt.toLocaleDateString(i18n.language || undefined, { weekday: 'short', month: 'short', day: 'numeric' })
                                : s?.date || '';
                            const timeLabel = s?.time ? String(s.time).slice(0, 5) : '';
                            return (
                                <TouchableOpacity
                                    key={`${s.groupId}-${s.date}-${s.time}-${i}`}
                                    style={styles.sessionCard}
                                    activeOpacity={0.85}
                                    onPress={() => s.courseId && router.push({ pathname: '/course-detail' as any, params: { courseId: s.courseId } })}
                                >
                                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                    <View style={[styles.sessionAccent, { backgroundColor: '#7cce06' }]} />
                                    <View style={styles.sessionBody}>
                                        <View style={styles.sessionTop}>
                                            <Text style={styles.sessionTitle} numberOfLines={1}>
                                                {s.courseTitle || s.groupName || 'Session'}
                                            </Text>
                                        </View>
                                        <Text style={styles.sessionTrainer}>{dateLabel} · {timeLabel}</Text>
                                        <View style={styles.sessionMeta}>
                                            <View style={styles.metaChip}>
                                                <Ionicons
                                                    name={s.isOnline ? 'videocam-outline' : 'location-outline'}
                                                    size={13}
                                                    color="#aaaaaa"
                                                />
                                                <Text style={styles.metaText}>{s.isOnline ? t('common.online') : t('common.onSite')}</Text>
                                            </View>
                                            {s.hours ? (
                                                <View style={styles.metaChip}>
                                                    <Ionicons name="time-outline" size={13} color="#aaaaaa" />
                                                    <Text style={styles.metaText}>{s.hours}h</Text>
                                                </View>
                                            ) : null}
                                        </View>
                                    </View>
                                    <View style={styles.sessionRight}>
                                        <View style={styles.sessionTypeBadge}>
                                            <Ionicons name="calendar-outline" size={12} color="#7cce06" />
                                            <Text style={styles.sessionTypeText}>Session</Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.2)" style={{ marginTop: 8 }} />
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}

                {/* ── MY ENROLLMENTS ── */}
                {enrolledCourses.length > 0 && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>{t('home.myEnrollments')}</Text>
                            <TouchableOpacity onPress={() => router.push('/my-schedule' as any)}>
                                <Text style={styles.seeAll}>{t('common.seeAll')}</Text>
                            </TouchableOpacity>
                        </View>
                        {enrolledCourses.slice(0, 4).map((enrollment: any, i: number) => (
                            <TouchableOpacity
                                key={enrollment.enrollmentId || i}
                                style={styles.sessionCard}
                                activeOpacity={0.85}
                                onPress={() => enrollment.courseId && router.push({ pathname: '/course-detail' as any, params: { courseId: enrollment.courseId } })}
                            >
                                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                <View style={[styles.sessionAccent, {
                                    backgroundColor: enrollment.enrollmentStatus === 'active' ? '#7cce06' : 'rgba(124,206,6,0.35)'
                                }]} />
                                <View style={styles.sessionBody}>
                                    <View style={styles.sessionTop}>
                                        <Text style={styles.sessionTitle} numberOfLines={1}>
                                            {enrollment.courseTitle || enrollment.courseName || 'Course'}
                                        </Text>
                                        {enrollment.enrollmentStatus === 'active' && (
                                            <View style={styles.soonBadge}>
                                                <Text style={styles.soonText}>Active</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={styles.sessionTrainer}>{enrollment.trainerName || ''}</Text>
                                    <View style={styles.sessionMeta}>
                                        <View style={styles.metaChip}>
                                            <Ionicons name="school-outline" size={13} color="#aaaaaa" />
                                            <Text style={styles.metaText}>{enrollment.enrollmentStatus || 'enrolled'}</Text>
                                        </View>
                                        {enrollment.progressPercentage != null && (
                                            <View style={styles.metaChip}>
                                                <Ionicons name="analytics-outline" size={13} color="#aaaaaa" />
                                                <Text style={styles.metaText}>{enrollment.progressPercentage}%</Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                                <View style={styles.sessionRight}>
                                    <View style={styles.sessionTypeBadge}>
                                        <Ionicons name="book-outline" size={12} color="#aaaaaa" />
                                        <Text style={styles.sessionTypeText}>Course</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.2)" style={{ marginTop: 8 }} />
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* ── GROUPS FORMING NOW ──
                    Shows courses that are ≥75% of the way to their minimum
                    student requirement. Tapping a card opens course-detail
                    where the student goes through the normal request flow —
                    no inline Join button, so there's a single path through
                    the funnel and we don't have to duplicate enrollment UX. */}
                {formingGroups.length > 0 && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>{t('home.groupsForming')}</Text>
                            <TouchableOpacity onPress={() => router.push('/groups-forming' as any)}><Text style={styles.seeAll}>{t('common.seeAll')}</Text></TouchableOpacity>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
                            {formingGroups.map((course: any, i: number) => {
                                const courseId = course.courseId || course.id;
                                const spotsLeft = course._min - course._enrolled;
                                return (
                                    <TouchableOpacity
                                        key={courseId || i}
                                        style={styles.groupCard}
                                        activeOpacity={0.85}
                                        onPress={() => router.push({ pathname: '/course-detail' as any, params: { courseId } })}
                                    >
                                        <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
                                        <View style={styles.groupDomain}>
                                            <Ionicons name="people" size={16} color="#7cce06" />
                                            <Text style={styles.groupDomainText} numberOfLines={1}>
                                                {course.domain || course.level || 'Course'}
                                            </Text>
                                        </View>
                                        <Text style={styles.groupTitle} numberOfLines={2}>{course.title}</Text>
                                        <Text style={styles.groupTrainer} numberOfLines={1}>
                                            {course.trainerName || course.trainer || 'Trainer'}
                                        </Text>
                                        <View style={styles.groupProgress}>
                                            <View style={styles.progressTrackSmall}>
                                                <View style={[styles.progressFillGroup, { width: `${course._pct}%` }]} />
                                            </View>
                                            <Text style={styles.groupCount}>{course._enrolled}/{course._min}</Text>
                                        </View>
                                        <Text style={styles.spotsHint}>
                                            {spotsLeft === 1 ? '1 spot left' : `${spotsLeft} spots left`}
                                        </Text>
                                        <View style={styles.viewHint}>
                                            <Text style={styles.viewHintText}>View course</Text>
                                            <Ionicons name="chevron-forward" size={13} color="#7cce06" />
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                )}

                {/* ── RECOMMENDED FOR YOU ── */}
                {recommendations.length > 0 && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>{t('home.recommended')}</Text>
                            <TouchableOpacity onPress={() => router.push('/recommended-courses' as any)}><Text style={styles.seeAll}>{t('common.seeAll')}</Text></TouchableOpacity>
                        </View>
                        {recommendations.slice(0, 4).map((course: any) => (
                            <TouchableOpacity
                                key={course.courseId || course.id}
                                style={styles.recCard}
                                activeOpacity={0.85}
                                onPress={() => router.push({ pathname: '/course-detail' as any, params: { courseId: course.courseId || course.id } })}
                            >
                                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                <View style={styles.recIcon}>
                                    <Ionicons name="school" size={28} color="#7cce06" />
                                </View>
                                <View style={styles.recInfo}>
                                    <Text style={styles.recTitle} numberOfLines={1}>{course.title}</Text>
                                    <Text style={styles.recTrainer}>{course.trainerName || course.trainer || ''}</Text>
                                    <View style={styles.recMeta}>
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
                                    </View>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* ── TOP TRAINERS ── */}
                {trainers.length > 0 && (
                    <View style={[styles.section, { marginBottom: 40 }]}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>{t('home.topTrainers')}</Text>
                            <TouchableOpacity onPress={() => router.push('/(student-tabs)/trainers' as any)}><Text style={styles.seeAll}>{t('common.seeAll')}</Text></TouchableOpacity>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
                            {trainers.slice(0, 8).map((trainer: any, i: number) => (
                                <TouchableOpacity
                                    key={trainer.trainerId || i}
                                    style={styles.trainerCard}
                                    activeOpacity={0.85}
                                    onPress={() => trainer.trainerId && router.push({
                                        pathname: '/trainer-profile' as any,
                                        params: { trainerId: trainer.trainerId },
                                    })}
                                >
                                    <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
                                    <View style={styles.trainerAvatar}>
                                        {trainer.profilePictureUrl ? (
                                            <Image source={{ uri: `${trainer.profilePictureUrl}?t=${imageTs}` }} style={{ width: 56, height: 56, borderRadius: 28 }} />
                                        ) : (
                                            <Ionicons name="person" size={28} color="rgba(255,255,255,0.6)" />
                                        )}
                                    </View>
                                    <Text style={styles.trainerName} numberOfLines={1}>{trainer.name}</Text>
                                    <Text style={styles.trainerDomain}>
                                        {(trainer.specializations && trainer.specializations[0]) || 'Trainer'}
                                    </Text>
                                    <View style={styles.trainerStats}>
                                        {trainer.isVerified && <Ionicons name="checkmark-circle" size={12} color="#7cce06" />}
                                        <Ionicons name="book-outline" size={12} color="#aaaaaa" />
                                        <Text style={styles.trainerStatText}>{trainer.coursesCount || 0} courses</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Show empty state only if everything is empty */}
                {recommendations.length === 0 && enrolledCourses.length === 0 && trainers.length === 0 && (
                    <View style={styles.section}>
                        <View style={{ alignItems: 'center', paddingTop: 20, paddingBottom: 40 }}>
                            <Ionicons name="planet-outline" size={48} color="rgba(124,206,6,0.4)" />
                            <Text style={{ fontSize: 16, color: '#ffffff', fontWeight: '600', marginTop: 16 }}>
                                No data yet
                            </Text>
                            <Text style={{ fontSize: 14, color: '#aaaaaa', textAlign: 'center', marginTop: 8 }}>
                                Courses and trainers will appear here{'\n'}once they're available on the platform.
                            </Text>
                        </View>
                    </View>
                )}
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 16, fontSize: 16, color: '#aaaaaa' },

    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 120, paddingHorizontal: 20 },

    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 56, marginBottom: 20 },
    logo: { width: 44, height: 44 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    bellWrap: { position: 'relative' },
    badge: { position: 'absolute', top: -4, right: -6, backgroundColor: '#ff4444', width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
    badgeText: { fontSize: 10, fontWeight: 'bold', color: '#ffffff' },
    avatarWrap: {},
    avatarImg: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(124,206,6,0.6)' },
    avatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(124,206,6,0.2)', borderWidth: 2, borderColor: 'rgba(124,206,6,0.5)', justifyContent: 'center', alignItems: 'center' },
    avatarPlaceholderText: { fontSize: 18, fontWeight: 'bold', color: '#7cce06' },

    greeting: { fontSize: 24, fontWeight: 'bold', color: '#ffffff' },
    subtitle: { fontSize: 15, color: '#aaaaaa', marginBottom: 24 },

    quickRow: { flexDirection: 'row', gap: CARD_GAP, marginBottom: CARD_GAP },
    quickCard: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', padding: 16, justifyContent: 'space-between' },
    quickTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    quickIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    quickLabel: { fontSize: 16, fontWeight: '600', color: '#ffffff' },

    section: { marginTop: 28 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#ffffff' },
    seeAll: { fontSize: 13, fontWeight: '600', color: '#7cce06' },

    sessionCard: { flexDirection: 'row', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 10, minHeight: 90 },
    sessionAccent: { width: 4, borderRadius: 0 },
    sessionBody: { flex: 1, padding: 14 },
    sessionTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    sessionTitle: { fontSize: 15, fontWeight: '600', color: '#ffffff', flex: 1 },
    soonBadge: { backgroundColor: 'rgba(124,206,6,0.18)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(124,206,6,0.4)' },
    soonText: { fontSize: 11, fontWeight: '700', color: '#7cce06' },
    sessionTrainer: { fontSize: 12, color: '#aaaaaa', marginBottom: 8 },
    sessionMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    sessionRight: { paddingVertical: 14, paddingRight: 14, alignItems: 'flex-end', justifyContent: 'space-between' },
    sessionTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    sessionTypeText: { fontSize: 11, color: '#aaaaaa' },

    horizontalList: { gap: 12, paddingRight: 20 },
    groupCard: { width: 180, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', padding: 14 },
    groupDomain: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    groupDomainText: { fontSize: 11, color: '#7cce06', fontWeight: '600', textTransform: 'uppercase' },
    groupTitle: { fontSize: 14, fontWeight: '600', color: '#ffffff', marginBottom: 4, lineHeight: 20 },
    groupTrainer: { fontSize: 12, color: '#aaaaaa', marginBottom: 10 },
    groupProgress: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    progressTrackSmall: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)' },
    progressFillGroup: { height: 4, borderRadius: 2, backgroundColor: '#7cce06' },
    groupCount: { fontSize: 11, color: '#aaaaaa', fontWeight: '600' },
    spotsHint: { fontSize: 10, color: '#FFA500', fontWeight: '600', marginBottom: 8 },
    // viewHint replaces the old Join button: tapping the card navigates to
    // course-detail, so all we need is a "tap me" affordance, not an action.
    viewHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
    viewHintText: { fontSize: 12, fontWeight: '600', color: '#7cce06' },

    recCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', padding: 14, marginBottom: 10 },
    recIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(124,206,6,0.12)', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    recInfo: { flex: 1 },
    recTitle: { fontSize: 15, fontWeight: '600', color: '#ffffff', marginBottom: 2 },
    recTrainer: { fontSize: 12, color: '#aaaaaa', marginBottom: 6 },
    recMeta: { flexDirection: 'row', gap: 10 },
    metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { fontSize: 11, color: '#aaaaaa' },

    trainerCard: { width: 140, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', padding: 14, alignItems: 'center' },
    trainerAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
    trainerName: { fontSize: 14, fontWeight: '600', color: '#ffffff', marginBottom: 2, textAlign: 'center' },
    trainerDomain: { fontSize: 11, color: '#aaaaaa', marginBottom: 8 },
    trainerStats: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    trainerStatText: { fontSize: 11, color: '#aaaaaa' },
    trainerStatDot: { fontSize: 11, color: 'rgba(255,255,255,0.2)' },
});
