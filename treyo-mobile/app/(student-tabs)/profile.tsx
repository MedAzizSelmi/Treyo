import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { authService } from '../../services/api';
import api from '../../services/api';
import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { ScreenBackground } from '../../components/ScreenBackground';

export default function ProfileScreen() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [profile, setProfile] = useState<any>(null);
    const [imageTs, setImageTs] = useState(Date.now());

    // Reload every time screen comes into focus
    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const loadData = async () => {
        try {
            const currentUser = await authService.getCurrentUser();
            setUser(currentUser);
            // Fetch full profile from backend
            const res = await api.get('/students/me');
            setProfile(res.data);
            setImageTs(Date.now()); // bust image cache on every reload
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

    const skillsList = profile?.keySkills || [];
    const domains = profile?.specificInterests || profile?.primaryDomains || [];

    return (
        <ScreenBackground>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* Header bar */}
                <View style={styles.header}>
                    <View style={styles.logoRow}>
                        <Image source={require('../../assets/images/logo-white.png')} style={styles.logo} resizeMode="contain" />
                        <View style={styles.headerRight}>
                            <TouchableOpacity onPress={() => router.push('/(student-tabs)/notifications' as any)} style={styles.bellWrap}>
                                <Ionicons name="notifications-outline" size={22} color="#ffffff" />
                                <View style={styles.badge}><Text style={styles.badgeText}>2</Text></View>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleLogout}>
                                <Ionicons name="log-out-outline" size={22} color="#ffffff" />
                            </TouchableOpacity>
                        </View>
                    </View>
                    <Text style={styles.headerTitle}>Profile</Text>
                </View>

                {/* Avatar */}
                <View style={styles.avatarSection}>
                    <View style={styles.avatarBorder}>
                        {profile?.profilePictureUrl ? (
                            <Image source={{ uri: `${profile.profilePictureUrl}?t=${imageTs}` }} style={styles.avatarImage} />
                        ) : (
                            <View style={styles.avatarFallback}>
                                <Text style={styles.avatarText}>{user?.name?.charAt(0) || 'S'}</Text>
                            </View>
                        )}
                    </View>
                    {/* Settings + heart icons */}
                    <View style={styles.iconRow}>
                        <TouchableOpacity onPress={() => router.push('/edit-profile' as any)}>
                            <Ionicons name="settings-outline" size={22} color="#7cce06" />
                        </TouchableOpacity>
                        <Ionicons name="heart" size={22} color="#7cce06" />
                    </View>
                </View>

                {/* Name + role */}
                <Text style={styles.profileName}>{user?.name || 'Student'}</Text>
                <Text style={styles.profileRole}>Learner</Text>

                {/* Bio card */}
                {profile?.bio ? (
                    <View style={styles.sectionWrap}>
                        <Text style={styles.sectionLabel}>Bio</Text>
                        <View style={styles.glassCard}>
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            <Text style={styles.bioText}>{profile.bio}</Text>
                        </View>
                    </View>
                ) : null}

                {/* Professional Overview */}
                <View style={styles.sectionWrap}>
                    <Text style={styles.sectionLabel}>Professional Overview</Text>
                    <View style={styles.glassCard}>
                        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                        <View style={styles.overviewGrid}>
                            {/* Professional Experience */}
                            <View style={styles.overviewCell}>
                                <Text style={styles.overviewTitle}>PROFESSIONAL EXPERIENCE</Text>
                                <Text style={styles.overviewValue}>
                                    {profile?.professionalExperience || 'Not provided yet'}
                                </Text>
                            </View>

                            {/* Key Skills */}
                            <View style={styles.overviewCell}>
                                <Text style={styles.overviewTitle}>KEY SKILLS</Text>
                                {skillsList.length > 0 ? (
                                    skillsList.map((skill: string, i: number) => (
                                        <Text key={i} style={styles.overviewBullet}>{'\u2022'} {skill}</Text>
                                    ))
                                ) : (
                                    <Text style={styles.overviewValue}>Not provided yet</Text>
                                )}
                            </View>

                            {/* Education Level */}
                            <View style={styles.overviewCell}>
                                <Text style={styles.overviewTitle}>EDUCATION LEVEL</Text>
                                <Text style={styles.overviewValue}>
                                    {profile?.educationLevel || 'Not provided yet'}
                                </Text>
                            </View>

                            {/* Training Domains / Interests */}
                            <View style={styles.overviewCell}>
                                <Text style={styles.overviewTitle}>TRAINING DOMAINS</Text>
                                {domains.length > 0 ? (
                                    domains.slice(0, 5).map((d: string, i: number) => (
                                        <Text key={i} style={styles.overviewBullet}>{'\u2022'} {d}</Text>
                                    ))
                                ) : (
                                    <Text style={styles.overviewValue}>Not provided yet</Text>
                                )}
                            </View>
                        </View>
                    </View>
                </View>

                {/* Edit Resume button */}
                <TouchableOpacity style={styles.editResumeBtn} onPress={() => router.push('/edit-profile' as any)} activeOpacity={0.8}>
                    <Text style={styles.editResumeBtnText}>Edit Profile</Text>
                </TouchableOpacity>
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 120 },

    // Header
    header: { paddingTop: 50, paddingHorizontal: 20, marginBottom: 8 },
    logoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    logo: { width: 40, height: 40 },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#ffffff' },
    headerRight: { flexDirection: 'row', gap: 16, alignItems: 'center' },
    bellWrap: { position: 'relative' },
    badge: { position: 'absolute', top: -4, right: -6, backgroundColor: '#ff4444', width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    badgeText: { fontSize: 9, fontWeight: 'bold', color: '#ffffff' },

    // Avatar
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

    // Name
    profileName: { fontSize: 22, fontWeight: 'bold', color: '#ffffff', textAlign: 'center', marginTop: 10 },
    profileRole: { fontSize: 14, fontWeight: '600', color: '#7cce06', textAlign: 'center', marginBottom: 24 },

    // Sections
    sectionWrap: { paddingHorizontal: 20, marginBottom: 20 },
    sectionLabel: { fontSize: 15, fontWeight: '700', color: '#7cce06', marginBottom: 10 },

    // Glass card
    glassCard: {
        borderRadius: 18, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.3)',
        padding: 18,
    },
    bioText: { fontSize: 14, color: '#dddddd', lineHeight: 22 },

    // Overview grid (2x2)
    overviewGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    overviewCell: { width: '50%', marginBottom: 18, paddingRight: 10 },
    overviewTitle: { fontSize: 11, fontWeight: '700', color: '#7cce06', marginBottom: 6, letterSpacing: 0.3 },
    overviewValue: { fontSize: 13, color: '#cccccc', lineHeight: 19 },
    overviewBullet: { fontSize: 13, color: '#cccccc', lineHeight: 20 },

    // Edit Resume button
    editResumeBtn: {
        alignSelf: 'center',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.4)',
        borderRadius: 12, paddingHorizontal: 32, paddingVertical: 12,
        backgroundColor: 'rgba(124,206,6,0.08)',
        marginTop: 4, marginBottom: 20,
    },
    editResumeBtnText: { fontSize: 14, fontWeight: '600', color: '#aaaaaa' },
});
