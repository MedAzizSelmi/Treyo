import {
    View, Text, TouchableOpacity, StyleSheet, ScrollView,
    ActivityIndicator, Alert, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenBackground } from '../components/ScreenBackground';
import { groupService } from '../services/api';

/**
 * Session scheduling screen — opened from a trainer's "Upcoming Sessions"
 * card. The trainer builds the course's class calendar:
 *   1. Tap dates on the calendar to add sessions
 *   2. Each session has its OWN duration (a 2h session and a 1h session
 *      can sit in the same schedule) plus a start time
 *   3. A running tally tracks total hours vs. the course total
 *   4. Save unlocks only when the session hours add up to EXACTLY the
 *      course's total duration
 *
 * The schedule is stored as JSON on the Group; startDate / endDate are
 * derived server-side from the earliest / latest session.
 */

type Session = {
    date: string;   // YYYY-MM-DD
    time: string;   // HH:mm
    hours: number;  // this session's length
};

const DEFAULT_SESSION_TIME = '18:00';
const DEFAULT_SESSION_HOURS = 2;
const ACCENT = '#7cce06';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local "today" as YYYY-MM-DD. */
function todayDateStr(): string {
    return new Date().toISOString().split('T')[0];
}

/**
 * True if a session at (dateStr, timeStr) is at or before "now".
 * Future dates → never past. Used to stop the trainer scheduling a
 * session today at a time that's already gone.
 */
function isTimeInPast(dateStr: string, timeStr: string): boolean {
    const today = todayDateStr();
    if (dateStr > today) return false;  // future date — any time is fine
    if (dateStr < today) return true;   // past date (calendar normally blocks this)
    const now = new Date();
    const [h, m] = timeStr.split(':').map(Number);
    return h < now.getHours() || (h === now.getHours() && m <= now.getMinutes());
}

/** Next 15-minute slot strictly after now, as "HH:mm" (clamped to 23:45). */
function nextValidSlotToday(): string {
    const now = new Date();
    let h = now.getHours();
    let m = Math.ceil((now.getMinutes() + 1) / 15) * 15;
    if (m >= 60) { m = 0; h += 1; }
    if (h >= 24) { h = 23; m = 45; }
    return `${pad(h)}:${pad(m)}`;
}

export default function ScheduleSessionsScreen() {
    const router = useRouter();
    const { groupId } = useLocalSearchParams<{ groupId: string }>();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [group, setGroup] = useState<any>(null);
    const [sessions, setSessions] = useState<Session[]>([]);
    // Index of the session whose time is being edited (time-picker modal).
    const [timePickerFor, setTimePickerFor] = useState<number | null>(null);

    const todayStr = new Date().toISOString().split('T')[0];

    useEffect(() => { load(); }, [groupId]);

    const load = async () => {
        if (!groupId) { setLoading(false); return; }
        try {
            const g = await groupService.getGroup(groupId);
            setGroup(g);

            // Pre-populate from a previously saved schedule so the trainer
            // edits rather than starts over. Sessions saved before per-
            // session durations existed won't have `hours` — fall back to
            // the old global `hoursPerSession`, or the default.
            if (g?.meetingSchedule) {
                try {
                    const parsed = JSON.parse(g.meetingSchedule);
                    if (Array.isArray(parsed?.sessions)) {
                        const legacyHours = parsed.hoursPerSession || DEFAULT_SESSION_HOURS;
                        setSessions(parsed.sessions.map((s: any) => ({
                            date: s.date,
                            time: s.time || DEFAULT_SESSION_TIME,
                            hours: s.hours || legacyHours,
                        })));
                    }
                } catch {
                    // Old / non-JSON meetingSchedule — ignore, start fresh.
                }
            }
        } catch (e) {
            console.log('Schedule load error', e);
        } finally {
            setLoading(false);
        }
    };

    const durationHours: number = group?.courseDurationHours || 0;

    // Running totals — the heart of the per-session-duration model.
    const totalScheduled = useMemo(
        () => sessions.reduce((sum, s) => sum + s.hours, 0),
        [sessions],
    );
    const remaining = durationHours - totalScheduled;

    // Sessions sorted chronologically — drives the numbered list and the
    // save payload so "Session 1" is always the earliest.
    const sortedSessions = useMemo(() => {
        return [...sessions].sort((a, b) =>
            (a.date + a.time).localeCompare(b.date + b.time));
    }, [sessions]);

    const markedDates = useMemo(() => {
        const m: Record<string, any> = {};
        for (const s of sessions) {
            m[s.date] = { selected: true, selectedColor: ACCENT };
        }
        return m;
    }, [sessions]);

    const onDayPress = (day: { dateString: string }) => {
        const date = day.dateString;
        setSessions(prev => {
            const exists = prev.find(s => s.date === date);
            if (exists) {
                // Tapping a selected date removes that session.
                return prev.filter(s => s.date !== date);
            }
            // New session defaults to a 2h block, but never more than the
            // hours still unallocated — so adding a session can't blow
            // past the course total in one tap. Clamped to >= 1h.
            const rem = durationHours - prev.reduce((s, x) => s + x.hours, 0);
            const defaultHours = Math.max(1, Math.min(DEFAULT_SESSION_HOURS, rem));
            // If this session is for today and the default 18:00 has
            // already passed, bump the default to the next 15-min slot
            // from now. Prevents an obviously-invalid default that the
            // trainer would have to manually fix every time.
            const defaultTime = isTimeInPast(date, DEFAULT_SESSION_TIME)
                ? nextValidSlotToday()
                : DEFAULT_SESSION_TIME;
            return [...prev, { date, time: defaultTime, hours: defaultHours }];
        });
    };

    const setSessionTime = (date: string, time: string) => {
        setSessions(prev => prev.map(s => (s.date === date ? { ...s, time } : s)));
    };

    const changeSessionHours = (date: string, delta: number) => {
        setSessions(prev => prev.map(s =>
            s.date === date ? { ...s, hours: Math.max(1, s.hours + delta) } : s));
    };

    const removeSession = (date: string) => {
        setSessions(prev => prev.filter(s => s.date !== date));
    };

    // Save only when the session hours add up to EXACTLY the course total.
    const canSave = sessions.length > 0 && remaining === 0 && !saving;

    const handleSave = async () => {
        if (!canSave || !groupId) return;
        // Final safety net: catches the case where the clock advances
        // past a today-session's time while the trainer is still editing.
        // The time picker already disables past slots up-front, so this
        // mostly only fires for very long editing sessions or after the
        // hour rolls over mid-edit.
        const past = sortedSessions.find(s => isTimeInPast(s.date, s.time));
        if (past) {
            Alert.alert(
                'Time has passed',
                `Session on ${fmtDate(past.date)} at ${past.time} is in the past. Please pick a later time.`,
            );
            return;
        }
        setSaving(true);
        try {
            await groupService.saveGroupSchedule(groupId, { sessions: sortedSessions });
            Alert.alert('Schedule saved', 'Your session schedule has been saved.', [
                { text: 'OK', onPress: () => router.back() },
            ]);
        } catch (e: any) {
            Alert.alert('Could not save', e?.response?.data?.error || 'Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const fmtDate = (ds: string) => {
        const d = new Date(ds + 'T00:00:00');
        return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    };

    // Tally banner state — drives colour + wording.
    const tallyExact = remaining === 0 && sessions.length > 0;
    const tallyOver = remaining < 0;
    const tallyText = tallyExact
        ? `${totalScheduled}h of ${durationHours}h scheduled`
        : tallyOver
            ? `${totalScheduled}h of ${durationHours}h — remove ${-remaining}h`
            : `${totalScheduled}h of ${durationHours}h — ${remaining}h left`;

    const saveLabel = tallyExact
        ? 'Save Schedule'
        : tallyOver
            ? `Remove ${-remaining}h to save`
            : `Allocate ${remaining}h more`;

    if (loading) {
        return (
            <ScreenBackground>
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={ACCENT} />
                </View>
            </ScreenBackground>
        );
    }

    return (
        <ScreenBackground>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Header ── */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color="#ffffff" />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>Schedule Sessions</Text>
                        <Text style={styles.headerSubtitle} numberOfLines={1}>
                            {group?.courseTitle || group?.groupName || 'Course'}
                        </Text>
                    </View>
                </View>

                {/* ── Running tally ── */}
                <View style={[
                    styles.tallyBanner,
                    tallyExact && styles.tallyBannerExact,
                    tallyOver && styles.tallyBannerOver,
                ]}>
                    <Ionicons
                        name={tallyExact ? 'checkmark-circle' : tallyOver ? 'alert-circle' : 'time-outline'}
                        size={20}
                        color={tallyExact ? ACCENT : tallyOver ? '#ff6b6b' : '#aaa'}
                    />
                    <Text style={styles.tallyText}>{tallyText}</Text>
                </View>

                {/* ── Calendar ── */}
                <View style={styles.calendarCard}>
                    <Calendar
                        minDate={todayStr}
                        markedDates={markedDates}
                        onDayPress={onDayPress}
                        theme={{
                            backgroundColor: 'transparent',
                            calendarBackground: 'transparent',
                            textSectionTitleColor: '#aaaaaa',
                            dayTextColor: '#ffffff',
                            todayTextColor: ACCENT,
                            monthTextColor: '#ffffff',
                            arrowColor: ACCENT,
                            textDisabledColor: 'rgba(255,255,255,0.2)',
                            selectedDayBackgroundColor: ACCENT,
                            selectedDayTextColor: '#000000',
                        }}
                    />
                    <Text style={styles.calendarHint}>
                        Tap a date to add a session · tap again to remove it
                    </Text>
                </View>

                {/* ── Picked sessions list ── */}
                {sortedSessions.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>
                            Sessions ({sortedSessions.length})
                        </Text>
                        {sortedSessions.map((s, i) => (
                            <View key={s.date} style={styles.sessionRow}>
                                {/* Top line: number + date + remove */}
                                <View style={styles.sessionTop}>
                                    <View style={styles.sessionNum}>
                                        <Text style={styles.sessionNumText}>{i + 1}</Text>
                                    </View>
                                    <Text style={styles.sessionDate}>{fmtDate(s.date)}</Text>
                                    <View style={{ flex: 1 }} />
                                    <TouchableOpacity
                                        onPress={() => removeSession(s.date)}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    >
                                        <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.35)" />
                                    </TouchableOpacity>
                                </View>

                                {/* Bottom line: time chip + per-session duration stepper */}
                                <View style={styles.sessionBottom}>
                                    <TouchableOpacity
                                        style={styles.timeChip}
                                        onPress={() => setTimePickerFor(
                                            sessions.findIndex(x => x.date === s.date))}
                                    >
                                        <Ionicons name="time-outline" size={13} color={ACCENT} />
                                        <Text style={styles.timeChipText}>{s.time}</Text>
                                    </TouchableOpacity>

                                    <View style={styles.durationStepper}>
                                        <TouchableOpacity
                                            style={styles.durBtn}
                                            onPress={() => changeSessionHours(s.date, -1)}
                                        >
                                            <Ionicons name="remove" size={16} color={ACCENT} />
                                        </TouchableOpacity>
                                        <Text style={styles.durValue}>{s.hours}h</Text>
                                        <TouchableOpacity
                                            style={styles.durBtn}
                                            onPress={() => changeSessionHours(s.date, 1)}
                                        >
                                            <Ionicons name="add" size={16} color={ACCENT} />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* ── Save ── */}
                <TouchableOpacity
                    style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
                    onPress={handleSave}
                    disabled={!canSave}
                    activeOpacity={0.85}
                >
                    {saving ? (
                        <ActivityIndicator size="small" color="#000" />
                    ) : (
                        <Text style={styles.saveBtnText}>{saveLabel}</Text>
                    )}
                </TouchableOpacity>
            </ScrollView>

            {/* ── Time picker modal ── */}
            <TimePickerModal
                visible={timePickerFor !== null}
                value={timePickerFor !== null ? sessions[timePickerFor]?.time : DEFAULT_SESSION_TIME}
                // The modal disables hours/minutes that are already past
                // when this date is today. Without it the trainer could
                // pick e.g. 09:00 on today's date at 14:00.
                sessionDate={timePickerFor !== null ? sessions[timePickerFor]?.date : ''}
                onClose={() => setTimePickerFor(null)}
                onPick={(time) => {
                    if (timePickerFor !== null) {
                        const date = sessions[timePickerFor]?.date;
                        if (date) setSessionTime(date, time);
                    }
                    setTimePickerFor(null);
                }}
            />
        </ScreenBackground>
    );
}

/**
 * Compact time picker — a modal with an hour grid (0–23) and a minute
 * row (00 / 15 / 30 / 45). Built in-house so we don't pull in the
 * native @react-native-community/datetimepicker (which would need a
 * prebuild). 15-minute granularity is plenty for class schedules.
 */
function TimePickerModal({
    visible, value, sessionDate, onClose, onPick,
}: {
    visible: boolean;
    value: string;
    /** YYYY-MM-DD of the session being edited. Drives the past-time
     *  disabling — past hours/minutes are blocked only when this is
     *  today's date. Future dates allow any time. */
    sessionDate: string;
    onClose: () => void;
    onPick: (time: string) => void;
}) {
    const [hour, setHour] = useState(18);
    const [minute, setMinute] = useState(0);

    // Today-snapshot. We recompute on each open so a long-running modal
    // session picks up the new "now" if the hour rolled over.
    const now = new Date();
    const isToday = sessionDate === todayDateStr();
    const nowH = now.getHours();
    const nowM = now.getMinutes();

    // An hour is unselectable when:
    //   - it's before the current hour, OR
    //   - it IS the current hour but every 15-min slot in it has already
    //     gone (i.e. we're past :45)
    const hourDisabled = (h: number): boolean =>
        isToday && (h < nowH || (h === nowH && nowM >= 45));

    // A minute slot is unselectable when we're in the current hour and
    // the slot's minute is at or before the current minute. Future hours
    // accept any minute.
    const minuteDisabled = (m: number): boolean =>
        isToday && hour === nowH && m <= nowM;

    // The whole selection is invalid if hour or minute is in the past.
    const selectionInPast =
        isToday && (hour < nowH || (hour === nowH && minute <= nowM));

    useEffect(() => {
        if (!visible) return;
        // Seed from the value the session currently holds…
        let h = 18;
        let m = 0;
        if (value) {
            const parts = value.split(':').map(Number);
            if (!isNaN(parts[0])) h = parts[0];
            if (!isNaN(parts[1])) m = parts[1];
        }
        // …but if that seed is in the past (e.g. defaults were set hours
        // ago), bump it forward to the next valid slot so the user opens
        // onto a usable selection rather than a disabled one.
        if (sessionDate === todayDateStr()) {
            const n = new Date();
            if (h < n.getHours() || (h === n.getHours() && m <= n.getMinutes())) {
                const slot = nextValidSlotToday();
                const sp = slot.split(':').map(Number);
                h = sp[0];
                m = sp[1];
            }
        }
        setHour(h);
        setMinute(m);
    }, [visible, value, sessionDate]);

    // When the user picks an hour that's the current hour, auto-bump the
    // minute to the first valid slot so they don't sit on a disabled one.
    const handleHourTap = (h: number) => {
        if (hourDisabled(h)) return;
        setHour(h);
        if (isToday && h === nowH && minute <= nowM) {
            const firstValid = [0, 15, 30, 45].find(m => m > nowM);
            if (firstValid !== undefined) setMinute(firstValid);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
                <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
                    <Text style={styles.modalTitle}>Start time</Text>
                    <Text style={styles.modalPreview}>{pad(hour)}:{pad(minute)}</Text>

                    <Text style={styles.modalLabel}>Hour</Text>
                    <View style={styles.hourGrid}>
                        {Array.from({ length: 24 }, (_, h) => {
                            const disabled = hourDisabled(h);
                            return (
                                <TouchableOpacity
                                    key={h}
                                    style={[
                                        styles.hourCell,
                                        hour === h && styles.hourCellActive,
                                        disabled && styles.cellDisabled,
                                    ]}
                                    onPress={() => handleHourTap(h)}
                                    disabled={disabled}
                                >
                                    <Text style={[
                                        styles.hourText,
                                        hour === h && styles.hourTextActive,
                                        disabled && styles.textDisabled,
                                    ]}>
                                        {pad(h)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <Text style={styles.modalLabel}>Minute</Text>
                    <View style={styles.minuteRow}>
                        {[0, 15, 30, 45].map(m => {
                            const disabled = minuteDisabled(m);
                            return (
                                <TouchableOpacity
                                    key={m}
                                    style={[
                                        styles.minuteCell,
                                        minute === m && styles.minuteCellActive,
                                        disabled && styles.cellDisabled,
                                    ]}
                                    onPress={() => !disabled && setMinute(m)}
                                    disabled={disabled}
                                >
                                    <Text style={[
                                        styles.minuteText,
                                        minute === m && styles.minuteTextActive,
                                        disabled && styles.textDisabled,
                                    ]}>
                                        {pad(m)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <TouchableOpacity
                        style={[styles.modalConfirm, selectionInPast && styles.saveBtnDisabled]}
                        disabled={selectionInPast}
                        onPress={() => onPick(`${pad(hour)}:${pad(minute)}`)}
                    >
                        <Text style={styles.modalConfirmText}>
                            {selectionInPast ? 'Pick a later time' : 'Set time'}
                        </Text>
                    </TouchableOpacity>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 60, paddingHorizontal: 20 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, marginBottom: 18 },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff' },
    headerSubtitle: { fontSize: 13, color: '#aaaaaa', marginTop: 2 },

    // Running tally banner
    tallyBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.03)',
        paddingVertical: 12, paddingHorizontal: 14, marginBottom: 14,
    },
    tallyBannerExact: { borderColor: 'rgba(124,206,6,0.4)', backgroundColor: 'rgba(124,206,6,0.08)' },
    tallyBannerOver: { borderColor: 'rgba(255,107,107,0.4)', backgroundColor: 'rgba(255,107,107,0.08)' },
    tallyText: { fontSize: 14, color: '#ffffff', fontWeight: '600' },

    calendarCard: {
        borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.03)',
        padding: 8, marginBottom: 18, overflow: 'hidden',
    },
    calendarHint: { fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingVertical: 8 },

    section: { marginBottom: 18 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 10 },
    sessionRow: {
        borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.03)',
        padding: 12, marginBottom: 8, gap: 10,
    },
    sessionTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    sessionNum: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: 'rgba(124,206,6,0.15)',
        justifyContent: 'center', alignItems: 'center',
    },
    sessionNumText: { fontSize: 13, fontWeight: '700', color: ACCENT },
    sessionDate: { fontSize: 14, fontWeight: '600', color: '#ffffff' },
    sessionBottom: { flexDirection: 'row', alignItems: 'center', gap: 10 },

    timeChip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(124,206,6,0.1)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.3)',
        borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
    },
    timeChipText: { fontSize: 13, fontWeight: '600', color: ACCENT },

    // Per-session duration stepper
    durationStepper: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        marginLeft: 'auto' as any,
    },
    durBtn: {
        width: 30, height: 30, borderRadius: 15,
        backgroundColor: 'rgba(124,206,6,0.1)',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.3)',
        justifyContent: 'center', alignItems: 'center',
    },
    durValue: { fontSize: 14, fontWeight: '700', color: '#ffffff', minWidth: 34, textAlign: 'center' },

    saveBtn: {
        backgroundColor: ACCENT, borderRadius: 14,
        paddingVertical: 15, alignItems: 'center', marginTop: 4,
    },
    saveBtnDisabled: { opacity: 0.4 },
    saveBtnText: { fontSize: 15, fontWeight: '700', color: '#000000' },

    // Time picker modal
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center', alignItems: 'center', padding: 24,
    },
    modalCard: {
        width: '100%', borderRadius: 20, padding: 20,
        backgroundColor: '#160e45',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.2)',
    },
    modalTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
    modalPreview: { fontSize: 32, fontWeight: '800', color: ACCENT, textAlign: 'center', marginVertical: 10 },
    modalLabel: { fontSize: 12, color: '#aaaaaa', fontWeight: '600', marginTop: 8, marginBottom: 8 },
    hourGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    hourCell: {
        width: '15%', aspectRatio: 1.6, borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center', alignItems: 'center',
    },
    hourCellActive: { backgroundColor: ACCENT },
    hourText: { fontSize: 13, color: '#ffffff' },
    hourTextActive: { color: '#000000', fontWeight: '700' },
    // Visual treatment for past hours/minutes when scheduling on today's
    // date — dim, non-tappable.
    cellDisabled: {
        backgroundColor: 'rgba(255,255,255,0.02)',
        opacity: 0.4,
    },
    textDisabled: { color: 'rgba(255,255,255,0.3)' },
    minuteRow: { flexDirection: 'row', gap: 8 },
    minuteCell: {
        flex: 1, paddingVertical: 10, borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center',
    },
    minuteCellActive: { backgroundColor: ACCENT },
    minuteText: { fontSize: 14, color: '#ffffff' },
    minuteTextActive: { color: '#000000', fontWeight: '700' },
    modalConfirm: {
        backgroundColor: ACCENT, borderRadius: 12,
        paddingVertical: 13, alignItems: 'center', marginTop: 18,
    },
    modalConfirmText: { fontSize: 14, fontWeight: '700', color: '#000000' },
});
