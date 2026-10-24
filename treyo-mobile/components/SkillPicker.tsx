import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { skillService, type SkillOption } from '../services/api';
import { key, matchesPrepared, prepare } from '../utils/textMatch';

type Props = {
    value: string[];
    onChange: (skills: string[]) => void;
    placeholder?: string;
    max?: number;
};

// Shown as chips, so a dozen fit: "c" has many good answers.
const SHOWN = 12;
const MAX_LENGTH = 50;

/** The administrators' skills, fetched once per session. */
let cache: Promise<SkillOption[]> | null = null;
export function loadSkillSuggestions(): Promise<SkillOption[]> {
    if (!cache) cache = skillService.suggestions().catch(() => { cache = null; return []; });
    return cache;
}

/**
 * Skills Affinda read from a CV, under the list's own names where they
 * match one ("communication" → "Communication"), as typed otherwise.
 */
export async function skillsFromCv(names: string[], max = 30): Promise<string[]> {
    const options = await loadSkillSuggestions();
    const byName = new Map<string, string>();
    for (const o of options) {
        for (const n of [o.name, o.nameFr, o.nameAr, o.nameEs]) if (n) byName.set(n.toLowerCase(), o.name);
    }
    const out: string[] = [];
    for (const raw of names) {
        const n = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, MAX_LENGTH);
        if (!n) continue;
        const name = byName.get(n.toLowerCase()) || n;
        if (!out.some(o => o.toLowerCase() === name.toLowerCase())) out.push(name);
        if (out.length >= max) break;
    }
    return out;
}

/**
 * Skills as chips, with suggestions as one types: "c" offers Communication,
 * Creativity, C#, C++. Suggestions come only from the administrators'
 * Skills list (dashboard), shown in the app's language and saved under
 * their English name. Something not in the list can still be added as
 * typed — a CV's skills are open-ended.
 */
export function SkillPicker({ value, onChange, placeholder, max = 30 }: Props) {
    const { t, i18n } = useTranslation();
    const [text, setText] = useState('');
    const [options, setOptions] = useState<SkillOption[]>([]);

    useEffect(() => { loadSkillSuggestions().then(setOptions); }, []);

    const lang = (i18n.language || '').slice(0, 2);
    const label = (s: SkillOption) =>
        (lang === 'fr' && s.nameFr) || (lang === 'ar' && s.nameAr) || (lang === 'es' && s.nameEs) || s.name;

    // Each skill's names prepared once, in English and the app's language.
    const index = useMemo(() => options.map(s => ({
        skill: s,
        shown: label(s),
        names: [s.name, label(s)].map(n => ({ lower: n.toLowerCase(), prepared: prepare(n) })),
    })), [options, lang]); // eslint-disable-line react-hooks/exhaustive-deps

    const chosen = useMemo(() => new Set(value.map(v => v.toLowerCase())), [value]);

    const suggestions = useMemo(() => {
        const typed = text.trim().toLowerCase();
        if (!typed) return [];
        const q = prepare(typed);
        const scored: { skill: SkillOption; shown: string; rank: number }[] = [];
        for (const i of index) {
            if (chosen.has(i.skill.name.toLowerCase())) continue;
            let rank = -1;
            for (const n of i.names) {
                // "c" finds C, C#, C++ and Communication by their start; a
                // word inside counts next ("bi" → Power BI); typos last.
                if (n.lower.startsWith(typed)) rank = Math.max(rank, 3);
                else if (n.prepared.words.some(w => w.startsWith(key(typed)))) rank = Math.max(rank, 2);
                else if (typed.length >= 3 && matchesPrepared(q, n.prepared)) rank = Math.max(rank, 1);
            }
            if (rank > 0) scored.push({ skill: i.skill, shown: i.shown, rank });
        }
        return scored
            .sort((a, b) => b.rank - a.rank || a.shown.localeCompare(b.shown))
            .slice(0, SHOWN);
    }, [text, index, chosen]);

    const add = (name: string) => {
        const n = name.trim().replace(/\s+/g, ' ').slice(0, MAX_LENGTH);
        if (!n || chosen.has(n.toLowerCase()) || value.length >= max) { setText(''); return; }
        // Typed exactly as a listed skill (in any of its languages): save it
        // under the list's name, so "communication" and "Communication" are one.
        const listed = index.find(i => i.names.some(x => x.lower === n.toLowerCase()));
        onChange([...value, listed ? listed.skill.name : n]);
        setText('');
    };

    const typedIsListed = !!text.trim() && index.some(i => i.names.some(x => x.lower === text.trim().toLowerCase()));
    const shownFor = (name: string) => {
        const listed = options.find(o => o.name.toLowerCase() === name.toLowerCase());
        return listed ? label(listed) : name;
    };

    return (
        <View>
            {value.length > 0 && (
                <View style={styles.chips}>
                    {value.map(s => (
                        <View key={s} style={styles.chip}>
                            <Text style={styles.chipText}>{shownFor(s)}</Text>
                            <TouchableOpacity
                                onPress={() => onChange(value.filter(v => v !== s))}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                accessibilityLabel={t('skillPicker.remove', { skill: s })}
                            >
                                <Ionicons name="close" size={14} color="#7cce06" />
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>
            )}

            <View style={styles.inputWrap}>
                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                <Ionicons name="search-outline" size={16} color="#777" />
                <TextInput
                    style={styles.input}
                    value={text}
                    onChangeText={v => setText(v.slice(0, MAX_LENGTH))}
                    onSubmitEditing={() => add(text)}
                    placeholder={placeholder || t('skillPicker.placeholder')}
                    placeholderTextColor="#555"
                    returnKeyType="done"
                    blurOnSubmit={false}
                    autoCorrect={false}
                />
            </View>

            {text.trim().length > 0 && (
                <View style={styles.suggestions}>
                    {suggestions.map(s => (
                        <TouchableOpacity key={s.skill.skillId} style={styles.suggestion} onPress={() => add(s.skill.name)}>
                            <Ionicons name="add" size={14} color="#7cce06" />
                            <Text style={styles.suggestionText}>{s.shown}</Text>
                        </TouchableOpacity>
                    ))}
                    {!typedIsListed && (
                        <TouchableOpacity style={[styles.suggestion, styles.typed]} onPress={() => add(text)}>
                            <Ionicons name="create-outline" size={14} color="rgba(255,255,255,0.6)" />
                            <Text style={styles.addTyped}>{t('skillPicker.addTyped', { skill: text.trim() })}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    chip: {
        flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6,
        borderRadius: 14, borderWidth: 1, borderColor: 'rgba(124,206,6,0.45)', backgroundColor: 'rgba(124,206,6,0.1)',
    },
    chipText: { color: '#7cce06', fontSize: 13, fontWeight: '600' },
    inputWrap: {
        flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12,
        borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    },
    input: { flex: 1, color: '#ffffff', fontSize: 15, paddingVertical: 12 },
    suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    suggestion: {
        flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7,
        borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.05)',
    },
    typed: { borderStyle: 'dashed' },
    suggestionText: { color: '#ffffff', fontSize: 13 },
    addTyped: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontStyle: 'italic' },
});
