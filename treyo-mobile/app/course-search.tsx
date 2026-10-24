import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Image, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenBackground } from '../components/ScreenBackground';
import { authService, courseService, searchLogService } from '../services/api';
import { HISTORY_LIMIT, loadSearchHistory, saveSearchHistory } from '../utils/searchHistory';
import { COURSE_LEVELS, levelLabel, normalizeLevel } from '../utils/courseLabels';
import { closest, matchesPrepared, prepare } from '../utils/textMatch';

/** How many results are drawn at first; more on request. */
const PAGE = 30;

// The backend's vocabulary. This used to be BEGINNER / INTERMEDIATE /
// ADVANCED, and no course is ever saved as "advanced", so the Advanced
// filter matched nothing and expert courses could not be found by level.
const LEVELS = COURSE_LEVELS;

export default function CourseSearchScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [allCourses, setAllCourses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState<string[]>([]);
    // Student ID — used to attribute search logs to the right user so
    // the recommendation engine can weight them per-student.
    const [studentId, setStudentId] = useState<string | null>(null);
    const [filterOpen, setFilterOpen] = useState(false);
    const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
    const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
    const [shown, setShown] = useState(PAGE);
    // Results follow the typing a moment behind it, so the keyboard never
    // waits for the list.
    const searchQuery = useDeferredValue(query);

    useEffect(() => {
        loadCourses();
        // History is per account, so it can only be read once we know
        // whose it is.
        authService.getCurrentUser()
            .then(async u => {
                const id = u?.userId ?? null;
                setStudentId(id);
                if (id) setHistory(await loadSearchHistory(id));
            })
            .catch(() => {});
    }, []);

    const loadCourses = async () => {
        try {
            const data = await courseService.getAllCourses();
            setAllCourses(Array.isArray(data) ? data : []);
        } catch (e) {
            setAllCourses([]);
        } finally {
            setLoading(false);
        }
    };

    const saveHistory = (next: string[]) => {
        setHistory(next);
        if (studentId) saveSearchHistory(studentId, next);
    };

    /** Push a term to the front, dedupe, cap to HISTORY_LIMIT.
     *  Called on submit, on result tap, AND from the debounced typing
     *  effect below — so a user who just types and looks at results
     *  without explicitly hitting Search still gets their query
     *  remembered. */
    const recordSearch = (term: string, clickedCourseId?: string, resultCount?: number) => {
        const trimmed = term.trim();
        if (!trimmed) return;
        const next = [trimmed, ...history.filter(h => h.toLowerCase() !== trimmed.toLowerCase())].slice(0, HISTORY_LIMIT);
        saveHistory(next);
        // Send to backend so the ML recommendation engine sees it on
        // its next refresh. Silent fail — UX doesn't care if logging
        // missed a beat.
        if (studentId) {
            searchLogService.log({ studentId, query: trimmed, clickedCourseId, resultCount });
        }
    };

    // Debounced auto-save: when the user pauses typing for 1.2s with
    // a non-trivial query (≥ 3 chars), record it. Avoids the bug
    // where someone types "node", studies the results, and leaves —
    // only ever seeing "N" (the leftover from a previous single-char
    // search) in their history. The 3-char floor stops us flooding
    // history with single-letter typos.
    useEffect(() => {
        const trimmed = searchQuery.trim();
        if (trimmed.length < 3) return;
        const t = setTimeout(() => recordSearch(trimmed, undefined, countForLog()), 1200);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery]);

    useEffect(() => { setShown(PAGE); }, [searchQuery, selectedLevel, selectedDomain]);

    const removeHistoryItem = (term: string) => {
        saveHistory(history.filter(h => h !== term));
    };

    const clearHistory = () => saveHistory([]);

    /** Unique domains across loaded courses, used in the filter sheet. */
    const domains = useMemo(() => {
        const set = new Set<string>();
        allCourses.forEach(c => { if (c.domain) set.add(c.domain); });
        return Array.from(set).sort();
    }, [allCourses]);

    /** Each course's text normalised once, when the catalogue loads — not
     *  on every keystroke. */
    const index = useMemo(() => allCourses.map(c => ({
        course: c,
        strong: prepare([c.title, c.domain, c.specificTopic, c.trainerName].filter(Boolean).join(' ')),
        loose: prepare(c.description),
        title: c.title ? { title: String(c.title), prepared: prepare(c.title) } : null,
    })), [allCourses]);

    /** Filtered list. Empty query + no filters → no results yet (we show history instead). */
    const results = useMemo(() => {
        const q = prepare(searchQuery);
        if (!q.key && !selectedLevel && !selectedDomain) return [];

        return index.filter(({ course: c, strong, loose }) => {
            // Case, accents, spacing and small typos do not matter, and the
            // words can come in any order: "powerbi", "bi power" and
            // "pwer bi" all find "Power BI" (utils/textMatch).
            const matchesQuery = !q.key || matchesPrepared(q, strong, loose);
            const matchesLevel = !selectedLevel || normalizeLevel(c.level) === selectedLevel;
            const matchesDomain = !selectedDomain || c.domain === selectedDomain;
            return matchesQuery && matchesLevel && matchesDomain;
        }).map(i => i.course);
    }, [searchQuery, index, selectedLevel, selectedDomain]);

    const activeFilterCount = (selectedLevel ? 1 : 0) + (selectedDomain ? 1 : 0);
    const showHistory = !query.trim() && activeFilterCount === 0;

    /** What this search found, for the server's "searches that found
     *  nothing" — only without filters, since a filter emptying the list
     *  is not a course missing from the catalogue. */
    const countForLog = () => (activeFilterCount === 0 ? results.length : undefined);

    /** "Did you mean…?" when nothing matched but a title is a typo away. */
    const didYouMean = useMemo(() => (results.length === 0 && searchQuery.trim().length >= 3
        ? closest(searchQuery, index.map(i => i.title).filter((x): x is { title: string; prepared: ReturnType<typeof prepare> } => !!x))
        : null), [results, searchQuery, index]);

    return (
        <ScreenBackground>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {/* ── Header ── */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color="#ffffff" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{t('search.title')}</Text>
                </View>

                {/* ── Search bar + filter ── */}
                <View style={styles.searchRow}>
                    <View style={styles.searchInputWrap}>
                        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                        <Ionicons name="search-outline" size={18} color="rgba(255,255,255,0.5)" />
                        <TextInput
                            style={styles.searchInput}
                            placeholder={t('search.placeholder')}
                            placeholderTextColor="rgba(255,255,255,0.35)"
                            value={query}
                            onChangeText={setQuery}
                            onSubmitEditing={() => recordSearch(query, undefined, countForLog())}
                            returnKeyType="search"
                            autoFocus
                        />
                        {query.length > 0 && (
                            <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn}>
                                <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.5)" />
                            </TouchableOpacity>
                        )}
                    </View>

                    <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterOpen(true)} activeOpacity={0.8}>
                        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                        <Ionicons name="options-outline" size={20} color="#7cce06" />
                        {activeFilterCount > 0 && (
                            <View style={styles.filterBadge}><Text style={styles.filterBadgeText}>{activeFilterCount}</Text></View>
                        )}
                    </TouchableOpacity>
                </View>

                {/* ── Active filter chips ── */}
                {activeFilterCount > 0 && (
                    <View style={styles.activeFilterRow}>
                        {selectedLevel && (
                            <TouchableOpacity style={styles.activeChip} onPress={() => setSelectedLevel(null)}>
                                <Text style={styles.activeChipText}>{levelLabel(t, selectedLevel)}</Text>
                                <Ionicons name="close" size={14} color="#7cce06" />
                            </TouchableOpacity>
                        )}
                        {selectedDomain && (
                            <TouchableOpacity style={styles.activeChip} onPress={() => setSelectedDomain(null)}>
                                <Text style={styles.activeChipText}>{selectedDomain}</Text>
                                <Ionicons name="close" size={14} color="#7cce06" />
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* ── Body: history vs. results ── */}
                {loading ? (
                    <View style={{ paddingTop: 60, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#7cce06" />
                    </View>
                ) : showHistory ? (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>{t('search.recentSearches')}</Text>
                            {history.length > 0 && (
                                <TouchableOpacity onPress={clearHistory}>
                                    <Text style={styles.clearAll}>{t('search.clearAll')}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        {history.length === 0 ? (
                            <View style={styles.emptyHistoryState}>
                                <View style={styles.emptyIconWrap}>
                                    <Ionicons name="time-outline" size={36} color="rgba(124,206,6,0.4)" />
                                </View>
                                <Text style={styles.emptyTitle}>{t('search.noResults')}</Text>
                                <Text style={styles.emptySubtitle}>{t('search.tryDifferent')}</Text>
                            </View>
                        ) : (
                            history.map((term, i) => (
                                <TouchableOpacity
                                    key={`${term}-${i}`}
                                    style={styles.historyRow}
                                    activeOpacity={0.7}
                                    onPress={() => { setQuery(term); recordSearch(term); }}
                                >
                                    <Ionicons name="time-outline" size={18} color="rgba(255,255,255,0.4)" />
                                    <Text style={styles.historyText} numberOfLines={1}>{term}</Text>
                                    <TouchableOpacity onPress={() => removeHistoryItem(term)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                        <Ionicons name="close" size={18} color="rgba(255,255,255,0.4)" />
                                    </TouchableOpacity>
                                </TouchableOpacity>
                            ))
                        )}
                    </View>
                ) : (
                    <View style={styles.section}>
                        <Text style={styles.resultsCount}>
                            {t('search.resultCount', { count: results.length })}
                        </Text>
                        {results.length === 0 ? (
                            <View style={styles.emptyHistoryState}>
                                <View style={styles.emptyIconWrap}>
                                    <Ionicons name="search-outline" size={36} color="rgba(124,206,6,0.4)" />
                                </View>
                                <Text style={styles.emptyTitle}>{t('search.noResults')}</Text>
                                {didYouMean ? (
                                    <TouchableOpacity onPress={() => setQuery(didYouMean)} activeOpacity={0.8}>
                                        <Text style={styles.didYouMean}>
                                            {t('search.didYouMean')} <Text style={styles.didYouMeanTerm}>{didYouMean}</Text> ?
                                        </Text>
                                    </TouchableOpacity>
                                ) : (
                                    <Text style={styles.emptySubtitle}>{t('search.tryDifferent')}</Text>
                                )}
                                {/* A course that is not there can be asked for. Only
                                    without filters: with one on, the course may exist. */}
                                {activeFilterCount === 0 && query.trim().length > 0 && (
                                    <TouchableOpacity
                                        style={styles.suggestBtn}
                                        activeOpacity={0.85}
                                        onPress={() => router.push({ pathname: '/suggest-course' as any, params: { topic: query.trim() } })}
                                    >
                                        <Ionicons name="bulb-outline" size={17} color="#000" />
                                        <Text style={styles.suggestBtnText}>{t('search.suggestThis')}</Text>
                                    </TouchableOpacity>
                                )}
                                {activeFilterCount === 0 && query.trim().length > 0 && (
                                    <Text style={styles.suggestHint}>{t('search.suggestHint')}</Text>
                                )}
                            </View>
                        ) : (
                            results.slice(0, shown).map((c: any) => (
                                <TouchableOpacity
                                    key={c.courseId || c.id}
                                    style={styles.resultCard}
                                    activeOpacity={0.85}
                                    onPress={() => {
                                        // Pass the clicked course so the ML
                                        // engine learns "query X → user wanted
                                        // course Y" associations.
                                        recordSearch(query, c.courseId || c.id, countForLog());
                                        router.push({ pathname: '/course-detail' as any, params: { courseId: c.courseId || c.id } });
                                    }}
                                >
                                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                    <View style={styles.resultIcon}>
                                        <Ionicons name="school" size={24} color="#7cce06" />
                                    </View>
                                    <View style={styles.resultInfo}>
                                        <Text style={styles.resultTitle} numberOfLines={1}>{c.title}</Text>
                                        <Text style={styles.resultTrainer} numberOfLines={1}>
                                            {c.trainerName || t('groupsForming.trainer')}
                                        </Text>
                                        <View style={styles.resultMeta}>
                                            {c.level && (
                                                <View style={styles.metaChip}>
                                                    <Ionicons name="bar-chart-outline" size={12} color="#aaaaaa" />
                                                    <Text style={styles.metaText}>{levelLabel(t, c.level)}</Text>
                                                </View>
                                            )}
                                            {c.domain && (
                                                <View style={styles.metaChip}>
                                                    <Ionicons name="pricetag-outline" size={12} color="#aaaaaa" />
                                                    <Text style={styles.metaText}>{c.domain}</Text>
                                                </View>
                                            )}
                                            {c.durationHours && (
                                                <View style={styles.metaChip}>
                                                    <Ionicons name="time-outline" size={12} color="#aaaaaa" />
                                                    <Text style={styles.metaText}>{c.durationHours}h</Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                    <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
                                </TouchableOpacity>
                            ))
                        )}
                        {/* Drawing every card at once for a one-letter search
                            made the list slow to appear. */}
                        {results.length > shown && (
                            <TouchableOpacity style={styles.showMoreBtn} onPress={() => setShown(n => n + PAGE)} activeOpacity={0.8}>
                                <Text style={styles.showMoreText}>
                                    {t('search.showMore', { count: Math.min(PAGE, results.length - shown) })}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </ScrollView>

            {/* ── Filter sheet ── */}
            <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
                <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setFilterOpen(false)} />
                <View style={styles.modalSheet}>
                    <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.modalHandle} />
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>{t('search.filters')}</Text>
                        <TouchableOpacity onPress={() => { setSelectedLevel(null); setSelectedDomain(null); }}>
                            <Text style={styles.modalReset}>{t('search.reset')}</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.filterScroll} showsVerticalScrollIndicator nestedScrollEnabled>
                    <Text style={styles.filterLabel}>{t('suggest.level')}</Text>
                    <View style={styles.chipRow}>
                        {LEVELS.map(level => {
                            const active = selectedLevel === level;
                            return (
                                <TouchableOpacity
                                    key={level}
                                    style={[styles.filterChip, active && styles.filterChipActive]}
                                    onPress={() => setSelectedLevel(active ? null : level)}
                                >
                                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{levelLabel(t, level)}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {domains.length > 0 && (
                        <>
                            <Text style={styles.filterLabel}>{t('suggest.domain')}</Text>
                            <View style={styles.chipRow}>
                                {domains.map(domain => {
                                    const active = selectedDomain === domain;
                                    return (
                                        <TouchableOpacity
                                            key={domain}
                                            style={[styles.filterChip, active && styles.filterChipActive]}
                                            onPress={() => setSelectedDomain(active ? null : domain)}
                                        >
                                            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{domain}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </>
                    )}

                    </ScrollView>

                    <TouchableOpacity style={styles.applyBtn} onPress={() => setFilterOpen(false)}>
                        <Text style={styles.applyBtnText}>{t('search.apply')}</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 60, paddingHorizontal: 20 },

    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, marginBottom: 20 },
    backBtn: { padding: 2 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff' },

    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    searchInputWrap: {
        flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
        borderRadius: 14, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 14, paddingVertical: 12,
    },
    searchInput: { flex: 1, fontSize: 14, color: '#ffffff', padding: 0 },
    clearBtn: { padding: 2 },

    filterBtn: {
        width: 46, height: 46, borderRadius: 14, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.3)',
        justifyContent: 'center', alignItems: 'center',
    },
    filterBadge: {
        position: 'absolute', top: 4, right: 4,
        backgroundColor: '#7cce06', borderRadius: 8,
        minWidth: 16, height: 16, paddingHorizontal: 4,
        justifyContent: 'center', alignItems: 'center',
    },
    filterBadgeText: { fontSize: 10, fontWeight: '700', color: '#000' },

    activeFilterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    activeChip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(124,206,6,0.12)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.35)',
        borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6,
    },
    activeChipText: { fontSize: 12, fontWeight: '600', color: '#7cce06' },

    section: { marginTop: 16 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
    clearAll: { fontSize: 13, color: '#7cce06', fontWeight: '600' },
    resultsCount: { fontSize: 13, color: '#aaaaaa', marginBottom: 12 },

    historyRow: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    historyText: { flex: 1, fontSize: 14, color: '#ffffff' },

    resultCard: {
        flexDirection: 'row', alignItems: 'center',
        borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        padding: 12, marginBottom: 10,
    },
    resultIcon: {
        width: 46, height: 46, borderRadius: 12,
        backgroundColor: 'rgba(124,206,6,0.12)',
        justifyContent: 'center', alignItems: 'center', marginRight: 12,
    },
    resultInfo: { flex: 1 },
    resultTitle: { fontSize: 14, fontWeight: '600', color: '#ffffff', marginBottom: 2 },
    resultTrainer: { fontSize: 12, color: '#aaaaaa', marginBottom: 6 },
    resultMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { fontSize: 11, color: '#aaaaaa' },

    emptyHistoryState: { alignItems: 'center', paddingTop: 50, paddingHorizontal: 24 },
    emptyIconWrap: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: 'rgba(124,206,6,0.06)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.12)',
        justifyContent: 'center', alignItems: 'center', marginBottom: 16,
    },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 6 },
    emptySubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center' },
    didYouMean: { fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
    didYouMeanTerm: { color: '#7cce06', fontWeight: '700' },
    suggestBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 22,
        backgroundColor: '#7cce06', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 18,
    },
    suggestBtnText: { fontSize: 14, fontWeight: '700', color: '#000' },
    suggestHint: { fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 8, lineHeight: 18 },

    // Filter modal
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    modalSheet: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: 'rgba(10,5,32,0.95)',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30,
        borderTopWidth: 1, borderColor: 'rgba(124,206,6,0.2)',
        overflow: 'hidden',
        // Many domains made the sheet taller than the screen, with no way
        // to reach the ones below; it now stops short and its list scrolls.
        maxHeight: '85%',
    },
    filterScroll: { flexGrow: 0, flexShrink: 1 },
    showMoreBtn: {
        alignSelf: 'center', marginTop: 6, paddingHorizontal: 18, paddingVertical: 10,
        borderRadius: 12, borderWidth: 1, borderColor: 'rgba(124,206,6,0.35)',
    },
    showMoreText: { color: '#7cce06', fontSize: 13, fontWeight: '700' },
    modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
    modalReset: { fontSize: 13, color: '#7cce06', fontWeight: '600' },

    filterLabel: { fontSize: 12, fontWeight: '700', color: '#7cce06', marginBottom: 10, marginTop: 6, letterSpacing: 0.3 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    filterChip: {
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    filterChipActive: { borderColor: '#7cce06', backgroundColor: 'rgba(124,206,6,0.15)' },
    filterChipText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
    filterChipTextActive: { color: '#7cce06' },

    applyBtn: {
        backgroundColor: '#7cce06', borderRadius: 14, paddingVertical: 14,
        alignItems: 'center', marginTop: 8,
    },
    applyBtnText: { fontSize: 15, fontWeight: '700', color: '#000' },
});
