import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRouter, useFocusEffect } from 'expo-router';
import { authService, notificationService } from '../../services/api';
import api from '../../services/api';
import { useState, useCallback } from 'react';
import { ScreenBackground } from '../../components/ScreenBackground';

export default function TrainerProfileScreen() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [profile, setProfile] = useState<any>(null);
    const [imageTs, setImageTs] = useState(Date.now());
    const [unreadNotifCount, setUnreadNotifCount] = useState(0);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const loadData = async () => {
        try {
            const currentUser = await authService.getCurrentUser();
            setUser(currentUser);
            const res = await api.get('/trainers/me');
            setProfile(res.data);
            setImageTs(Date.now());

            if (currentUser?.userId) {
                try {
                    const count = await notificationService.getUnreadCount(currentUser.userId);
                    setUnreadNotifCount(typeof count === 'number' ? count : 0);
                } catch (_) {}
            }
        } catch (e) {
            console.log('Profile fetch error', e);
        }
    };

    const handleLogout = async () => {
        Alert.alert('Logout', 'Are you sure you want to logout?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Logout', style: 'destructive',
                onPress: async () => { await authService.logout(); router.replace('/' as any); },
            },
        ]);
    };

    return (
        <ScreenBackground>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* ── Header ── */}
                <View style={styles.header}>
                    <View style={styles.logoRow}>
                        <Image source={require('../../assets/images/logo-white.png')} style={styles.logo} resizeMode="contain" />
                        <View style={styles.headerRight}>
                            <TouchableOpacity onPress={() => router.push('/(trainer-tabs)/notifications' as any)} style={styles.bellWrap}>
                                <Ionicons name="notifications-outline" size={22} color="#ffffff" />
                                {unreadNotifCount > 0 && (
                                    <View style={styles.badge}>
                                        <Text style={styles.badgeText}>{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleLogout}>
                                <Ionicons name="log-out-outline" size={22} color="#ffffff" />
                            </TouchableOpacity>
                        </View>
                    </View>
                    <Text style={styles.headerTitle}>Profile</Text>
                </View>

                {/* ── Avatar ── */}
                <View style={styles.avatarSection}>
                    <View style={styles.avatarBorder}>
                        {profile?.profilePictureUrl ? (
                            <Image source={{ uri: `${profile.profilePictureUrl}?t=${imageTs}` }} style={styles.avatarImage} />
                        ) : (
                            <View style={styles.avatarFallback}>
                                <Text style={styles.avatarText}>{user?.name?.charAt(0) || 'T'}</Text>
                            </View>
                        )}
                    </View>
                    <View style={styles.iconRow}>
                        <TouchableOpacity onPress={() => router.push('/edit-profile' as any)}>
                            <Ionicons name="settings-outline" size={22} color="#7cce06" />
                        </TouchableOpacity>
                        <Ionicons name="heart" size={22} color="#7cce06" />
                    </View>
                </View>

                {/* ── Name + Role ── */}
                <Text style={styles.profileName}>{user?.name || 'Trainer'}</Text>
                <Text style={styles.profileRole}>Trainer</Text>

                {/* ── Stats ── */}
                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>{profile?.totalStudents ?? 0}</Text>
                        <Text style={styles.statLabel}>Students</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>{profile?.totalCourses ?? 0}</Text>
                        <Text style={styles.statLabel}>Courses</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>
                            {profile?.averageRating ? Number(profile.averageRating).toFixed(1) : '—'}
                        </Text>
                        <Text style={styles.statLabel}>Rating</Text>
                    </View>
                </View>

                {/* ── Professional Info ── */}
                <View style={styles.sectionWrap}>
                    <Text style={styles.sectionLabel}>Professional Overview</Text>
                    <View style={styles.glassCard}>
                        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                        <View style={styles.overviewGrid}>
                            <View style={styles.overviewCell}>
                                <Text style={styles.overviewTitle}>SPECIALIZATION</Text>
                                <Text style={styles.overviewValue}>{profile?.specialization || 'Not provided yet'}</Text>
                            </View>
                            <View style={styles.overviewCell}>
                                <Text style={styles.overviewTitle}>EXPERIENCE</Text>
                                <Text style={styles.overviewValue}>{profile?.experience || 'Not provided yet'}</Text>
                            </View>
                            <View style={styles.overviewCell}>
                                <Text style={styles.overviewTitle}>EDUCATION</Text>
                                <Text style={styles.overviewValue}>{profile?.education || 'Not provided yet'}</Text>
                            </View>
                            <View style={styles.overviewCell}>
                                <Text style={styles.overviewTitle}>LOCATION</Text>
                                <Text style={styles.overviewValue}>{profile?.location || 'Not provided yet'}</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* ── Bio ── */}
                {(profile?.bio) ? (
                    <View style={styles.sectionWrap}>
                        <Text style={styles.sectionLabel}>Bio</Text>
                        <View style={styles.glassCard}>
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            <Text style={styles.bioText}>{profile.bio}</Text>
                        </View>
                    </View>
                ) : null}

                {/* ── Edit Profile ── */}
                <TouchableOpacity style={styles.editBtn} onPress={() => router.push('/edit-profile' as any)} activeOpacity={0.8}>
                    <Text style={styles.editBtnText}>Edit Profile</Text>
                </TouchableOpacity>
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 120 },

    header: { paddingTop: 50, paddingHorizontal: 20, marginBottom: 8 },
    logoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    logo: { width: 40, height: 40 },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#ffffff' },
    headerRight: { flexDirection: 'row', gap: 16, alignItems: 'center' },
    bellWrap: { position: 'relative' },
    badge: { position: 'absolute', top: -4, right: -6, backgroundColor: '#ff4444', width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    badgeText: { fontSize: 9, fontWeight: 'bold', color: '#ffffff' },

    avatarSection: { alignItems: 'center', marginTop: 16, marginBottom: 6 },
    avatarBorder: {
        width: 150, height: 150, borderRadius: 75,
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)',
        overflow: 'hidden', justifyContent: 'center', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    avatarImage: { width: '100%', height: '100%' },
    avatarFallback: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(124,206,6,0.15)' },
    avatarText: { fontSize: 52, fontWeight: 'bold', color: '#7cce06' },
    iconRow: { flexDirection: 'row', gap: 12, marginTop: -10, alignSelf: 'center', paddingLeft: 80 },

    profileName: { fontSize: 22, fontWeight: 'bold', color: '#ffffff', textAlign: 'center', marginTop: 10 },
    profileRole: { fontSize: 14, fontWeight: '600', color: '#7cce06', textAlign: 'center', marginBottom: 16 },

    // Stats row
    statsRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        marginHorizontal: 20, marginBottom: 24,
        borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        paddingVertical: 16,
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    statItem: { flex: 1, alignItems: 'center' },
    statValue: { fontSize: 20, fontWeight: 'bold', color: '#ffffff', marginBottom: 2 },
    statLabel: { fontSize: 12, color: '#aaaaaa' },
    statDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.1)' },

    // Sections
    sectionWrap: { paddingHorizontal: 20, marginBottom: 20 },
    sectionLabel: { fontSize: 15, fontWeight: '700', color: '#7cce06', marginBottom: 10 },

    glassCard: {
        borderRadius: 18, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.3)',
        padding: 18,
    },
    bioText: { fontSize: 14, color: '#dddddd', lineHeight: 22 },

    overviewGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    overviewCell: { width: '50%', marginBottom: 18, paddingRight: 10 },
    overviewTitle: { fontSize: 11, fontWeight: '700', color: '#7cce06', marginBottom: 6, letterSpacing: 0.3 },
    overviewValue: { fontSize: 13, color: '#cccccc', lineHeight: 19 },

    editBtn: {
        alignSelf: 'center',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.4)',
        borderRadius: 12, paddingHorizontal: 32, paddingVertical: 12,
        backgroundColor: 'rgba(124,206,6,0.08)',
        marginTop: 4, marginBottom: 20,
    },
    editBtnText: { fontSize: 14, fontWeight: '600', color: '#aaaaaa' },
});
