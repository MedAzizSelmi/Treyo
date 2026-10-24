import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { authService, studentService } from '../../../services/api';
import { ScreenBackground } from '../../../components/ScreenBackground';
import { useTranslation } from 'react-i18next';

/**
 * Learner onboarding, step 1 of 4: phone and address — the same step
 * trainers have.
 *
 * Added in October 2026 with the automated group flow: when too few
 * learners have paid for a group near its deadline, an administrator
 * phones the ones who have not, and learners had never been asked for a
 * number. Pre-filled from the profile, so a learner resuming onboarding
 * does not type it twice.
 */
export default function StudentOnboardingContact() {
    const router = useRouter();
    const { t } = useTranslation();
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [town, setTown] = useState('');
    const [state, setState] = useState('');
    const [postCode, setPostCode] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        studentService.getMyProfile()
            .then((p: any) => {
                if (!p) return;
                setPhone(p.phone || '');
                setAddress(p.address || '');
                setTown(p.city || '');
                setState(p.state || '');
                setPostCode(p.postalCode || '');
            })
            .catch(() => {});
    }, []);

    const handleSignOut = async () => {
        await authService.logout();
        router.replace('/' as any);
    };

    const handleNext = async () => {
        if (!phone.trim() || !address.trim() || !town.trim() || !state.trim() || !postCode.trim()) {
            Alert.alert(t('common.error'), t('trainerOnboarding.fillRequired'));
            return;
        }
        setLoading(true);
        try {
            await studentService.updateContact({
                phone: phone.trim(),
                address: address.trim(),
                city: town.trim(),
                state: state.trim(),
                postalCode: postCode.trim(),
            });
            router.replace('/onboarding/student/step1' as any);
        } catch (error) {
            Alert.alert(t('common.error'), t('trainerOnboarding.saveFailed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScreenBackground>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Nothing sits behind onboarding to go back to; signing
                        out returns to the welcome screen. */}
                    <TouchableOpacity style={styles.signOut} onPress={handleSignOut}>
                        <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.7)" />
                        <Text style={styles.signOutText}>{t('trainerOnboarding.signOut')}</Text>
                    </TouchableOpacity>

                    <View style={styles.header}>
                        <Text style={styles.title}>{t('trainerOnboarding.contactTitle')}</Text>
                        <Text style={styles.subtitle}>{t('studentOnboarding.contactSubtitle')}</Text>
                        <Text style={styles.step}>{t('trainerOnboarding.stepOf', { step: 1, total: 4 })}</Text>
                    </View>

                    <View style={styles.progressContainer}>
                        <View style={[styles.progressBar, { width: '25%' }]} />
                    </View>

                    <View style={styles.glassCard}>
                        <BlurView intensity={22} tint="light" style={StyleSheet.absoluteFill} />

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>{t('trainerOnboarding.phone')}</Text>
                            <View style={styles.inputContainer}>
                                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                <Ionicons name="call-outline" size={20} color="#666" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="+216 12 345 678"
                                    placeholderTextColor="#555"
                                    value={phone}
                                    onChangeText={setPhone}
                                    keyboardType="phone-pad"
                                />
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>{t('trainerOnboarding.address')}</Text>
                            <View style={styles.inputContainer}>
                                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                <Ionicons name="home-outline" size={20} color="#666" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder={t('trainerOnboarding.addressPh')}
                                    placeholderTextColor="#555"
                                    value={address}
                                    onChangeText={setAddress}
                                />
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>{t('trainerOnboarding.town')}</Text>
                            <View style={styles.inputContainer}>
                                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                <Ionicons name="location-outline" size={20} color="#666" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder={t('trainerOnboarding.townPh')}
                                    placeholderTextColor="#555"
                                    value={town}
                                    onChangeText={setTown}
                                />
                            </View>
                        </View>

                        <View style={styles.row}>
                            <View style={[styles.inputGroup, { flex: 1 }]}>
                                <Text style={styles.label}>{t('trainerOnboarding.state')}</Text>
                                <View style={styles.inputContainer}>
                                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                    <TextInput
                                        style={styles.input}
                                        placeholder={t('trainerOnboarding.statePh')}
                                        placeholderTextColor="#555"
                                        value={state}
                                        onChangeText={setState}
                                    />
                                </View>
                            </View>

                            <View style={[styles.inputGroup, { flex: 1 }]}>
                                <Text style={styles.label}>{t('trainerOnboarding.postCode')}</Text>
                                <View style={styles.inputContainer}>
                                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="1234"
                                        placeholderTextColor="#555"
                                        value={postCode}
                                        onChangeText={setPostCode}
                                        keyboardType="number-pad"
                                    />
                                </View>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={[styles.continueButton, loading && { opacity: 0.6 }]}
                            onPress={handleNext}
                            disabled={loading}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.continueButtonText}>
                                {loading ? t('trainerOnboarding.saving') : t('trainerOnboarding.continue')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    scrollContent: { flexGrow: 1, paddingTop: 60, paddingBottom: 40, paddingHorizontal: 24 },

    header: { marginBottom: 24 },
    title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 8 },
    subtitle: { fontSize: 16, color: '#aaaaaa', marginBottom: 8 },
    step: { fontSize: 14, color: '#7cce06', fontWeight: '600' },

    signOut: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12, marginBottom: 4 },
    signOutText: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
    progressContainer: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 32 },
    progressBar: { height: 4, backgroundColor: '#7cce06', borderRadius: 2 },

    glassCard: {
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(124, 206, 6, 0.6)',
        padding: 20,
        marginBottom: 40,
    },

    inputGroup: { marginBottom: 20 },
    label: { fontSize: 14, fontWeight: '600', color: '#ffffff', marginBottom: 8 },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        overflow: 'hidden',
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    inputIcon: { marginRight: 12 },
    input: { flex: 1, fontSize: 16, color: '#ffffff', paddingVertical: 16 },
    row: { flexDirection: 'row', gap: 12 },

    continueButton: {
        backgroundColor: '#f5f0e0',
        borderRadius: 30,
        paddingVertical: 14,
        paddingHorizontal: 50,
        alignItems: 'center',
        alignSelf: 'center',
        marginTop: 16,
    },
    continueButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1a1a1a',
    },
});
