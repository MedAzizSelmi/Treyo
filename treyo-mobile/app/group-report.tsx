import {
    View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
    ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenBackground } from '../components/ScreenBackground';
import { groupReportService } from '../services/api';

/**
 * The trainer's end-of-course report, opened from the report notification
 * or the "Report due" card on the trainer's home.
 *
 * Five parts: each learner's attendance and result, whether every session
 * was held, how much of the course plan was covered, how the level and the
 * prerequisites fitted the group, and anything else. Learners start at
 * "attended everything, completed", so a group where everyone came takes a
 * minute; the questions after that have no default, so each is answered
 * on purpose. Completed — which earns the attestation — needs at least 80%
 * of the sessions held (the server sends the percentage and refuses less);
 * below it the option is greyed out and the learner moves to Partly
 * completed. Sessions marked not held come off the count. Sent once: the server refuses a second report, and learners
 * marked Completed receive their attestation de participation.
 *
 * Once sent, the same screen shows the report read-only.
 */

const ACCENT = '#7cce06';

/** Sessions needed out of those held: the percentage, rounded up — the server's rule. */
const neededFor = (held: number, percent: number) => Math.floor((held * percent + 99) / 100);
type Result = 'COMPLETED' | 'PARTIAL' | 'DID_NOT_FOLLOW';
type LearnerState = { enrollmentId: string; name: string; attended: number; result: Result; note: string };
type NotHeldState = Record<string, string>; // "date|time" -> reason

const RESULTS: { key: Result; label: string; hint: string }[] = [
    { key: 'COMPLETED', label: 'groupReport.completed', hint: 'groupReport.completedHint' },
    { key: 'PARTIAL', label: 'groupReport.partial', hint: 'groupReport.partialHint' },
    { key: 'DID_NOT_FOLLOW', label: 'groupReport.didNotFollow', hint: 'groupReport.didNotFollowHint' },
];
const COVERAGE = [
    { key: 'ALL', label: 'groupReport.coverAll' },
    { key: 'MOST', label: 'groupReport.coverMost' },
    { key: 'PART', label: 'groupReport.coverPart' },
];
const LEVEL = [
    { key: 'TOO_EASY', label: 'groupReport.tooEasy' },
    { key: 'RIGHT', label: 'groupReport.levelRight' },
    { key: 'TOO_HARD', label: 'groupReport.tooHard' },
];
const PREREQ = [
    { key: 'MOST_HAD', label: 'groupReport.mostHad' },
    { key: 'SOME_LACKED', label: 'groupReport.someLacked' },
    { key: 'MOST_LACKED', label: 'groupReport.mostLacked' },
];

export default function GroupReportScreen() {
    const router = useRouter();
    const { t, i18n } = useTranslation();
    const { groupId } = useLocalSearchParams<{ groupId: string }>();

    const [data, setData] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [learners, setLearners] = useState<LearnerState[]>([]);
    const [allHeld, setAllHeld] = useState<boolean | null>(null);
    const [notHeld, setNotHeld] = useState<NotHeldState>({});
    const [coverage, setCoverage] = useState<string | null>(null);
    const [leftOut, setLeftOut] = useState('');
    const [level, setLevel] = useState<string | null>(null);
    const [prereq, setPrereq] = useState<string | null>(null);
    const [comments, setComments] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sending, setSending] = useState(false);

    const load = useCallback(async () => {
        if (!groupId) return;
        setLoading(true);
        setLoadError(null);
        try {
            const d = await groupReportService.get(String(groupId));
            setData(d);
            const total = (d.sessions || []).length;
            setLearners((d.learners || []).map((l: any) => ({
                enrollmentId: l.enrollmentId,
                name: l.name || '',
                attended: total,
                result: 'COMPLETED' as Result,
                note: '',
            })));
        } catch (e: any) {
            setLoadError(e?.response?.data?.message || t('groupReport.loadFailed'));
        } finally {
            setLoading(false);
        }
    }, [groupId, t]);

    useEffect(() => { load(); }, [load]);

    const total: number = (data?.sessions || []).length;
    const percent: number = data?.attendancePercentToComplete ?? 80;
    const held = total - (allHeld === false ? Object.keys(notHeld).length : 0);
    const needed = useMemo(() => neededFor(held, percent), [held, percent]);

    // Fewer sessions held: nobody attended more than were held, and a
    // learner below the bar can no longer be Completed.
    useEffect(() => {
        setLearners(prev => prev.map(l => {
            const attended = Math.min(l.attended, held);
            const result = l.result === 'COMPLETED' && attended < needed ? 'PARTIAL' : l.result;
            return attended === l.attended && result === l.result ? l : { ...l, attended, result };
        }));
    }, [held, needed]);
    const fmtDate = (iso?: string | null) => {
        if (!iso) return '';
        const d = new Date(`${iso}T00:00:00`);
        return Number.isNaN(d.getTime()) ? iso
            : d.toLocaleDateString(i18n.language || undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    };
    const sessionKey = (s: any) => `${s.date}|${String(s.time).slice(0, 5)}`;

    const updateLearner = (i: number, patch: Partial<LearnerState>) =>
        setLearners(prev => prev.map((l, j) => {
            if (j !== i) return l;
            const next = { ...l, ...patch };
            // Below the bar: Completed is not available, so they move down.
            if (next.result === 'COMPLETED' && next.attended < needed) next.result = 'PARTIAL';
            return next;
        }));

    const toggleNotHeld = (key: string) =>
        setNotHeld(prev => {
            const next = { ...prev };
            if (key in next) delete next[key]; else next[key] = '';
            return next;
        });

    /** The first thing missing, in the order the form asks it; null when it can be sent. */
    const firstProblem = (): string | null => {
        if (learners.some(l => l.result === 'COMPLETED' && l.attended < needed)) {
            return t('groupReport.errCompletedNeeds', { needed, held, percent });
        }
        if (allHeld === null) return t('groupReport.errAllHeld');
        if (allHeld === false) {
            const keys = Object.keys(notHeld);
            if (keys.length === 0) return t('groupReport.errPickNotHeld');
            if (keys.some(k => !notHeld[k].trim())) return t('groupReport.errReason');
        }
        if (!coverage) return t('groupReport.errCoverage');
        if (coverage !== 'ALL' && !leftOut.trim()) return t('groupReport.errLeftOut');
        if (!level) return t('groupReport.errLevel');
        if (!prereq) return t('groupReport.errPrereq');
        if (!confirmed) return t('groupReport.errConfirm');
        return null;
    };

    const send = async () => {
        const problem = firstProblem();
        if (problem) { setError(problem); return; }
        setError(null);
        setSending(true);
        try {
            await groupReportService.submit(String(groupId), {
                learners: learners.map(l => ({
                    enrollmentId: l.enrollmentId,
                    sessionsAttended: l.attended,
                    result: l.result,
                    note: l.note.trim() || null,
                })),
                allSessionsHeld: allHeld,
                sessionsNotHeld: allHeld ? [] : Object.entries(notHeld).map(([k, reason]) => {
                    const [date, time] = k.split('|');
                    return { date, time, reason: reason.trim() };
                }),
                planCoverage: coverage,
                planLeftOut: coverage === 'ALL' ? null : leftOut.trim(),
                levelFit: level,
                prerequisites: prereq,
                comments: comments.trim() || null,
                confirmed: true,
            });
            Alert.alert(t('groupReport.sentTitle'), t('groupReport.sentBody'));
            load();
        } catch (e: any) {
            setError(e?.response?.data?.message || t('groupReport.sendFailed'));
        } finally {
            setSending(false);
        }
    };

    // ── rendering ─────────────────────────────────────────────────────

    const header = (
        <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color="#ffffff" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>{t('groupReport.title')}</Text>
                {!!data?.courseTitle && (
                    <Text style={styles.headerSubtitle} numberOfLines={1}>
                        {data.courseTitle}{data.groupName ? ` · ${data.groupName}` : ''}
                    </Text>
                )}
            </View>
        </View>
    );

    if (loading) {
        return <ScreenBackground><View style={styles.centered}><ActivityIndicator size="large" color={ACCENT} /></View></ScreenBackground>;
    }
    if (loadError || !data) {
        return (
            <ScreenBackground>
                <View style={styles.pad}>{header}</View>
                <View style={styles.centered}>
                    <Text style={styles.muted}>{loadError || t('groupReport.loadFailed')}</Text>
                    <TouchableOpacity onPress={load} style={styles.retryBtn}>
                        <Text style={styles.retryText}>{t('common.retry')}</Text>
                    </TouchableOpacity>
                </View>
            </ScreenBackground>
        );
    }

    const summary = (
        <View style={styles.summary}>
            <Ionicons name="calendar-outline" size={16} color={ACCENT} />
            <Text style={styles.summaryText}>
                {fmtDate(data.firstSession)} – {fmtDate(data.lastSession)} · {t('groupReport.sessionsCount', { count: total })}
                {' · '}{t('groupReport.learnersCount', { count: learners.length })}
            </Text>
        </View>
    );

    if (data.report) {
        return <SentReport data={data} header={header} summary={summary} fmtDate={fmtDate} />;
    }

    if (!data.completed) {
        return (
            <ScreenBackground>
                <View style={styles.pad}>{header}</View>
                <View style={styles.centered}>
                    <Ionicons name="time-outline" size={42} color="rgba(255,255,255,0.25)" />
                    <Text style={[styles.muted, { marginTop: 12 }]}>{t('groupReport.notReady')}</Text>
                </View>
            </ScreenBackground>
        );
    }

    return (
        <ScreenBackground>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    {header}
                    {summary}

                    {/* ── Part 1: the learners ── */}
                    <Part number={1} title={t('groupReport.part1')} />
                    <Text style={styles.hint}>{t('groupReport.part1Hint')}</Text>
                    <View style={styles.infoBox}>
                        <Ionicons name="ribbon-outline" size={16} color={ACCENT} />
                        <Text style={styles.infoText}>{t('groupReport.attendanceRule', { percent, needed, held })}</Text>
                    </View>
                    {data.preparesCertification && (
                        <View style={styles.infoBox}>
                            <Ionicons name="ribbon-outline" size={16} color={ACCENT} />
                            <Text style={styles.infoText}>{t('groupReport.certificationNote')}</Text>
                        </View>
                    )}
                    {learners.map((l, i) => (
                        <View key={l.enrollmentId} style={styles.card}>
                            <Text style={styles.learnerName}>{l.name}</Text>

                            <View style={styles.row}>
                                <Text style={styles.label}>{t('groupReport.attended')}</Text>
                                <View style={styles.stepper}>
                                    <TouchableOpacity style={styles.stepBtn} disabled={l.attended <= 0}
                                        onPress={() => updateLearner(i, { attended: Math.max(0, l.attended - 1) })}>
                                        <Ionicons name="remove" size={18} color={l.attended <= 0 ? '#555' : ACCENT} />
                                    </TouchableOpacity>
                                    <Text style={styles.stepValue}>{t('groupReport.ofTotal', { n: l.attended, total: held })}</Text>
                                    <TouchableOpacity style={styles.stepBtn} disabled={l.attended >= held}
                                        onPress={() => updateLearner(i, { attended: Math.min(held, l.attended + 1) })}>
                                        <Ionicons name="add" size={18} color={l.attended >= held ? '#555' : ACCENT} />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <Text style={[styles.label, { marginTop: 12 }]}>{t('groupReport.result')}</Text>
                            {RESULTS.map(r => {
                                const blocked = r.key === 'COMPLETED' && l.attended < needed;
                                return (
                                    <Radio key={r.key} selected={l.result === r.key} label={t(r.label)}
                                        hint={blocked ? t('groupReport.completedBlocked', { needed, held, percent }) : t(r.hint)}
                                        disabled={blocked}
                                        onPress={() => updateLearner(i, { result: r.key })} />
                                );
                            })}

                            <Text style={[styles.label, { marginTop: 12 }]}>{t('groupReport.noteLabel')}</Text>
                            <TextInput
                                style={styles.input}
                                value={l.note}
                                onChangeText={v => updateLearner(i, { note: v.slice(0, 200) })}
                                placeholder={t('groupReport.notePh')}
                                placeholderTextColor="rgba(255,255,255,0.3)"
                                maxLength={200}
                            />
                            <Text style={styles.small}>{t('groupReport.notePrivate')}</Text>
                        </View>
                    ))}

                    {/* ── Part 2: the sessions ── */}
                    <Part number={2} title={t('groupReport.part2')} />
                    <View style={styles.card}>
                        <Text style={styles.question}>{t('groupReport.allHeldQ', { count: total })}</Text>
                        <Radio selected={allHeld === true} label={t('groupReport.yes')} onPress={() => setAllHeld(true)} />
                        <Radio selected={allHeld === false} label={t('groupReport.someNotHeld')} onPress={() => setAllHeld(false)} />
                        {allHeld === false && (data.sessions || []).map((s: any, i: number) => {
                            const key = sessionKey(s);
                            const ticked = key in notHeld;
                            return (
                                <View key={key} style={styles.sessionRow}>
                                    <TouchableOpacity style={styles.checkRow} onPress={() => toggleNotHeld(key)}>
                                        <Ionicons name={ticked ? 'checkbox' : 'square-outline'} size={20}
                                            color={ticked ? ACCENT : 'rgba(255,255,255,0.4)'} />
                                        <Text style={styles.sessionText}>
                                            {t('groupReport.sessionN', { n: i + 1 })} · {fmtDate(s.date)} · {String(s.time).slice(0, 5)}
                                        </Text>
                                        {ticked && <Text style={styles.notHeldTag}>{t('groupReport.notHeld')}</Text>}
                                    </TouchableOpacity>
                                    {ticked && (
                                        <TextInput
                                            style={styles.input}
                                            value={notHeld[key]}
                                            onChangeText={v => setNotHeld(prev => ({ ...prev, [key]: v.slice(0, 150) }))}
                                            placeholder={t('groupReport.whyPh')}
                                            placeholderTextColor="rgba(255,255,255,0.3)"
                                            maxLength={150}
                                        />
                                    )}
                                </View>
                            );
                        })}
                    </View>

                    {/* ── Part 3: the course plan ── */}
                    <Part number={3} title={t('groupReport.part3')} />
                    <View style={styles.card}>
                        <Text style={styles.question}>{t('groupReport.coverageQ')}</Text>
                        {COVERAGE.map(o => (
                            <Radio key={o.key} selected={coverage === o.key} label={t(o.label)} onPress={() => setCoverage(o.key)} />
                        ))}
                        {coverage && coverage !== 'ALL' && (
                            <>
                                <Text style={[styles.label, { marginTop: 12 }]}>{t('groupReport.leftOutLabel')}</Text>
                                <TextInput
                                    style={[styles.input, styles.multiline]}
                                    value={leftOut}
                                    onChangeText={v => setLeftOut(v.slice(0, 300))}
                                    multiline
                                    maxLength={300}
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                />
                                <Text style={styles.small}>{leftOut.length}/300</Text>
                            </>
                        )}
                    </View>

                    {/* ── Part 4: the group ── */}
                    <Part number={4} title={t('groupReport.part4')} />
                    <View style={styles.card}>
                        <Text style={styles.question}>{t('groupReport.levelQ')}</Text>
                        {LEVEL.map(o => (
                            <Radio key={o.key} selected={level === o.key} label={t(o.label)} onPress={() => setLevel(o.key)} />
                        ))}
                        <Text style={[styles.question, { marginTop: 14 }]}>{t('groupReport.prereqQ')}</Text>
                        {PREREQ.map(o => (
                            <Radio key={o.key} selected={prereq === o.key} label={t(o.label)} onPress={() => setPrereq(o.key)} />
                        ))}
                    </View>

                    {/* ── Part 5: anything else ── */}
                    <Part number={5} title={t('groupReport.part5')} />
                    <View style={styles.card}>
                        <Text style={styles.label}>{t('groupReport.commentsLabel')}</Text>
                        <TextInput
                            style={[styles.input, styles.multiline, { minHeight: 110 }]}
                            value={comments}
                            onChangeText={v => setComments(v.slice(0, 1000))}
                            multiline
                            maxLength={1000}
                            placeholder={t('groupReport.commentsPh')}
                            placeholderTextColor="rgba(255,255,255,0.3)"
                        />
                        <Text style={styles.small}>{comments.length}/1000</Text>
                    </View>

                    {/* ── Sending ── */}
                    <TouchableOpacity style={styles.confirmRow} onPress={() => setConfirmed(v => !v)} activeOpacity={0.8}>
                        <Ionicons name={confirmed ? 'checkbox' : 'square-outline'} size={22}
                            color={confirmed ? ACCENT : 'rgba(255,255,255,0.4)'} />
                        <Text style={styles.confirmText}>{t('groupReport.confirm')}</Text>
                    </TouchableOpacity>
                    <Text style={styles.small}>{t('groupReport.attestationNote')}</Text>

                    {error && <Text style={styles.error}>{error}</Text>}

                    <TouchableOpacity style={[styles.sendBtn, sending && { opacity: 0.6 }]} onPress={send} disabled={sending} activeOpacity={0.85}>
                        {sending ? <ActivityIndicator color="#0a0520" /> : <Text style={styles.sendText}>{t('groupReport.send')}</Text>}
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </ScreenBackground>
    );
}

/** The report once sent, read-only. */
function SentReport({ data, header, summary, fmtDate }: { data: any; header: any; summary: any; fmtDate: (d?: string | null) => string }) {
    const { t } = useTranslation();
    const r = data.report;
    const resultLabel = (k: string) => t(RESULTS.find(x => x.key === k)?.label || k);
    const pick = (list: { key: string; label: string }[], k: string) => t(list.find(x => x.key === k)?.label || k);
    const held = (data.sessions || []).length - (r.sessionsNotHeld || []).length;
    return (
        <ScreenBackground>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {header}
                {summary}
                <View style={styles.sentBanner}>
                    <Ionicons name="checkmark-circle" size={18} color={ACCENT} />
                    <Text style={styles.sentText}>{t('groupReport.sentOn', { date: fmtDate(String(r.submittedAt || '').slice(0, 10)) })}</Text>
                </View>

                <Part number={1} title={t('groupReport.part1')} />
                {(data.learners || []).map((l: any) => (
                    <View key={l.enrollmentId} style={styles.card}>
                        <Text style={styles.learnerName}>{l.name}</Text>
                        <Text style={styles.answer}>
                            {t('groupReport.ofTotal', { n: l.sessionsAttended ?? 0, total: held })} · {resultLabel(l.result)}
                        </Text>
                        {!!l.note && <Text style={styles.small}>{l.note}</Text>}
                    </View>
                ))}

                <Part number={2} title={t('groupReport.part2')} />
                <View style={styles.card}>
                    <Text style={styles.answer}>{r.allSessionsHeld ? t('groupReport.yes') : t('groupReport.someNotHeld')}</Text>
                    {(r.sessionsNotHeld || []).map((n: any) => (
                        <Text key={`${n.date}|${n.time}`} style={styles.small}>
                            {fmtDate(n.date)} · {n.time} — {n.reason}
                        </Text>
                    ))}
                </View>

                <Part number={3} title={t('groupReport.part3')} />
                <View style={styles.card}>
                    <Text style={styles.answer}>{pick(COVERAGE, r.planCoverage)}</Text>
                    {!!r.planLeftOut && <Text style={styles.small}>{r.planLeftOut}</Text>}
                </View>

                <Part number={4} title={t('groupReport.part4')} />
                <View style={styles.card}>
                    <Text style={styles.small}>{t('groupReport.levelQ')}</Text>
                    <Text style={styles.answer}>{pick(LEVEL, r.levelFit)}</Text>
                    <Text style={[styles.small, { marginTop: 10 }]}>{t('groupReport.prereqQ')}</Text>
                    <Text style={styles.answer}>{pick(PREREQ, r.prerequisites)}</Text>
                </View>

                {!!r.comments && (
                    <>
                        <Part number={5} title={t('groupReport.part5')} />
                        <View style={styles.card}><Text style={styles.answer}>{r.comments}</Text></View>
                    </>
                )}
            </ScrollView>
        </ScreenBackground>
    );
}

function Part({ number, title }: { number: number; title: string }) {
    return (
        <View style={styles.partRow}>
            <View style={styles.partNum}><Text style={styles.partNumText}>{number}</Text></View>
            <Text style={styles.partTitle}>{title}</Text>
        </View>
    );
}

function Radio({ selected, label, hint, onPress, disabled }: {
    selected: boolean; label: string; hint?: string; onPress: () => void; disabled?: boolean;
}) {
    return (
        <TouchableOpacity style={[styles.radio, selected && styles.radioOn, disabled && { opacity: 0.45 }]}
            onPress={onPress} disabled={disabled} activeOpacity={0.8}>
            <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20}
                color={selected ? ACCENT : 'rgba(255,255,255,0.4)'} />
            <View style={{ flex: 1 }}>
                <Text style={[styles.radioLabel, selected && { color: '#ffffff' }]}>{label}</Text>
                {!!hint && <Text style={styles.radioHint}>{hint}</Text>}
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 60, paddingHorizontal: 20 },
    pad: { paddingHorizontal: 20 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
    muted: { fontSize: 14, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 20 },
    retryBtn: { marginTop: 14, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: ACCENT },
    retryText: { color: ACCENT, fontWeight: '700' },

    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, marginBottom: 14 },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff' },
    headerSubtitle: { fontSize: 13, color: '#aaaaaa', marginTop: 2 },

    summary: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        borderRadius: 12, borderWidth: 1, borderColor: 'rgba(124,206,6,0.3)',
        backgroundColor: 'rgba(124,206,6,0.06)', paddingVertical: 10, paddingHorizontal: 12, marginBottom: 6,
    },
    summaryText: { flex: 1, fontSize: 13, color: '#ffffff', fontWeight: '600' },

    partRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22, marginBottom: 10 },
    partNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(124,206,6,0.15)', alignItems: 'center', justifyContent: 'center' },
    partNumText: { color: ACCENT, fontWeight: '700', fontSize: 13 },
    partTitle: { fontSize: 17, fontWeight: '700', color: '#ffffff' },
    hint: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 10, lineHeight: 17 },

    infoBox: {
        flexDirection: 'row', gap: 8, alignItems: 'flex-start',
        borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', padding: 10, marginBottom: 10,
    },
    infoText: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 17 },

    card: {
        borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.03)', padding: 14, marginBottom: 10,
    },
    learnerName: { fontSize: 15, fontWeight: '700', color: '#ffffff', marginBottom: 10 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    label: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginBottom: 6 },
    question: { fontSize: 14, fontWeight: '600', color: '#ffffff', marginBottom: 8, lineHeight: 20 },
    answer: { fontSize: 14, color: '#ffffff', fontWeight: '600' },
    small: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4, lineHeight: 16 },

    stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    stepBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(124,206,6,0.1)', alignItems: 'center', justifyContent: 'center' },
    stepValue: { fontSize: 14, fontWeight: '700', color: '#ffffff', minWidth: 52, textAlign: 'center' },

    radio: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
        paddingVertical: 9, paddingHorizontal: 10, marginBottom: 6,
    },
    radioOn: { borderColor: 'rgba(124,206,6,0.45)', backgroundColor: 'rgba(124,206,6,0.07)' },
    radioLabel: { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
    radioHint: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 },

    input: {
        borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(255,255,255,0.04)', color: '#ffffff',
        paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, marginTop: 4,
    },
    multiline: { minHeight: 80, textAlignVertical: 'top' },
    inlineError: { fontSize: 12, color: '#ff6b6b', marginTop: 4 },

    sessionRow: { marginTop: 8 },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sessionText: { flex: 1, fontSize: 13, color: '#ffffff' },
    notHeldTag: { fontSize: 11, color: '#ffb347', fontWeight: '700' },

    confirmRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 22 },
    confirmText: { flex: 1, fontSize: 13, color: '#ffffff', lineHeight: 19 },
    error: { fontSize: 13, color: '#ff6b6b', marginTop: 12 },
    sendBtn: { marginTop: 16, borderRadius: 14, backgroundColor: ACCENT, paddingVertical: 14, alignItems: 'center' },
    sendText: { fontSize: 15, fontWeight: '800', color: '#0a0520' },

    sentBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8,
        borderRadius: 12, backgroundColor: 'rgba(124,206,6,0.1)', padding: 10,
    },
    sentText: { fontSize: 13, color: '#ffffff', fontWeight: '600' },
});
