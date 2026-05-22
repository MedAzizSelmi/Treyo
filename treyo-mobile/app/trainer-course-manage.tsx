import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Image, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { ScreenBackground } from '../components/ScreenBackground';
import { enrollmentService, groupService, API_BASE_URL } from '../services/api';

type Tab = 'students' | 'groups';

const STATUS_COLOR: Record<string, string> = {
    CONFIRMED: '#7cce06',
    ACTIVE: '#7cce06',
    PENDING: '#FFA500',
    COMPLETED: '#3b5bdb',
    CANCELLED: '#ff4444',
};

const GROUP_STATUS_COLOR: Record<string, string> = {
    forming: '#FFA500',
    ready: '#7cce06',
    active: '#3b5bdb',
    completed: '#aaaaaa',
    cancelled: '#ff4444',
};

export default function TrainerCourseManageScreen() {
    const router = useRouter();
    const { courseId, courseTitle } = useLocalSearchParams<{ courseId: string; courseTitle: string }>();
    const [tab, setTab] = useState<Tab>('students');
    const [students, setStudents] = useState<any[]>([]);
    const [groups, setGroups] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => { load(); }, []);

    const load = async () => {
        if (!courseId) return;
        try {
            const [s, g] = await Promise.all([
                enrollmentService.getCourseEnrollments(courseId),
                groupService.getCourseGroups(courseId),
            ]);
            setStudents(Array.isArray(s) ? s : []);
            setGroups(Array.isArray(g) ? g : []);
        } catch (e) {
            console.log('Course manage load error', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => { setRefreshing(true); load(); };

    const enrollmentStatusLabel = (status: string) => {
        const s = (status || '').toUpperCase();
        switch (s) {
            case 'CONFIRMED': return 'Confirmed';
            case 'ACTIVE': return 'Active';
            case 'COMPLETED': return 'Completed';
            case 'CANCELLED': return 'Cancelled';
            default: return status || 'Pending';
        }
    };

    const groupStatusLabel = (status: string) => {
        if (!status) return 'Unknown';
        return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'TBD';
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    return (
        <ScreenBackground>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={22} color="#ffffff" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle} numberOfLines={1}>{courseTitle || 'Course'}</Text>
                    <Text style={styles.headerSub}>Course Management</Text>
                </View>
            </View>

            {/* Summary pills */}
            <View style={styles.summaryRow}>
                <View style={styles.summaryPill}>
                    <Ionicons name="people" size={15} color="#7cce06" />
                    <Text style={styles.summaryText}>{students.length} students</Text>
                </View>
                <View style={styles.summaryPill}>
                    <Ionicons name="git-branch" size={15} color="#3b5bdb" />
                    <Text style={styles.summaryText}>{groups.length} groups</Text>
                </View>
            </View>

            {/* Tabs */}
            <View style={styles.tabRow}>
                <TouchableOpacity style={[styles.tabBtn, tab === 'students' && styles.tabBtnActive]} onPress={() => setTab('students')} activeOpacity={0.8}>
                    <Ionicons name="people-outline" size={16} color={tab === 'students' ? '#7cce06' : 'rgba(255,255,255,0.4)'} />
                    <Text style={[styles.tabText, tab === 'students' && styles.tabTextActive]}>Students</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tabBtn, tab === 'groups' && styles.tabBtnActive]} onPress={() => setTab('groups')} activeOpacity={0.8}>
                    <Ionicons name="git-branch-outline" size={16} color={tab === 'groups' ? '#7cce06' : 'rgba(255,255,255,0.4)'} />
                    <Text style={[styles.tabText, tab === 'groups' && styles.tabTextActive]}>Groups</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#7cce06" />
                </View>
            ) : (
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7cce06" colors={['#7cce06']} />}
                >
                    {tab === 'students' ? (
                        students.length === 0 ? (
                            <EmptyState icon="people-outline" title="No students yet" subtitle="Students who enroll will appear here." />
                        ) : (
                            students.map((s: any) => {
                                const statusKey = (s.enrollmentStatus || '').toUpperCase();
                                const color = STATUS_COLOR[statusKey] || '#aaaaaa';
                                const avatarUri = s.studentProfilePicture
                                    ? (s.studentProfilePicture.startsWith('http') ? s.studentProfilePicture : API_BASE_URL + s.studentProfilePicture)
                                    : null;
                                return (
                                    <View key={s.enrollmentId} style={styles.card}>
                                        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                        <View style={styles.studentRow}>
                                            {avatarUri ? (
                                                <Image source={{ uri: avatarUri }} style={styles.avatar} />
                                            ) : (
                                                <View style={styles.avatarFallback}>
                                                    <Text style={styles.avatarLetter}>{(s.studentName || 'S').charAt(0).toUpperCase()}</Text>
                                                </View>
                                            )}
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.studentName}>{s.studentName || 'Student'}</Text>
                                                <Text style={styles.studentMeta}>
                                                    Enrolled {s.enrolledAt ? new Date(s.enrolledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                                                    {s.groupId ? '  ·  Has group' : ''}
                                                </Text>
                                            </View>
                                            <View style={[styles.statusBadge, { backgroundColor: color + '20', borderColor: color + '50' }]}>
                                                <Text style={[styles.statusText, { color }]}>{enrollmentStatusLabel(s.enrollmentStatus)}</Text>
                                            </View>
                                        </View>
                                        {typeof s.progressPercentage === 'number' && (
                                            <View style={styles.progressRow}>
                                                <View style={styles.progressBar}>
                                                    <View style={[styles.progressFill, { width: `${s.progressPercentage}%` as any }]} />
                                                </View>
                                                <Text style={styles.progressLabel}>{s.progressPercentage}%</Text>
                                            </View>
                                        )}
                                    </View>
                                );
                            })
                        )
                    ) : (
                        groups.length === 0 ? (
                            <EmptyState icon="git-branch-outline" title="No groups yet" subtitle="Groups will be created automatically as students enroll." />
                        ) : (
                            groups.map((g: any) => {
                                const statusKey = (g.groupStatus || '').toLowerCase();
                                const color = GROUP_STATUS_COLOR[statusKey] || '#aaaaaa';
                                const spotsLeft = (g.maxSize || 0) - (g.currentSize || 0);
                                const fillPct = g.maxSize > 0 ? Math.min(100, Math.round((g.currentSize / g.maxSize) * 100)) : 0;
                                return (
                                    <View key={g.groupId} style={styles.card}>
                                        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                        <View style={styles.groupHeader}>
                                            <View style={styles.groupIconWrap}>
                                                <Ionicons name="people" size={20} color="#7cce06" />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.groupName}>{g.groupName || 'Group'}</Text>
                                                <Text style={styles.groupMeta}>{g.isOnline ? 'Online' : g.meetingLocation || 'In-person'}</Text>
                                            </View>
                                            <View style={[styles.statusBadge, { backgroundColor: color + '20', borderColor: color + '50' }]}>
                                                <Text style={[styles.statusText, { color }]}>{groupStatusLabel(g.groupStatus)}</Text>
                                            </View>
                                        </View>

                                        <View style={styles.groupStats}>
                                            <View style={styles.groupStat}>
                                                <Ionicons name="people-outline" size={14} color="#aaaaaa" />
                                                <Text style={styles.groupStatText}>{g.currentSize}/{g.maxSize} members</Text>
                                            </View>
                                            <View style={styles.groupStat}>
                                                <Ionicons name="calendar-outline" size={14} color="#aaaaaa" />
                                                <Text style={styles.groupStatText}>{formatDate(g.startDate)}</Text>
                                            </View>
                                        </View>

                                        <View style={styles.progressRow}>
                                            <View style={styles.progressBar}>
                                                <View style={[styles.progressFill, { width: `${fillPct}%` as any, backgroundColor: color }]} />
                                            </View>
                                            <Text style={styles.progressLabel}>{spotsLeft > 0 ? `${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left` : 'Full'}</Text>
                                        </View>
                                    </View>
                                );
                            })
                        )
                    )}
                </ScrollView>
            )}
        </ScreenBackground>
    );
}

function EmptyState({ icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
    return (
        <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
                <Ionicons name={icon} size={44} color="rgba(124,206,6,0.4)" />
            </View>
            <Text style={styles.emptyTitle}>{title}</Text>
            <Text style={styles.emptySubtitle}>{subtitle}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    },
    backBtn: {
        width: 38, height: 38, borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.08)',
        justifyContent: 'center', alignItems: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#ffffff' },
    headerSub: { fontSize: 12, color: '#aaaaaa', marginTop: 2 },

    summaryRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 16 },
    summaryPill: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    },
    summaryText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },

    tabRow: {
        flexDirection: 'row', marginHorizontal: 20, marginBottom: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 14, padding: 4,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },
    tabBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 6, paddingVertical: 10, borderRadius: 10,
    },
    tabBtnActive: { backgroundColor: 'rgba(124,206,6,0.12)' },
    tabText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.4)' },
    tabTextActive: { color: '#7cce06' },

    listContent: { paddingHorizontal: 20, paddingBottom: 100 },

    card: {
        borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        padding: 14, marginBottom: 12,
    },

    studentRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: { width: 46, height: 46, borderRadius: 23 },
    avatarFallback: {
        width: 46, height: 46, borderRadius: 23,
        backgroundColor: 'rgba(124,206,6,0.15)',
        justifyContent: 'center', alignItems: 'center',
    },
    avatarLetter: { fontSize: 18, fontWeight: 'bold', color: '#7cce06' },
    studentName: { fontSize: 15, fontWeight: '700', color: '#ffffff', marginBottom: 3 },
    studentMeta: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },

    statusBadge: {
        paddingHorizontal: 9, paddingVertical: 4,
        borderRadius: 8, borderWidth: 1, flexShrink: 0,
    },
    statusText: { fontSize: 11, fontWeight: '700' },

    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
    progressBar: {
        flex: 1, height: 4, borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
    },
    progressFill: { height: '100%', backgroundColor: '#7cce06', borderRadius: 2 },
    progressLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)', minWidth: 30, textAlign: 'right' },

    groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    groupIconWrap: {
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: 'rgba(124,206,6,0.1)',
        justifyContent: 'center', alignItems: 'center', flexShrink: 0,
    },
    groupName: { fontSize: 15, fontWeight: '700', color: '#ffffff', marginBottom: 2 },
    groupMeta: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
    groupStats: { flexDirection: 'row', gap: 16, marginBottom: 4 },
    groupStat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    groupStatText: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },

    emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
    emptyIconWrap: {
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: 'rgba(124,206,6,0.06)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.12)',
        justifyContent: 'center', alignItems: 'center', marginBottom: 18,
    },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: '#ffffff', marginBottom: 6 },
    emptySubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 20 },
});
