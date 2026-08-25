import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { ScreenBackground } from '../components/ScreenBackground';

export default function HelpSupportScreen() {
    const { colors } = useTheme();
    const router = useRouter();
    const { t } = useTranslation();

    const handleContactSupport = () => {
        Linking.openURL('mailto:support@lean-consulting.com?subject=Help Request');
    };

    const handleWhatsApp = () => {
        Linking.openURL('https://wa.me/21612345678');
    };

    const handleFAQ = (question: string) => {
        // TODO: Navigate to specific FAQ or expand inline
        console.log('FAQ:', question);
    };

    return (
        <ScreenBackground style={styles.container}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>{t('help.title')}</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('help.contactUs')}</Text>

                <TouchableOpacity style={[styles.contactCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]} onPress={handleContactSupport}>
                    <View style={styles.contactIcon}>
                        <Ionicons name="mail" size={24} color="#7cce06" />
                    </View>
                    <View style={styles.contactInfo}>
                        <Text style={[styles.contactTitle, { color: colors.text }]}>{t('help.emailSupport')}</Text>
                        <Text style={[styles.contactDescription, { color: colors.textSecondary }]}>support@lean-consulting.com</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
                </TouchableOpacity>

                <TouchableOpacity style={[styles.contactCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]} onPress={handleWhatsApp}>
                    <View style={styles.contactIcon}>
                        <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
                    </View>
                    <View style={styles.contactInfo}>
                        <Text style={[styles.contactTitle, { color: colors.text }]}>{t('help.whatsapp')}</Text>
                        <Text style={[styles.contactDescription, { color: colors.textSecondary }]}>+216 12 345 678</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
                </TouchableOpacity>

                <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('help.faq')}</Text>

                <FAQItem
                    question={t('help.faqEnrollQ')}
                    answer={t('help.faqEnrollA')}
                    onPress={() => handleFAQ('enroll')}
                    colors={colors}
                />
                <FAQItem
                    question={t('help.faqContactQ')}
                    answer={t('help.faqContactA')}
                    onPress={() => handleFAQ('contact')}
                    colors={colors}
                />
                <FAQItem
                    question={t('help.faqRefundQ')}
                    answer={t('help.faqRefundA')}
                    onPress={() => handleFAQ('refund')}
                    colors={colors}
                />
                <FAQItem
                    question={t('help.faqCertsQ')}
                    answer={t('help.faqCertsA')}
                    onPress={() => handleFAQ('certificates')}
                    colors={colors}
                />

                <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('help.resources')}</Text>

                <ResourceItem
                    icon="book-outline"
                    title={t('help.userGuide')}
                    description={t('help.userGuideDesc')}
                    onPress={() => console.log('User Guide')}
                    colors={colors}
                />
                <ResourceItem
                    icon="videocam-outline"
                    title={t('help.videoTutorials')}
                    description={t('help.videoTutorialsDesc')}
                    onPress={() => console.log('Videos')}
                    colors={colors}
                />
                {/* Privacy Policy and Terms of Service intentionally live
                    only under Settings > Support & Legal — they were
                    duplicated here, which meant two entry points to the
                    same documents. */}
            </ScrollView>
        </ScreenBackground>
    );
}

function FAQItem({ question, answer, onPress, colors }: any) {
    return (
        <TouchableOpacity style={[styles.faqItem, { backgroundColor: colors.backgroundSecondary }]} onPress={onPress}>
            <Text style={[styles.faqQuestion, { color: colors.text }]}>{question}</Text>
            <Text style={[styles.faqAnswer, { color: colors.textSecondary }]}>{answer}</Text>
        </TouchableOpacity>
    );
}

function ResourceItem({ icon, title, description, onPress, colors }: any) {
    return (
        <TouchableOpacity style={[styles.resourceItem, { borderBottomColor: colors.border }]} onPress={onPress}>
            <Ionicons name={icon} size={24} color="#7cce06" />
            <View style={styles.resourceInfo}>
                <Text style={[styles.resourceTitle, { color: colors.text }]}>{title}</Text>
                <Text style={[styles.resourceDescription, { color: colors.textSecondary }]}>{description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, borderBottomWidth: 1 },
    backButton: { width: 40, height: 40, justifyContent: 'center' },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },
    content: { flex: 1, padding: 20 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', marginTop: 8, marginBottom: 16 },
    contactCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1 },
    contactIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#f0fde4', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    contactInfo: { flex: 1 },
    contactTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
    contactDescription: { fontSize: 13 },
    faqItem: { borderRadius: 12, padding: 16, marginBottom: 12 },
    faqQuestion: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
    faqAnswer: { fontSize: 13, lineHeight: 20 },
    resourceItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1 },
    resourceInfo: { flex: 1, marginLeft: 12 },
    resourceTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
    resourceDescription: { fontSize: 13 },
});