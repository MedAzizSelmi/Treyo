import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { ScreenBackground } from './ScreenBackground';
import { LegalSection, LEGAL_LAST_UPDATED } from '../constants/legal';

/**
 * Shared renderer for the Terms of Service and Privacy Policy screens —
 * both are just a title plus a list of headed sections, so they share
 * one layout.
 *
 * Lines beginning with "• " are rendered as bullets; everything else is
 * a paragraph.
 */
type Props = {
    title: string;
    intro?: string;
    sections: LegalSection[];
};

export default function LegalDocumentScreen({ title, intro, sections }: Props) {
    const router = useRouter();

    return (
        <ScreenBackground>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                    <Ionicons name="arrow-back" size={20} color="#ffffff" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>{title}</Text>
                    <Text style={styles.headerSub}>Last updated: {LEGAL_LAST_UPDATED}</Text>
                </View>
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {!!intro && (
                    <View style={styles.introCard}>
                        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                        <Text style={styles.introText}>{intro}</Text>
                    </View>
                )}

                {sections.map((section, i) => (
                    <View key={i} style={styles.section}>
                        <Text style={styles.heading}>{section.heading}</Text>
                        {section.body.map((line, j) =>
                            line.startsWith('• ') ? (
                                <View key={j} style={styles.bulletRow}>
                                    <Text style={styles.bulletDot}>•</Text>
                                    <Text style={styles.bulletText}>{line.slice(2)}</Text>
                                </View>
                            ) : (
                                <Text key={j} style={styles.paragraph}>{line}</Text>
                            )
                        )}
                    </View>
                ))}

                <View style={{ height: 40 }} />
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 12, overflow: 'hidden',
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff' },
    headerSub: { fontSize: 11.5, color: 'rgba(255,255,255,0.45)', marginTop: 2 },

    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },

    introCard: {
        borderRadius: 14, overflow: 'hidden', padding: 14, marginBottom: 20,
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.2)',
    },
    introText: { fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 19 },

    section: { marginBottom: 22 },
    heading: {
        fontSize: 15, fontWeight: '700', color: '#7cce06', marginBottom: 8,
    },
    paragraph: {
        fontSize: 13.5, color: 'rgba(255,255,255,0.72)',
        lineHeight: 21, marginBottom: 9,
    },
    bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 7, paddingLeft: 4 },
    bulletDot: { fontSize: 13.5, color: '#7cce06', lineHeight: 21 },
    bulletText: {
        flex: 1, fontSize: 13.5, color: 'rgba(255,255,255,0.72)', lineHeight: 21,
    },
});
