import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Image, Linking, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRouter, useFocusEffect } from 'expo-router';
import { authService, notificationService, courseService, trainerService } from '../../services/api';
import api from '../../services/api';
import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScreenBackground } from '../../components/ScreenBackground';
import { ReviewsList } from '../../components/ReviewsList';

export default function TrainerProfileScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    // Local mirrors of the availability fields so the stepper / switch
    // respond instantly. Synced from `profile` on every load and
    // pushed up to the backend on each interaction.
    const [maxGroups, setMaxGroups] = useState<number>(3);
    const [savingAvailability, setSavingAvailability] = useState(false);
    const [user, setUser] = useState<any>(null);
    // useState import gets these here — `useState` already imported above.
    const [profile, setProfile] = useState<any>(null);
    const [courses, setCourses] = useState<any[]>([]);
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
            // Sync local availability mirrors with server state.
            if (res.data?.maxConcurrentGroups) {
                setMaxGroups(Number(res.data.maxConcurrentGroups));
            }

            if (currentUser?.userId) {
                // Pull this trainer's courses so we can derive student
                // count + course count. The trainer DTO doesn't carry
                // those aggregates (totalStudentsTaught isn't auto-
                // updated on enrollment, totalCourses doesn't exist at
                // all), so we compute them from the source of truth.
                try {
                    const c = await courseService.getTrainerCourses(currentUser.userId);
                    setCourses(Array.isArray(c) ? c : []);
                } catch (_) {
                    setCourses([]);
                }
                try {
                    const count = await notificationService.getUnreadCount(currentUser.userId);
                    setUnreadNotifCount(typeof count === 'number' ? count : 0);
                } catch (_) {}
            }
        } catch (e) {
            console.log('Profile fetch error', e);
        }
    };

    // ── Derived values ────────────────────────────────────────────────
    // Computed from real data instead of the broken DTO fields the
    // screen used to read.
    const studentsCount = useMemo(
        () => courses.reduce(
            (sum, c: any) => sum + (c.totalEnrolled ?? c.interestedStudentsCount ?? 0),
            0,
        ),
        [courses],
    );
    const coursesCount = courses.length;

    // specializations is a String[] on the DTO. Pretty-print it; "—" if empty.
    const specializationText = useMemo(() => {
        const s = profile?.specializations;
        if (!s) return null;
        if (Array.isArray(s)) return s.filter(Boolean).join(' · ') || null;
        return String(s) || null;
    }, [profile?.specializations]);

    // Experience: prefer the free-text professionalExperience the trainer
    // wrote, fall back to "N years" derived from experienceYears.
    const experienceText = useMemo(() => {
        const exp = profile?.professionalExperience;
        if (exp && String(exp).trim()) return String(exp).trim();
        const years = profile?.experienceYears;
        if (years && Number(years) > 0) return `${years} ${Number(years) === 1 ? 'year' : 'years'}`;
        return null;
    }, [profile?.professionalExperience, profile?.experienceYears]);

    // Location: stitched together from city + state (no single "location"
    // field exists on the DTO). Skips empty pieces gracefully.
    const locationText = useMemo(() => {
        const parts = [profile?.city, profile?.state].filter(
            (x: any) => x && String(x).trim());
        return parts.length > 0 ? parts.join(', ') : null;
    }, [profile?.city, profile?.state]);

    /** Flip the trainer's active flag. Optimistic update — patches the
     *  profile state immediately, rolls back on error. Pushes to
     *  /trainers/me/availability. */
    const handleToggleActive = async (next: boolean) => {
        if (!user?.userId || savingAvailability) return;
        const prevActive = !!profile?.active;
        setProfile((p: any) => ({ ...(p || {}), active: next }));
        setSavingAvailability(true);
        try {
            await trainerService.updateAvailability(user.userId, { isActive: next });
        } catch (_) {
            // Roll back
            setProfile((p: any) => ({ ...(p || {}), active: prevActive }));
            Alert.alert(t('common.error'), t('common.retry'));
        } finally {
            setSavingAvailability(false);
        }
    };

    /** Bump the cap by +1 / -1. Clamped to [1, 20] client-side; the
     *  backend repeats the clamp. Each tap fires a PUT — no debounce.
     *  Trainers won't be flipping this fast. */
    const handleChangeMaxGroups = async (delta: number) => {
        if (!user?.userId || savingAvailability) return;
        const next = Math.max(1, Math.min(20, maxGroups + delta));
        if (next === maxGroups) return;
        const prev = maxGroups;
        setMaxGroups(next);
        setSavingAvailability(true);
        try {
            await trainerService.updateAvailability(user.userId, { maxConcurrentGroups: next });
        } catch (_) {
            setMaxGroups(prev);
            Alert.alert(t('common.error'), t('common.retry'));
        } finally {
            setSavingAvailability(false);
        }
    };

    const handleLogout = async () => {
        Alert.alert(t('auth.logout'), t('auth.logoutConfirm'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
                text: t('auth.logout'), style: 'destructive',
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
                    <Text style={styles.headerTitle}>{t('tabs.profile')}</Text>
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
                        <TouchableOpacity onPress={() => router.push('/trainer-edit-profile' as any)}>
                            <Ionicons name="settings-outline" size={22} color="#7cce06" />
                        </TouchableOpacity>
                        <Ionicons name="heart" size={22} color="#7cce06" />
                    </View>
                </View>

                {/* ── Name + Role ── */}
                <Text style={styles.profileName}>{user?.name || t('auth.trainer')}</Text>
                <Text style={styles.profileRole}>{t('auth.trainer')}</Text>

                {/* ── Stats ──
                    Derived from the trainer's own courses (computed above).
                    Cuts out the broken `totalStudents`/`totalCourses`
                    fields that don't exist on the trainer DTO. */}
                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>{studentsCount}</Text>
                        <Text style={styles.statLabel}>{t('profile.students')}</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>{coursesCount}</Text>
                        <Text style={styles.statLabel}>{t('profile.courses')}</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>
                            {profile?.averageRating && Number(profile.averageRating) > 0
                                ? Number(profile.averageRating).toFixed(1)
                                : '—'}
                        </Text>
                        <Text style={styles.statLabel}>{t('profile.rating')}</Text>
                    </View>
                </View>

                {/* ── Professional Info ──
                    Reads the actual DTO fields now: `specializations` (array),
                    `professionalExperience` / `experienceYears`, `education`,
                    and a stitched `city, state` for location. */}
                <View style={styles.sectionWrap}>
                    <Text style={styles.sectionLabel}>{t('profile.professionalOverview')}</Text>
                    <View style={styles.glassCard}>
                        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                        <View style={styles.overviewGrid}>
                            <View style={styles.overviewCell}>
                                <Text style={styles.overviewTitle}>{t('profile.specializationCaps')}</Text>
                                <Text style={styles.overviewValue}>{specializationText || t('profile.notProvided')}</Text>
                            </View>
                            <View style={styles.overviewCell}>
                                <Text style={styles.overviewTitle}>{t('profile.experienceCaps')}</Text>
                                <Text style={styles.overviewValue}>{experienceText || t('profile.notProvided')}</Text>
                            </View>
                            <View style={styles.overviewCell}>
                                <Text style={styles.overviewTitle}>{t('profile.education')}</Text>
                                <Text style={styles.overviewValue}>{profile?.education || t('profile.notProvided')}</Text>
                            </View>
                            <View style={styles.overviewCell}>
                                <Text style={styles.overviewTitle}>{t('profile.locationCaps')}</Text>
                                <Text style={styles.overviewValue}>{locationText || t('profile.notProvided')}</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* ── Bio ── */}
                {(profile?.bio) ? (
                    <View style={styles.sectionWrap}>
                        <Text style={styles.sectionLabel}>{t('profile.bio')}</Text>
                        <View style={styles.glassCard}>
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            <Text style={styles.bioText}>{profile.bio}</Text>
                        </View>
                    </View>
                ) : null}

                {/* ── LinkedIn / Portfolio links ── */}
                {(profile?.linkedinUrl || profile?.portfolioUrl) && (
                    <View style={styles.sectionWrap}>
                        <Text style={styles.sectionLabel}>{t('profile.links')}</Text>
                        <View style={styles.glassCard}>
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            <View style={styles.linksRow}>
                                {profile.linkedinUrl && (
                                    <TouchableOpacity
                                        style={styles.linkBtn}
                                        onPress={() => Linking.openURL(profile.linkedinUrl)}
                                        activeOpacity={0.8}
                                    >
                                        <Ionicons name="logo-linkedin" size={16} color="#0A66C2" />
                                        <Text style={styles.linkBtnText}>LinkedIn</Text>
                                    </TouchableOpacity>
                                )}
                                {profile.portfolioUrl && (
                                    <TouchableOpacity
                                        style={styles.linkBtn}
                                        onPress={() => Linking.openURL(profile.portfolioUrl)}
                                        activeOpacity={0.8}
                                    >
                                        <Ionicons name="globe-outline" size={16} color="#7cce06" />
                                        <Text style={styles.linkBtnText}>Portfolio</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    </View>
                )}

                {/* ── Student feedback ──
                    Read-only list of every review the trainer's
                    students have left across all their courses. Hint
                    line explains it's only visible to them so they
                    feel safe acting on harsh feedback. */}
                {user?.userId && (
                    <View style={styles.sectionWrap}>
                        <Text style={styles.sectionLabel}>{t('reviews.myFeedback')}</Text>
                        <Text style={styles.feedbackHint}>{t('reviews.myFeedbackHint')}</Text>
                        <ReviewsList mode="trainer" id={user.userId} limit={5} />
                    </View>
                )}

                {/* ── Availability + concurrent-groups cap ── */}
                <View style={styles.sectionWrap}>
                    <Text style={styles.sectionLabel}>{t('profile.availability')}</Text>
                    <View style={styles.glassCard}>
                        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />

                        {/* Active / Inactive switch */}
                        <View style={styles.availRow}>
                            <View style={styles.availIconWrap}>
                                <Ionicons
                                    name={profile?.active ? 'flash' : 'pause-circle-outline'}
                                    size={20}
                                    color={profile?.active ? '#7cce06' : '#ffa500'}
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.availTitle}>
                                    {profile?.active ? t('profile.active') : t('profile.inactive')}
                                </Text>
                                <Text style={styles.availSubtitle}>
                                    {profile?.active ? t('profile.activeBody') : t('profile.inactiveBody')}
                                </Text>
                            </View>
                            <Switch
                                value={!!profile?.active}
                                onValueChange={handleToggleActive}
                                trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(124,206,6,0.5)' }}
                                thumbColor={profile?.active ? '#7cce06' : '#ffffff'}
                                ios_backgroundColor="rgba(255,255,255,0.15)"
                            />
                        </View>

                        <View style={styles.availDivider} />

                        {/* Max concurrent groups stepper */}
                        <View style={styles.availRow}>
                            <View style={styles.availIconWrap}>
                                <Ionicons name="people" size={20} color="#7cce06" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.availTitle}>{t('profile.maxGroups')}</Text>
                                <Text style={styles.availSubtitle}>{t('profile.maxGroupsBody')}</Text>
                            </View>
                            <View style={styles.stepper}>
                                <TouchableOpacity
                                    onPress={() => handleChangeMaxGroups(-1)}
                                    style={styles.stepperBtn}
                                    activeOpacity={0.6}
                                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                                >
                                    <Ionicons name="remove" size={18} color="#7cce06" />
                                </TouchableOpacity>
                                <Text style={styles.stepperValue}>{maxGroups}</Text>
                                <TouchableOpacity
                                    onPress={() => handleChangeMaxGroups(1)}
                                    style={styles.stepperBtn}
                                    activeOpacity={0.6}
                                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                                >
                                    <Ionicons name="add" size={18} color="#7cce06" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>

                {/* ── Settings & Privacy ── */}
                <View style={styles.settingsWrap}>
                    <TouchableOpacity
                        style={styles.settingsRow}
                        onPress={() => router.push('/settings-privacy' as any)}
                        activeOpacity={0.8}
                    >
                        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                        <View style={styles.settingsIconWrap}>
                            <Ionicons name="settings-outline" size={22} color="#7cce06" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.settingsTitle}>{t('profile.settingsPrivacy')}</Text>
                            <Text style={styles.settingsSubtitle}>{t('settings.manageAccount')}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
                    </TouchableOpacity>
                </View>

                {/* ── Edit Profile ── */}
                <TouchableOpacity style={styles.editBtn} onPress={() => router.push('/trainer-edit-profile' as any)} activeOpacity={0.8}>
                    <Text style={styles.editBtnText}>{t('profile.editProfile')}</Text>
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
    feedbackHint: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: -6, marginBottom: 12 },

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

    linksRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    linkBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    },
    linkBtnText: { fontSize: 13, color: '#ffffff', fontWeight: '500' },

    // Availability card
    availRow: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingVertical: 14, paddingHorizontal: 16,
    },
    availIconWrap: {
        width: 36, height: 36, borderRadius: 12,
        backgroundColor: 'rgba(124,206,6,0.10)',
        alignItems: 'center', justifyContent: 'center',
    },
    availTitle: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
    availSubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 3, lineHeight: 16 },
    availDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginHorizontal: 16 },

    stepper: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 999, paddingHorizontal: 4, paddingVertical: 3,
    },
    stepperBtn: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: 'rgba(124,206,6,0.12)',
        alignItems: 'center', justifyContent: 'center',
    },
    stepperValue: { color: '#ffffff', fontSize: 14, fontWeight: '700', minWidth: 22, textAlign: 'center' },

    settingsWrap: { paddingHorizontal: 20, marginBottom: 16 },
    settingsRow: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.25)',
        paddingHorizontal: 16, paddingVertical: 14,
    },
    settingsIconWrap: {
        width: 42, height: 42, borderRadius: 12,
        backgroundColor: 'rgba(124,206,6,0.12)',
        justifyContent: 'center', alignItems: 'center',
    },
    settingsTitle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
    settingsSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 },

    editBtn: {
        alignSelf: 'center',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.4)',
        borderRadius: 12, paddingHorizontal: 32, paddingVertical: 12,
        backgroundColor: 'rgba(124,206,6,0.08)',
        marginTop: 4, marginBottom: 20,
    },
    editBtnText: { fontSize: 14, fontWeight: '600', color: '#aaaaaa' },
});
