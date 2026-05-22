import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, Alert, KeyboardAvoidingView, Platform,
    Image, Modal, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { authService, trainerService, fetchUpload, API_BASE_URL } from '../services/api';
import api from '../services/api';
import { ScreenBackground } from '../components/ScreenBackground';

export default function TrainerEditProfileScreen() {
    const router = useRouter();

    // Form state
    const [bio, setBio] = useState('');
    const [linkedinUrl, setLinkedinUrl] = useState('');
    const [portfolioUrl, setPortfolioUrl] = useState('');
    const [profilePic, setProfilePic] = useState<string | null>(null);
    const [localPicUri, setLocalPicUri] = useState<string | null>(null);

    // Page-2 fields (loaded and passed back unchanged unless edited)
    const [specializations, setSpecializations] = useState<string[]>([]);
    const [skills, setSkills] = useState<string[]>([]);
    const [experienceYears, setExperienceYears] = useState('');
    const [education, setEducation] = useState('');
    const [specializationInput, setSpecializationInput] = useState('');
    const [skillInput, setSkillInput] = useState('');

    const [trainerId, setTrainerId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [showPicModal, setShowPicModal] = useState(false);
    const [uploading, setUploading] = useState(false);

    useEffect(() => { loadProfile(); }, []);

    const loadProfile = async () => {
        try {
            const user = await authService.getCurrentUser();
            if (!user?.userId) return;
            setTrainerId(user.userId);
            const res = await api.get(`/trainers/me`, { params: { trainerId: user.userId } });
            const p = res.data;
            setBio(p.bio || '');
            setLinkedinUrl(p.linkedinUrl || '');
            setPortfolioUrl(p.portfolioUrl || '');
            setProfilePic(p.profilePictureUrl || null);
            setSpecializations(p.specializations || []);
            setSkills(p.skills || []);
            setExperienceYears(p.experienceYears ? String(p.experienceYears) : '');
            setEducation(p.education || '');
        } catch (e) {
            console.log('Load trainer profile error', e);
        }
    };

    const handlePickImage = async (source: 'camera' | 'gallery') => {
        setShowPicModal(false);
        try {
            let result;
            if (source === 'camera') {
                const perm = await ImagePicker.requestCameraPermissionsAsync();
                if (!perm.granted) { Alert.alert('Permission needed', 'Camera access is required.'); return; }
                result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
            } else {
                const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (!perm.granted) { Alert.alert('Permission needed', 'Gallery access is required.'); return; }
                result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
            }
            if (!result.canceled && result.assets?.[0]) {
                setLocalPicUri(result.assets[0].uri);
            }
        } catch (e) {
            console.log('Image pick error', e);
        }
    };

    const uploadPicture = async (): Promise<string | null> => {
        if (!localPicUri || !trainerId) return null;
        setUploading(true);
        try {
            const filename = localPicUri.split('/').pop() || 'photo.jpg';
            const match = /\.(\w+)$/.exec(filename);
            const type = match ? `image/${match[1]}` : 'image/jpeg';
            const form = new FormData();
            form.append('file', { uri: localPicUri, name: filename, type } as any);
            form.append('userId', trainerId);
            form.append('userType', 'TRAINER');
            const data = await fetchUpload('/files/upload/profile-picture', form);
            return `${API_BASE_URL}${data.fileUrl}`;
        } catch (e) {
            console.log('Upload error', e);
            return null;
        } finally {
            setUploading(false);
        }
    };

    const addTag = (input: string, list: string[], setter: (v: string[]) => void, inputSetter: (v: string) => void) => {
        const trimmed = input.trim();
        if (trimmed && !list.includes(trimmed)) setter([...list, trimmed]);
        inputSetter('');
    };

    const removeTag = (index: number, list: string[], setter: (v: string[]) => void) => {
        setter(list.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        if (!trainerId) return;
        if (!bio.trim()) { Alert.alert('Required', 'Please write a short bio.'); return; }

        setLoading(true);
        try {
            let picUrl = profilePic;
            if (localPicUri) {
                const uploaded = await uploadPicture();
                if (uploaded) picUrl = uploaded;
            }

            await trainerService.updateTrainerPage3(trainerId, {
                bio: bio.trim(),
                profilePictureUrl: picUrl || undefined,
            });

            if (specializations.length > 0 && skills.length > 0 && education.trim()) {
                await trainerService.updateTrainerPage2(trainerId, {
                    specializations,
                    skills,
                    education: education.trim(),
                    experienceYears: parseInt(experienceYears) || 0,
                    linkedinUrl: linkedinUrl.trim() || null,
                    portfolioUrl: portfolioUrl.trim() || null,
                    cvUrl: null,
                    professionalExperience: null,
                    certificates: [],
                    githubUrl: null,
                });
            }

            Alert.alert('Saved', 'Your profile has been updated.', [
                { text: 'OK', onPress: () => router.back() },
            ]);
        } catch (e: any) {
            Alert.alert('Error', e?.response?.data?.message || 'Could not save changes.');
        } finally {
            setLoading(false);
        }
    };

    const displayPic = localPicUri || profilePic;

    return (
        <ScreenBackground>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                            <Ionicons name="arrow-back" size={22} color="#ffffff" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Edit Profile</Text>
                    </View>

                    {/* Avatar picker */}
                    <View style={styles.avatarSection}>
                        <TouchableOpacity onPress={() => setShowPicModal(true)} style={styles.avatarWrap} activeOpacity={0.8}>
                            {displayPic ? (
                                <Image source={{ uri: displayPic }} style={styles.avatar} />
                            ) : (
                                <View style={styles.avatarFallback}>
                                    <Ionicons name="person" size={40} color="#7cce06" />
                                </View>
                            )}
                            <View style={styles.editOverlay}>
                                <Ionicons name="camera" size={18} color="#ffffff" />
                            </View>
                        </TouchableOpacity>
                        <Text style={styles.avatarHint}>Tap to change photo</Text>
                    </View>

                    {/* Bio */}
                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Bio *</Text>
                        <View style={styles.textAreaWrap}>
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            <TextInput
                                style={styles.textArea}
                                value={bio}
                                onChangeText={setBio}
                                placeholder="Tell students about yourself..."
                                placeholderTextColor="rgba(255,255,255,0.3)"
                                multiline
                                numberOfLines={4}
                                textAlignVertical="top"
                            />
                        </View>
                    </View>

                    {/* Experience + Education */}
                    <View style={styles.row}>
                        <View style={[styles.fieldGroup, { flex: 1 }]}>
                            <Text style={styles.fieldLabel}>Experience (years)</Text>
                            <View style={styles.inputWrap}>
                                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                <Ionicons name="briefcase-outline" size={16} color="rgba(255,255,255,0.4)" />
                                <TextInput
                                    style={styles.input}
                                    value={experienceYears}
                                    onChangeText={setExperienceYears}
                                    placeholder="e.g. 5"
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                    keyboardType="number-pad"
                                />
                            </View>
                        </View>
                        <View style={[styles.fieldGroup, { flex: 1 }]}>
                            <Text style={styles.fieldLabel}>Education</Text>
                            <View style={styles.inputWrap}>
                                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                <Ionicons name="school-outline" size={16} color="rgba(255,255,255,0.4)" />
                                <TextInput
                                    style={styles.input}
                                    value={education}
                                    onChangeText={setEducation}
                                    placeholder="e.g. Master's"
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                />
                            </View>
                        </View>
                    </View>

                    {/* Specializations */}
                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Specializations</Text>
                        <View style={styles.inputWrap}>
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            <TextInput
                                style={styles.input}
                                value={specializationInput}
                                onChangeText={setSpecializationInput}
                                placeholder="Type and press +"
                                placeholderTextColor="rgba(255,255,255,0.3)"
                                onSubmitEditing={() => addTag(specializationInput, specializations, setSpecializations, setSpecializationInput)}
                                returnKeyType="done"
                            />
                            <TouchableOpacity
                                onPress={() => addTag(specializationInput, specializations, setSpecializations, setSpecializationInput)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <Ionicons name="add-circle" size={20} color="#7cce06" />
                            </TouchableOpacity>
                        </View>
                        {specializations.length > 0 && (
                            <View style={styles.tagRow}>
                                {specializations.map((s, i) => (
                                    <TouchableOpacity
                                        key={i}
                                        style={styles.tag}
                                        onPress={() => removeTag(i, specializations, setSpecializations)}
                                    >
                                        <Text style={styles.tagText}>{s}</Text>
                                        <Ionicons name="close" size={12} color="#7cce06" />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>

                    {/* Skills */}
                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Skills</Text>
                        <View style={styles.inputWrap}>
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            <TextInput
                                style={styles.input}
                                value={skillInput}
                                onChangeText={setSkillInput}
                                placeholder="Type and press +"
                                placeholderTextColor="rgba(255,255,255,0.3)"
                                onSubmitEditing={() => addTag(skillInput, skills, setSkills, setSkillInput)}
                                returnKeyType="done"
                            />
                            <TouchableOpacity
                                onPress={() => addTag(skillInput, skills, setSkills, setSkillInput)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <Ionicons name="add-circle" size={20} color="#7cce06" />
                            </TouchableOpacity>
                        </View>
                        {skills.length > 0 && (
                            <View style={styles.tagRow}>
                                {skills.map((s, i) => (
                                    <TouchableOpacity
                                        key={i}
                                        style={styles.tag}
                                        onPress={() => removeTag(i, skills, setSkills)}
                                    >
                                        <Text style={styles.tagText}>{s}</Text>
                                        <Ionicons name="close" size={12} color="#7cce06" />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>

                    {/* LinkedIn */}
                    <View style={styles.fieldGroup}>
                        <View style={styles.fieldLabelRow}>
                            <Text style={styles.fieldLabel}>LinkedIn URL</Text>
                            <View style={styles.optionalTag}><Text style={styles.optionalText}>Optional</Text></View>
                        </View>
                        <View style={styles.inputWrap}>
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            <Ionicons name="logo-linkedin" size={16} color="#0A66C2" />
                            <TextInput
                                style={styles.input}
                                value={linkedinUrl}
                                onChangeText={setLinkedinUrl}
                                placeholder="linkedin.com/in/yourprofile"
                                placeholderTextColor="rgba(255,255,255,0.3)"
                                keyboardType="url"
                                autoCapitalize="none"
                            />
                        </View>
                    </View>

                    {/* Portfolio */}
                    <View style={styles.fieldGroup}>
                        <View style={styles.fieldLabelRow}>
                            <Text style={styles.fieldLabel}>Portfolio URL</Text>
                            <View style={styles.optionalTag}><Text style={styles.optionalText}>Optional</Text></View>
                        </View>
                        <View style={styles.inputWrap}>
                            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                            <Ionicons name="globe-outline" size={16} color="#7cce06" />
                            <TextInput
                                style={styles.input}
                                value={portfolioUrl}
                                onChangeText={setPortfolioUrl}
                                placeholder="yourportfolio.com"
                                placeholderTextColor="rgba(255,255,255,0.3)"
                                keyboardType="url"
                                autoCapitalize="none"
                            />
                        </View>
                    </View>

                    {/* Save */}
                    <TouchableOpacity
                        style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
                        onPress={handleSave}
                        disabled={loading}
                        activeOpacity={0.85}
                    >
                        {loading ? (
                            <ActivityIndicator size="small" color="#000" />
                        ) : (
                            <Text style={styles.saveBtnText}>Save Changes</Text>
                        )}
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Photo picker modal */}
            <Modal visible={showPicModal} transparent animationType="slide" onRequestClose={() => setShowPicModal(false)}>
                <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowPicModal(false)} />
                <View style={styles.modalSheet}>
                    <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.modalHandle} />
                    <Text style={styles.modalTitle}>Change Photo</Text>

                    <TouchableOpacity style={styles.modalOption} onPress={() => handlePickImage('camera')}>
                        <Ionicons name="camera-outline" size={22} color="#7cce06" />
                        <Text style={styles.modalOptionText}>Take Photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modalOption} onPress={() => handlePickImage('gallery')}>
                        <Ionicons name="images-outline" size={22} color="#7cce06" />
                        <Text style={styles.modalOptionText}>Choose from Gallery</Text>
                    </TouchableOpacity>
                    {displayPic && (
                        <TouchableOpacity style={styles.modalOption} onPress={() => { setLocalPicUri(null); setProfilePic(null); setShowPicModal(false); }}>
                            <Ionicons name="trash-outline" size={22} color="#ff4444" />
                            <Text style={[styles.modalOptionText, { color: '#ff4444' }]}>Remove Photo</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </Modal>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 60, paddingHorizontal: 20 },

    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, marginBottom: 24 },
    backBtn: { padding: 2 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff' },

    avatarSection: { alignItems: 'center', marginBottom: 28 },
    avatarWrap: { width: 100, height: 100, borderRadius: 50, position: 'relative' },
    avatar: { width: 100, height: 100, borderRadius: 50 },
    avatarFallback: {
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: 'rgba(124,206,6,0.12)',
        borderWidth: 2, borderColor: 'rgba(124,206,6,0.3)',
        justifyContent: 'center', alignItems: 'center',
    },
    editOverlay: {
        position: 'absolute', bottom: 0, right: 0,
        backgroundColor: '#7cce06', borderRadius: 14,
        width: 28, height: 28, justifyContent: 'center', alignItems: 'center',
    },
    avatarHint: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 8 },

    fieldGroup: { marginBottom: 18 },
    fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: '#aaaaaa', marginBottom: 8 },
    optionalTag: {
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2,
    },
    optionalText: { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },

    row: { flexDirection: 'row', gap: 12 },

    inputWrap: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        borderRadius: 14, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 14, paddingVertical: 12,
    },
    input: { flex: 1, fontSize: 14, color: '#ffffff', padding: 0 },

    textAreaWrap: {
        borderRadius: 14, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        padding: 14, minHeight: 100,
    },
    textArea: { fontSize: 14, color: '#ffffff', lineHeight: 22, padding: 0 },

    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    tag: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(124,206,6,0.1)',
        borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.3)',
    },
    tagText: { fontSize: 12, color: '#7cce06', fontWeight: '600' },

    saveBtn: {
        backgroundColor: '#7cce06', borderRadius: 16,
        paddingVertical: 16, alignItems: 'center',
        marginTop: 8, marginBottom: 12,
    },
    saveBtnDisabled: { opacity: 0.6 },
    saveBtnText: { fontSize: 16, fontWeight: '700', color: '#000000' },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    modalSheet: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: 'rgba(10,5,32,0.95)', overflow: 'hidden',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32,
        borderTopWidth: 1, borderTopColor: 'rgba(124,206,6,0.2)',
    },
    modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 17, fontWeight: '700', color: '#ffffff', marginBottom: 20 },
    modalOption: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    modalOptionText: { fontSize: 15, color: '#ffffff', fontWeight: '500' },
});
