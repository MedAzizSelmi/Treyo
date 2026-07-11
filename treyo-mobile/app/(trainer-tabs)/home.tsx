import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { authService, courseService, notificationService, groupService, trainerService } from '../../services/api';
import api from '../../services/api';
import { ScreenBackground } from '../../components/ScreenBackground';

export default function TrainerHomeScreen() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
    const [imageTs, setImageTs] = useState(Date.now());
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [courses, setCourses] = useState<any[]>([]);
    const [upcomingSessions, setUpcomingSessions] = useState<any[]>([]);
    const [unreadNotifCount, setUnreadNotifCount] = useState(0);
    const [stats, setStats] = useState({ students: 0, courses: 0, rating: 0, revenue: 0 });
    const [currency, setCurrency] = useState<string>('TND');

    const loadData = async () => {
        try {
            const currentUser = await authService.getCurrentUser();
            setUser(currentUser);

            let trainerData: any = null;
            try {
                const res = await api.get('/trainers/me');
                trainerData = res.data;
                setProfilePicUrl(res.data.profilePictureUrl || null);
                setImageTs(Date.now());
            } catch (_) {}

            if (currentUser?.userId) {
                let trainerCourses: any[] = [];
                try {
                    trainerCourses = await courseService.getTrainerCourses(currentUser.userId) || [];
                    setCourses(trainerCourses);
                } catch (_) {
                    setCourses([]);
                }

                // Stats are derived from the courses list because the
                // trainer entity's totalStudentsTaught / totalRevenue fields
                // don't auto-update on enrollment — they were originally
                // designed as lifetime aggregates and are commonly zero.
                // Summing across courses gives us a live number that
                // matches what shows in the My Courses section below.
                const studentsCount = trainerCourses.reduce(
                    (sum: number, c: any) =>
                        sum + (c.totalEnrolled ?? c.interestedStudentsCount ?? 0),
                    0,
                );
                setStats({
                    students: studentsCount,
                    courses: trainerCourses.length,
                    rating: trainerData?.averageRating
                        ? Number(trainerData.averageRating)
                        : 0,
                    revenue: 0, // No payment system yet — see admin dashboard rewrite
                });

                try {
                    const sessions = await groupService.getUpcomingSessions(currentUser.userId);
                    setUpcomingSessions(Array.isArray(sessions) ? sessions : []);
                } catch (_) {
                    setUpcomingSessions([]);
                }

                try {
                    const count = await notificationService.getUnreadCount(currentUser.userId);
                    setUnreadNotifCount(typeof count === 'number' ? count : 0);
                } catch (_) {}

                try {
                    const res = await trainerService.getCurrency(currentUser.userId);
                    if (res.currency) setCurrency(res.currency);
                } catch (_) {}

                // Current-month earnings — resets each month naturally
                // since we always query {now.year, now.month}. Backend
                // returns a currency too, which overrides the trainer's
                // preferred display currency when set.
                try {
                    const now = new Date();
                    const earn = await trainerService.getEarnings(
                        currentUser.userId,
                        now.getFullYear(),
                        now.getMonth() + 1,
                    );
                    setStats(s => ({ ...s, revenue: Number(earn.total) || 0 }));
                    if (earn.currency) setCurrency(earn.currency);
                } catch (_) {}
            }
        } catch (e) {
            console.log('Trainer home load error', e);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const firstName = user?.name?.split(' ')[0] || 'Trainer';

    /**
     * Render revenue using the trainer's preferred currency (settings-
     * currency screen). Trailing code — "0 EUR", "1.2k TND" — rather
     * than a leading symbol since not every listed currency has a
     * clean one-glyph prefix (MAD, DZD, AED all read better as codes).
     */
    const formatRevenue = (v: number) => {
        if (!v) return `0 ${currency}`;
        if (v >= 1000) return `${(v / 1000).toFixed(1)}k ${currency}`;
        return `${v} ${currency}`;
    };

    // Courses returned by /api/courses/trainer/{id} carry isPublished /
    // isActive booleans, NOT a stringly-typed "status" field — the
    // earlier filter checked phantom fields and dropped everything.
    // Drafts were removed app-wide, so every active row is live.
    const activeCourses = courses.filter((c: any) => c.isActive !== false);

    return (
        <ScreenBackground>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#7cce06']} />}
            >
                {/* ── Header ── */}
                <View style={styles.header}>
                    <Image source={require('../../assets/images/logo-white.png')} style={styles.logo} resizeMode="contain" />
                    <View style={styles.headerRight}>
                        <TouchableOpacity onPress={() => router.push('/(trainer-tabs)/notifications' as any)} style={styles.bellWrap}>
                            <Ionicons name="notifications-outline" size={24} color="#ffffff" />
                            {unreadNotifCount > 0 && (
                                <View style={styles.badge}>
                                    <Text style={styles.badgeText}>{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => router.push('/(trainer-tabs)/profile' as any)}>
                            {profilePicUrl ? (
                                <Image source={{ uri: `${profilePicUrl}?t=${imageTs}` }} style={styles.avatarImg} />
                            ) : (
                                <View style={styles.avatarPlaceholder}>
                                    <Text style={styles.avatarPlaceholderText}>{user?.name?.charAt(0) || 'T'}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                <Text style={styles.greeting}>Hello, {firstName}</Text>
                <Text style={styles.subtitle}>Here's your dashboard</Text>

                {loading ? (
                    <View style={{ paddingTop: 60, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#7cce06" />
                    </View>
                ) : (
                    <>
                        {/* ── Stats Grid ── */}
                        <View style={styles.statsRow}>
                            <StatCard title="Students" value={String(stats.students)} icon="people" color="#7cce06" />
                            <StatCard
                                title="Revenue"
                                value={formatRevenue(stats.revenue)}
                                icon="cash-outline"
                                color="#FFD700"
                                onPress={() => router.push('/trainer-earnings' as any)}
                            />
                        </View>
                        <View style={styles.statsRow}>
                            <StatCard title="Courses" value={String(stats.courses || courses.length)} icon="book-outline" color="#FF6B6B" />
                            <StatCard
                                title="Avg Rating"
                                value={stats.rating ? stats.rating.toFixed(1) : '—'}
                                icon="star"
                                color="#FFA500"
                            />
                        </View>

                        {/* ── Upcoming Sessions ── */}
                        <View style={styles.section}>
                            <View style={styles.sectionHeader}>
                                <Text style={styles.sectionTitle}>Upcoming Sessions</Text>
                                <Text style={styles.sessionCount}>
                                    {upcomingSessions.length > 0 ? `${upcomingSessions.length} scheduled` : ''}
                                </Text>
                            </View>
                            {upcomingSessions.length > 0 ? (
                                upcomingSessions.slice(0, 4).map((s: any) => (
                                    <SessionCard key={s.groupId} session={s} />
                                ))
                            ) : (
                                <View style={styles.sessionsEmpty}>
                                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                    <View style={styles.sessionsEmptyIcon}>
                                        <Ionicons name="calendar-outline" size={28} color="rgba(124,206,6,0.5)" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.sessionsEmptyTitle}>No sessions scheduled</Text>
                                        <Text style={styles.sessionsEmptyText}>
                                            You'll see upcoming groups here once enough students enroll in your courses.
                                        </Text>
                                    </View>
                                </View>
                            )}
                        </View>

                        {/* ── My Courses ── */}
                        <View style={styles.section}>
                            <View style={styles.sectionHeader}>
                                <Text style={styles.sectionTitle}>My Courses</Text>
                                <TouchableOpacity onPress={() => router.push('/(trainer-tabs)/courses' as any)}>
                                    <Text style={styles.seeAll}>See All</Text>
                                </TouchableOpacity>
                            </View>
                            {activeCourses.length > 0 ? (
                                activeCourses.slice(0, 3).map((c: any) => (
                                    <FormationCard
                                        key={c.courseId || c.id}
                                        title={c.title || 'Untitled'}
                                        // CourseResponse uses totalEnrolled (paid) +
                                        // interestedStudentsCount (queue) — fall back
                                        // through both before the legacy enrolledCount.
                                        students={
                                            c.totalEnrolled
                                            ?? c.interestedStudentsCount
                                            ?? c.enrolledCount
                                            ?? 0
                                        }
                                        groups={c.currentGroupsCount ?? c.groupsCount ?? 0}
                                        status="Active"
                                    />
                                ))
                            ) : (
                                <View style={styles.emptyInline}>
                                    <Text style={styles.emptyInlineText}>No published courses yet.</Text>
                                </View>
                            )}
                        </View>
                    </>
                )}
            </ScrollView>
        </ScreenBackground>
    );
}

function StatCard({ title, value, icon, color, onPress }: any) {
    const inner = (
        <>
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[styles.statIcon, { backgroundColor: color + '20' }]}>
                <Ionicons name={icon} size={22} color={color} />
            </View>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statTitle}>{title}</Text>
        </>
    );
    if (onPress) {
        return (
            <TouchableOpacity style={styles.statCard} onPress={onPress} activeOpacity={0.75}>
                {inner}
            </TouchableOpacity>
        );
    }
    return <View style={styles.statCard}>{inner}</View>;
}

function formatSessionDate(iso: string | null | undefined): { day: string; time: string; relative: string } {
    // Short labels — these get rendered into a 64dp pill so anything
    // longer than ~6 chars wraps to a second line (the old "Forming"
    // and "Tomorrow" both did). Keeping each label ≤ 5 chars keeps the
    // pill on a single line for all states.
    if (!iso) return { day: 'Date TBA', time: '', relative: 'Soon' };
    const d = new Date(iso);
    const now = new Date();
    const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

    const diffMs = d.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    let relative: string;
    if (diffDays < 0) relative = 'Now';
    else if (diffDays === 0) relative = 'Today';
    else if (diffDays === 1) relative = 'Tmrw';
    else if (diffDays < 7) relative = `In ${diffDays}d`;
    else relative = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return { day, time, relative };
}

function SessionCard({ session }: { session: any }) {
    const router = useRouter();
    const { day, time, relative } = formatSessionDate(session.startDate);
    const status = (session.groupStatus || '').toLowerCase();
    const statusColor = status === 'active' ? '#7cce06' : status === 'ready' ? '#FFA500' : '#888';
    const studentRatio = `${session.currentSize ?? 0}/${session.maxSize ?? 0}`;
    const locationLabel = session.isOnline
        ? (session.meetingLink ? 'Online · Link ready' : 'Online')
        : (session.meetingLocation || 'Location TBA');

    return (
        <TouchableOpacity
            style={styles.sessionCard}
            activeOpacity={0.85}
            // Tapping a session card opens the scheduling screen for this
            // group — where the trainer lays out the actual class dates.
            onPress={() => router.push({
                pathname: '/schedule-sessions' as any,
                params: { groupId: session.groupId },
            })}
        >
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />

            {/* Date pill on the left */}
            <View style={styles.sessionDatePill}>
                <Text style={styles.sessionDateRelative}>{relative}</Text>
                {!!time && <Text style={styles.sessionDateTime}>{time}</Text>}
            </View>

            {/* Body */}
            <View style={styles.sessionBody}>
                <Text style={styles.sessionTitle} numberOfLines={1}>
                    {session.courseTitle || session.groupName || 'Session'}
                </Text>
                {!!session.groupName && session.courseTitle && (
                    <Text style={styles.sessionSubtitle} numberOfLines={1}>{session.groupName}</Text>
                )}
                <View style={styles.sessionMetaRow}>
                    <View style={styles.sessionMetaChip}>
                        <Ionicons name={session.isOnline ? 'videocam-outline' : 'location-outline'} size={11} color="#aaa" />
                        <Text style={styles.sessionMetaText} numberOfLines={1}>{locationLabel}</Text>
                    </View>
                    <View style={styles.sessionMetaChip}>
                        <Ionicons name="people-outline" size={11} color="#aaa" />
                        <Text style={styles.sessionMetaText}>{studentRatio}</Text>
                    </View>
                </View>
            </View>

            {/* Status dot */}
            <View style={[styles.sessionStatusDot, { backgroundColor: statusColor }]} />
        </TouchableOpacity>
    );
}

function FormationCard({ title, students, groups, status }: any) {
    return (
        <TouchableOpacity style={styles.formationCard} activeOpacity={0.85}>
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.formationIcon}>
                <Ionicons name="book" size={24} color="#7cce06" />
            </View>
            <View style={styles.formationInfo}>
                <Text style={styles.formationTitle}>{title}</Text>
                <Text style={styles.formationStat}>{students} students • {groups} groups</Text>
            </View>
            <View style={styles.statusBadge}>
                <Text style={styles.statusText}>{status}</Text>
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 120, paddingHorizontal: 20 },

    // Header
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 56, marginBottom: 20 },
    logo: { width: 44, height: 44 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    bellWrap: { position: 'relative' },
    badge: { position: 'absolute', top: -4, right: -6, backgroundColor: '#ff4444', width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
    badgeText: { fontSize: 10, fontWeight: 'bold', color: '#ffffff' },
    avatarImg: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(124,206,6,0.6)' },
    avatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(124,206,6,0.2)', borderWidth: 2, borderColor: 'rgba(124,206,6,0.5)', justifyContent: 'center', alignItems: 'center' },
    avatarPlaceholderText: { fontSize: 18, fontWeight: 'bold', color: '#7cce06' },

    greeting: { fontSize: 24, fontWeight: 'bold', color: '#ffffff' },
    subtitle: { fontSize: 15, color: '#aaaaaa', marginBottom: 24 },

    // Stats
    statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    statCard: {
        flex: 1, borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        padding: 16, alignItems: 'center',
    },
    statIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
    statValue: { fontSize: 22, fontWeight: 'bold', color: '#ffffff', marginBottom: 2 },
    statTitle: { fontSize: 12, color: '#aaaaaa' },

    // Sections
    section: { marginTop: 24 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#ffffff' },
    seeAll: { fontSize: 13, fontWeight: '600', color: '#7cce06' },

    // Formations
    formationCard: {
        flexDirection: 'row', alignItems: 'center',
        borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        padding: 14, marginBottom: 10,
    },
    formationIcon: {
        width: 48, height: 48, borderRadius: 14,
        backgroundColor: 'rgba(124,206,6,0.12)',
        justifyContent: 'center', alignItems: 'center', marginRight: 14,
    },
    formationInfo: { flex: 1 },
    formationTitle: { fontSize: 15, fontWeight: '600', color: '#ffffff', marginBottom: 4 },
    formationStat: { fontSize: 12, color: '#aaaaaa' },
    statusBadge: {
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
        backgroundColor: 'rgba(124,206,6,0.15)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.3)',
    },
    statusText: { fontSize: 11, fontWeight: '700', color: '#7cce06' },

    emptyInline: {
        borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        padding: 20, alignItems: 'center',
    },
    emptyInlineText: { fontSize: 13, color: 'rgba(255,255,255,0.4)' },

    // Sessions
    sessionCount: { fontSize: 12, color: '#7cce06', fontWeight: '600' },
    sessionCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.2)',
        padding: 12, marginBottom: 10,
    },
    sessionDatePill: {
        width: 64, paddingVertical: 8, alignItems: 'center',
        backgroundColor: 'rgba(124,206,6,0.12)',
        borderRadius: 12,
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.25)',
    },
    // Dropped textTransform: 'uppercase' + letterSpacing: 0.4. With both
    // applied, "FORMING" (7 chars) wrapped to "FORMIN\nG" in the 64dp
    // pill. Mixed case fits the labels we now use (Soon / Today / Tmrw
    // / In Nd / Now) on a single line.
    sessionDateRelative: { fontSize: 12, fontWeight: '700', color: '#7cce06' },
    sessionDateTime: { fontSize: 12, color: '#ffffff', marginTop: 2, fontWeight: '600' },
    sessionBody: { flex: 1 },
    sessionTitle: { fontSize: 14, fontWeight: '700', color: '#ffffff', marginBottom: 2 },
    sessionSubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 6 },
    sessionMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    sessionMetaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 160 },
    sessionMetaText: { fontSize: 11, color: '#aaaaaa' },
    sessionStatusDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 4 },

    sessionsEmpty: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        padding: 16,
    },
    sessionsEmptyIcon: {
        width: 48, height: 48, borderRadius: 14,
        backgroundColor: 'rgba(124,206,6,0.08)',
        justifyContent: 'center', alignItems: 'center',
    },
    sessionsEmptyTitle: { fontSize: 14, fontWeight: '600', color: '#ffffff', marginBottom: 2 },
    sessionsEmptyText: { fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 17 },
});
