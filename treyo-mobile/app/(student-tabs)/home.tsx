import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, RefreshControl, ActivityIndicator, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { courseService, authService } from '../../services/api';
import api from '../../services/api';
import { useTheme } from '../../contexts/ThemeContext';
import { ScreenBackground } from '../../components/ScreenBackground';

const { width } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_HALF = (width - 40 - CARD_GAP) / 2; // 2-column card width

export default function StudentHomeScreen() {
    const { colors } = useTheme();
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [sessions, setSessions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => { loadData(); }, []);

    // Reload profile picture when returning from profile/edit screens
    useFocusEffect(
        useCallback(() => {
            loadProfilePic();
        }, [])
    );

    const loadProfilePic = async () => {
        try {
            const res = await api.get('/students/me');
            setProfilePicUrl(res.data.profilePictureUrl || null);
        } catch (e) {
            // silently ignore — avatar falls back to icon
        }
    };

    const loadData = async () => {
        try {
            const currentUser = await authService.getCurrentUser();
            setUser(currentUser);
            // Also grab profile pic
            try {
                const res = await api.get('/students/me');
                setProfilePicUrl(res.data.profilePictureUrl || null);
            } catch (_) {}
            const recs = await courseService.getRecommendations();
            setRecommendations(recs);
            // TODO: replace mock with real API call e.g. api.get(`/enrollments/student/${currentUser.userId}/sessions`)
            // Mock upcoming sessions — replace with real API call when endpoint exists
            setSessions([
                {
                    id: '1',
                    title: 'React Native – Module 3',
                    trainer: 'Alice Johnson',
                    date: 'Today',
                    time: '5:00 PM',
                    duration: '1h 30min',
                    type: 'Group',
                    status: 'soon',   // 'soon' | 'upcoming'
                },
                {
                    id: '2',
                    title: 'Data Science Fundamentals',
                    trainer: 'Mohammed K.',
                    date: 'Tomorrow',
                    time: '3:00 PM',
                    duration: '2h',
                    type: 'Group',
                    status: 'upcoming',
                },
                {
                    id: '3',
                    title: 'UI/UX Design Workshop',
                    trainer: 'Sara B.',
                    date: 'Thu, Apr 10',
                    time: '6:00 PM',
                    duration: '1h',
                    type: 'Group',
                    status: 'upcoming',
                },
            ]);
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
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
                            <View style={styles.badge}><Text style={styles.badgeText}>2</Text></View>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => router.push('/(student-tabs)/profile' as any)} style={styles.avatarWrap}>
                            {profilePicUrl ? (
                                <Image source={{ uri: profilePicUrl }} style={styles.avatarImg} />
                            ) : (
                                <View style={styles.avatarPlaceholder}>
                                    <Text style={styles.avatarPlaceholderText}>{user?.name?.charAt(0) || 'S'}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                <Text style={styles.greeting}>Hello, {user?.name?.split(' ')[0] || 'Student'}</Text>
                <Text style={styles.subtitle}>Ready to start learning?</Text>

                {/* ── QUICK ACTIONS (designer's 3 cards) ── */}
                <View style={styles.quickRow}>
                    <TouchableOpacity style={[styles.quickCard, { width: CARD_HALF, height: CARD_HALF * 0.85 }]} onPress={() => router.push('/(student-tabs)/trainers' as any)} activeOpacity={0.8}>
                        <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
                        <View style={styles.quickTop}>
                            <View style={styles.quickIconWrap}><Ionicons name="school-outline" size={22} color="rgba(255,255,255,0.7)" /></View>
                            <Ionicons name="arrow-up-outline" size={18} color="rgba(255,255,255,0.4)" style={{ transform: [{ rotate: '45deg' }] }} />
                        </View>
                        <Text style={styles.quickLabel}>Trainings</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.quickCard, { width: CARD_HALF, height: CARD_HALF * 0.85 }]} onPress={() => router.push('/(student-tabs)/chatbot' as any)} activeOpacity={0.8}>
                        <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
                        <View style={styles.quickTop}>
                            <View style={styles.quickIconWrap}><Ionicons name="chatbubble-ellipses-outline" size={22} color="rgba(255,255,255,0.7)" /></View>
                            <Ionicons name="arrow-up-outline" size={18} color="rgba(255,255,255,0.4)" style={{ transform: [{ rotate: '45deg' }] }} />
                        </View>
                        <Text style={styles.quickLabel}>AI Chat</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity style={[styles.quickCard, { width: '100%', height: CARD_HALF * 0.7 }]} onPress={() => {}} activeOpacity={0.8}>
                    <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.quickTop}>
                        <View style={styles.quickIconWrap}><Ionicons name="list-outline" size={22} color="rgba(255,255,255,0.7)" /></View>
                        <Ionicons name="arrow-up-outline" size={18} color="rgba(255,255,255,0.4)" style={{ transform: [{ rotate: '45deg' }] }} />
                    </View>
                    <Text style={styles.quickLabel}>Feed</Text>
                </TouchableOpacity>

                {/* ── UPCOMING SESSIONS ── */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Upcoming Sessions</Text>
                        <TouchableOpacity><Text style={styles.seeAll}>See All</Text></TouchableOpacity>
                    </View>
                    {sessions.map((session) => (
                        <TouchableOpacity key={session.id} style={styles.sessionCard} activeOpacity={0.85}>
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            {/* Left accent bar */}
                            <View style={[styles.sessionAccent, { backgroundColor: session.status === 'soon' ? '#7cce06' : 'rgba(124,206,6,0.35)' }]} />
                            <View style={styles.sessionBody}>
                                <View style={styles.sessionTop}>
                                    <Text style={styles.sessionTitle} numberOfLines={1}>{session.title}</Text>
                                    {session.status === 'soon' && (
                                        <View style={styles.soonBadge}>
                                            <Text style={styles.soonText}>Soon</Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={styles.sessionTrainer}>{session.trainer}</Text>
                                <View style={styles.sessionMeta}>
                                    <View style={styles.metaChip}>
                                        <Ionicons name="calendar-outline" size={13} color="#aaaaaa" />
                                        <Text style={styles.metaText}>{session.date}</Text>
                                    </View>
                                    <View style={styles.metaChip}>
                                        <Ionicons name="time-outline" size={13} color="#aaaaaa" />
                                        <Text style={styles.metaText}>{session.time}</Text>
                                    </View>
                                    <View style={styles.metaChip}>
                                        <Ionicons name="hourglass-outline" size={13} color="#aaaaaa" />
                                        <Text style={styles.metaText}>{session.duration}</Text>
                                    </View>
                                </View>
                            </View>
                            <View style={styles.sessionRight}>
                                <View style={styles.sessionTypeBadge}>
                                    <Ionicons name="people-outline" size={12} color="#aaaaaa" />
                                    <Text style={styles.sessionTypeText}>{session.type}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.2)" style={{ marginTop: 8 }} />
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* ── GROUPS FORMING NOW ── */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Groups Forming Now</Text>
                        <TouchableOpacity><Text style={styles.seeAll}>See All</Text></TouchableOpacity>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
                        {(recommendations.length > 0 ? recommendations : []).slice(0, 5).map((course: any, i: number) => {
                            const enrolled = Math.floor(Math.random() * 10) + 5;
                            const max = 15;
                            const pct = Math.min(Math.round((enrolled / max) * 100), 100);
                            return (
                                <TouchableOpacity key={course.id || i} style={styles.groupCard} activeOpacity={0.85}>
                                    <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
                                    <View style={styles.groupDomain}>
                                        <Ionicons name="people" size={16} color="#7cce06" />
                                        <Text style={styles.groupDomainText}>{course.level || 'Beginner'}</Text>
                                    </View>
                                    <Text style={styles.groupTitle} numberOfLines={2}>{course.title}</Text>
                                    <Text style={styles.groupTrainer}>{course.trainer}</Text>
                                    <View style={styles.groupProgress}>
                                        <View style={styles.progressTrackSmall}>
                                            <View style={[styles.progressFillGroup, { width: `${pct}%` }]} />
                                        </View>
                                        <Text style={styles.groupCount}>{enrolled}/{max}</Text>
                                    </View>
                                    <TouchableOpacity style={styles.joinBtn}>
                                        <Text style={styles.joinText}>Join Group</Text>
                                    </TouchableOpacity>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* ── RECOMMENDED FOR YOU ── */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Recommended For You</Text>
                        <TouchableOpacity><Text style={styles.seeAll}>See All</Text></TouchableOpacity>
                    </View>
                    {recommendations.slice(0, 4).map((course: any) => (
                        <TouchableOpacity key={course.id} style={styles.recCard} activeOpacity={0.85}>
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            <View style={styles.recIcon}>
                                <Ionicons name="school" size={28} color="#7cce06" />
                            </View>
                            <View style={styles.recInfo}>
                                <Text style={styles.recTitle} numberOfLines={1}>{course.title}</Text>
                                <Text style={styles.recTrainer}>{course.trainer}</Text>
                                <View style={styles.recMeta}>
                                    <View style={styles.metaChip}>
                                        <Ionicons name="star" size={13} color="#FFD700" />
                                        <Text style={styles.metaText}>{course.rating}</Text>
                                    </View>
                                    <View style={styles.metaChip}>
                                        <Ionicons name="people-outline" size={13} color="#aaaaaa" />
                                        <Text style={styles.metaText}>{course.students}</Text>
                                    </View>
                                    <View style={styles.metaChip}>
                                        <Ionicons name="time-outline" size={13} color="#aaaaaa" />
                                        <Text style={styles.metaText}>{course.duration}</Text>
                                    </View>
                                </View>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
                        </TouchableOpacity>
                    ))}
                </View>

                {/* ── TOP TRAINERS ── */}
                <View style={[styles.section, { marginBottom: 40 }]}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Top Trainers</Text>
                        <TouchableOpacity onPress={() => router.push('/(student-tabs)/trainers' as any)}><Text style={styles.seeAll}>See All</Text></TouchableOpacity>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
                        {[
                            { name: 'Alice Johnson', domain: 'Web Dev', rating: 4.9, students: 234 },
                            { name: 'Mohammed K.', domain: 'Data Science', rating: 4.8, students: 189 },
                            { name: 'Sara B.', domain: 'UI/UX', rating: 4.7, students: 156 },
                            { name: 'David L.', domain: 'Mobile Dev', rating: 4.9, students: 312 },
                        ].map((trainer, i) => (
                            <TouchableOpacity key={i} style={styles.trainerCard} activeOpacity={0.85}>
                                <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
                                <View style={styles.trainerAvatar}>
                                    <Ionicons name="person" size={28} color="rgba(255,255,255,0.6)" />
                                </View>
                                <Text style={styles.trainerName} numberOfLines={1}>{trainer.name}</Text>
                                <Text style={styles.trainerDomain}>{trainer.domain}</Text>
                                <View style={styles.trainerStats}>
                                    <Ionicons name="star" size={12} color="#FFD700" />
                                    <Text style={styles.trainerStatText}>{trainer.rating}</Text>
                                    <Text style={styles.trainerStatDot}> / </Text>
                                    <Ionicons name="people-outline" size={12} color="#aaaaaa" />
                                    <Text style={styles.trainerStatText}>{trainer.students}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 16, fontSize: 16, color: '#aaaaaa' },

    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 120, paddingHorizontal: 20 },

    // ── Header
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

    // ── Quick Actions (designer cards)
    quickRow: { flexDirection: 'row', gap: CARD_GAP, marginBottom: CARD_GAP },
    quickCard: {
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        padding: 16,
        justifyContent: 'space-between',
    },
    quickTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    quickIconWrap: {
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center', alignItems: 'center',
    },
    quickLabel: { fontSize: 16, fontWeight: '600', color: '#ffffff' },

    // ── Sections
    section: { marginTop: 28 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#ffffff' },
    seeAll: { fontSize: 13, fontWeight: '600', color: '#7cce06' },

    // ── Upcoming Sessions
    sessionCard: {
        flexDirection: 'row',
        borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        marginBottom: 10, minHeight: 90,
    },
    sessionAccent: { width: 4, borderRadius: 0 },
    sessionBody: { flex: 1, padding: 14 },
    sessionTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    sessionTitle: { fontSize: 15, fontWeight: '600', color: '#ffffff', flex: 1 },
    soonBadge: {
        backgroundColor: 'rgba(124,206,6,0.18)',
        borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2,
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.4)',
    },
    soonText: { fontSize: 11, fontWeight: '700', color: '#7cce06' },
    sessionTrainer: { fontSize: 12, color: '#aaaaaa', marginBottom: 8 },
    sessionMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    sessionRight: { paddingVertical: 14, paddingRight: 14, alignItems: 'flex-end', justifyContent: 'space-between' },
    sessionTypeBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    },
    sessionTypeText: { fontSize: 11, color: '#aaaaaa' },

    // ── Groups Forming
    horizontalList: { gap: 12, paddingRight: 20 },
    groupCard: {
        width: 180, borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        padding: 14,
    },
    groupDomain: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    groupDomainText: { fontSize: 11, color: '#7cce06', fontWeight: '600', textTransform: 'uppercase' },
    groupTitle: { fontSize: 14, fontWeight: '600', color: '#ffffff', marginBottom: 4, lineHeight: 20 },
    groupTrainer: { fontSize: 12, color: '#aaaaaa', marginBottom: 10 },
    groupProgress: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    progressTrackSmall: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)' },
    progressFillGroup: { height: 4, borderRadius: 2, backgroundColor: '#7cce06' },
    groupCount: { fontSize: 11, color: '#aaaaaa', fontWeight: '600' },
    joinBtn: {
        backgroundColor: 'rgba(124,206,6,0.15)',
        borderRadius: 10, paddingVertical: 8, alignItems: 'center',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.3)',
    },
    joinText: { fontSize: 13, fontWeight: '600', color: '#7cce06' },

    // ── Recommended
    recCard: {
        flexDirection: 'row', alignItems: 'center',
        borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        padding: 14, marginBottom: 10,
    },
    recIcon: {
        width: 52, height: 52, borderRadius: 14,
        backgroundColor: 'rgba(124,206,6,0.12)',
        justifyContent: 'center', alignItems: 'center', marginRight: 14,
    },
    recInfo: { flex: 1 },
    recTitle: { fontSize: 15, fontWeight: '600', color: '#ffffff', marginBottom: 2 },
    recTrainer: { fontSize: 12, color: '#aaaaaa', marginBottom: 6 },
    recMeta: { flexDirection: 'row', gap: 10 },
    metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { fontSize: 11, color: '#aaaaaa' },

    // ── Top Trainers
    trainerCard: {
        width: 140, borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        padding: 14, alignItems: 'center',
    },
    trainerAvatar: {
        width: 56, height: 56, borderRadius: 28,
        backgroundColor: 'rgba(255,255,255,0.08)',
        justifyContent: 'center', alignItems: 'center', marginBottom: 10,
    },
    trainerName: { fontSize: 14, fontWeight: '600', color: '#ffffff', marginBottom: 2, textAlign: 'center' },
    trainerDomain: { fontSize: 11, color: '#aaaaaa', marginBottom: 8 },
    trainerStats: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    trainerStatText: { fontSize: 11, color: '#aaaaaa' },
    trainerStatDot: { fontSize: 11, color: 'rgba(255,255,255,0.2)' },
});
