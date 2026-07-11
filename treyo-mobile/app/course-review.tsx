import {
    View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
    ActivityIndicator, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as StoreReview from 'expo-store-review';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenBackground } from '../components/ScreenBackground';
import { authService, courseService, reviewService } from '../services/api';

/**
 * End-of-course survey.
 *
 * Flow:
 *   1. Student lands here after the last session ends — either via the
 *      auto-prompt on home (driven by /reviews/check) or by tapping the
 *      "Leave a review" button on course-detail.
 *   2. Picks a 1-5 rating for the course AND for the trainer (both
 *      required), optionally writes a feedback note.
 *   3. POSTs to /api/reviews — backend persists + rolls up averages.
 *   4. Asks the native Google Play / App Store rating prompt via
 *      expo-store-review. If the platform refuses (rate-limited /
 *      already shown recently / unavailable), we just go back silently.
 *
 * Reviews are one-per-(student, course) — if the backend returns 409
 * we surface "You've already reviewed this course" and pop back.
 */
export default function CourseReviewScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const { courseId } = useLocalSearchParams<{ courseId: string }>();

    const [studentId, setStudentId] = useState<string | null>(null);
    const [course, setCourse] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [courseRating, setCourseRating] = useState(0);
    const [trainerRating, setTrainerRating] = useState(0);
    // Two separate feedback fields — courseFeedback ends up on
    // course-detail's "What students said" list, trainerFeedback on
    // the trainer's pages. Both optional.
    const [courseFeedback, setCourseFeedback] = useState('');
    const [trainerFeedback, setTrainerFeedback] = useState('');

    useEffect(() => { load(); }, [courseId]);

    const load = async () => {
        if (!courseId) {
            setLoading(false);
            return;
        }
        try {
            const [user, c] = await Promise.all([
                authService.getCurrentUser(),
                courseService.getCourseById(courseId),
            ]);
            setStudentId(user?.userId || null);
            setCourse(c);

            // If already reviewed, short-circuit straight back. We don't
            // let students re-submit — the backend would 409 anyway and
            // there's no clean UX for "edit your existing review" yet.
            if (user?.userId) {
                try {
                    const status = await reviewService.check(user.userId, courseId);
                    if (status?.reviewed) {
                        Alert.alert(t('review.alreadyReviewed'), t('review.alreadyReviewedBody'));
                        router.back();
                        return;
                    }
                } catch (_) {}
            }
        } catch (_) {
            // Stay on the screen — the user will get an error when they try to submit.
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (!studentId || !courseId) return;
        if (courseRating < 1 || trainerRating < 1) {
            Alert.alert(t('review.almostThere'), t('review.almostThereBody'));
            return;
        }
        setSubmitting(true);
        try {
            await reviewService.submit({
                studentId,
                courseId: String(courseId),
                trainerId: course?.trainerId,
                courseRating,
                trainerRating,
                courseFeedback: courseFeedback.trim() || undefined,
                trainerFeedback: trainerFeedback.trim() || undefined,
            });

            // Now ask for the native store rating. requestReview() is a
            // no-op if the platform decides not to show it (rate limits,
            // dev build, etc.) — we don't gate UX on it.
            try {
                const available = await StoreReview.isAvailableAsync();
                const hasAction = await StoreReview.hasAction();
                if (available && hasAction) {
                    await StoreReview.requestReview();
                }
            } catch (_) {}

            Alert.alert(
                t('review.thanks'),
                t('review.thanksBody'),
                [{ text: t('common.ok'), onPress: () => router.back() }],
            );
        } catch (e: any) {
            const status = e?.response?.status;
            const msg = e?.response?.data?.error
                || (status === 409 ? 'You\'ve already reviewed this course.' : 'Could not submit your review. Please try again.');
            Alert.alert('Submission failed', msg);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <ScreenBackground>
                <View style={styles.center}><ActivityIndicator size="large" color="#7cce06" /></View>
            </ScreenBackground>
        );
    }

    return (
        <ScreenBackground>
            <LinearGradient
                colors={['rgba(124,206,6,0.15)', 'rgba(10,5,32,0)']}
                style={styles.headerGlow}
            />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                    <Ionicons name="arrow-back" size={20} color="#ffffff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('review.title')}</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Course summary card */}
                <View style={styles.courseCard}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.courseIconWrap}>
                        <Ionicons name="school" size={26} color="#7cce06" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.courseTitle} numberOfLines={2}>
                            {course?.title || 'Course'}
                        </Text>
                        {course?.trainerName ? (
                            <Text style={styles.courseTrainer}>by {course.trainerName}</Text>
                        ) : null}
                    </View>
                </View>

                {/* Course rating + course feedback */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{t('review.courseQ')}</Text>
                    <Text style={styles.sectionHint}>{t('review.courseHint')}</Text>
                    <StarPicker value={courseRating} onChange={setCourseRating} />
                    <View style={[styles.feedbackWrap, { marginTop: 14 }]}>
                        <TextInput
                            style={styles.feedbackInput}
                            placeholder={t('review.courseFeedbackPlaceholder')}
                            placeholderTextColor="rgba(255,255,255,0.35)"
                            value={courseFeedback}
                            onChangeText={setCourseFeedback}
                            multiline
                            textAlignVertical="top"
                            maxLength={1000}
                        />
                        <Text style={styles.feedbackCount}>{courseFeedback.length}/1000</Text>
                    </View>
                </View>

                {/* Trainer rating + trainer feedback */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{t('review.trainerQ')}</Text>
                    <Text style={styles.sectionHint}>{t('review.trainerHint')}</Text>
                    <StarPicker value={trainerRating} onChange={setTrainerRating} />
                    <View style={[styles.feedbackWrap, { marginTop: 14 }]}>
                        <TextInput
                            style={styles.feedbackInput}
                            placeholder={t('review.trainerFeedbackPlaceholder')}
                            placeholderTextColor="rgba(255,255,255,0.35)"
                            value={trainerFeedback}
                            onChangeText={setTrainerFeedback}
                            multiline
                            textAlignVertical="top"
                            maxLength={1000}
                        />
                        <Text style={styles.feedbackCount}>{trainerFeedback.length}/1000</Text>
                    </View>
                </View>

                <View style={{ height: 24 }} />
            </ScrollView>

            {/* Submit bar */}
            <View style={styles.submitBar}>
                <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
                <TouchableOpacity
                    style={[
                        styles.submitBtn,
                        (courseRating < 1 || trainerRating < 1 || submitting) && styles.submitBtnDisabled,
                    ]}
                    onPress={handleSubmit}
                    disabled={courseRating < 1 || trainerRating < 1 || submitting}
                    activeOpacity={0.85}
                >
                    {submitting ? (
                        <ActivityIndicator size="small" color="#000" />
                    ) : (
                        <>
                            <Ionicons name="paper-plane" size={16} color="#000" />
                            <Text style={styles.submitBtnText}>{t('review.submit')}</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </ScreenBackground>
    );
}

/** 5-star horizontal picker. Tapping a star sets the rating; tapping
 *  the same star again clears it. */
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    return (
        <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map(n => {
                const filled = n <= value;
                return (
                    <TouchableOpacity
                        key={n}
                        onPress={() => onChange(value === n ? 0 : n)}
                        activeOpacity={0.7}
                        style={styles.starBtn}
                    >
                        <Ionicons
                            name={filled ? 'star' : 'star-outline'}
                            size={36}
                            color={filled ? '#FFD700' : 'rgba(255,255,255,0.35)'}
                        />
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    headerGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 200 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: 12,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 20, overflow: 'hidden',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: 17, color: '#ffffff', fontWeight: '700' },

    scrollContent: { paddingHorizontal: 16, paddingBottom: 100 },

    courseCard: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        borderRadius: 18, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        padding: 16, marginBottom: 16,
    },
    courseIconWrap: {
        width: 52, height: 52, borderRadius: 14,
        backgroundColor: 'rgba(124,206,6,0.14)',
        alignItems: 'center', justifyContent: 'center',
    },
    courseTitle: { fontSize: 16, color: '#ffffff', fontWeight: '700' },
    courseTrainer: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4 },

    section: { marginTop: 20 },
    sectionTitle: { fontSize: 15, color: '#ffffff', fontWeight: '700' },
    sectionHint: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 },

    starRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingHorizontal: 10 },
    starBtn: { padding: 4 },

    feedbackWrap: {
        marginTop: 12, borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    feedbackInput: {
        padding: 14,
        minHeight: 110,
        fontSize: 14, color: '#ffffff',
    },
    feedbackCount: {
        fontSize: 11, color: 'rgba(255,255,255,0.4)',
        textAlign: 'right', paddingHorizontal: 12, paddingBottom: 8,
    },

    submitBar: {
        position: 'absolute', left: 0, right: 0, bottom: 0,
        paddingHorizontal: 16, paddingTop: 12, paddingBottom: 30,
        borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
    },
    submitBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: '#7cce06', borderRadius: 28, paddingVertical: 16,
    },
    submitBtnDisabled: { opacity: 0.5 },
    submitBtnText: { color: '#000', fontSize: 15, fontWeight: '700' },
});
