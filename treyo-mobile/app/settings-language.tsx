import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Updates from 'expo-updates';
import { ScreenBackground } from '../components/ScreenBackground';
import { setLanguage, getCurrentLanguage, LANGUAGE_KEY, Language } from '../i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Language picker.
 *
 * Tapping a language:
 *   1. Persists to AsyncStorage under LANGUAGE_KEY.
 *   2. Calls i18next.changeLanguage(code) so every useTranslation()
 *      consumer re-renders with the new strings immediately.
 *   3. If we're toggling in/out of an RTL language (Arabic), prompts
 *      to restart so the layout direction actually flips — RN can't
 *      switch I18nManager.isRTL without a fresh bundle.
 */

const LANGUAGES: { code: Language; label: string; native: string; flag: string }[] = [
    { code: 'en', label: 'English', native: 'English', flag: '🇬🇧' },
    { code: 'fr', label: 'French', native: 'Français', flag: '🇫🇷' },
    { code: 'ar', label: 'Arabic', native: 'العربية', flag: '🇹🇳' },
    { code: 'es', label: 'Spanish', native: 'Español', flag: '🇪🇸' },
];

export default function LanguageSettingsScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const [selected, setSelected] = useState<Language>(getCurrentLanguage());

    useEffect(() => {
        // Keep state in sync with whatever's persisted (e.g. user opened
        // this screen, navigated away, came back — the system locale
        // could also have changed in the background).
        AsyncStorage.getItem(LANGUAGE_KEY).then(v => {
            if (v) setSelected(v as Language);
        });
    }, []);

    const handleSelect = async (code: Language) => {
        if (code === selected) return;
        setSelected(code);
        const { requiresRestart } = await setLanguage(code);
        if (requiresRestart) {
            Alert.alert(
                t('settings.restartRequired'),
                t('settings.restartBody'),
                [
                    { text: t('common.later'), style: 'cancel' },
                    {
                        text: t('common.ok'),
                        onPress: async () => {
                            // Updates.reloadAsync forces a fresh JS bundle so
                            // the new I18nManager.isRTL takes effect across
                            // every mounted screen. Falls back to a no-op in
                            // Expo Go on simulators — the user can just kill
                            // and reopen the app in that case.
                            try { await Updates.reloadAsync(); } catch (_) {}
                        },
                    },
                ],
            );
        }
    };

    return (
        <ScreenBackground>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color="#ffffff" />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>{t('settings.languageTitle')}</Text>
                        <Text style={styles.headerSubtitle}>{t('settings.languageSubtitle')}</Text>
                    </View>
                </View>

                <View style={styles.card}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    {LANGUAGES.map((lang, i) => {
                        const active = selected === lang.code;
                        return (
                            <View key={lang.code}>
                                <TouchableOpacity style={styles.row} onPress={() => handleSelect(lang.code)} activeOpacity={0.7}>
                                    <Text style={styles.flag}>{lang.flag}</Text>
                                    <View style={styles.body}>
                                        <Text style={styles.label}>{lang.label}</Text>
                                        <Text style={styles.native}>{lang.native}</Text>
                                    </View>
                                    {active ? (
                                        <View style={styles.checkWrap}>
                                            <Ionicons name="checkmark" size={16} color="#000" />
                                        </View>
                                    ) : (
                                        <View style={styles.radioOff} />
                                    )}
                                </TouchableOpacity>
                                {i < LANGUAGES.length - 1 && <View style={styles.divider} />}
                            </View>
                        );
                    })}
                </View>

                <View style={styles.noteWrap}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <Ionicons name="information-circle-outline" size={18} color="#7cce06" />
                    <Text style={styles.noteText}>{t('settings.languageNote')}</Text>
                </View>
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 60, paddingHorizontal: 20 },

    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, marginBottom: 24 },
    backBtn: { padding: 2 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff' },
    headerSubtitle: { fontSize: 13, color: '#aaaaaa', marginTop: 2 },

    card: {
        borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
    flag: { fontSize: 26, marginRight: 14 },
    body: { flex: 1 },
    label: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
    native: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
    checkWrap: {
        width: 24, height: 24, borderRadius: 12,
        backgroundColor: '#7cce06',
        justifyContent: 'center', alignItems: 'center',
    },
    radioOff: {
        width: 22, height: 22, borderRadius: 11,
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
    },
    divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginLeft: 56 },

    noteWrap: {
        flexDirection: 'row', gap: 10, alignItems: 'flex-start',
        marginTop: 16, padding: 14,
        borderRadius: 14, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.18)',
    },
    noteText: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 18 },
});
