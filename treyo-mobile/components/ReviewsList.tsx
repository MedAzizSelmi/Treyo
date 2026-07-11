import { View, Text, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { reviewService, API_BASE_URL } from '../services/api';

/**
 * Reusable "What students said" list. Drops into:
 *   - course-detail (mode="course") — shows course + trainer ratings
 *   - trainer-profile (mode="trainer") — shows trainer rating only
 *   - trainer's own profile (mode="trainer", showSelfHint=true) — same,
 *     but with a hint explaining the feedback is private to them
 *
 * Loads on mount via /api/reviews/{course|trainer}/{id}. Renders an
 * empty state when there are no reviews yet rather than disappearing,
 * so the section header still has something to anchor.
 */
type Props = {
    mode: 'course' | 'trainer';
    id: string;
    /** Optional cap. Defaults to all reviews returned by the API. */
    limit?: number;
};

export function ReviewsList({ mode, id, limit }: Props) {
    const { t, i18n } = useTranslation();
    const [reviews, setReviews] = useState<any[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const list = mode === 'course'
                    ? await reviewService.forCourse(id)
                    : await reviewService.forTrainer(id);
                if (!cancelled) setReviews(Array.isArray(list) ? list : []);
            } catch (_) {
                if (!cancelled) setReviews([]);
            }
        })();
        return () => { cancelled = true; };
    }, [mode, id]);

    if (reviews === null) {
        return (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#7cce06" />
            </View>
        );
    }

    if (reviews.length === 0) {
        return (
            <View style={styles.emptyState}>
                <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill} />
                <Ionicons name="star-outline" size={20} color="rgba(255,255,255,0.35)" />
                <Text style={styles.emptyText}>{t('reviews.empty')}</Text>
            </View>
        );
    }

    const shown = typeof limit === 'number' ? reviews.slice(0, limit) : reviews;

    return (
        <View>
            {shown.map(r => (
                <ReviewCard key={r.reviewId} review={r} mode={mode} lang={i18n.language} />
            ))}
            {typeof limit === 'number' && reviews.length > limit && (
                <Text style={styles.moreHint}>
                    {t('reviews.moreCount', { count: reviews.length - limit })}
                </Text>
            )}
        </View>
    );
}

function ReviewCard({ review, mode, lang }: { review: any; mode: 'course' | 'trainer'; lang: string }) {
    const { t } = useTranslation();
    const stars = mode === 'course'
        ? Number(review.courseRating || 0)
        : Number(review.trainerRating || 0);
    const dateLabel = review.createdAt
        ? formatDate(review.createdAt, lang)
        : '';
    const photoUri = review.studentPhoto
        ? (String(review.studentPhoto).startsWith('http')
            ? review.studentPhoto
            : `${API_BASE_URL}${review.studentPhoto}`)
        : null;
    const initial = (review.studentName || 'S').trim().charAt(0).toUpperCase();

    return (
        <View style={styles.card}>
            <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />

            <View style={styles.cardHeader}>
                {photoUri ? (
                    <Image source={{ uri: photoUri }} style={styles.avatar} />
                ) : (
                    <View style={styles.avatarFallback}>
                        <Text style={styles.avatarText}>{initial}</Text>
                    </View>
                )}
                <View style={{ flex: 1 }}>
                    <Text style={styles.studentName} numberOfLines={1}>
                        {review.studentName || t('reviews.anonymous')}
                    </Text>
                    <View style={styles.starRow}>
                        {[1, 2, 3, 4, 5].map(n => (
                            <Ionicons
                                key={n}
                                name={n <= stars ? 'star' : 'star-outline'}
                                size={12}
                                color={n <= stars ? '#FFD700' : 'rgba(255,255,255,0.25)'}
                            />
                        ))}
                        <Text style={styles.dateText}>· {dateLabel}</Text>
                    </View>
                </View>

                {/* In course mode the card also shows the trainer rating
                    as a tiny pill so prospective students can see both
                    numbers at once. */}
                {mode === 'course' && review.trainerRating != null && (
                    <View style={styles.trainerPill}>
                        <Ionicons name="person-outline" size={10} color="#7cce06" />
                        <Text style={styles.trainerPillText}>{Number(review.trainerRating).toFixed(0)}</Text>
                    </View>
                )}
            </View>

            {/* Show only the feedback relevant to the surface we're on.
             *  Course pages get courseFeedback; trainer pages get
             *  trainerFeedback. Falls back to the legacy `feedback`
             *  field so older review rows that pre-date the split
             *  still render their text. */}
            {(() => {
                const text = mode === 'course'
                    ? (review.courseFeedback ?? review.feedback)
                    : (review.trainerFeedback ?? review.feedback);
                if (text) {
                    return <Text style={styles.feedbackText}>{text}</Text>;
                }
                return <Text style={styles.feedbackTextMuted}>{t('reviews.noWritten')}</Text>;
            })()}
        </View>
    );
}

function formatDate(iso: string, lang: string) {
    try {
        return new Date(iso).toLocaleDateString(lang || undefined, {
            month: 'short', day: 'numeric', year: 'numeric',
        });
    } catch { return ''; }
}

const styles = StyleSheet.create({
    emptyState: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 14, paddingVertical: 12,
        borderRadius: 12, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    },
    emptyText: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' },

    card: {
        padding: 14, marginBottom: 10,
        borderRadius: 14, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    avatar: { width: 36, height: 36, borderRadius: 18 },
    avatarFallback: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(124,206,6,0.15)',
        alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { color: '#7cce06', fontSize: 14, fontWeight: '700' },

    studentName: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
    starRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
    dateText: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 4 },

    trainerPill: {
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: 'rgba(124,206,6,0.10)',
        paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999,
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.25)',
    },
    trainerPillText: { fontSize: 10, fontWeight: '700', color: '#7cce06' },

    feedbackText: { fontSize: 13, lineHeight: 19, color: 'rgba(255,255,255,0.85)' },
    feedbackTextMuted: { fontSize: 12, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' },

    moreHint: { fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 4 },
});
