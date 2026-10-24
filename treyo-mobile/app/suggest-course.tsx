import {
    View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert,
    KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenBackground } from '../components/ScreenBackground';
import { COURSE_LANGUAGES, COURSE_LEVELS, languageLabel, levelLabel } from '../utils/courseLabels';
import { courseSuggestionService, moduleService, studentService } from '../services/api';

type Similar = { suggestionId: string; topic: string; domain?: string; supporters: number; supported: boolean };

const FORMATS = ['Online', 'Face-to-face', 'Hybrid'] as const;

/**
 * "Suggest a course": a learner asks for a course the catalogue does not
 * have, so administrators can look for a trainer who can teach it.
 *
 * Opened from a search that found nothing (the topic comes pre-filled
 * with what they typed) or from the profile. The topic alone is often
 * vague, so the form also asks what they want to be able to do.
 *
 * While they type, requests other learners already made — only ones an
 * administrator has accepted — are offered for "me too", so five learners
 * asking for Power BI become one request with five behind it.
 */
export default function SuggestCourseScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const params = useLocalSearchParams<{ topic?: string }>();

    const [topic, setTopic] = useState(String(params.topic || ''));
    const [details, setDetails] = useState('');
    const [domain, setDomain] = useState<string | null>(null);
    const [level, setLevel] = useState<string | null>(null);
    const [format, setFormat] = useState<string | null>(null);
    const [language, setLanguage] = useState<string | null>(null);
    const [city, setCity] = useState('');
    const [domains, setDomains] = useState<string[]>([]);
    const [similar, setSimilar] = useState<Similar[]>([]);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        moduleService.listActive()
            .then(list => setDomains((list || []).map((m: any) => m.name).filter(Boolean)))
            .catch(() => {});
        studentService.getMyProfile()
            .then((p: any) => { if (p?.city) setCity(p.city); })
            .catch(() => {});
    }, []);

    // "Me too": accepted requests like this one, after a pause in typing.
    useEffect(() => {
        const q = topic.trim();
        if (q.length < 2) { setSimilar([]); return; }
        const timer = setTimeout(() => {
            courseSuggestionService.similar(q).then(setSimilar).catch(() => setSimilar([]));
        }, 400);
        return () => clearTimeout(timer);
    }, [topic]);

    const errorText = (e: any) => {
        const code = e?.response?.data?.error;
        switch (code) {
            case 'TOPIC_INVALID': return t('suggest.errorTopic');
            case 'DETAILS_TOO_SHORT': return t('suggest.errorDetails');
            case 'TOO_MANY_OPEN': return t('suggest.errorTooMany');
            case 'NOT_OPEN': return t('suggest.errorNotOpen');
            default: return e?.response?.data?.message || t('suggest.errorGeneric');
        }
    };

    const handleMeToo = async (s: Similar) => {
        if (s.supported || busyId) return;
        setBusyId(s.suggestionId);
        try {
            const res = await courseSuggestionService.support(s.suggestionId);
            setSimilar(prev => prev.map(x => x.suggestionId === s.suggestionId
                ? { ...x, supported: true, supporters: res?.supporters ?? x.supporters + 1 } : x));
            Alert.alert(t('suggest.meTooTitle'), t('suggest.meTooBody'), [
                { text: t('suggest.stayHere'), style: 'cancel' },
                { text: t('suggest.mySuggestions'), onPress: () => router.replace('/my-suggestions' as any) },
            ]);
        } catch (e: any) {
            Alert.alert(t('common.error'), errorText(e));
        } finally {
            setBusyId(null);
        }
    };

    const handleSend = async () => {
        if (sending) return;
        if (!topic.trim()) { Alert.alert(t('common.error'), t('suggest.errorTopic')); return; }
        if (details.trim().length < 10) { Alert.alert(t('common.error'), t('suggest.errorDetails')); return; }
        setSending(true);
        try {
            await courseSuggestionService.create({
                topic: topic.trim(), details: details.trim(), domain, level, format, language,
                city: city.trim() || null,
            });
            Alert.alert(t('suggest.sentTitle'), t('suggest.sentBody'), [
                { text: t('common.ok'), onPress: () => router.replace('/my-suggestions' as any) },
            ]);
        } catch (e: any) {
            Alert.alert(t('common.error'), errorText(e));
        } finally {
            setSending(false);
        }
    };

    const Chips = ({ options, value, onChange, label }: {
        options: readonly string[]; value: string | null; onChange: (v: string | null) => void;
        label: (v: string) => string;
    }) => (
        <View style={styles.chipRow}>
            <TouchableOpacity
                style={[styles.chip, value === null && styles.chipActive]}
                onPress={() => onChange(null)}
            >
                <Text style={[styles.chipText, value === null && styles.chipTextActive]}>{t('suggest.any')}</Text>
            </TouchableOpacity>
            {options.map(o => (
                <TouchableOpacity
                    key={o}
                    style={[styles.chip, value === o && styles.chipActive]}
                    onPress={() => onChange(o)}
                >
                    <Text style={[styles.chipText, value === o && styles.chipTextActive]}>{label(o)}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );

    return (
        <ScreenBackground>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}>
                    <View style={styles.header}>
                        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                            <Ionicons name="arrow-back" size={20} color="#ffffff" />
                        </TouchableOpacity>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>{t('suggest.title')}</Text>
                            <Text style={styles.subtitle}>{t('suggest.subtitle')}</Text>
                        </View>
                    </View>

                    <Text style={styles.label}>{t('suggest.topic')}</Text>
                    <View style={styles.inputWrap}>
                        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                        <TextInput
                            style={styles.input}
                            value={topic}
                            onChangeText={setTopic}
                            placeholder={t('suggest.topicPh')}
                            placeholderTextColor="#666"
                            maxLength={120}
                        />
                    </View>

                    {similar.length > 0 && (
                        <View style={styles.similarCard}>
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            <Text style={styles.similarTitle}>{t('suggest.alreadyAsked')}</Text>
                            {similar.map(s => (
                                <View key={s.suggestionId} style={styles.similarRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.similarTopic} numberOfLines={2}>{s.topic}</Text>
                                        <Text style={styles.similarMeta}>
                                            {t('suggest.learnersWant', { count: s.supporters })}
                                            {s.domain ? ` · ${s.domain}` : ''}
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        style={[styles.meTooBtn, s.supported && styles.meTooDone]}
                                        onPress={() => handleMeToo(s)}
                                        disabled={s.supported || !!busyId}
                                        activeOpacity={0.85}
                                    >
                                        {busyId === s.suggestionId ? (
                                            <ActivityIndicator size="small" color="#000" />
                                        ) : (
                                            <Text style={[styles.meTooText, s.supported && styles.meTooDoneText]}>
                                                {s.supported ? t('suggest.youreIn') : t('suggest.meToo')}
                                            </Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            ))}
                            <Text style={styles.similarHint}>{t('suggest.orSendYours')}</Text>
                        </View>
                    )}

                    <Text style={styles.label}>{t('suggest.details')}</Text>
                    <View style={styles.inputWrap}>
                        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                        <TextInput
                            style={[styles.input, styles.multiline]}
                            value={details}
                            onChangeText={setDetails}
                            placeholder={t('suggest.detailsPh')}
                            placeholderTextColor="#666"
                            multiline
                            maxLength={1000}
                        />
                    </View>

                    {domains.length > 0 && (
                        <>
                            <Text style={styles.label}>{t('suggest.domain')}</Text>
                            <Chips options={domains} value={domain} onChange={setDomain} label={d => d} />
                        </>
                    )}

                    <Text style={styles.label}>{t('suggest.level')}</Text>
                    <Chips options={COURSE_LEVELS} value={level} onChange={setLevel} label={l => levelLabel(t, l)} />

                    <Text style={styles.label}>{t('suggest.format')}</Text>
                    <Chips
                        options={FORMATS}
                        value={format}
                        onChange={setFormat}
                        label={f => f === 'Online' ? t('common.online')
                            : f === 'Face-to-face' ? t('common.onSite') : t('courseCreate.formatHybrid')}
                    />

                    <Text style={styles.label}>{t('suggest.language')}</Text>
                    <Chips options={COURSE_LANGUAGES} value={language} onChange={setLanguage} label={l => languageLabel(t, l)} />

                    <Text style={styles.label}>{t('suggest.city')}</Text>
                    <View style={styles.inputWrap}>
                        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                        <TextInput
                            style={styles.input}
                            value={city}
                            onChangeText={setCity}
                            placeholder={t('trainerOnboarding.townPh')}
                            placeholderTextColor="#666"
                            maxLength={100}
                        />
                    </View>

                    <TouchableOpacity
                        style={[styles.sendBtn, sending && { opacity: 0.6 }]}
                        onPress={handleSend}
                        disabled={sending}
                        activeOpacity={0.85}
                    >
                        {sending
                            ? <ActivityIndicator size="small" color="#000" />
                            : <Text style={styles.sendText}>{t('suggest.send')}</Text>}
                    </TouchableOpacity>
                    <Text style={styles.footnote}>{t('suggest.footnote')}</Text>
                </ScrollView>
            </KeyboardAvoidingView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    scrollContent: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 48 },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 20 },
    backBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center',
    },
    title: { color: '#ffffff', fontSize: 22, fontWeight: '800' },
    subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 4, lineHeight: 19 },

    label: { color: '#ffffff', fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 8 },
    inputWrap: {
        borderRadius: 12, overflow: 'hidden', paddingHorizontal: 14,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    },
    input: { color: '#ffffff', fontSize: 15, paddingVertical: 14 },
    multiline: { minHeight: 96, textAlignVertical: 'top' },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.04)',
    },
    chipActive: { backgroundColor: '#7cce06', borderColor: '#7cce06' },
    chipText: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600' },
    chipTextActive: { color: '#000' },

    similarCard: {
        borderRadius: 14, overflow: 'hidden', padding: 14, marginTop: 10,
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.35)',
    },
    similarTitle: { color: '#7cce06', fontSize: 13, fontWeight: '700', marginBottom: 6 },
    similarRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    similarTopic: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
    similarMeta: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 2 },
    similarHint: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 6 },
    meTooBtn: { backgroundColor: '#7cce06', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, minWidth: 84, alignItems: 'center' },
    meTooDone: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#7cce06' },
    meTooText: { color: '#000', fontSize: 13, fontWeight: '700' },
    meTooDoneText: { color: '#7cce06' },

    sendBtn: { backgroundColor: '#7cce06', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 28 },
    sendText: { color: '#000', fontSize: 16, fontWeight: '800' },
    footnote: { color: 'rgba(255,255,255,0.45)', fontSize: 12, textAlign: 'center', marginTop: 12, lineHeight: 18 },
});
