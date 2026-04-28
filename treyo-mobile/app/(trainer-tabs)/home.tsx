import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { authService, courseService, notificationService } from '../../services/api';
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
    const [unreadNotifCount, setUnreadNotifCount] = useState(0);
    const [stats, setStats] = useState({ students: 0, courses: 0, rating: 0, revenue: 0 });

    const loadData = async () => {
        try {
            const currentUser = await authService.getCurrentUser();
            setUser(currentUser);

            try {
                const res = await api.get('/trainers/me');
                setProfilePicUrl(res.data.profilePictureUrl || null);
                setImageTs(Date.now());

                setStats({
                    students: res.data.totalStudents || 0,
                    courses: res.data.totalCourses || 0,
                    rating: res.data.averageRating || 0,
                    revenue: res.data.totalRevenue || 0,
                });
            } catch (_) {}

            if (currentUser?.userId) {
                try {
                    const trainerCourses = await courseService.getTrainerCourses(currentUser.userId);
                    setCourses(trainerCourses || []);
                } catch (_) {
                    setCourses([]);
                }

                try {
                    const count = await notificationService.getUnreadCount(currentUser.userId);
                    setUnreadNotifCount(typeof count === 'number' ? count : 0);
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

    const formatRevenue = (v: number) => {
        if (!v) return '$0';
        if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
        return `$${v}`;
    };

    const activeCourses = courses.filter((c: any) => {
        const s = (c.status || c.courseStatus || '').toString().toUpperCase();
        return s === 'PUBLISHED' || s === 'ACTIVE';
    });

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
                            <StatCard title="Revenue" value={formatRevenue(stats.revenue)} icon="cash-outline" color="#FFD700" />
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
                                        students={c.enrolledCount ?? 0}
                                        groups={c.groupsCount ?? 0}
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

function StatCard({ title, value, icon, color }: any) {
    return (
        <View style={styles.statCard}>
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[styles.statIcon, { backgroundColor: color + '20' }]}>
                <Ionicons name={icon} size={22} color={color} />
            </View>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statTitle}>{title}</Text>
        </View>
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
});
