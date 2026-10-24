import { View, Text, StyleSheet, type TextStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ExperienceEntry, longMonth } from '../utils/experience';

/**
 * Experience entries for reading: the position and organisation, and when,
 * in the app's language. Profiles from before October 2026 have only a
 * paragraph; `fallback` shows it.
 */
export function ExperienceList({ entries, fallback, textStyle }: {
    entries?: ExperienceEntry[] | null;
    fallback?: string | null;
    textStyle?: TextStyle;
}) {
    const { t, i18n } = useTranslation();
    const list = Array.isArray(entries) ? entries : [];
    if (list.length === 0) {
        return <Text style={textStyle}>{fallback || t('profile.notProvided')}</Text>;
    }
    return (
        <View style={styles.list}>
            {list.map((e, i) => (
                <View key={i}>
                    <Text style={[textStyle, styles.title]}>{e.position} · {e.organization}</Text>
                    <Text style={styles.when}>
                        {longMonth(e.from, i18n.language)} – {e.to ? longMonth(e.to, i18n.language) : t('experience.present')}
                    </Text>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    list: { gap: 8 },
    title: { fontWeight: '600' },
    when: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
});
