import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useCallback, useEffect, useState } from 'react';
import api, { authService, skillService, type SkillOption } from '../../../services/api';
import { ScreenBackground } from '../../../components/ScreenBackground';
import { useTranslation } from 'react-i18next';

/**
 * Learner onboarding: the skills they want to develop, under the fields
 * chosen on the previous screen.
 *
 * The list comes from the administrators (dashboard → Skills) since
 * October 2026; it used to be written here, so a field could never gain a
 * skill without a new release. A skill is saved under its English name, as
 * before — that is what the profile stores and the recommendation engine
 * reads — and shown in the app's language when the dashboard has a
 * translation.
 *
 * The learner confirms the choice before going on: these are the skills
 * they want to develop now, and what their recommendations will follow.
 */
export default function StudentOnboardingStep2() {
    const router = useRouter();
    const { t, i18n } = useTranslation();
    const params = useLocalSearchParams();
    const selectedFields = (params.fields as string)?.split(',').filter(Boolean) || [];

    const [skills, setSkills] = useState<SkillOption[]>([]);
    const [loadingSkills, setLoadingSkills] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
    const [confirmed, setConfirmed] = useState(false);
    const [loading, setLoading] = useState(false);

    const loadSkills = useCallback(async () => {
        setLoadingSkills(true);
        setLoadFailed(false);
        try {
            setSkills(await skillService.forFields(selectedFields));
        } catch (_) {
            setLoadFailed(true);
        } finally {
            setLoadingSkills(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.fields]);

    useEffect(() => { loadSkills(); }, [loadSkills]);

    /** The skill's name in the app's language, or its English name. */
    const shown = (s: SkillOption) => {
        const lang = (i18n.language || '').slice(0, 2);
        return (lang === 'fr' && s.nameFr) || (lang === 'ar' && s.nameAr) || (lang === 'es' && s.nameEs) || s.name;
    };

    const toggleInterest = (name: string) => {
        if (selectedInterests.includes(name)) {
            setSelectedInterests(selectedInterests.filter(i => i !== name));
        } else {
            setSelectedInterests([...selectedInterests, name]);
        }
    };

    const handleNext = async () => {
        if (selectedInterests.length === 0) {
            Alert.alert(t('common.error'), t('studentOnboarding.pickInterest'));
            return;
        }
        if (!confirmed) {
            Alert.alert(t('common.error'), t('studentOnboarding.confirmRequired'));
            return;
        }

        setLoading(true);
        try {
            const user = await authService.getCurrentUser();
            if (!user || !user.userId) {
                Alert.alert(t('common.error'), t('trainerOnboarding.userNotFound'));
                return;
            }

            await api.put(`/students/me/interests?studentId=${user.userId}`, {
                primaryDomains: selectedFields,
                specificInterests: selectedInterests,
                experienceLevel: 'beginner',
            });

            router.replace({
                pathname: '/onboarding/student/step3' as any,
                params: { fields: params.fields, interests: selectedInterests.join(',') },
            });
        } catch (error) {
            console.error('Error saving interests:', error);
            Alert.alert(t('common.error'), t('studentOnboarding.interestsSaveFailed'));
            // A skill may have been hidden meanwhile: show the list as it is now.
            loadSkills();
        } finally {
            setLoading(false);
        }
    };

    const canContinue = selectedInterests.length > 0 && confirmed && !loading;

    return (
        <ScreenBackground>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.header}>
                    <Text style={styles.title}>{t('studentOnboarding.interestsTitle')}</Text>
                    <Text style={styles.subtitle}>{t('studentOnboarding.interestsSubtitle')}</Text>
                    <Text style={styles.step}>{t('trainerOnboarding.stepOf', { step: 3, total: 4 })}</Text>
                </View>

                <View style={styles.progressContainer}>
                    <View style={[styles.progressBar, { width: '75%' }]} />
                </View>

                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={20} color="#aaaaaa" />
                    <Text style={styles.backText}>{t('common.back')}</Text>
                </TouchableOpacity>

                {/* Glass card wrapping chips and button */}
                <View style={styles.glassCard}>
                    <BlurView intensity={22} tint="light" style={StyleSheet.absoluteFill} />

                    {loadingSkills ? (
                        <ActivityIndicator size="large" color="#7cce06" style={{ marginVertical: 30 }} />
                    ) : loadFailed ? (
                        <View style={styles.notice}>
                            <Text style={styles.noticeText}>{t('studentOnboarding.skillsLoadFailed')}</Text>
                            <TouchableOpacity onPress={loadSkills} style={styles.retryBtn}>
                                <Text style={styles.retryText}>{t('common.retry')}</Text>
                            </TouchableOpacity>
                        </View>
                    ) : skills.length === 0 ? (
                        <View style={styles.notice}>
                            <Text style={styles.noticeText}>{t('studentOnboarding.noSkills')}</Text>
                            <TouchableOpacity onPress={() => router.back()} style={styles.retryBtn}>
                                <Text style={styles.retryText}>{t('common.back')}</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            {selectedFields.map(field => {
                                const inField = skills.filter(s => s.field === field);
                                if (inField.length === 0) return null;
                                return (
                                    <View key={field} style={styles.fieldBlock}>
                                        {selectedFields.length > 1 && (
                                            <Text style={styles.fieldTitle}>{t(`interestFields.${field}`, { defaultValue: field })}</Text>
                                        )}
                                        <View style={styles.interestsContainer}>
                                            {inField.map(skill => {
                                                const selected = selectedInterests.includes(skill.name);
                                                return (
                                                    <TouchableOpacity
                                                        key={skill.skillId}
                                                        style={[styles.interestChip, selected && styles.interestChipSelected]}
                                                        onPress={() => toggleInterest(skill.name)}
                                                        activeOpacity={0.8}
                                                    >
                                                        <BlurView intensity={selected ? 30 : 22} tint="dark" style={StyleSheet.absoluteFill} />
                                                        <Text style={[styles.interestText, selected && styles.interestTextSelected]}>
                                                            {shown(skill)}
                                                        </Text>
                                                        {selected && (
                                                            <Ionicons name="checkmark-circle" size={18} color="#7cce06" />
                                                        )}
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>
                                );
                            })}

                            {/* The learner confirms the choice before going on. */}
                            <TouchableOpacity
                                style={styles.consentRow}
                                onPress={() => setConfirmed(c => !c)}
                                activeOpacity={0.8}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: confirmed }}
                            >
                                <View style={[styles.checkbox, confirmed && styles.checkboxOn]}>
                                    {confirmed && <Ionicons name="checkmark" size={16} color="#000" />}
                                </View>
                                <Text style={styles.consentText}>{t('studentOnboarding.consent')}</Text>
                            </TouchableOpacity>

                            {/* Continue Button inside card */}
                            <TouchableOpacity
                                style={[styles.continueButton, !canContinue && { opacity: 0.6 }]}
                                onPress={handleNext}
                                disabled={!canContinue}
                                activeOpacity={0.85}
                            >
                                <Text style={styles.continueButtonText}>
                                    {loading ? t('trainerOnboarding.saving') : t('studentOnboarding.nextSelected', { count: selectedInterests.length })}
                                </Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </ScrollView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    scrollContent: { flexGrow: 1, paddingTop: 60, paddingBottom: 40, paddingHorizontal: 20 },

    header: { marginBottom: 24 },
    title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 8 },
    subtitle: { fontSize: 16, color: '#aaaaaa', marginBottom: 8 },
    step: { fontSize: 14, color: '#7cce06', fontWeight: '600' },

    progressContainer: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 24 },
    progressBar: { height: 4, backgroundColor: '#7cce06', borderRadius: 2 },

    backButton: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 8 },
    backText: { fontSize: 16, color: '#aaaaaa' },

    glassCard: {
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#7cce06',
        padding: 16,
        marginBottom: 20,
    },

    fieldBlock: { marginBottom: 8 },
    fieldTitle: { fontSize: 13, fontWeight: '700', color: '#7cce06', marginBottom: 10, letterSpacing: 0.3 },
    interestsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },

    interestChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.12)',
        gap: 8,
        overflow: 'hidden',
    },
    interestChipSelected: { borderColor: '#7cce06' },
    interestText: { fontSize: 15, color: '#cccccc', fontWeight: '500' },
    interestTextSelected: { color: '#7cce06', fontWeight: '600' },

    notice: { alignItems: 'center', paddingVertical: 20, gap: 14 },
    noticeText: { color: '#cccccc', fontSize: 15, textAlign: 'center', lineHeight: 22 },
    retryBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: '#7cce06' },
    retryText: { color: '#7cce06', fontSize: 14, fontWeight: '700' },

    consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 4, marginBottom: 12, paddingVertical: 4 },
    checkbox: {
        width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
        alignItems: 'center', justifyContent: 'center', marginTop: 1,
    },
    checkboxOn: { backgroundColor: '#7cce06', borderColor: '#7cce06' },
    consentText: { flex: 1, color: '#ffffff', fontSize: 14, lineHeight: 21 },

    continueButton: {
        backgroundColor: '#f5f0e0',
        borderRadius: 30,
        paddingVertical: 14,
        paddingHorizontal: 50,
        alignItems: 'center',
        alignSelf: 'center',
        marginTop: 8,
    },
    continueButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1a1a1a',
    },
});
