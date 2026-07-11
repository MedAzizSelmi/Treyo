import {
    View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenBackground } from '../components/ScreenBackground';
import { authService, feedService } from '../services/api';

/**
 * Saved feed posts — the list a student sees when they tap "Saved
 * posts" in their profile. Mirrors the layout of the main feed screen
 * but without the like/save action buttons (every post here is
 * already saved; tapping unsave should remove the row in place).
 *
 * Source: GET /api/feed/saved?userId=…&lang=…
 */
export default function SavedPostsScreen() {
    const router = useRouter();
    const { t, i18n } = useTranslation();
    const [posts, setPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);

    useFocusEffect(useCallback(() => { load(); }, []));

    const load = async () => {
        try {
            const user = await authService.getCurrentUser();
            setUserId(user?.userId ?? null);
            if (!user?.userId) { setPosts([]); return; }
            const data = await feedService.getSaved(user.userId, i18n.language);
            setPosts(Array.isArray(data) ? data : []);
        } catch (_) {
            setPosts([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    /** Unsave from inside this screen — removes the row instantly
     *  and rolls back on error. The main feed will reflect the new
     *  state on next focus. */
    const handleUnsave = async (post: any) => {
        if (!userId) return;
        setPosts(ps => ps.filter(p => p.postId !== post.postId));
        try {
            await feedService.toggleSave(post.postId, userId);
        } catch (_) {
            // Roll back — put it back in place
            setPosts(ps => [...ps, post]);
        }
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
            return new Date(dateStr).toLocaleDateString(i18n.language || undefined, {
                month: 'short', day: 'numeric',
            });
        } catch { return ''; }
    };

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
                <Text style={styles.headerTitle}>{t('profile.savedPosts')}</Text>
                <View style={{ width: 40 }} />
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#7cce06" />
                </View>
            ) : posts.length === 0 ? (
                <View style={styles.empty}>
                    <Ionicons name="bookmark-outline" size={42} color="rgba(255,255,255,0.25)" />
                    <Text style={styles.emptyTitle}>{t('profile.noSavedPosts')}</Text>
                    <Text style={styles.emptyBody}>{t('profile.noSavedPostsBody')}</Text>
                </View>
            ) : (
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#7cce06" />
                    }
                >
                    {posts.map(post => {
                        const accent = post.accentColor || '#7cce06';
                        return (
                            <View key={post.postId} style={styles.card}>
                                <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />

                                <View style={styles.cardTopRow}>
                                    <View style={[styles.categoryPill, { backgroundColor: accent + '20', borderColor: accent + '40' }]}>
                                        {post.icon && (
                                            <Ionicons name={post.icon as any} size={12} color={accent} />
                                        )}
                                        <Text style={[styles.categoryText, { color: accent }]}>{categoryLabel(post.category)}</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => handleUnsave(post)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                                        <Ionicons name="bookmark" size={20} color="#7cce06" />
                                    </TouchableOpacity>
                                </View>

                                <Text style={styles.cardTitle}>{post.title}</Text>
                                <Text style={styles.cardBody}>{post.body}</Text>

                                <View style={styles.cardFooter}>
                                    {post.domain && (
                                        <View style={styles.domainChip}>
                                            <Ionicons name="pricetag-outline" size={11} color="rgba(255,255,255,0.55)" />
                                            <Text style={styles.domainText}>{post.domain}</Text>
                                        </View>
                                    )}
                                    <Text style={styles.dateLabel}>{formatTime(post.publishedAt)}</Text>
                                </View>
                            </View>
                        );
                    })}
                    <View style={{ height: 40 }} />
                </ScrollView>
            )}
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    headerGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 180 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 20, overflow: 'hidden',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: 17, fontWeight: '700', color: '#ffffff' },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 32, gap: 12,
    },
    emptyTitle: { fontSize: 16, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
    emptyBody: { fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 19 },

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

    cardTitle: { fontSize: 17, fontWeight: '700', color: '#ffffff', marginBottom: 8, lineHeight: 23 },
    cardBody: { fontSize: 14, lineHeight: 21, color: 'rgba(255,255,255,0.78)' },

    cardFooter: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 14, paddingTop: 12,
        borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    },
    domainChip: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: 'rgba(255,255,255,0.06)',
        paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
    },
    domainText: { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },
    dateLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
});
