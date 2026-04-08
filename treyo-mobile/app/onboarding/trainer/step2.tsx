import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Modal } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { authService } from '../../../services/api';
import api from '../../../services/api';
import { ScreenBackground } from '../../../components/ScreenBackground';

const AFFINDA_API_KEY = 'aff_843f6171e970155a546144a7181ae56e0e1d74ec';

const EDUCATION_LEVELS = [
    "High School",
    "Bachelor's Degree",
    "Master's Degree",
    "PhD",
    "Professional Certification",
    "Other",
];

// Maps Affinda education data to our dropdown options
function mapEducationLevel(edu: any): string {
    // Try accreditation.educationLevel first (e.g. "bachelor", "master", "doctorate")
    const level = (edu?.accreditation?.educationLevel || '').toLowerCase();
    // Fallback to accreditation.education (e.g. "Bachelor of Science")
    const name = (edu?.accreditation?.education || '').toLowerCase();
    // Also check the raw string
    const input = (edu?.accreditation?.inputStr || '').toLowerCase();
    const combined = `${level} ${name} ${input}`;

    if (combined.includes('phd') || combined.includes('doctor') || combined.includes('doctorat')) return 'PhD';
    if (combined.includes('master') || combined.includes('mast') || combined.includes('mba')) return "Master's Degree";
    if (combined.includes('bachelor') || combined.includes('licen') || combined.includes('bsc') || combined.includes('bac+')) return "Bachelor's Degree";
    if (combined.includes('high school') || combined.includes('secondary') || combined.includes('lycée') || combined.includes('baccalaur')) return 'High School';
    if (combined.includes('certif') || combined.includes('diplom')) return 'Professional Certification';
    return 'Other';
}

export default function TrainerOnboardingStep2() {
    const router = useRouter();
    const params = useLocalSearchParams();

    const [cvFile, setCvFile] = useState<any>(null);
    const [parsing, setParsing] = useState(false);
    const [professionalExperience, setProfessionalExperience] = useState('');
    const [keySkills, setKeySkills] = useState('');
    const [educationLevel, setEducationLevel] = useState('');
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

            const response = await fetch('https://api.affinda.com/v2/resumes', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${AFFINDA_API_KEY}`,
                    Accept: 'application/json',
                },
                body: formData,
            });

            const json = await response.json();
            const parsed = json?.data;
            if (!parsed) return;

            // Professional experience — prefer summary, fallback to work history
            if (parsed.summary) {
                setProfessionalExperience(parsed.summary.substring(0, 120));
            } else if (parsed.workExperience?.length > 0) {
                const exp = parsed.workExperience
                    .map((w: any) => [w.jobTitle, w.organization].filter(Boolean).join(' at '))
                    .join(', ');
                setProfessionalExperience(exp.substring(0, 120));
            }

            // Key skills
            if (parsed.skills?.length > 0) {
                const skills = parsed.skills.map((s: any) => s.name).filter(Boolean).join(', ');
                setKeySkills(skills.substring(0, 120));
            }

            // Education level — pass the full education object for field matching
            if (parsed.education?.length > 0) {
                setEducationLevel(mapEducationLevel(parsed.education[0]));
            }
        } catch (error) {
            console.log('Affinda CV parse failed — fill manually');
        } finally {
            setParsing(false);
        }
    };

    const handleContinue = async () => {
        if (!professionalExperience || !keySkills || !educationLevel) {
            Alert.alert('Required Fields', 'Please fill in all required fields');
            return;
        }

        setLoading(true);
        try {
            const user = await authService.getCurrentUser();
            if (!user?.userId) {
                Alert.alert('Error', 'User not found. Please login again.');
                return;
            }

            const skillsArray = keySkills.split(',').map((s: string) => s.trim()).filter(Boolean);

            await api.put(`/trainers/me/profile/page2?trainerId=${user.userId}`, {
                cvUrl: cvFile?.uri || null,
                professionalExperience,
                specializations: skillsArray.slice(0, 5),
                experienceYears: 0,
                education: educationLevel,
                skills: skillsArray,
                linkedinUrl: null,
                githubUrl: null,
                portfolioUrl: null,
            });

            router.push({
                pathname: '/onboarding/trainer/step3' as any,
                params: {
                    ...params,
                    experience: professionalExperience,
                    education: educationLevel,
                    skills: keySkills,
                },
            });
        } catch (error) {
            Alert.alert('Error', 'Failed to save. Please try again.');
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
                    <Text style={styles.title}>Upload your resume</Text>
                    <Text style={styles.step}>Step 2 of 4</Text>
                </View>

                <View style={styles.progressContainer}>
                    <View style={[styles.progressBar, { width: '50%' }]} />
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
                            <Text style={styles.uploadText}>Parsing your CV...</Text>
                            <Text style={styles.uploadSubtext}>Fields will fill automatically</Text>
                        </>
                    ) : cvFile ? (
                        <>
                            <Ionicons name="document-text" size={44} color="#7cce06" />
                            <Text style={styles.uploadText} numberOfLines={1}>{cvFile.name}</Text>
                            <Text style={styles.uploadSubtext}>Tap to change</Text>
                        </>
                    ) : (
                        <>
                            <View style={styles.uploadIconWrapper}>
                                <Ionicons name="cloud-upload-outline" size={44} color="#ffffff" />
                            </View>
                            <Text style={styles.uploadText}>Select CV / Resume</Text>
                            <Text style={styles.uploadSubtext}>PDF or Word — fields auto-fill</Text>
                        </>
                    )}
                </TouchableOpacity>

                {/* Required Fields Card */}
                <View style={styles.fieldsCard}>
                    <BlurView intensity={22} tint="light" style={StyleSheet.absoluteFill} />

                    {/* Card Header */}
                    <View style={styles.cardHeader}>
                        <View style={styles.cardTitleRow}>
                            <Text style={styles.cardTitle}>Required CV Fields</Text>
                            <Text style={styles.nonSkippable}> (Non-Skippable)</Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setCvFile(null)}
                            style={styles.closeButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Ionicons name="close" size={22} color="#aaaaaa" />
                        </TouchableOpacity>
                    </View>

                    {/* Professional Experience */}
                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Professional Experience</Text>
                        <View style={styles.inputContainer}>
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. 5 years in web development, led teams of 10..."
                                placeholderTextColor="#555"
                                value={professionalExperience}
                                onChangeText={(t) => setProfessionalExperience(t.slice(0, 120))}
                                multiline
                            />
                            <Text style={styles.charCount}>{professionalExperience.length}/120</Text>
                        </View>
                    </View>

                    {/* Key Skills */}
                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Key Skills</Text>
                        <View style={styles.inputContainer}>
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. React, Node.js, Python, Figma..."
                                placeholderTextColor="#555"
                                value={keySkills}
                                onChangeText={(t) => setKeySkills(t.slice(0, 120))}
                                multiline
                            />
                            <Text style={styles.charCount}>{keySkills.length}/120</Text>
                        </View>
                    </View>

                    {/* Education Level */}
                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Education Level</Text>
                        <TouchableOpacity
                            style={styles.dropdownContainer}
                            onPress={() => setShowEduPicker(true)}
                            activeOpacity={0.8}
                        >
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            <Text style={[styles.dropdownText, !educationLevel && styles.dropdownPlaceholder]}>
                                {educationLevel || 'Select your education level'}
                            </Text>
                            <Ionicons name="chevron-down" size={20} color="#aaaaaa" />
                        </TouchableOpacity>
                    </View>

                    {/* Continue Button */}
                    <TouchableOpacity
                        style={[styles.continueButton, loading && { opacity: 0.6 }]}
                        onPress={handleContinue}
                        disabled={loading}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.continueButtonText}>
                            {loading ? 'Saving...' : 'Continue'}
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
                        <Text style={styles.modalTitle}>Education Level</Text>
                        {EDUCATION_LEVELS.map((level) => (
                            <TouchableOpacity
                                key={level}
                                style={[styles.modalOption, educationLevel === level && styles.modalOptionSelected]}
                                onPress={() => { setEducationLevel(level); setShowEduPicker(false); }}
                            >
                                <Text style={[styles.modalOptionText, educationLevel === level && styles.modalOptionTextSelected]}>
                                    {level}
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

    continueButton: {
        backgroundColor: '#f5f0e0',
        borderRadius: 30,
        paddingVertical: 14,
        paddingHorizontal: 50,
        alignItems: 'center',
        marginTop: 8,
        alignSelf: 'center',
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
