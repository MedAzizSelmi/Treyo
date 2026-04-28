import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { ScreenBackground } from '../../components/ScreenBackground';
import { authService, courseService, notificationService } from '../../services/api';
import api from '../../services/api';

export default function TrainerCoursesScreen() {
    const router = useRouter();
    const [userName, setUserName] = useState('');
    const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
    const [imageTs, setImageTs] = useState(Date.now());
    const [activeFilter, setActiveFilter] = useState<'All' | 'Active' | 'Draft' | 'Completed'>('All');
    const [courses, setCourses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [unreadNotifCount, setUnreadNotifCount] = useState(0);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const loadData = async () => {
        try {
            const user = await authService.getCurrentUser();
            if (user?.name) setUserName(user.name.split(' ')[0]);

            try {
                const res = await api.get('/trainers/me');
                setProfilePicUrl(res.data.profilePictureUrl || null);
                setImageTs(Date.now());
            } catch (_) {}

            if (user?.userId) {
                try {
                    const list = await courseService.getTrainerCourses(user.userId);
                    setCourses(list || []);
                } catch (_) {
                    setCourses([]);
                }

                try {
                    const count = await notificationService.getUnreadCount(user.userId);
                    setUnreadNotifCount(typeof count === 'number' ? count : 0);
                } catch (_) {}
            }
        } catch (e) {
            console.log('Trainer courses load error', e);
        } finally {
            setLoading(false);
        }
    };

    const mapStatus = (c: any): 'Active' | 'Draft' | 'Completed' => {
        const s = (c.status || c.courseStatus || '').toString().toUpperCase();
        if (s === 'PUBLISHED' || s === 'ACTIVE') return 'Active';
        if (s === 'COMPLETED' || s === 'ARCHIVED') return 'Completed';
        return 'Draft';
    };

    const filters: Array<'All' | 'Active' | 'Draft' | 'Completed'> = ['All', 'Active', 'Draft', 'Completed'];
    const filtered = activeFilter === 'All' ? courses : courses.filter(c => mapStatus(c) === activeFilter);

    const statusColor = (status: string) => {
        switch (status) {
            case 'Active': return '#7cce06';
            case 'Draft': return '#aaaaaa';
            case 'Completed': return '#3b5bdb';
            default: return '#aaaaaa';
        }
    };

    return (
        <ScreenBackground>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
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
                                    <Text style={styles.avatarPlaceholderText}>{userName.charAt(0) || 'T'}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── Title + Add button ── */}
                <View style={styles.titleRow}>
                    <View>
                        <Text style={styles.pageTitle}>My Courses</Text>
                        <Text style={styles.pageSubtitle}>
                            {courses.length} course{courses.length === 1 ? '' : 's'} total
                        </Text>
                    </View>
                    <TouchableOpacity style={styles.addBtn} activeOpacity={0.8}>
                        <Ionicons name="add" size={20} color="#000" />
                        <Text style={styles.addBtnText}>New</Text>
                    </TouchableOpacity>
                </View>

                {/* ── Filter chips ── */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                    {filters.map(f => (
                        <TouchableOpacity
                            key={f}
                            onPress={() => setActiveFilter(f)}
                            style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
                            activeOpacity={0.7}
                        >
                            <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>{f}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* ── Course Cards ── */}
                {loading ? (
                    <View style={{ paddingTop: 40, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#7cce06" />
                    </View>
                ) : filtered.length > 0 ? filtered.map((course: any) => {
                    const status = mapStatus(course);
                    return (
                        <TouchableOpacity key={course.courseId || course.id} style={styles.courseCard} activeOpacity={0.85}>
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />

                            <View style={styles.cardTop}>
                                <View style={styles.courseIconWrap}>
                                    <Ionicons name="book" size={24} color="#7cce06" />
                                </View>
                                <View style={[styles.statusBadge, { backgroundColor: statusColor(status) + '20', borderColor: statusColor(status) + '50' }]}>
                                    <Text style={[styles.statusText, { color: statusColor(status) }]}>{status}</Text>
                                </View>
                            </View>

                            <Text style={styles.courseTitle}>{course.title || 'Untitled course'}</Text>
                            {!!course.level && (
                                <View style={styles.levelChip}>
                                    <Ionicons name="layers-outline" size={12} color="#aaaaaa" />
                                    <Text style={styles.levelText}>{course.level}</Text>
                                </View>
                            )}

                            <View style={styles.cardDivider} />

                            <View style={styles.cardStats}>
                                <View style={styles.cardStat}>
                                    <Ionicons name="people-outline" size={14} color="#7cce06" />
                                    <Text style={styles.cardStatText}>
                                        {course.enrolledCount ?? course.students ?? 0} students
                                    </Text>
                                </View>
                                <View style={styles.cardStat}>
                                    <Ionicons name="git-branch-outline" size={14} color="#7cce06" />
                                    <Text style={styles.cardStatText}>
                                        {course.groupsCount ?? course.groups ?? 0} groups
                                    </Text>
                                </View>
                                <TouchableOpacity style={styles.manageBtn}>
                                    <Text style={styles.manageBtnText}>Manage</Text>
                                    <Ionicons name="chevron-forward" size={13} color="#7cce06" />
                                </TouchableOpacity>
                            </View>
                        </TouchableOpacity>
                    );
                }) : (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <Ionicons name="book-outline" size={48} color="rgba(124,206,6,0.4)" />
                        </View>
                        <Text style={styles.emptyTitle}>
                            No {activeFilter !== 'All' ? activeFilter.toLowerCase() + ' ' : ''}courses
                        </Text>
                        <Text style={styles.emptySubtitle}>Tap "New" to create your first course.</Text>
                    </View>
                )}
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 120, paddingHorizontal: 20 },

    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 56, marginBottom: 20 },
    logo: { width: 44, height: 44 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    bellWrap: { position: 'relative' },
    badge: { position: 'absolute', top: -4, right: -6, backgroundColor: '#ff4444', width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
    badgeText: { fontSize: 10, fontWeight: 'bold', color: '#ffffff' },
    avatarImg: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(124,206,6,0.6)' },
    avatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(124,206,6,0.2)', borderWidth: 2, borderColor: 'rgba(124,206,6,0.5)', justifyContent: 'center', alignItems: 'center' },
    avatarPlaceholderText: { fontSize: 18, fontWeight: 'bold', color: '#7cce06' },

    titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    pageTitle: { fontSize: 24, fontWeight: 'bold', color: '#ffffff' },
    pageSubtitle: { fontSize: 15, color: '#aaaaaa', marginTop: 2 },
    addBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#7cce06', borderRadius: 12,
        paddingHorizontal: 14, paddingVertical: 9,
    },
    addBtnText: { fontSize: 14, fontWeight: '700', color: '#000' },

    filterRow: { gap: 8, paddingBottom: 16 },
    filterChip: {
        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    },
    filterChipActive: {
        backgroundColor: 'rgba(124,206,6,0.15)',
        borderColor: 'rgba(124,206,6,0.4)',
    },
    filterText: { fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: '500' },
    filterTextActive: { color: '#7cce06', fontWeight: '700' },

    courseCard: {
        borderRadius: 18, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        padding: 16, marginBottom: 14,
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    courseIconWrap: {
        width: 46, height: 46, borderRadius: 14,
        backgroundColor: 'rgba(124,206,6,0.12)',
        justifyContent: 'center', alignItems: 'center',
    },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
    statusText: { fontSize: 12, fontWeight: '700' },
    courseTitle: { fontSize: 17, fontWeight: '700', color: '#ffffff', marginBottom: 6 },
    levelChip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 14 },
    levelText: { fontSize: 12, color: '#aaaaaa' },
    cardDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginBottom: 12 },
    cardStats: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    cardStat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    cardStatText: { fontSize: 13, color: '#aaaaaa' },
    manageBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 'auto' as any },
    manageBtnText: { fontSize: 13, fontWeight: '600', color: '#7cce06' },

    emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 24 },
    emptyIconWrap: {
        width: 88, height: 88, borderRadius: 44,
        backgroundColor: 'rgba(124,206,6,0.06)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.12)',
        justifyContent: 'center', alignItems: 'center', marginBottom: 20,
    },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff', marginBottom: 8 },
    emptySubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 22 },
});
