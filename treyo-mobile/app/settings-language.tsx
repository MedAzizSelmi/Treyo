import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScreenBackground } from '../components/ScreenBackground';

const LANGUAGE_KEY = 'app_language';

const LANGUAGES = [
    { code: 'en', label: 'English', native: 'English', flag: '🇬🇧' },
    { code: 'fr', label: 'French', native: 'Français', flag: '🇫🇷' },
    { code: 'ar', label: 'Arabic', native: 'العربية', flag: '🇹🇳' },
    { code: 'es', label: 'Spanish', native: 'Español', flag: '🇪🇸' },
];

export default function LanguageSettingsScreen() {
    const router = useRouter();
    const [selected, setSelected] = useState('en');

    useEffect(() => {
        AsyncStorage.getItem(LANGUAGE_KEY).then(v => { if (v) setSelected(v); });
    }, []);

    const handleSelect = async (code: string) => {
        setSelected(code);
        await AsyncStorage.setItem(LANGUAGE_KEY, code);
    };

    return (
        <ScreenBackground>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color="#ffffff" />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>Language</Text>
                        <Text style={styles.headerSubtitle}>Choose your preferred language</Text>
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
                    <Text style={styles.noteText}>
                        Your preference is saved on this device. Full UI translations are rolling out gradually — newly added screens will pick up the language automatically.
                    </Text>
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
