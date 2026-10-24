import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Modal } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { authService, fetchUpload } from '../../../services/api';
import api from '../../../services/api';
import { ScreenBackground } from '../../../components/ScreenBackground';
import { extractCvLinks } from '../../../utils/cvLinks';
import { useTranslation } from 'react-i18next';
import { EDUCATION_LEVELS, educationLabel } from '../../../utils/educationLevels';
import { ExperienceEditor } from '../../../components/ExperienceEditor';
import { SkillPicker, skillsFromCv } from '../../../components/SkillPicker';
import { ExperienceEntry, entryProblem, fromAffinda } from '../../../utils/experience';


// Maps Affinda education data to our dropdown options
function mapEducationLevel(edu: any): string {
    const level = (edu?.accreditation?.educationLevel || '').toLowerCase();
    const name = (edu?.accreditation?.education || '').toLowerCase();
    const input = (edu?.accreditation?.inputStr || '').toLowerCase();
    const combined = `${level} ${name} ${input}`;

    if (combined.includes('phd') || combined.includes('doctor') || combined.includes('doctorat')) return 'PhD';
    if (combined.includes('master') || combined.includes('mast') || combined.includes('mba')) return "Master's Degree";
    if (combined.includes('bachelor') || combined.includes('licen') || combined.includes('bsc') || combined.includes('bac+')) return "Bachelor's Degree";
    if (combined.includes('high school') || combined.includes('secondary') || combined.includes('lycée') || combined.includes('baccalaur')) return 'High School';
    if (combined.includes('certif') || combined.includes('diplom')) return 'Professional Certification';
    return 'Other';
}

export default function StudentOnboardingStep3() {
    const router = useRouter();
    const { t } = useTranslation();

    const [cvFile, setCvFile] = useState<any>(null);
    const [parsing, setParsing] = useState(false);
    const [experience, setExperience] = useState<ExperienceEntry[]>([]);
    // A learner may have no work history yet; saying so stands in for entries.
    const [noExperience, setNoExperience] = useState(false);
    const [keySkills, setKeySkills] = useState<string[]>([]);
    const [educationLevel, setEducationLevel] = useState('');
    const [linkedinUrl, setLinkedinUrl] = useState('');
    const [portfolioUrl, setPortfolioUrl] = useState('');
    const [showEduPicker, setShowEduPicker] = useState(false);
    const [loading, setLoading] = useState(false);

    const handlePickFile = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: [
                    'application/pdf',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                ],
                copyToCacheDirectory: true,
            });
            if (!result.canceled && result.assets?.[0]) {
                const file = result.assets[0];
                setCvFile(file);
                await parseCvWithAffinda(file);
            }
        } catch (error) {
            console.error('Error picking file:', error);
        }
    };

    const parseCvWithAffinda = async (file: any) => {
        setParsing(true);
        try {
            const formData = new FormData();
            formData.append('file', {
                uri: file.uri,
                name: file.name,
                type: file.mimeType || 'application/pdf',
            } as any);

            // Parsed server-side: the Affinda key stays on the backend
            // instead of being compiled into this bundle, where anyone
            // with the published app could read it. An empty object means
            // "could not parse" — the user fills the form by hand.
            const parsed = await fetchUpload('/cv/parse', formData);
            if (!parsed || Object.keys(parsed).length === 0) return;

            // Work history as entries — organisation, position, dates — for
            // the person to check rather than retype.
            const entries = fromAffinda(parsed.workExperience);
            if (entries.length > 0) {
                setExperience(entries);
                setNoExperience(false);
            }

            // Skills, under the Skills list's own names where they match one.
            if (parsed.skills?.length > 0) {
                setKeySkills(await skillsFromCv(parsed.skills.map((s: any) => s?.name)));
            }

            // Education level — pass the full education object for field matching
            if (parsed.education?.length > 0) {
                setEducationLevel(mapEducationLevel(parsed.education[0]));
            }

            // Optional links — filled only when the CV contains them.
            const links = extractCvLinks(parsed);
            if (links.linkedin) setLinkedinUrl(links.linkedin);
            if (links.portfolio) setPortfolioUrl(links.portfolio);
        } catch (error) {
            console.log('Affinda CV parse failed — fill manually');
        } finally {
            setParsing(false);
        }
    };

    const handleContinue = async () => {
        if (keySkills.length === 0 || !educationLevel) {
            Alert.alert(t('trainerOnboarding.requiredFields'), t('trainerOnboarding.fillRequired'));
            return;
        }
        if (!noExperience) {
            if (experience.length === 0) {
                Alert.alert(t('trainerOnboarding.requiredFields'), t('experience.addOneOrNone'));
                return;
            }
            const problem = experience.map(entryProblem).find(Boolean);
            if (problem) {
                Alert.alert(t('trainerOnboarding.requiredFields'), t(problem));
                return;
            }
        }

        setLoading(true);
        try {
            const user = await authService.getCurrentUser();
            if (!user?.userId) {
                Alert.alert(t('common.error'), t('trainerOnboarding.userNotFound'));
                return;
            }

            await api.put(`/students/me/profile?studentId=${user.userId}`, {
                cvUrl: cvFile?.uri || null,
                // The server writes the readable text from the entries.
                experienceEntries: noExperience ? [] : experience,
                keySkills,
                educationLevel,
                trainingDomain: null,
                linkedinUrl: linkedinUrl.trim() || null,
                portfolioUrl: portfolioUrl.trim() || null,
            });

            router.replace({
                pathname: '/success' as any,
                params: {
                    message: t('studentOnboarding.done'),
                    nextRoute: '/(student-tabs)/home',
                },
            });
        } catch (error) {
            Alert.alert(t('common.error'), t('trainerOnboarding.saveFailed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScreenBackground>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>{t('trainerOnboarding.uploadTitle')}</Text>
                    <Text style={styles.step}>{t('trainerOnboarding.stepOf', { step: 4, total: 4 })}</Text>
                </View>

                <View style={styles.progressContainer}>
                    <View style={[styles.progressBar, { width: '100%' }]} />
                </View>

                {/* CV Upload Box */}
                <TouchableOpacity
                    style={styles.uploadBox}
                    onPress={handlePickFile}
                    activeOpacity={0.8}
                >
                    <BlurView intensity={22} tint="light" style={StyleSheet.absoluteFill} />
                    {parsing ? (
                        <>
                            <Ionicons name="sync" size={44} color="#7cce06" />
                            <Text style={styles.uploadText}>{t('trainerOnboarding.parsing')}</Text>
                            <Text style={styles.uploadSubtext}>{t('trainerOnboarding.autoFill')}</Text>
                        </>
                    ) : cvFile ? (
                        <>
                            <Ionicons name="document-text" size={44} color="#7cce06" />
                            <Text style={styles.uploadText} numberOfLines={1}>{cvFile.name}</Text>
                            <Text style={styles.uploadSubtext}>{t('trainerOnboarding.tapToChange')}</Text>
                        </>
                    ) : (
                        <>
                            <View style={styles.uploadIconWrapper}>
                                <Ionicons name="cloud-upload-outline" size={44} color="#ffffff" />
                            </View>
                            <Text style={styles.uploadText}>{t('trainerOnboarding.selectCv')}</Text>
                            <Text style={styles.uploadSubtext}>{t('studentOnboarding.cvHint')}</Text>
                        </>
                    )}
                </TouchableOpacity>

                {/* Required Fields Card */}
                <View style={styles.fieldsCard}>
                    <BlurView intensity={22} tint="light" style={StyleSheet.absoluteFill} />

                    {/* Card Header */}
                    <View style={styles.cardHeader}>
                        <View style={styles.cardTitleRow}>
                            <Text style={styles.cardTitle}>{t('trainerOnboarding.cvFieldsTitle')}</Text>
                            <Text style={styles.nonSkippable}>{t('trainerOnboarding.nonSkippable')}</Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setCvFile(null)}
                            style={styles.closeButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Ionicons name="close" size={22} color="#aaaaaa" />
                        </TouchableOpacity>
                    </View>

                    {/* Professional Experience — one entry at a time, not a
                        paragraph to write (October 2026). */}
                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>{t('editProfile.professionalExperience')}</Text>
                        {/* A learner may not have worked yet; a trainer must have. */}
                        <TouchableOpacity
                            style={styles.noExpRow}
                            onPress={() => setNoExperience(v => !v)}
                            activeOpacity={0.8}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: noExperience }}
                        >
                            <View style={[styles.noExpBox, noExperience && styles.noExpBoxOn]}>
                                {noExperience && <Ionicons name="checkmark" size={14} color="#000" />}
                            </View>
                            <Text style={styles.noExpText}>{t('experience.none')}</Text>
                        </TouchableOpacity>
                        {!noExperience && <ExperienceEditor value={experience} onChange={setExperience} />}
                    </View>

                    {/* Key Skills — suggested from the Skills list as one types. */}
                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>{t('editProfile.keySkills')}</Text>
                        <SkillPicker value={keySkills} onChange={setKeySkills} />
                    </View>

                    {/* Education Level */}
                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>{t('editProfile.educationLevel')}</Text>
                        <TouchableOpacity
                            style={styles.dropdownContainer}
                            onPress={() => setShowEduPicker(true)}
                            activeOpacity={0.8}
                        >
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            <Text style={[styles.dropdownText, !educationLevel && styles.dropdownPlaceholder]}>
                                {educationLevel ? educationLabel(t, educationLevel) : t('trainerOnboarding.selectEducation')}
                            </Text>
                            <Ionicons name="chevron-down" size={20} color="#aaaaaa" />
                        </TouchableOpacity>
                    </View>

                    {/* LinkedIn URL */}
                    <View style={styles.fieldGroup}>
                        <View style={styles.optionalLabelRow}>
                            <Text style={styles.fieldLabel}>LinkedIn</Text>
                            <Text style={styles.optionalTag}>{t('editProfile.optional')}</Text>
                        </View>
                        <View style={styles.urlInputContainer}>
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            <Ionicons name="logo-linkedin" size={18} color="#7cce06" style={{ marginRight: 8 }} />
                            <TextInput
                                style={styles.urlInput}
                                placeholder="https://linkedin.com/in/your-profile"
                                placeholderTextColor="#555"
                                value={linkedinUrl}
                                onChangeText={setLinkedinUrl}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="url"
                            />
                        </View>
                    </View>

                    {/* Portfolio URL */}
                    <View style={styles.fieldGroup}>
                        <View style={styles.optionalLabelRow}>
                            <Text style={styles.fieldLabel}>Portfolio</Text>
                            <Text style={styles.optionalTag}>{t('editProfile.optional')}</Text>
                        </View>
                        <View style={styles.urlInputContainer}>
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            <Ionicons name="globe-outline" size={18} color="#7cce06" style={{ marginRight: 8 }} />
                            <TextInput
                                style={styles.urlInput}
                                placeholder="https://your-portfolio.com"
                                placeholderTextColor="#555"
                                value={portfolioUrl}
                                onChangeText={setPortfolioUrl}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="url"
                            />
                        </View>
                    </View>

                    {/* Finish Button */}
                    <TouchableOpacity
                        style={[styles.continueButton, loading && { opacity: 0.6 }]}
                        onPress={handleContinue}
                        disabled={loading}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.continueButtonText}>
                            {loading ? t('trainerOnboarding.saving') : t('studentOnboarding.finish')}
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>

            {/* Education Level Picker Modal */}
            <Modal visible={showEduPicker} transparent animationType="slide">
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setShowEduPicker(false)}
                >
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{t('editProfile.educationLevel')}</Text>
                        {EDUCATION_LEVELS.map((level) => (
                            <TouchableOpacity
                                key={level}
                                style={[styles.modalOption, educationLevel === level && styles.modalOptionSelected]}
                                onPress={() => { setEducationLevel(level); setShowEduPicker(false); }}
                            >
                                <Text style={[styles.modalOptionText, educationLevel === level && styles.modalOptionTextSelected]}>
                                    {educationLabel(t, level)}
                                </Text>
                                {educationLevel === level && (
                                    <Ionicons name="checkmark" size={18} color="#7cce06" />
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
            </Modal>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    noExpRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    noExpBox: {
        width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
        alignItems: 'center', justifyContent: 'center',
    },
    noExpBoxOn: { backgroundColor: '#7cce06', borderColor: '#7cce06' },
    noExpText: { flex: 1, color: '#dddddd', fontSize: 14 },

    scrollContent: { flexGrow: 1, paddingTop: 60, paddingBottom: 40, paddingHorizontal: 20 },

    header: { marginBottom: 20 },
    title: { fontSize: 26, fontWeight: 'bold', color: '#ffffff', marginBottom: 6 },
    step: { fontSize: 13, color: '#7cce06', fontWeight: '600' },

    progressContainer: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 28 },
    progressBar: { height: 4, backgroundColor: '#7cce06', borderRadius: 2 },

    uploadBox: {
        borderRadius: 22,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: '#7cce06',
        paddingVertical: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        gap: 6,
    },
    uploadIconWrapper: {
        width: 64,
        height: 64,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    uploadText: { fontSize: 16, color: '#ffffff', fontWeight: '600' },
    uploadSubtext: { fontSize: 13, color: '#aaaaaa' },

    fieldsCard: {
        borderRadius: 22,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: '#7cce06',
        padding: 20,
        marginBottom: 40,
    },

    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
    cardTitle: { fontSize: 17, fontWeight: 'bold', color: '#7cce06' },
    nonSkippable: { fontSize: 13, color: '#aaaaaa' },
    closeButton: { padding: 2 },

    fieldGroup: { marginBottom: 20 },
    fieldLabel: { fontSize: 14, fontWeight: '600', color: '#ffffff', marginBottom: 8 },

    inputContainer: {
        borderRadius: 14,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 8,
    },
    input: {
        color: '#ffffff',
        fontSize: 15,
        minHeight: 60,
        textAlignVertical: 'top',
    },
    charCount: { fontSize: 11, color: '#555', textAlign: 'right', marginTop: 4 },

    dropdownContainer: {
        borderRadius: 14,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    dropdownText: { fontSize: 15, color: '#ffffff', flex: 1 },
    dropdownPlaceholder: { color: '#555' },

    optionalLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    optionalTag: {
        fontSize: 11, fontWeight: '600', color: '#888',
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
    },
    urlInputContainer: {
        flexDirection: 'row', alignItems: 'center',
        borderRadius: 14, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
        paddingHorizontal: 16, paddingVertical: 12,
    },
    urlInput: { flex: 1, fontSize: 15, color: '#ffffff', padding: 0 },

    continueButton: {
        backgroundColor: '#f5f0e0',
        borderRadius: 30,
        paddingVertical: 14,
        paddingHorizontal: 50,
        alignItems: 'center',
        alignSelf: 'center',
        marginTop: 8,
    },
    continueButtonText: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalContent: {
        backgroundColor: '#160e45',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    modalTitle: { fontSize: 17, fontWeight: 'bold', color: '#7cce06', marginBottom: 16 },
    modalOption: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    modalOptionSelected: { backgroundColor: 'rgba(124,206,6,0.08)', borderRadius: 8, paddingHorizontal: 8 },
    modalOptionText: { fontSize: 15, color: '#cccccc' },
    modalOptionTextSelected: { color: '#7cce06', fontWeight: '600' },
});
