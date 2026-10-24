import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExperienceEntry, currentMonth, emptyEntry, shortMonth } from '../utils/experience';

type Props = {
    value: ExperienceEntry[];
    onChange: (entries: ExperienceEntry[]) => void;
};

/**
 * Professional experience, one entry at a time: "+ Add experience" opens an
 * entry with the organisation and its dates side by side, and the position
 * underneath. Replaces a paragraph to write; Affinda fills it from a CV.
 */
export function ExperienceEditor({ value, onChange }: Props) {
    const { t } = useTranslation();
    // Which entry's date is being picked, and which end.
    const [picking, setPicking] = useState<{ index: number; end: 'from' | 'to' } | null>(null);

    const update = (index: number, patch: Partial<ExperienceEntry>) =>
        onChange(value.map((e, i) => (i === index ? { ...e, ...patch } : e)));

    return (
        <View>
            {value.map((entry, index) => (
                <View key={index} style={styles.card}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.topRow}>
                        <View style={styles.orgWrap}>
                            <Text style={styles.smallLabel}>{t('experience.organization')}</Text>
                            <TextInput
                                style={styles.input}
                                value={entry.organization}
                                onChangeText={v => update(index, { organization: v.slice(0, 100) })}
                                placeholder={t('experience.organizationPh')}
                                placeholderTextColor="#555"
                            />
                        </View>
                        <View style={styles.dates}>
                            <TouchableOpacity style={styles.dateBtn} onPress={() => setPicking({ index, end: 'from' })}>
                                <Text style={styles.dateLabel}>{t('experience.from')}</Text>
                                <Text style={[styles.dateValue, !entry.from && styles.datePlaceholder]}>
                                    {entry.from ? shortMonth(entry.from) : t('experience.pick')}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.dateBtn} onPress={() => setPicking({ index, end: 'to' })}>
                                <Text style={styles.dateLabel}>{t('experience.to')}</Text>
                                <Text style={styles.dateValue}>
                                    {entry.to ? shortMonth(entry.to) : t('experience.present')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                            style={styles.remove}
                            onPress={() => onChange(value.filter((_, i) => i !== index))}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityLabel={t('experience.remove')}
                        >
                            <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.4)" />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.smallLabel}>{t('experience.position')}</Text>
                    <TextInput
                        style={styles.input}
                        value={entry.position}
                        onChangeText={v => update(index, { position: v.slice(0, 100) })}
                        placeholder={t('experience.positionPh')}
                        placeholderTextColor="#555"
                    />
                </View>
            ))}

            <TouchableOpacity style={styles.addBtn} onPress={() => onChange([...value, emptyEntry()])} activeOpacity={0.8}>
                <Ionicons name="add-circle-outline" size={20} color="#7cce06" />
                <Text style={styles.addText}>{t('experience.add')}</Text>
            </TouchableOpacity>

            <MonthYearPicker
                visible={!!picking}
                allowPresent={picking?.end === 'to'}
                value={picking ? (picking.end === 'from' ? value[picking.index]?.from : value[picking.index]?.to) ?? null : null}
                min={picking?.end === 'to' ? value[picking.index]?.from || undefined : undefined}
                onClose={() => setPicking(null)}
                onPick={month => {
                    if (!picking) return;
                    if (picking.end === 'from') {
                        const to = value[picking.index]?.to;
                        update(picking.index, { from: month || '', ...(to && month && to < month ? { to: null } : {}) });
                    } else {
                        update(picking.index, { to: month });
                    }
                    setPicking(null);
                }}
            />
        </View>
    );
}

/**
 * Month and year, no typing. The end of a position can also be "Present".
 * Written here rather than with a native date picker so the app needs no
 * new build to use it.
 */
function MonthYearPicker({ visible, value, allowPresent, min, onPick, onClose }: {
    visible: boolean; value: string | null; allowPresent: boolean; min?: string;
    onPick: (month: string | null) => void; onClose: () => void;
}) {
    const { t, i18n } = useTranslation();
    const now = currentMonth();
    const thisYear = Number(now.slice(0, 4));
    const [year, setYear] = useState<number>(thisYear);
    const [shownFor, setShownFor] = useState<string | null>(null);

    // Open on the entry's own year.
    const key = `${visible}-${value}`;
    if (visible && shownFor !== key) {
        setShownFor(key);
        setYear(value ? Number(value.slice(0, 4)) : (min ? Number(min.slice(0, 4)) : thisYear));
    }

    const years = Array.from({ length: thisYear - 1960 + 1 }, (_, i) => thisYear - i);
    const monthName = (m: number) => {
        try {
            return new Date(2000, m - 1, 1).toLocaleDateString(i18n.language || undefined, { month: 'short' });
        } catch {
            return String(m).padStart(2, '0');
        }
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
                <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
                    <Text style={styles.sheetTitle}>{t('experience.pickMonth')}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.yearRow}>
                        {years.map(y => (
                            <TouchableOpacity key={y} style={[styles.yearChip, y === year && styles.chipOn]} onPress={() => setYear(y)}>
                                <Text style={[styles.chipText, y === year && styles.chipTextOn]}>{y}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <View style={styles.monthGrid}>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                            const ym = `${year}-${String(m).padStart(2, '0')}`;
                            const disabled = ym > now || (!!min && ym < min);
                            return (
                                <TouchableOpacity
                                    key={m}
                                    style={[styles.monthChip, value === ym && styles.chipOn, disabled && { opacity: 0.3 }]}
                                    disabled={disabled}
                                    onPress={() => onPick(ym)}
                                >
                                    <Text style={[styles.chipText, value === ym && styles.chipTextOn]}>{monthName(m)}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    {allowPresent && (
                        <TouchableOpacity style={[styles.presentBtn, value === null && styles.chipOn]} onPress={() => onPick(null)}>
                            <Text style={[styles.chipText, value === null && styles.chipTextOn]}>{t('experience.stillThere')}</Text>
                        </TouchableOpacity>
                    )}
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 14, overflow: 'hidden', padding: 12, marginBottom: 10,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    },
    topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
    orgWrap: { flex: 1 },
    smallLabel: { fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '600', marginBottom: 4 },
    input: {
        color: '#ffffff', fontSize: 14, paddingHorizontal: 10, paddingVertical: 9,
        borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(0,0,0,0.15)',
    },
    dates: { gap: 6 },
    dateBtn: {
        minWidth: 86, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.35)', backgroundColor: 'rgba(124,206,6,0.06)',
    },
    dateLabel: { fontSize: 10, color: 'rgba(255,255,255,0.5)' },
    dateValue: { fontSize: 13, color: '#7cce06', fontWeight: '700' },
    datePlaceholder: { color: 'rgba(255,255,255,0.4)', fontWeight: '500' },
    remove: { paddingTop: 2 },

    addBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(124,206,6,0.5)',
    },
    addText: { color: '#7cce06', fontSize: 14, fontWeight: '700' },

    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
    sheet: {
        backgroundColor: 'rgba(16,10,44,0.98)', borderRadius: 18, padding: 16,
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.25)',
    },
    sheetTitle: { color: '#ffffff', fontSize: 16, fontWeight: '700', marginBottom: 12 },
    yearRow: { gap: 8, paddingBottom: 12 },
    yearChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
    monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    monthChip: {
        width: '22%', paddingVertical: 10, borderRadius: 10, alignItems: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    },
    presentBtn: {
        marginTop: 12, paddingVertical: 11, borderRadius: 12, alignItems: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    },
    chipOn: { backgroundColor: '#7cce06', borderColor: '#7cce06' },
    chipText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
    chipTextOn: { color: '#000' },
});
