import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { ScreenBackground } from '../components/ScreenBackground';

export default function HelpSupportScreen() {
    const { colors } = useTheme();
    const router = useRouter();

    const handleContactSupport = () => {
        Linking.openURL('mailto:support@treyo.com?subject=Help Request');
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
                <Text style={[styles.headerTitle, { color: colors.text }]}>Help & Support</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Contact Us</Text>

                <TouchableOpacity style={[styles.contactCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]} onPress={handleContactSupport}>
                    <View style={styles.contactIcon}>
                        <Ionicons name="mail" size={24} color="#7cce06" />
                    </View>
                    <View style={styles.contactInfo}>
                        <Text style={[styles.contactTitle, { color: colors.text }]}>Email Support</Text>
                        <Text style={[styles.contactDescription, { color: colors.textSecondary }]}>support@treyo.com</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
                </TouchableOpacity>

                <TouchableOpacity style={[styles.contactCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]} onPress={handleWhatsApp}>
                    <View style={styles.contactIcon}>
                        <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
                    </View>
                    <View style={styles.contactInfo}>
                        <Text style={[styles.contactTitle, { color: colors.text }]}>WhatsApp</Text>
                        <Text style={[styles.contactDescription, { color: colors.textSecondary }]}>+216 12 345 678</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
                </TouchableOpacity>

                <Text style={[styles.sectionTitle, { color: colors.text }]}>Frequently Asked Questions</Text>

                <FAQItem
                    question="How do I enroll in a course?"
                    answer="Browse courses, click on one you like, and tap the 'Enroll' button."
                    onPress={() => handleFAQ('enroll')}
                    colors={colors}
                />
                <FAQItem
                    question="How do I contact my trainer?"
                    answer="Go to the Messages tab and select your trainer from the list."
                    onPress={() => handleFAQ('contact')}
                    colors={colors}
                />
                <FAQItem
                    question="Can I get a refund?"
                    answer="Refunds are available within 7 days of enrollment if you haven't completed more than 20% of the course."
                    onPress={() => handleFAQ('refund')}
                    colors={colors}
                />
                <FAQItem
                    question="How do I earn certificates?"
                    answer="Complete all course modules and pass the final assessment to earn your certificate."
                    onPress={() => handleFAQ('certificates')}
                    colors={colors}
                />

                <Text style={[styles.sectionTitle, { color: colors.text }]}>Resources</Text>

                <ResourceItem
                    icon="book-outline"
                    title="User Guide"
                    description="Learn how to use Treyo effectively"
                    onPress={() => console.log('User Guide')}
                    colors={colors}
                />
                <ResourceItem
                    icon="videocam-outline"
                    title="Video Tutorials"
                    description="Watch step-by-step video guides"
                    onPress={() => console.log('Videos')}
                    colors={colors}
                />
                <ResourceItem
                    icon="shield-checkmark-outline"
                    title="Privacy Policy"
                    description="How we protect your data"
                    onPress={() => console.log('Privacy')}
                    colors={colors}
                />
                <ResourceItem
                    icon="document-text-outline"
                    title="Terms of Service"
                    description="Our terms and conditions"
                    onPress={() => console.log('Terms')}
                    colors={colors}
                />
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