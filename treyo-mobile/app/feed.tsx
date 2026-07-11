import {
    View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
    RefreshControl, Share, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenBackground } from '../components/ScreenBackground';
import { authService, feedService } from '../services/api';

/**
 * AI-generated daily feed screen.
 *
 * Backed by /api/feed — paged, newest-first. Each card shows:
 *   - A category pill (Did you know? / Tip / Worth a thought)
 *   - Title + body
 *   - Like / save / share actions
 *
 * Behaviour:
 *   - Loads page 0 on mount + on focus (so a tap on home → feed always
 *     surfaces fresh content).
 *   - Pull-to-refresh resets and reloads.
 *   - Infinite scroll loads more pages as the user nears the bottom.
 *   - Like/save are optimistic — toggle the UI immediately and roll
 *     back only if the request fails.
 */
export default function FeedScreen() {
    const router = useRouter();
    const { t, i18n } = useTranslation();

    const [posts, setPosts] = useState<any[]>([]);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    // Tracks the manual "Generate posts" button on the empty state —
    // disabled mid-call + spinner so the user doesn't double-tap.
    const [generating, setGenerating] = useState(false);

    useFocusEffect(useCallback(() => {
        (async () => {
            const u = await authService.getCurrentUser();
            setUserId(u?.userId ?? null);
            loadPage(0, u?.userId ?? null, /* replace */ true);
        })();
    }, []));

    // Re-fetch when the i18n language changes so users see translated
    // content immediately rather than after a restart. Skips the very
    // first render — useFocusEffect already covers that case.
    useEffect(() => {
        if (loading) return;
        loadPage(0, userId, true);
    }, [i18n.language]);

    const loadPage = async (pageNum: number, uid: string | null, replace: boolean) => {
        try {
            const data = await feedService.getFeed(uid || undefined, i18n.language, pageNum, 20);
            const items = data.items || [];
            setPosts(prev => replace ? items : [...prev, ...items]);
            setHasMore(!!data.hasMore);
            setPage(pageNum);
        } catch (_) {
            if (replace) setPosts([]);
        } finally {
            setLoading(false);
            setLoadingMore(false);
            setRefreshing(false);
        }
    };

    const handleRefresh = () => {
        setRefreshing(true);
        loadPage(0, userId, true);
    };

    /** Manual seed — hits POST /api/feed/generate which runs the
     *  Gemini batch the daily cron would normally produce. Used to
     *  bootstrap the feed before the first 6am cron tick. */
    const handleGenerate = async () => {
        if (generating) return;
        setGenerating(true);
        try {
            await feedService.generate();
            await loadPage(0, userId, true);
        } catch (_) {
            // Silent — the empty state stays visible and the user can
            // try again.
        } finally {
            setGenerating(false);
        }
    };

    const handleEndReached = () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        loadPage(page + 1, userId, false);
    };

    const handleLike = async (post: any) => {
        if (!userId) return;
        // Optimistic UI — flip immediately, server confirms or rolls back
        const wasLiked = !!post.liked;
        setPosts(ps => ps.map(p =>
            p.postId === post.postId
                ? { ...p, liked: !wasLiked, likesCount: Math.max(0, (p.likesCount || 0) + (wasLiked ? -1 : 1)) }
                : p
        ));
        try {
            await feedService.toggleLike(post.postId, userId);
        } catch (_) {
            // Roll back
            setPosts(ps => ps.map(p =>
                p.postId === post.postId
                    ? { ...p, liked: wasLiked, likesCount: post.likesCount }
                    : p
            ));
        }
    };

    const handleSave = async (post: any) => {
        if (!userId) return;
        const wasSaved = !!post.saved;
        setPosts(ps => ps.map(p =>
            p.postId === post.postId ? { ...p, saved: !wasSaved } : p
        ));
        try {
            await feedService.toggleSave(post.postId, userId);
        } catch (_) {
            setPosts(ps => ps.map(p =>
                p.postId === post.postId ? { ...p, saved: wasSaved } : p
            ));
        }
    };

    const handleShare = async (post: any) => {
        try {
            await Share.share({
                message: `${post.title}\n\n${post.body}\n\n— ${t('feed.byTreyoAi')}`,
                title: post.title,
            });
        } catch (_) {}
    };

    const categoryLabel = (category: string) => {
        switch (category) {
            case 'FUN_FACT': return t('feed.categoryFunFact');
            case 'DOMAIN_TIP': return t('feed.categoryDomainTip');
            case 'MOTIVATION': return t('feed.categoryMotivation');
            case 'NEWS': return t('feed.categoryNews');
            default: return category;
        }
    };

    const formatTime = (dateStr: string) => {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString(i18n.language || undefined, {
                month: 'short', day: 'numeric',
            });
        } catch { return ''; }
    };

    return (
        <ScreenBackground>
            {/* Header */}
            <LinearGradient
                colors={['rgba(124,206,6,0.15)', 'rgba(10,5,32,0)']}
                style={styles.headerGlow}
            />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                    <Ionicons name="arrow-back" size={20} color="#ffffff" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>{t('feed.title')}</Text>
                    <Text style={styles.headerSubtitle}>{t('feed.subtitle')}</Text>
                </View>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#7cce06" />
                </View>
            ) : posts.length === 0 ? (
                <View style={styles.empty}>
                    <Ionicons name="newspaper-outline" size={42} color="rgba(255,255,255,0.25)" />
                    <Text style={styles.emptyTitle}>{t('feed.empty')}</Text>
                    <Text style={styles.emptyBody}>{t('feed.emptyBody')}</Text>
                    {/* Manual seed button — useful in dev before the daily
                        cron has fired, and as a "generate more" shortcut
                        any time the feed runs out of fresh content. */}
                    <TouchableOpacity
                        onPress={handleGenerate}
                        disabled={generating}
                        activeOpacity={0.85}
                        style={[styles.generateBtn, generating && { opacity: 0.6 }]}
                    >
                        {generating
                            ? <ActivityIndicator size="small" color="#000" />
                            : (
                                <>
                                    <Ionicons name="sparkles-outline" size={16} color="#000" />
                                    <Text style={styles.generateBtnText}>{t('feed.refresh')}</Text>
                                </>
                            )}
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor="#7cce06"
                        />
                    }
                    onScroll={({ nativeEvent }) => {
                        const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
                        // Within 200px of the bottom triggers next page
                        if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 200) {
                            handleEndReached();
                        }
                    }}
                    scrollEventThrottle={300}
                >
                    {posts.map(post => (
                        <FeedCard
                            key={post.postId}
                            post={post}
                            categoryLabel={categoryLabel(post.category)}
                            dateLabel={formatTime(post.publishedAt)}
                            onLike={() => handleLike(post)}
                            onSave={() => handleSave(post)}
                            onShare={() => handleShare(post)}
                            shareLabel={t('feed.share')}
                            saveLabel={post.saved ? t('feed.saved') : t('feed.save')}
                        />
                    ))}

                    {loadingMore && (
                        <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                            <ActivityIndicator size="small" color="#7cce06" />
                        </View>
                    )}
                    <View style={{ height: 40 }} />
                </ScrollView>
            )}
        </ScreenBackground>
    );
}

function FeedCard({
    post, categoryLabel, dateLabel,
    onLike, onSave, onShare,
    shareLabel, saveLabel,
}: {
    post: any; categoryLabel: string; dateLabel: string;
    onLike: () => void; onSave: () => void; onShare: () => void;
    shareLabel: string; saveLabel: string;
}) {
    const accent = post.accentColor || '#7cce06';
    return (
        <View style={styles.card}>
            <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />

            {/* Category pill + date */}
            <View style={styles.cardTopRow}>
                <View style={[styles.categoryPill, { backgroundColor: accent + '20', borderColor: accent + '40' }]}>
                    {post.icon && (
                        <Ionicons name={post.icon as any} size={12} color={accent} />
                    )}
                    <Text style={[styles.categoryText, { color: accent }]}>{categoryLabel}</Text>
                </View>
                <Text style={styles.dateLabel}>{dateLabel}</Text>
            </View>

            <Text style={styles.cardTitle}>{post.title}</Text>
            <Text style={styles.cardBody}>{post.body}</Text>

            {post.domain && (
                <View style={styles.domainChip}>
                    <Ionicons name="pricetag-outline" size={11} color="rgba(255,255,255,0.55)" />
                    <Text style={styles.domainText}>{post.domain}</Text>
                </View>
            )}

            <View style={styles.actions}>
                <TouchableOpacity onPress={onLike} style={styles.actionBtn} activeOpacity={0.7}>
                    <Ionicons
                        name={post.liked ? 'heart' : 'heart-outline'}
                        size={20}
                        color={post.liked ? '#ff5470' : '#ffffff'}
                    />
                    <Text style={styles.actionText}>{post.likesCount || 0}</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={onSave} style={styles.actionBtn} activeOpacity={0.7}>
                    <Ionicons
                        name={post.saved ? 'bookmark' : 'bookmark-outline'}
                        size={19}
                        color={post.saved ? '#7cce06' : '#ffffff'}
                    />
                    <Text style={styles.actionText}>{saveLabel}</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={onShare} style={styles.actionBtn} activeOpacity={0.7}>
                    <Ionicons name="share-social-outline" size={19} color="#ffffff" />
                    <Text style={styles.actionText}>{shareLabel}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    headerGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 200 },
    header: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 20, overflow: 'hidden',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: 22, fontWeight: '700', color: '#ffffff' },
    headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 32, gap: 12,
    },
    emptyTitle: { fontSize: 16, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
    emptyBody: { fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 19 },

    generateBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, backgroundColor: '#7cce06',
        paddingHorizontal: 22, paddingVertical: 13, borderRadius: 24,
        marginTop: 8,
    },
    generateBtnText: { color: '#000', fontSize: 14, fontWeight: '700' },

    scrollContent: { paddingHorizontal: 16, paddingTop: 4 },

    card: {
        borderRadius: 20, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        padding: 18, marginBottom: 14,
    },
    cardTopRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12,
    },
    categoryPill: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
        borderWidth: 1,
    },
    categoryText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
    dateLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },

    cardTitle: {
        fontSize: 18, fontWeight: '700', color: '#ffffff',
        marginBottom: 8, lineHeight: 24,
    },
    cardBody: {
        fontSize: 14, lineHeight: 21,
        color: 'rgba(255,255,255,0.78)',
    },

    domainChip: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(255,255,255,0.06)',
        paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
        marginTop: 12,
    },
    domainText: { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },

    actions: {
        flexDirection: 'row', gap: 18,
        marginTop: 16, paddingTop: 14,
        borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    },
    actionBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
    },
    actionText: { fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: '600' },
});
