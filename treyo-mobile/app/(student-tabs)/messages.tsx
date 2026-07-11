import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenBackground } from '../../components/ScreenBackground';
import { authService, messageService, notificationService } from '../../services/api';
import api from '../../services/api';

export default function MessagesScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const [userName, setUserName] = useState('');
    const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
    const [imageTs, setImageTs] = useState(Date.now());
    const [conversations, setConversations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [unreadNotifCount, setUnreadNotifCount] = useState(0);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const loadData = async () => {
        try {
            const user = await authService.getCurrentUser();
            if (user?.name) setUserName(user.name.split(' ')[0]);

            // Profile pic
            try {
                const res = await api.get('/students/me');
                setProfilePicUrl(res.data.profilePictureUrl || null);
                setImageTs(Date.now());
            } catch (_) {}

            if (user?.userId) {
                // Conversations
                try {
                    const convs = await messageService.getConversations(user.userId);
                    setConversations(convs || []);
                } catch (_) {
                    setConversations([]);
                }

                // Notification badge
                try {
                    const count = await notificationService.getUnreadCount(user.userId);
                    setUnreadNotifCount(typeof count === 'number' ? count : 0);
                } catch (_) {}
            }
        } catch (e) {
            console.log('Messages load error', e);
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (dateStr: string) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    };

    return (
        <ScreenBackground>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Header ── */}
                <View style={styles.header}>
                    <Image source={require('../../assets/images/logo-white.png')} style={styles.logo} resizeMode="contain" />
                    <View style={styles.headerRight}>
                        <TouchableOpacity onPress={() => router.push('/(student-tabs)/notifications' as any)} style={styles.bellWrap}>
                            <Ionicons name="notifications-outline" size={24} color="#ffffff" />
                            {unreadNotifCount > 0 && (
                                <View style={styles.badge}><Text style={styles.badgeText}>{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</Text></View>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => router.push('/(student-tabs)/profile' as any)}>
                            {profilePicUrl ? (
                                <Image source={{ uri: `${profilePicUrl}?t=${imageTs}` }} style={styles.avatarImg} />
                            ) : (
                                <View style={styles.avatarPlaceholder}>
                                    <Text style={styles.avatarPlaceholderText}>{userName.charAt(0) || 'S'}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                <Text style={styles.pageTitle}>{t('messages.title')}</Text>
                <Text style={styles.pageSubtitle}>{t('messages.tapToOpen')}</Text>

                {/* ── Search bar ── */}
                <TouchableOpacity style={styles.searchBar} activeOpacity={0.7}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <Ionicons name="search-outline" size={18} color="rgba(255,255,255,0.4)" />
                    <Text style={styles.searchPlaceholder}>Search conversations...</Text>
                </TouchableOpacity>

                {/* ── Conversations ── */}
                {loading ? (
                    <View style={{ paddingTop: 60, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#7cce06" />
                    </View>
                ) : conversations.length > 0 ? (
                    <View style={styles.listWrap}>
                        {conversations.map((conv: any, index: number) => {
                            // Backend now flags group conversations with isGroup=true.
                            // We use a different avatar (people icon) and route taps
                            // to the dedicated /group-chat screen.
                            const isGroup = !!conv.isGroup;
                            const onPress = () => {
                                if (isGroup && conv.groupId) {
                                    router.push({
                                        pathname: '/group-chat' as any,
                                        params: { groupId: conv.groupId, groupName: conv.otherUserName || '' },
                                    });
                                }
                                // DM taps are intentionally a no-op for now — the
                                // 1-to-1 chat screen isn't wired up yet (separate concern).
                            };
                            return (
                                <TouchableOpacity
                                    key={conv.conversationId || index}
                                    style={[styles.convCard, index < conversations.length - 1 && styles.convCardBorder]}
                                    activeOpacity={0.7}
                                    onPress={onPress}
                                >
                                    {/* Avatar */}
                                    <View style={styles.convAvatarWrap}>
                                        <View style={[
                                            styles.convAvatar,
                                            (conv.unreadCount || 0) > 0 && styles.convAvatarUnread,
                                            isGroup && styles.convAvatarGroup,
                                        ]}>
                                            {isGroup ? (
                                                <Ionicons name="people" size={24} color="#7cce06" />
                                            ) : conv.otherUserPhotoUrl ? (
                                                <Image source={{ uri: `${conv.otherUserPhotoUrl}?t=${imageTs}` }} style={{ width: 50, height: 50, borderRadius: 25 }} />
                                            ) : (
                                                <Text style={styles.convAvatarText}>{(conv.otherUserName || '?')[0].toUpperCase()}</Text>
                                            )}
                                        </View>
                                        {!isGroup && conv.isOnline && <View style={styles.onlineDot} />}
                                    </View>

                                    {/* Info */}
                                    <View style={styles.convInfo}>
                                        <View style={styles.convTopRow}>
                                            <View style={styles.convNameWrap}>
                                                <Text style={[styles.convName, (conv.unreadCount || 0) > 0 && styles.convNameUnread]} numberOfLines={1}>
                                                    {conv.otherUserName || 'Unknown'}
                                                </Text>
                                                {isGroup && (
                                                    // Tiny pill so the user can tell at a glance
                                                    // this is a group chat (not a DM with a person
                                                    // named "Node.js Fundamentals — Group 1").
                                                    <View style={styles.groupPill}>
                                                        <Ionicons name="people-outline" size={9} color="#7cce06" />
                                                        <Text style={styles.groupPillText}>
                                                            {conv.memberCount ?? '—'}
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>
                                            <Text style={[styles.convTime, (conv.unreadCount || 0) > 0 && styles.convTimeUnread]}>
                                                {formatTime(conv.lastMessageTime)}
                                            </Text>
                                        </View>
                                        <View style={styles.convBottomRow}>
                                            <Text style={[styles.convMessage, (conv.unreadCount || 0) > 0 && styles.convMessageUnread]} numberOfLines={1}>
                                                {conv.lastMessage || 'No messages yet'}
                                            </Text>
                                            {(conv.unreadCount || 0) > 0 && (
                                                <View style={styles.unreadBadge}>
                                                    <Text style={styles.unreadText}>{conv.unreadCount}</Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                ) : (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <Ionicons name="chatbubbles-outline" size={48} color="rgba(124,206,6,0.4)" />
                        </View>
                        <Text style={styles.emptyTitle}>{t('messages.noConversations')}</Text>
                        <Text style={styles.emptySubtitle}>
                            Start a conversation with your trainers{'\n'}to get help and guidance.
                        </Text>
                    </View>
                )}
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 120, paddingHorizontal: 20 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 56, marginBottom: 20 },
    logo: { width: 44, height: 44 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    bellWrap: { position: 'relative' },
    badge: { position: 'absolute', top: -4, right: -6, backgroundColor: '#ff4444', width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
    badgeText: { fontSize: 10, fontWeight: 'bold', color: '#ffffff' },
    avatarImg: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(124,206,6,0.6)' },
    avatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(124,206,6,0.2)', borderWidth: 2, borderColor: 'rgba(124,206,6,0.5)', justifyContent: 'center', alignItems: 'center' },
    avatarPlaceholderText: { fontSize: 18, fontWeight: 'bold', color: '#7cce06' },
    pageTitle: { fontSize: 24, fontWeight: 'bold', color: '#ffffff' },
    pageSubtitle: { fontSize: 15, color: '#aaaaaa', marginBottom: 20 },
    searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 16, paddingVertical: 14, marginBottom: 20 },
    searchPlaceholder: { fontSize: 14, color: 'rgba(255,255,255,0.35)' },
    listWrap: { borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    convCard: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: 'rgba(255,255,255,0.03)' },
    convCardBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
    convAvatarWrap: { position: 'relative', marginRight: 14 },
    convAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(124,206,6,0.12)', borderWidth: 1.5, borderColor: 'rgba(124,206,6,0.2)', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
    convAvatarUnread: { borderColor: 'rgba(124,206,6,0.45)', backgroundColor: 'rgba(124,206,6,0.15)' },
    convAvatarGroup: { backgroundColor: 'rgba(124,206,6,0.16)', borderColor: 'rgba(124,206,6,0.35)' },
    convAvatarText: { fontSize: 20, fontWeight: '700', color: '#7cce06' },
    // Title + group pill sit on one line. The flex hierarchy is fiddly:
    //   - convNameWrap   flex:1, minWidth:0  → claims remaining space after the
    //     timestamp on the right, AND allows its children to compress (the
    //     default for a flex item is `minWidth: auto`, which prevents Text
    //     children from shrinking below their content width — that was the
    //     bug, causing the pill to spill into the timestamp).
    //   - convName       flex:1, flexShrink:1 → truncates with ellipsis when
    //     the pill is present, keeping the pill visible.
    //   - groupPill      flexShrink:0 → never shrinks; always its natural width.
    convNameWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flex: 1,
        minWidth: 0,
        marginRight: 8,
    },
    groupPill: {
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: 'rgba(124,206,6,0.12)',
        borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.25)',
        flexShrink: 0,
    },
    groupPillText: { fontSize: 10, color: '#7cce06', fontWeight: '700' },
    onlineDot: { position: 'absolute', bottom: 1, right: 1, width: 12, height: 12, borderRadius: 6, backgroundColor: '#7cce06', borderWidth: 2, borderColor: '#0a0520' },
    convInfo: { flex: 1 },
    convTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    // flexShrink:1 so the title compresses (with numberOfLines={1} ellipsis)
    // rather than spilling past convNameWrap and overlapping the timestamp.
    convName: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.75)', flexShrink: 1 },
    convNameUnread: { color: '#ffffff', fontWeight: '700' },
    // flexShrink:0 so "3d ago" / "Xm ago" never compresses to "…".
    convTime: { fontSize: 12, color: 'rgba(255,255,255,0.3)', flexShrink: 0 },
    convTimeUnread: { color: '#7cce06' },
    convBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    convMessage: { fontSize: 13.5, color: 'rgba(255,255,255,0.4)', flex: 1, marginRight: 10 },
    convMessageUnread: { color: 'rgba(255,255,255,0.6)' },
    unreadBadge: { backgroundColor: '#7cce06', borderRadius: 10, minWidth: 22, height: 22, paddingHorizontal: 6, justifyContent: 'center', alignItems: 'center' },
    unreadText: { fontSize: 11, color: '#000', fontWeight: 'bold' },
    emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 24 },
    emptyIconWrap: { width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(124,206,6,0.06)', borderWidth: 1, borderColor: 'rgba(124,206,6,0.12)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff', marginBottom: 8 },
    emptySubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 22 },
});
