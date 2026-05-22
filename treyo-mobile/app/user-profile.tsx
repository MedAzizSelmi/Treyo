import {
    View, Text, StyleSheet, ScrollView, ActivityIndicator,
    Image, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenBackground } from '../components/ScreenBackground';
import { studentService, trainerService, API_BASE_URL } from '../services/api';

/**
 * Generic profile-view screen — opened when a chat member taps another
 * member's avatar in group-chat.tsx. Handles all three user types:
 *
 *   - trainer → loads via trainerService.getTrainerById (full public
 *     profile already exposed for browsing)
 *   - student → loads via studentService.getPublicProfile (limited
 *     fields, intentionally no contact info)
 *   - admin   → static "Admin" card with name + role only (admins don't
 *     have a public profile and shouldn't need one)
 *
 * Trainer details are intentionally minimal here; for the full
 * trainer profile experience there's still /trainer-profile which we
 * route to directly from messages screens too.
 */
export default function UserProfileScreen() {
    const router = useRouter();
    const { userId, userType, userName } =
        useLocalSearchParams<{ userId: string; userType: string; userName?: string }>();

    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => { load(); }, [userId, userType]);

    const load = async () => {
        if (!userId || !userType) {
            setLoading(false);
            return;
        }
        try {
            if (userType === 'trainer') {
                const t = await trainerService.getTrainerById(userId);
                setProfile(t);
            } else if (userType === 'student') {
                const s = await studentService.getPublicProfile(userId);
                setProfile(s);
            } else {
                // Admin — no backend lookup; we render the name passed in
                // via params (came from MessageResponse.senderName).
                setProfile({ name: userName || 'Admin' });
            }
        } catch (e) {
            // Most likely 404 or auth — let the screen render with no data
            // and the user sees "Couldn't load profile" instead of a blank.
            console.log('User profile load error', e);
        } finally {
            setLoading(false);
        }
    };

    const photoUri = profile?.profilePictureUrl
        ? (profile.profilePictureUrl.startsWith('http')
            ? profile.profilePictureUrl
            : `${API_BASE_URL}${profile.profilePictureUrl}`)
        : null;

    // Coerce list fields that the backend sometimes returns as a single
    // string instead of an array (varies between students & trainers).
    const asArray = (v: any): string[] =>
        Array.isArray(v) ? v.filter(Boolean) : v ? [String(v)] : [];

    const domains = asArray(profile?.primaryDomains || profile?.specializations);
    const interests = asArray(profile?.specificInterests || profile?.skills);

    return (
        <ScreenBackground>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Header ── */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color="#ffffff" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Profile</Text>
                </View>

                {loading ? (
                    <View style={{ paddingTop: 60, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#7cce06" />
                    </View>
                ) : !profile ? (
                    <View style={styles.empty}>
                        <Ionicons name="alert-circle-outline" size={48} color="rgba(255,255,255,0.3)" />
                        <Text style={styles.emptyText}>Couldn&apos;t load this profile.</Text>
                    </View>
                ) : (
                    <>
                        {/* ── Hero card with avatar + name + role ── */}
                        <View style={styles.heroCard}>
                            <LinearGradient
                                colors={['rgba(124,206,6,0.22)', 'rgba(10,5,32,0)']}
                                style={StyleSheet.absoluteFill}
                            />
                            <View style={styles.avatarRing}>
                                {photoUri ? (
                                    <Image source={{ uri: photoUri }} style={styles.avatar} />
                                ) : (
                                    <View style={styles.avatarFallback}>
                                        <Text style={styles.avatarLetter}>
                                            {(profile.name || '?')[0].toUpperCase()}
                                        </Text>
                                    </View>
                                )}
                            </View>
                            <Text style={styles.name}>{profile.name || 'Unknown user'}</Text>
                            <View style={styles.roleBadge}>
                                <Ionicons
                                    name={
                                        userType === 'trainer' ? 'school-outline'
                                            : userType === 'admin' ? 'shield-checkmark-outline'
                                                : 'person-outline'
                                    }
                                    size={12} color="#7cce06"
                                />
                                <Text style={styles.roleText}>
                                    {userType === 'trainer' ? 'Trainer'
                                        : userType === 'admin' ? 'Admin'
                                            : 'Student'}
                                </Text>
                            </View>
                        </View>

                        {/* Trainer extras → tap to open the full trainer page
                            so users get the courses list / reviews / etc. */}
                        {userType === 'trainer' && profile.trainerId && (
                            <TouchableOpacity
                                style={styles.viewFullBtn}
                                onPress={() => router.replace({
                                    pathname: '/trainer-profile' as any,
                                    params: { trainerId: profile.trainerId },
                                })}
                            >
                                <Text style={styles.viewFullText}>See full trainer profile</Text>
                                <Ionicons name="arrow-forward" size={16} color="#7cce06" />
                            </TouchableOpacity>
                        )}

                        {!!profile.bio && (
                            <View style={styles.card}>
                                <Text style={styles.cardLabel}>About</Text>
                                <Text style={styles.cardBody}>{profile.bio}</Text>
                            </View>
                        )}

                        {domains.length > 0 && (
                            <View style={styles.card}>
                                <Text style={styles.cardLabel}>
                                    {userType === 'trainer' ? 'Specializations' : 'Domains'}
                                </Text>
                                <View style={styles.chipRow}>
                                    {domains.map((d, i) => (
                                        <View key={i} style={styles.chip}>
                                            <Text style={styles.chipText}>{d}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}

                        {interests.length > 0 && (
                            <View style={styles.card}>
                                <Text style={styles.cardLabel}>
                                    {userType === 'trainer' ? 'Skills' : 'Interests'}
                                </Text>
                                <View style={styles.chipRow}>
                                    {interests.map((d, i) => (
                                        <View key={i} style={styles.chip}>
                                            <Text style={styles.chipText}>{d}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}
                    </>
                )}
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 60, paddingHorizontal: 20 },

    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 56, marginBottom: 16 },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff' },

    empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
    emptyText: { color: 'rgba(255,255,255,0.5)' },

    heroCard: {
        borderRadius: 22, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        padding: 28, alignItems: 'center', marginBottom: 16,
    },
    avatarRing: {
        width: 100, height: 100, borderRadius: 50,
        borderWidth: 2, borderColor: 'rgba(124,206,6,0.5)',
        padding: 3, marginBottom: 12,
    },
    avatar: { width: 92, height: 92, borderRadius: 46 },
    avatarFallback: {
        width: 92, height: 92, borderRadius: 46,
        backgroundColor: 'rgba(124,206,6,0.18)',
        justifyContent: 'center', alignItems: 'center',
    },
    avatarLetter: { fontSize: 38, fontWeight: '700', color: '#7cce06' },
    name: { fontSize: 22, fontWeight: '700', color: '#ffffff' },
    roleBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(124,206,6,0.12)',
        borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
        marginTop: 10,
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.25)',
    },
    roleText: { fontSize: 11, color: '#7cce06', fontWeight: '700', textTransform: 'uppercase' },

    viewFullBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.4)',
        backgroundColor: 'rgba(124,206,6,0.08)',
        borderRadius: 14, paddingVertical: 12, marginBottom: 16,
    },
    viewFullText: { color: '#7cce06', fontWeight: '600', fontSize: 14 },

    card: {
        borderRadius: 16,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        padding: 16, marginBottom: 12,
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    cardLabel: {
        fontSize: 11, color: '#7cce06', fontWeight: '700',
        textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5,
    },
    cardBody: { fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 20 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
        backgroundColor: 'rgba(124,206,6,0.1)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.25)',
        borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
    },
    chipText: { fontSize: 12, color: '#7cce06', fontWeight: '600' },
});
