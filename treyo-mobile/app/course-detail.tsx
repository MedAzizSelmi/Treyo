import {
    View, Text, TouchableOpacity, StyleSheet, ScrollView,
    ActivityIndicator, Image, Linking, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenBackground } from '../components/ScreenBackground';
import {
    courseService, trainerService, enrollmentService,
    interactionService, authService, API_BASE_URL,
} from '../services/api';

export default function CourseDetailScreen() {
    const router = useRouter();
    const { courseId } = useLocalSearchParams<{ courseId: string }>();

    const [course, setCourse] = useState<any>(null);
    const [trainer, setTrainer] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [interested, setInterested] = useState(false);
    const [enrolled, setEnrolled] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(false);
    // Favourite-toggle state. `saved` drives the heart icon (filled/outlined);
    // `saveInFlight` blocks rapid taps so we don't fire two POSTs at the same
    // time (the backend handles that gracefully but doing it client-side is
    // cleaner and lets us show a spinner).
    const [saved, setSaved] = useState(false);
    const [saveInFlight, setSaveInFlight] = useState(false);
    // Ref guards against double-tap races — React state updates async, refs update sync
    const requestInFlight = useRef(false);

    useEffect(() => { loadData(); }, [courseId]);

    const loadData = async () => {
        if (!courseId) return;
        try {
            const [user, courseData] = await Promise.all([
                authService.getCurrentUser(),
                courseService.getCourseById(courseId),
            ]);
            setCourse(courseData);
            setUserId(user?.userId || null);

            if (user?.userId) {
                interactionService.trackView(user.userId, courseId).catch(() => {});
                try {
                    const status = await interactionService.getStatus(user.userId, courseId);
                    setInterested(!!status.interested);
                    setEnrolled(!!status.enrolled);
                } catch (_) {}
                // Saved-state lookup runs in parallel with the rest — heart
                // icon paints correctly on first render rather than starting
                // outlined and flipping after a delay.
                interactionService.isCourseSaved(user.userId, courseId)
                    .then(setSaved)
                    .catch(() => {});
            }

            if (courseData?.trainerId) {
                trainerService.getTrainerById(courseData.trainerId)
                    .then(setTrainer)
                    .catch(() => {});
            }
        } catch (e) {
            console.log('Course detail load error', e);
        } finally {
            setLoading(false);
        }
    };

    const handleRequestToJoin = async () => {
        if (!userId || !courseId || enrolled || interested || requestInFlight.current) return;
        requestInFlight.current = true;
        setActionLoading(true);
        // Optimistically flip the button immediately so rapid taps can't fire again
        setInterested(true);
        try {
            await interactionService.expressInterest(userId, courseId);
            Alert.alert(
                'Request Sent!',
                "You'll be notified when the group is ready to start.",
            );
        } catch (e: any) {
            // Roll back the optimistic flip if the call actually failed
            setInterested(false);
            Alert.alert('Error', e?.response?.data?.message || 'Could not send request. Please try again.');
        } finally {
            requestInFlight.current = false;
            setActionLoading(false);
        }
    };

    /**
     * Heart-icon toggle. Optimistic update so the icon flips instantly;
     * we roll back if the request fails. Both the on→off and off→on
     * directions go through the same /interactions/saved endpoint —
     * backend returns the new state which we trust over our optimistic flip.
     */
    const handleToggleSave = async () => {
        if (!userId || !courseId || saveInFlight) return;
        setSaveInFlight(true);
        const previous = saved;
        setSaved(!previous); // optimistic
        try {
            const next = await interactionService.toggleSaveCourse(userId, courseId);
            setSaved(next); // reconcile against the source of truth
        } catch (e: any) {
            setSaved(previous); // roll back
            Alert.alert(
                'Could not update favourites',
                e?.response?.data?.message || 'Please try again.',
            );
        } finally {
            setSaveInFlight(false);
        }
    };

    const handleCancelRequest = async () => {
        if (!userId || !courseId || requestInFlight.current) return;
        Alert.alert(
            'Cancel Request',
            'Are you sure you want to withdraw your interest from this course?',
            [
                { text: 'Keep Request', style: 'cancel' },
                {
                    text: 'Cancel Request', style: 'destructive', onPress: async () => {
                        if (requestInFlight.current) return;
                        requestInFlight.current = true;
                        setActionLoading(true);
                        try {
                            await interactionService.cancelInterest(userId, courseId);
                            setInterested(false);
                        } catch (e: any) {
                            Alert.alert('Error', e?.response?.data?.message || 'Could not cancel request.');
                        } finally {
                            requestInFlight.current = false;
                            setActionLoading(false);
                        }
                    }
                },
            ]
        );
    };

    if (loading) {
        return (
            <ScreenBackground>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#7cce06" />
                </View>
            </ScreenBackground>
        );
    }

    if (!course) {
        return (
            <ScreenBackground>
                <View style={styles.errorState}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={20} color="#ffffff" />
                    </TouchableOpacity>
                    <Ionicons name="alert-circle-outline" size={56} color="rgba(255,255,255,0.3)" />
                    <Text style={styles.errorText}>Course not found</Text>
                    <TouchableOpacity onPress={() => router.back()}>
                        <Text style={styles.errorLink}>Go back</Text>
                    </TouchableOpacity>
                </View>
            </ScreenBackground>
        );
    }

    const rating = course.averageRating ? Number(course.averageRating) : null;
    const price = course.price ? Number(course.price) : 0;
    const minStudents = course.minStudentsRequired || 0;
    const interestedCount = course.interestedStudentsCount ?? course.totalEnrolled ?? 0;
    const progressPct = minStudents > 0 ? Math.min(Math.round((interestedCount / minStudents) * 100), 100) : 100;
    const spotsLeft = minStudents > 0 ? Math.max(minStudents - interestedCount, 0) : null;
    const outcomes: string[] = Array.isArray(course.learningOutcomes) ? course.learningOutcomes : [];
    const longDesc = (course.description || '').length > 220;

    const trainerPicUri = trainer?.profilePictureUrl
        ? (trainer.profilePictureUrl.startsWith('http')
            ? trainer.profilePictureUrl
            : `${API_BASE_URL}${trainer.profilePictureUrl}`)
        : null;

    return (
        <ScreenBackground>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Hero ── */}
                <View style={styles.hero}>
                    <LinearGradient
                        colors={['rgba(124,206,6,0.22)', 'rgba(10,5,32,0)']}
                        style={StyleSheet.absoluteFill}
                    />

                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                        <Ionicons name="arrow-back" size={20} color="#ffffff" />
                    </TouchableOpacity>

                    {/* Favourite toggle — mirrors the back button on the right.
                        Only shown when we know who's logged in; otherwise saving
                        would 401 anyway and the button would just be confusing. */}
                    {userId && (
                        <TouchableOpacity
                            onPress={handleToggleSave}
                            disabled={saveInFlight}
                            style={styles.saveBtn}
                            activeOpacity={0.7}
                        >
                            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                            {saveInFlight ? (
                                <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                                <Ionicons
                                    name={saved ? 'heart' : 'heart-outline'}
                                    size={20}
                                    color={saved ? '#ff4d6d' : '#ffffff'}
                                />
                            )}
                        </TouchableOpacity>
                    )}

                    <View style={styles.heroIconWrap}>
                        <Ionicons name="school" size={44} color="#7cce06" />
                    </View>

                    <View style={styles.heroBadgeRow}>
                        {course.domain && (
                            <View style={styles.domainBadge}>
                                <Text style={styles.domainText}>{course.domain}</Text>
                            </View>
                        )}
                        {course.level && (
                            <View style={styles.levelBadge}>
                                <Ionicons name="bar-chart-outline" size={11} color="#aaaaaa" />
                                <Text style={styles.levelText}>{course.level}</Text>
                            </View>
                        )}
                        {course.hasCertificate && (
                            <View style={styles.certBadge}>
                                <Ionicons name="ribbon-outline" size={11} color="#FFD700" />
                                <Text style={styles.certText}>Certificate</Text>
                            </View>
                        )}
                    </View>

                    <Text style={styles.heroTitle}>{course.title}</Text>
                    {course.specificTopic && (
                        <Text style={styles.heroTopic}>{course.specificTopic}</Text>
                    )}
                </View>

                {/* ── Stats row ── */}
                <View style={styles.statsRow}>
                    {rating !== null && (
                        <StatItem icon="star" iconColor="#FFD700" value={rating.toFixed(1)} label="Rating" />
                    )}
                    <StatItem icon="people-outline" iconColor="#7cce06" value={String(course.totalEnrolled || 0)} label="Enrolled" />
                    {course.durationHours && (
                        <StatItem icon="time-outline" iconColor="#7cce06" value={`${course.durationHours}h`} label="Duration" />
                    )}
                    <StatItem
                        icon="cash-outline"
                        iconColor="#7cce06"
                        value={price === 0 ? 'Free' : `${price}`}
                        label={price === 0 ? '' : (course.currency || 'TND')}
                    />
                </View>

                {/* ── Group forming progress ── */}
                {minStudents > 0 && spotsLeft !== null && spotsLeft > 0 && (
                    <View style={styles.groupSection}>
                        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                        <View style={styles.groupHeader}>
                            <View style={styles.groupTitleRow}>
                                <Ionicons name="people" size={15} color="#7cce06" />
                                <Text style={styles.groupTitle}>Group Forming</Text>
                            </View>
                            <View style={styles.spotsLeftBadge}>
                                <Text style={styles.spotsLeftText}>{spotsLeft} spots left</Text>
                            </View>
                        </View>
                        <View style={styles.progressRow}>
                            <View style={styles.progressTrack}>
                                <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
                            </View>
                            <Text style={styles.progressLabel}>{interestedCount}/{minStudents}</Text>
                        </View>
                        <Text style={styles.groupHint}>
                            Group starts once {minStudents} students enroll
                        </Text>
                    </View>
                )}

                {/* ── Description ── */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>About this course</Text>
                    <Text style={styles.descText} numberOfLines={expanded ? undefined : 4}>
                        {course.description}
                    </Text>
                    {longDesc && (
                        <TouchableOpacity
                            onPress={() => setExpanded(!expanded)}
                            style={styles.expandBtn}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.expandText}>{expanded ? 'Show less' : 'Read more'}</Text>
                            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color="#7cce06" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* ── Learning outcomes ── */}
                {outcomes.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>What you'll learn</Text>
                        {outcomes.map((item, i) => (
                            <View key={i} style={styles.outcomeRow}>
                                <View style={styles.outcomeDot} />
                                <Text style={styles.outcomeText}>{item}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* ── Prerequisites ── */}
                {course.prerequisites ? (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Prerequisites</Text>
                        <View style={styles.prereqBox}>
                            <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill} />
                            <Ionicons name="information-circle-outline" size={16} color="#7cce06" />
                            <Text style={styles.prereqText}>{course.prerequisites}</Text>
                        </View>
                    </View>
                ) : null}

                {/* ── Course details ── */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Course details</Text>
                    <View style={styles.detailsGrid}>
                        {course.format && (
                            <DetailChip icon="layers-outline" label="Format" value={course.format} />
                        )}
                        {course.language && (
                            <DetailChip icon="language-outline" label="Language" value={course.language} />
                        )}
                        {course.maxStudentsPerGroup && (
                            <DetailChip icon="people-outline" label="Group size" value={`Max ${course.maxStudentsPerGroup}`} />
                        )}
                        {course.hasCertificate && (
                            <DetailChip icon="ribbon-outline" label="Certificate" value="Included" />
                        )}
                    </View>
                </View>

                {/* ── Instructor ── */}
                {trainer && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Your instructor</Text>
                        <View style={styles.trainerCard}>
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />

                            <View style={styles.trainerTop}>
                                {trainerPicUri ? (
                                    <Image source={{ uri: trainerPicUri }} style={styles.trainerAvatar} />
                                ) : (
                                    <View style={styles.trainerAvatarFallback}>
                                        <Ionicons name="person" size={22} color="#7cce06" />
                                    </View>
                                )}
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.trainerName}>{trainer.name}</Text>
                                    {trainer.experienceYears ? (
                                        <Text style={styles.trainerMeta}>{trainer.experienceYears} yrs experience</Text>
                                    ) : null}
                                    {trainer.coursesCount ? (
                                        <Text style={styles.trainerMeta}>{trainer.coursesCount} courses</Text>
                                    ) : null}
                                </View>
                                {trainer.averageRating ? (
                                    <View style={styles.trainerRatingBadge}>
                                        <Ionicons name="star" size={12} color="#FFD700" />
                                        <Text style={styles.trainerRatingText}>
                                            {Number(trainer.averageRating).toFixed(1)}
                                        </Text>
                                    </View>
                                ) : null}
                            </View>

                            {trainer.bio ? (
                                <Text style={styles.trainerBio} numberOfLines={3}>{trainer.bio}</Text>
                            ) : null}

                            {trainer.specializations?.length > 0 && (
                                <View style={styles.specRow}>
                                    {(trainer.specializations as string[]).slice(0, 3).map((s, i) => (
                                        <View key={i} style={styles.specChip}>
                                            <Text style={styles.specText}>{s}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}

                            {(trainer.linkedinUrl || trainer.portfolioUrl) && (
                                <View style={styles.trainerLinks}>
                                    {trainer.linkedinUrl && (
                                        <TouchableOpacity
                                            onPress={() => Linking.openURL(trainer.linkedinUrl)}
                                            style={styles.linkBtn}
                                        >
                                            <Ionicons name="logo-linkedin" size={14} color="#0A66C2" />
                                            <Text style={styles.linkText}>LinkedIn</Text>
                                        </TouchableOpacity>
                                    )}
                                    {trainer.portfolioUrl && (
                                        <TouchableOpacity
                                            onPress={() => Linking.openURL(trainer.portfolioUrl)}
                                            style={styles.linkBtn}
                                        >
                                            <Ionicons name="globe-outline" size={14} color="#7cce06" />
                                            <Text style={styles.linkText}>Portfolio</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            )}
                        </View>
                    </View>
                )}

                <View style={{ height: 110 }} />
            </ScrollView>

            {/* ── Fixed bottom enroll bar ── */}
            <View style={styles.enrollBar}>
                <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={styles.enrollBarInner}>
                    <View>
                        <Text style={styles.enrollPriceValue}>
                            {price === 0 ? 'Free' : `${price} ${course.currency || 'TND'}`}
                        </Text>
                        {price > 0 && (
                            <Text style={styles.enrollPriceLabel}>one-time payment</Text>
                        )}
                    </View>

                    {enrolled ? (
                        <View style={[styles.enrollBtn, styles.enrolledBtn]}>
                            <Ionicons name="checkmark-circle" size={17} color="#000" />
                            <Text style={styles.enrollBtnText}>Enrolled</Text>
                        </View>
                    ) : interested ? (
                        <View style={styles.actionGroup}>
                            <View style={[styles.requestedBtn]}>
                                <Ionicons name="checkmark-circle" size={15} color="#7cce06" />
                                <Text style={styles.requestedBtnText}>Requested</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.cancelRequestBtn}
                                onPress={handleCancelRequest}
                                disabled={actionLoading}
                                activeOpacity={0.85}
                            >
                                {actionLoading ? (
                                    <ActivityIndicator size="small" color="#ff6b6b" />
                                ) : (
                                    <Text style={styles.cancelRequestText}>Cancel</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={[styles.enrollBtn, actionLoading && styles.enrollBtnDisabled]}
                            onPress={handleRequestToJoin}
                            disabled={actionLoading}
                            activeOpacity={0.85}
                        >
                            {actionLoading ? (
                                <ActivityIndicator size="small" color="#000" />
                            ) : (
                                <>
                                    <Ionicons name="add-circle-outline" size={17} color="#000" />
                                    <Text style={styles.enrollBtnText}>Request to Join</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </ScreenBackground>
    );
}

function StatItem({ icon, iconColor, value, label }: { icon: any; iconColor: string; value: string; label: string }) {
    return (
        <View style={styles.statItem}>
            <Ionicons name={icon} size={17} color={iconColor} />
            <Text style={styles.statValue}>{value}</Text>
            {label ? <Text style={styles.statLabel}>{label}</Text> : null}
        </View>
    );
}

function DetailChip({ icon, label, value }: { icon: any; label: string; value: string }) {
    return (
        <View style={styles.detailChip}>
            <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill} />
            <Ionicons name={icon} size={16} color="#7cce06" />
            <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>{label}</Text>
                <Text style={styles.detailValue}>{value}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 20 },

    // Error state
    errorState: {
        flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, padding: 32,
    },
    errorText: { fontSize: 16, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
    errorLink: { fontSize: 14, color: '#7cce06', fontWeight: '600' },

    // Back button (hero)
    backBtn: {
        position: 'absolute', top: 56, left: 20, zIndex: 10,
        width: 38, height: 38, borderRadius: 12, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
        justifyContent: 'center', alignItems: 'center',
    },
    // Favourite (heart) toggle — mirrors backBtn on the right side.
    saveBtn: {
        position: 'absolute', top: 56, right: 20, zIndex: 10,
        width: 38, height: 38, borderRadius: 12, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
        justifyContent: 'center', alignItems: 'center',
    },

    // Hero
    hero: {
        paddingTop: 100, paddingBottom: 28, paddingHorizontal: 20,
        alignItems: 'center',
    },
    heroIconWrap: {
        width: 80, height: 80, borderRadius: 24,
        backgroundColor: 'rgba(124,206,6,0.12)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.25)',
        justifyContent: 'center', alignItems: 'center',
        marginBottom: 16,
    },
    heroBadgeRow: {
        flexDirection: 'row', gap: 8, flexWrap: 'wrap',
        justifyContent: 'center', marginBottom: 14,
    },
    domainBadge: {
        backgroundColor: 'rgba(124,206,6,0.15)',
        borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.3)',
    },
    domainText: { fontSize: 11, color: '#7cce06', fontWeight: '700', textTransform: 'uppercase' },
    levelBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    },
    levelText: { fontSize: 11, color: '#aaaaaa', fontWeight: '600', textTransform: 'capitalize' },
    certBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(255,215,0,0.08)',
        borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
        borderWidth: 1, borderColor: 'rgba(255,215,0,0.25)',
    },
    certText: { fontSize: 11, color: '#FFD700', fontWeight: '600' },
    heroTitle: {
        fontSize: 22, fontWeight: '800', color: '#ffffff',
        textAlign: 'center', lineHeight: 30, marginBottom: 6,
    },
    heroTopic: {
        fontSize: 13, color: '#aaaaaa', textAlign: 'center', lineHeight: 19,
    },

    // Stats row
    statsRow: {
        flexDirection: 'row', justifyContent: 'space-around',
        marginHorizontal: 20, marginBottom: 16,
        borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        paddingVertical: 14, backgroundColor: 'rgba(255,255,255,0.03)',
    },
    statItem: { alignItems: 'center', gap: 2, flex: 1 },
    statValue: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
    statLabel: { fontSize: 10, color: '#aaaaaa', fontWeight: '500' },

    // Group forming
    groupSection: {
        marginHorizontal: 20, marginBottom: 16,
        borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,165,0,0.25)',
        padding: 14,
    },
    groupHeader: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 10,
    },
    groupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    groupTitle: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
    spotsLeftBadge: {
        backgroundColor: 'rgba(255,165,0,0.12)',
        borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
        borderWidth: 1, borderColor: 'rgba(255,165,0,0.3)',
    },
    spotsLeftText: { fontSize: 11, color: '#FFA500', fontWeight: '600' },
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
    progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)' },
    progressFill: { height: 6, borderRadius: 3, backgroundColor: '#7cce06' },
    progressLabel: { fontSize: 11, color: '#aaaaaa', fontWeight: '600' },
    groupHint: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' },

    // Sections
    section: { paddingHorizontal: 20, marginBottom: 22 },
    sectionTitle: {
        fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 12,
    },
    descText: { fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 22 },
    expandBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, alignSelf: 'flex-start',
    },
    expandText: { fontSize: 13, color: '#7cce06', fontWeight: '600' },

    // Outcomes
    outcomeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
    outcomeDot: {
        width: 6, height: 6, borderRadius: 3, backgroundColor: '#7cce06', marginTop: 7,
    },
    outcomeText: { flex: 1, fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 21 },

    // Prerequisites
    prereqBox: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 10,
        borderRadius: 12, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.2)',
        padding: 12,
    },
    prereqText: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 20 },

    // Details grid
    detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    detailChip: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 10,
        borderRadius: 12, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        padding: 12, minWidth: '45%', flex: 1,
    },
    detailLabel: { fontSize: 10, color: '#aaaaaa', fontWeight: '600', marginBottom: 2, textTransform: 'uppercase' },
    detailValue: { fontSize: 13, color: '#ffffff', fontWeight: '500' },

    // Trainer card
    trainerCard: {
        borderRadius: 18, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        padding: 16,
    },
    trainerTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    trainerAvatar: { width: 52, height: 52, borderRadius: 26 },
    trainerAvatarFallback: {
        width: 52, height: 52, borderRadius: 26,
        backgroundColor: 'rgba(124,206,6,0.12)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.25)',
        justifyContent: 'center', alignItems: 'center',
    },
    trainerName: { fontSize: 15, fontWeight: '700', color: '#ffffff', marginBottom: 2 },
    trainerMeta: { fontSize: 12, color: '#aaaaaa' },
    trainerRatingBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: 'rgba(255,215,0,0.1)',
        borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
        alignSelf: 'flex-start',
    },
    trainerRatingText: { fontSize: 12, fontWeight: '700', color: '#FFD700' },
    trainerBio: { fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 20, marginBottom: 10 },
    specRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
    specChip: {
        backgroundColor: 'rgba(124,206,6,0.08)',
        borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.2)',
    },
    specText: { fontSize: 11, color: '#7cce06', fontWeight: '600' },
    trainerLinks: { flexDirection: 'row', gap: 10, marginTop: 2 },
    linkBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    },
    linkText: { fontSize: 12, color: '#ffffff', fontWeight: '500' },

    // Enroll bar
    enrollBar: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
    },
    enrollBarInner: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 14, paddingBottom: 30,
    },
    enrollPriceValue: { fontSize: 20, fontWeight: '800', color: '#ffffff' },
    enrollPriceLabel: { fontSize: 11, color: '#aaaaaa' },
    enrollBtn: {
        backgroundColor: '#7cce06', borderRadius: 14,
        paddingHorizontal: 28, paddingVertical: 14,
        flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 130, justifyContent: 'center',
    },
    enrollBtnDisabled: { backgroundColor: 'rgba(124,206,6,0.5)' },
    enrollBtnText: { fontSize: 15, fontWeight: '700', color: '#000000' },
    enrolledBtn: { backgroundColor: 'rgba(124,206,6,0.85)' },

    actionGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    requestedBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.5)',
        backgroundColor: 'rgba(124,206,6,0.12)',
    },
    requestedBtnText: { fontSize: 14, fontWeight: '700', color: '#7cce06' },
    cancelRequestBtn: {
        borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
        borderWidth: 1, borderColor: 'rgba(255,107,107,0.4)',
        backgroundColor: 'rgba(255,107,107,0.08)',
        minWidth: 70, alignItems: 'center', justifyContent: 'center',
    },
    cancelRequestText: { fontSize: 13, fontWeight: '700', color: '#ff6b6b' },
});
