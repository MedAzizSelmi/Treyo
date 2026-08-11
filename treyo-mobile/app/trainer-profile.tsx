import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Image, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ScreenBackground } from '../components/ScreenBackground';
import { ReviewsList } from '../components/ReviewsList';
import ReportTrainerModal from '../components/ReportTrainerModal';
import { trainerService, courseService, authService, API_BASE_URL } from '../services/api';

export default function TrainerProfileScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const { trainerId } = useLocalSearchParams<{ trainerId: string }>();
    const [trainer, setTrainer] = useState<any>(null);
    const [courses, setCourses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [reportOpen, setReportOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);

    // Reporting is a student-only action, and nobody reports themselves.
    const canReport =
        currentUser?.role === 'STUDENT' &&
        !!currentUser?.userId &&
        currentUser.userId !== trainerId;

    useEffect(() => { load(); }, []);

    useEffect(() => {
        authService.getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
    }, []);

    const load = async () => {
        if (!trainerId) return;
        try {
            const [t, c] = await Promise.all([
                trainerService.getTrainerById(trainerId),
                courseService.getTrainerCourses(trainerId),
            ]);
            setTrainer(t);
            setCourses(Array.isArray(c) ? c.filter((x: any) => {
                const s = (x.status || x.courseStatus || '').toUpperCase();
                return s === 'PUBLISHED' || s === 'ACTIVE';
            }) : []);
        } catch (e) {
            console.log('Trainer profile load error', e);
        } finally {
            setLoading(false);
        }
    };

    const avatarUri = trainer?.profilePictureUrl
        ? (trainer.profilePictureUrl.startsWith('http') ? trainer.profilePictureUrl : API_BASE_URL + trainer.profilePictureUrl)
        : null;

    const specializations: string[] = Array.isArray(trainer?.specializations)
        ? trainer.specializations
        : (trainer?.specializations ? [trainer.specializations] : []);

    if (loading) {
        return (
            <ScreenBackground>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#7cce06" />
                </View>
            </ScreenBackground>
        );
    }

    if (!trainer) {
        return (
            <ScreenBackground>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color="#ffffff" />
                    </TouchableOpacity>
                </View>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="person-outline" size={48} color="rgba(255,255,255,0.2)" />
                    <Text style={{ color: 'rgba(255,255,255,0.4)', marginTop: 12, fontSize: 16 }}>Trainer not found</Text>
                </View>
            </ScreenBackground>
        );
    }

    return (
        <ScreenBackground>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                {/* Back button + report action */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color="#ffffff" />
                    </TouchableOpacity>
                    {/* Only students can report, and never themselves — a
                        trainer viewing their own profile shouldn't see this. */}
                    {canReport && (
                        <TouchableOpacity
                            onPress={() => setReportOpen(true)}
                            style={styles.reportBtn}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="flag-outline" size={15} color="#ff8f8f" />
                            <Text style={styles.reportBtnText}>{t('report.reportAction')}</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Hero card */}
                <View style={styles.heroCard}>
                    <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />

                    {/* Avatar */}
                    <View style={styles.avatarWrap}>
                        {avatarUri ? (
                            <Image source={{ uri: avatarUri }} style={styles.avatar} />
                        ) : (
                            <LinearGradient colors={['#7cce06', '#5aaa00']} style={styles.avatar}>
                                <Text style={styles.avatarLetter}>{(trainer.name || 'T').charAt(0)}</Text>
                            </LinearGradient>
                        )}
                        {trainer.isVerified && (
                            <View style={styles.verifiedBadge}>
                                <Ionicons name="checkmark" size={11} color="#fff" />
                            </View>
                        )}
                    </View>

                    <Text style={styles.name}>{trainer.name}</Text>

                    {specializations.length > 0 && (
                        <Text style={styles.specialization}>{specializations[0]}</Text>
                    )}

                    {/* Stats row */}
                    <View style={styles.statsRow}>
                        {trainer.averageRating > 0 && (
                            <View style={styles.statItem}>
                                <Ionicons name="star" size={16} color="#FFD700" />
                                <Text style={styles.statValue}>{Number(trainer.averageRating).toFixed(1)}</Text>
                                <Text style={styles.statLabel}>{t('profile.rating')}</Text>
                            </View>
                        )}
                        {typeof trainer.experienceYears === 'number' && (
                            <View style={styles.statItem}>
                                <Ionicons name="briefcase" size={16} color="#7cce06" />
                                <Text style={styles.statValue}>{trainer.experienceYears}</Text>
                                <Text style={styles.statLabel}>Yrs exp</Text>
                            </View>
                        )}
                        {typeof trainer.coursesCount === 'number' && (
                            <View style={styles.statItem}>
                                <Ionicons name="book" size={16} color="#3b5bdb" />
                                <Text style={styles.statValue}>{trainer.coursesCount}</Text>
                                <Text style={styles.statLabel}>{t('profile.courses')}</Text>
                            </View>
                        )}
                    </View>

                    {/* Links */}
                    {(trainer.linkedinUrl || trainer.portfolioUrl) && (
                        <View style={styles.linksRow}>
                            {trainer.linkedinUrl && (
                                <TouchableOpacity style={styles.linkBtn} onPress={() => Linking.openURL(trainer.linkedinUrl)} activeOpacity={0.8}>
                                    <Ionicons name="logo-linkedin" size={15} color="#0A66C2" />
                                    <Text style={styles.linkBtnText}>LinkedIn</Text>
                                </TouchableOpacity>
                            )}
                            {trainer.portfolioUrl && (
                                <TouchableOpacity style={styles.linkBtn} onPress={() => Linking.openURL(trainer.portfolioUrl)} activeOpacity={0.8}>
                                    <Ionicons name="globe-outline" size={15} color="#7cce06" />
                                    <Text style={styles.linkBtnText}>Portfolio</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                </View>

                {/* Bio */}
                {!!trainer.bio && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>{t('profile.bio')}</Text>
                        <View style={styles.glassBox}>
                            <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
                            <Text style={styles.bioText}>{trainer.bio}</Text>
                        </View>
                    </View>
                )}

                {/* Specializations */}
                {specializations.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>{t('trainers.specializations')}</Text>
                        <View style={styles.chipsWrap}>
                            {specializations.map((s: string, i: number) => (
                                <View key={i} style={styles.chip}>
                                    <Text style={styles.chipText}>{s}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* Courses */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{t('profile.courses')} ({courses.length})</Text>
                    {courses.length === 0 ? (
                        <View style={styles.emptyCoursesWrap}>
                            <Ionicons name="book-outline" size={36} color="rgba(124,206,6,0.3)" />
                            <Text style={styles.emptyCoursesText}>No published courses yet</Text>
                        </View>
                    ) : (
                        courses.map((course: any) => (
                            <TouchableOpacity
                                key={course.courseId || course.id}
                                style={styles.courseCard}
                                activeOpacity={0.85}
                                onPress={() => router.push({ pathname: '/course-detail' as any, params: { courseId: course.courseId || course.id } })}
                            >
                                <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
                                <View style={styles.courseCardInner}>
                                    <View style={styles.courseIconWrap}>
                                        <Ionicons name="book" size={20} color="#7cce06" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.courseTitle} numberOfLines={2}>{course.title || 'Untitled'}</Text>
                                        <View style={styles.courseMeta}>
                                            {!!course.level && (
                                                <Text style={styles.courseMetaText}>{course.level}</Text>
                                            )}
                                            {!!course.domain && (
                                                <Text style={styles.courseMetaText}>· {course.domain}</Text>
                                            )}
                                            {course.price != null && (
                                                <Text style={styles.coursePrice}>
                                                    {Number(course.price) === 0 ? 'Free' : `${Number(course.price).toFixed(0)} DT`}
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                    <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
                                </View>
                            </TouchableOpacity>
                        ))
                    )}
                </View>

                {/* Reviews this trainer has received — same component
                    the course page uses; backend filters by trainerId. */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{t('reviews.byStudents')}</Text>
                    <ReviewsList mode="trainer" id={String(trainerId)} />
                </View>

                <View style={{ height: 80 }} />
            </ScrollView>

            {canReport && (
                <ReportTrainerModal
                    visible={reportOpen}
                    onClose={() => setReportOpen(false)}
                    studentId={currentUser.userId}
                    trainerId={String(trainerId)}
                    trainerName={trainer?.name}
                />
            )}
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    scroll: { paddingBottom: 40 },

    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12,
    },
    reportBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
        borderWidth: 1, borderColor: 'rgba(255,84,84,0.3)',
        backgroundColor: 'rgba(255,84,84,0.10)',
    },
    reportBtnText: { fontSize: 12.5, fontWeight: '700', color: '#ff8f8f' },
    backBtn: {
        width: 38, height: 38, borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.08)',
        justifyContent: 'center', alignItems: 'center',
    },

    heroCard: {
        marginHorizontal: 20, borderRadius: 24, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        padding: 24, alignItems: 'center', marginBottom: 20,
    },
    avatarWrap: { marginBottom: 14, position: 'relative' },
    avatar: { width: 90, height: 90, borderRadius: 45, justifyContent: 'center', alignItems: 'center' },
    avatarLetter: { fontSize: 36, fontWeight: 'bold', color: '#fff' },
    verifiedBadge: {
        position: 'absolute', bottom: 2, right: 2,
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: '#3b5bdb',
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 2, borderColor: '#0d0d1a',
    },
    name: { fontSize: 22, fontWeight: '800', color: '#ffffff', marginBottom: 4 },
    specialization: { fontSize: 14, color: '#aaaaaa', marginBottom: 16 },
    statsRow: { flexDirection: 'row', gap: 28, marginBottom: 16 },
    statItem: { alignItems: 'center', gap: 4 },
    statValue: { fontSize: 16, fontWeight: '800', color: '#ffffff' },
    statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
    linksRow: { flexDirection: 'row', gap: 10 },
    linkBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 14, paddingVertical: 8,
        borderRadius: 20, borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    linkBtnText: { fontSize: 13, color: '#ffffff', fontWeight: '600' },

    section: { paddingHorizontal: 20, marginBottom: 22 },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: '#ffffff', marginBottom: 12 },

    glassBox: {
        borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        padding: 16,
    },
    bioText: { fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 22 },

    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        paddingHorizontal: 14, paddingVertical: 7,
        borderRadius: 20,
        backgroundColor: 'rgba(124,206,6,0.1)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.25)',
    },
    chipText: { fontSize: 13, color: '#7cce06', fontWeight: '600' },

    courseCard: {
        borderRadius: 14, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        marginBottom: 10,
    },
    courseCardInner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
    courseIconWrap: {
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: 'rgba(124,206,6,0.1)',
        justifyContent: 'center', alignItems: 'center', flexShrink: 0,
    },
    courseTitle: { fontSize: 14, fontWeight: '700', color: '#ffffff', marginBottom: 4 },
    courseMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    courseMetaText: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
    coursePrice: { fontSize: 12, fontWeight: '700', color: '#7cce06' },

    emptyCoursesWrap: { alignItems: 'center', paddingVertical: 32 },
    emptyCoursesText: { fontSize: 14, color: 'rgba(255,255,255,0.3)', marginTop: 10 },
});
