import {
    View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
    ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useTranslation } from 'react-i18next';
import { ScreenBackground } from '../components/ScreenBackground';
import { authService, moduleService, trainerCourseService } from '../services/api';
import { COURSE_LANGUAGES, CourseLanguage, defaultCourseLanguage } from '../utils/courseLabels';

/**
 * Trainer's course-submission screen.
 *
 * Flow:
 *   1. Trainer picks a domain (admin-created category) from the picker.
 *      "Domain" is the word users see; the code and API call it a module.
 *   2. Fills the course fields (title, description, hours, price, ...).
 *   3. Attaches the training material — PDF / PPT / ZIP. Optional but
 *      strongly encouraged, since the admin uses it to decide.
 *   4. Hits Submit → uploads the file first (if picked), then POSTs
 *      the course. Backend flags it as PENDING; admin gets it in the
 *      review queue. Trainer sees a success alert and lands back on
 *      their courses list.
 */
export default function TrainerCourseCreateScreen() {
    const router = useRouter();
    const { t, i18n } = useTranslation();

    const [trainerId, setTrainerId] = useState<string | null>(null);
    const [modules, setModules] = useState<any[]>([]);
    const [moduleId, setModuleId] = useState<string | null>(null);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [specificTopic, setSpecificTopic] = useState('');
    const [level, setLevel] = useState<'beginner' | 'intermediate' | 'expert'>('beginner');
    const [durationHours, setDurationHours] = useState('10');
    // Price and currency are set by the admin at approval time — the
    // trainer's create form has no price field.
    const [prerequisites, setPrerequisites] = useState('');
    const [format, setFormat] = useState<'Face-to-face' | 'Online' | 'Hybrid'>('Online');
    // The language the course is taught in. It used to be sent as a fixed
    // 'French' for every course; the trainer's app language is the
    // likeliest answer, so it starts there.
    const [courseLanguage, setCourseLanguage] = useState<CourseLanguage>(() => defaultCourseLanguage(i18n.language));
    const [maxStudents, setMaxStudents] = useState('30');
    const [minStudents, setMinStudents] = useState('5');
    const [hasCertificate, setHasCertificate] = useState(false);

    // Picked material — held in memory until submit fires the upload.
    const [material, setMaterial] = useState<{ uri: string; name: string; mimeType?: string } | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        (async () => {
            const user = await authService.getCurrentUser();
            setTrainerId(user?.userId ?? null);
            try {
                const list = await moduleService.listActive();
                setModules(Array.isArray(list) ? list : []);
            } catch (_) { setModules([]); }
        })();
    }, []);

    /** Prompt the OS document picker. PDF + PPT are the common cases;
     *  ZIP too since some trainers bundle multiple files. */
    const handlePickMaterial = async () => {
        try {
            const res = await DocumentPicker.getDocumentAsync({
                type: [
                    'application/pdf',
                    'application/vnd.ms-powerpoint',
                    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    'application/zip',
                    'application/x-zip-compressed',
                ],
                copyToCacheDirectory: true,
            });
            if (res.canceled) return;
            const asset = res.assets?.[0];
            if (asset) {
                setMaterial({
                    uri: asset.uri,
                    name: asset.name || 'material',
                    mimeType: asset.mimeType,
                });
            }
        } catch (_) {
            Alert.alert(t('common.error'), t('courseCreate.pickerFailed'));
        }
    };

    const handleSubmit = async () => {
        if (!trainerId) return;
        if (!moduleId) {
            Alert.alert(t('common.error'), t('courseCreate.pickDomain'));
            return;
        }
        if (!title.trim() || !description.trim() || !specificTopic.trim()) {
            Alert.alert(t('common.error'), t('courseCreate.requiredFields'));
            return;
        }
        const hours = Number(durationHours);
        if (!Number.isFinite(hours) || hours < 1) {
            Alert.alert(t('common.error'), t('courseCreate.minDuration'));
            return;
        }
        setSubmitting(true);
        try {
            let materialUrl: string | undefined;
            let materialName: string | undefined;

            // Upload material first (if provided). Failures roll back
            // to a form-still-editable state — we don't want the
            // trainer to lose all their typing.
            if (material) {
                setUploading(true);
                try {
                    const up = await trainerCourseService.uploadMaterial(trainerId, {
                        uri: material.uri,
                        name: material.name,
                        type: material.mimeType || 'application/octet-stream',
                    });
                    materialUrl = up.url;
                    materialName = up.name;
                } catch (uploadErr: any) {
                    Alert.alert(t('common.error'), t('courseCreate.uploadFailed'));
                    setUploading(false);
                    setSubmitting(false);
                    return;
                } finally {
                    setUploading(false);
                }
            }

            await trainerCourseService.create(trainerId, {
                title: title.trim(),
                description: description.trim(),
                domain: modules.find(m => m.moduleId === moduleId)?.name || 'General',
                specificTopic: specificTopic.trim(),
                level,
                durationHours: hours,
                language: courseLanguage,
                format,
                prerequisites: prerequisites.trim() || null,
                learningOutcomes: [],
                // Price + currency are set by the admin at approval time.
                minStudentsRequired: Number(minStudents) || 5,
                maxStudentsPerGroup: Number(maxStudents) || 30,
                maxGroupsAllowed: 1,
                hasCertificate,
                moduleId,
                materialUrl,
                materialName,
            });

            Alert.alert(
                t('courseCreate.submittedTitle'),
                t('courseCreate.submittedBody'),
                [{ text: t('common.ok'), onPress: () => router.back() }],
            );
        } catch (e: any) {
            const msg = e?.response?.data?.error || t('courseCreate.submitFailed');
            Alert.alert(t('common.error'), msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ScreenBackground>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
            >
                <LinearGradient
                    colors={['rgba(124,206,6,0.15)', 'rgba(10,5,32,0)']}
                    style={styles.headerGlow}
                />
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                        <Ionicons name="arrow-back" size={20} color="#ffffff" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{t('courseCreate.title')}</Text>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.content}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Domain picker */}
                    <SectionLabel text={t('courseCreate.domain')} />
                    <Text style={styles.hint}>{t('courseCreate.domainHint')}</Text>
                    <View style={styles.chipRow}>
                        {modules.length === 0 && (
                            <Text style={styles.emptyText}>{t('courseCreate.noDomains')}</Text>
                        )}
                        {modules.map(m => {
                            const active = moduleId === m.moduleId;
                            return (
                                <TouchableOpacity
                                    key={m.moduleId}
                                    onPress={() => setModuleId(m.moduleId)}
                                    style={[styles.chip, active && styles.chipActive]}
                                    activeOpacity={0.75}
                                >
                                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{m.name}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <SectionLabel text={t('courseCreate.courseTitle')} />
                    <Input value={title} onChangeText={setTitle} placeholder={t('courseCreate.titlePlaceholder')} />

                    <SectionLabel text={t('courseCreate.specificTopic')} />
                    <Input value={specificTopic} onChangeText={setSpecificTopic} placeholder={t('courseCreate.topicPlaceholder')} />

                    <SectionLabel text={t('courseCreate.description')} />
                    <Input
                        value={description}
                        onChangeText={setDescription}
                        placeholder={t('courseCreate.descriptionPlaceholder')}
                        multiline
                    />

                    <SectionLabel text={t('courseCreate.level')} />
                    <SegmentedRow
                        options={['beginner', 'intermediate', 'expert'] as const}
                        value={level}
                        onChange={setLevel}
                        labels={{
                            beginner: t('levels.beginner'),
                            intermediate: t('levels.intermediate'),
                            expert: t('levels.expert'),
                        }}
                    />

                    <SectionLabel text={t('course.format')} />
                    <SegmentedRow
                        options={['Face-to-face', 'Online', 'Hybrid'] as const}
                        value={format}
                        onChange={setFormat}
                        labels={{
                            'Face-to-face': t('common.onSite'),
                            Online: t('common.online'),
                            Hybrid: t('courseCreate.formatHybrid'),
                        }}
                    />

                    <SectionLabel text={t('courseCreate.language')} />
                    <Text style={styles.hint}>{t('courseCreate.languageHint')}</Text>
                    <View style={styles.chipRow}>
                        {COURSE_LANGUAGES.map(lang => {
                            const active = courseLanguage === lang;
                            return (
                                <TouchableOpacity
                                    key={lang}
                                    onPress={() => setCourseLanguage(lang)}
                                    style={[styles.chip, active && styles.chipActive]}
                                    activeOpacity={0.75}
                                >
                                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                        {t(`courseLanguages.${lang.toLowerCase()}`)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <SectionLabel text={t('courseCreate.durationHours')} />
                    <Input value={durationHours} onChangeText={setDurationHours} keyboardType="number-pad" />

                    {/* Pricing is handled by the admin at approval — no field here. */}
                    <View style={styles.infoBanner}>
                        <Text style={styles.infoBannerText}>
                            {t('courseCreate.priceByAdmin')}
                        </Text>
                    </View>

                    <View style={styles.row}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                            <SectionLabel text={t('courseCreate.minStudents')} />
                            <Input value={minStudents} onChangeText={setMinStudents} keyboardType="number-pad" />
                        </View>
                        <View style={{ flex: 1, marginLeft: 8 }}>
                            <SectionLabel text={t('courseCreate.maxPerGroup')} />
                            <Input value={maxStudents} onChangeText={setMaxStudents} keyboardType="number-pad" />
                        </View>
                    </View>

                    <SectionLabel text={t('courseCreate.prerequisites')} />
                    <Input value={prerequisites} onChangeText={setPrerequisites} placeholder={t('courseCreate.prerequisitesPlaceholder')} multiline />

                    <TouchableOpacity
                        onPress={() => setHasCertificate(v => !v)}
                        style={[styles.certRow, hasCertificate && styles.certRowActive]}
                        activeOpacity={0.75}
                    >
                        <Ionicons
                            name={hasCertificate ? 'checkbox' : 'square-outline'}
                            size={22}
                            color={hasCertificate ? '#7cce06' : 'rgba(255,255,255,0.4)'}
                        />
                        <Text style={styles.certText}>{t('courseCreate.certificate')}</Text>
                    </TouchableOpacity>

                    {/* Material upload */}
                    <SectionLabel text={t('courseCreate.material')} />
                    <Text style={styles.hint}>{t('courseCreate.materialHint')}</Text>
                    <TouchableOpacity
                        style={styles.uploadBox}
                        onPress={handlePickMaterial}
                        activeOpacity={0.85}
                    >
                        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                        {material ? (
                            <View style={styles.filePickedRow}>
                                <Ionicons name="document-attach" size={22} color="#7cce06" />
                                <Text style={styles.fileNameText} numberOfLines={1}>{material.name}</Text>
                                <TouchableOpacity
                                    onPress={(e) => { e.stopPropagation(); setMaterial(null); }}
                                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                >
                                    <Ionicons name="close" size={18} color="rgba(255,255,255,0.6)" />
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.filePickerRow}>
                                <Ionicons name="cloud-upload-outline" size={24} color="#7cce06" />
                                <Text style={styles.filePickerText}>{t('courseCreate.chooseFile')}</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* Submit */}
                    <TouchableOpacity
                        style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
                        onPress={handleSubmit}
                        disabled={submitting}
                        activeOpacity={0.85}
                    >
                        <LinearGradient colors={['#7cce06', '#6bb805']} style={styles.submitGradient}>
                            {submitting ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <ActivityIndicator size="small" color="#000" />
                                    <Text style={styles.submitText}>
                                        {uploading ? t('courseCreate.uploading') : t('courseCreate.submitting')}
                                    </Text>
                                </View>
                            ) : (
                                <Text style={styles.submitText}>{t('courseCreate.submit')}</Text>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>

                    <View style={{ height: 40 }} />
                </ScrollView>
            </KeyboardAvoidingView>
        </ScreenBackground>
    );
}

function SectionLabel({ text }: { text: string }) {
    return <Text style={styles.label}>{text}</Text>;
}

function Input({ multiline, ...rest }: any) {
    return (
        <View style={[styles.inputWrap, multiline && styles.inputWrapMulti]}>
            <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill} />
            <TextInput
                {...rest}
                multiline={multiline}
                textAlignVertical={multiline ? 'top' : 'center'}
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={[styles.input, multiline && styles.inputMulti]}
            />
        </View>
    );
}

function SegmentedRow<T extends string>({
    options, value, onChange, labels,
}: { options: readonly T[]; value: T; onChange: (v: T) => void; labels: Record<T, string> }) {
    return (
        <View style={styles.segmentedRow}>
            {options.map(opt => (
                <TouchableOpacity
                    key={opt}
                    onPress={() => onChange(opt)}
                    style={[styles.segmentedBtn, value === opt && styles.segmentedBtnActive]}
                    activeOpacity={0.75}
                >
                    <Text style={[styles.segmentedText, value === opt && styles.segmentedTextActive]}>
                        {labels[opt]}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    headerGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 200 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 20, overflow: 'hidden',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: 17, color: '#ffffff', fontWeight: '700' },

    content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 20 },

    label: {
        fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: '700',
        letterSpacing: 0.3, textTransform: 'uppercase',
        marginTop: 18, marginBottom: 8,
    },
    hint: { fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 8, marginTop: -4 },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        paddingHorizontal: 14, paddingVertical: 8,
        borderRadius: 999, borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(255,255,255,0.04)',
    },
    chipActive: {
        borderColor: '#7cce06',
        backgroundColor: 'rgba(124,206,6,0.15)',
    },
    chipText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
    chipTextActive: { color: '#7cce06' },

    inputWrap: {
        borderRadius: 14, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },
    inputWrapMulti: { minHeight: 90 },
    input: {
        paddingHorizontal: 14, paddingVertical: 12,
        color: '#ffffff', fontSize: 14,
    },
    inputMulti: { paddingTop: 12, paddingBottom: 12, minHeight: 90 },

    row: { flexDirection: 'row' },

    infoBanner: {
        marginTop: 12, padding: 12, borderRadius: 12,
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.25)',
        backgroundColor: 'rgba(124,206,6,0.08)',
    },
    infoBannerText: { fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 18 },

    segmentedRow: { flexDirection: 'row', gap: 8 },
    segmentedBtn: {
        flex: 1, paddingVertical: 10, borderRadius: 12,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.04)',
        alignItems: 'center',
    },
    segmentedBtnActive: {
        borderColor: '#7cce06',
        backgroundColor: 'rgba(124,206,6,0.12)',
    },
    segmentedText: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
    segmentedTextActive: { color: '#7cce06' },

    certRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        marginTop: 14, padding: 12, borderRadius: 12,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    },
    certRowActive: { borderColor: 'rgba(124,206,6,0.3)' },
    certText: { fontSize: 14, color: '#ffffff' },

    uploadBox: {
        borderRadius: 14, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(124,206,6,0.25)',
        paddingHorizontal: 14, paddingVertical: 18,
        borderStyle: 'dashed',
    },
    filePickerRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    },
    filePickerText: { color: '#7cce06', fontSize: 14, fontWeight: '700' },
    filePickedRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
    },
    fileNameText: { flex: 1, color: '#ffffff', fontSize: 13, fontWeight: '600' },

    emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontStyle: 'italic' },

    submitBtn: { marginTop: 28, borderRadius: 28, overflow: 'hidden' },
    submitGradient: { paddingVertical: 16, alignItems: 'center' },
    submitText: { color: '#000', fontSize: 15, fontWeight: '700' },
});
