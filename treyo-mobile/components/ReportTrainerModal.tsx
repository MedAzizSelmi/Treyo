import { useState } from 'react';
import {
    Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { reportService } from '../services/api';

/**
 * "Report trainer" sheet, opened from the trainer profile.
 *
 * Reason codes are the same fixed set the backend validates against
 * (TrainerReportService.VALID_REASONS) — keep the two in sync if either
 * side gains a category.
 */

const REASONS = [
    'INAPPROPRIATE_BEHAVIOUR',
    'MISLEADING_CONTENT',
    'NO_SHOW',
    'HARASSMENT',
    'SPAM',
    'OTHER',
] as const;

type Props = {
    visible: boolean;
    onClose: () => void;
    studentId: string;
    trainerId: string;
    trainerName?: string;
    courseId?: string;
};

export default function ReportTrainerModal({
    visible, onClose, studentId, trainerId, trainerName, courseId,
}: Props) {
    const { t } = useTranslation();
    const [reason, setReason] = useState<string | null>(null);
    const [details, setDetails] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const reset = () => {
        setReason(null);
        setDetails('');
        setSubmitting(false);
    };

    const handleClose = () => {
        if (submitting) return;
        reset();
        onClose();
    };

    const handleSubmit = async () => {
        if (!reason) {
            Alert.alert(t('report.title'), t('report.pickReason'));
            return;
        }
        setSubmitting(true);
        try {
            await reportService.reportTrainer({
                studentId,
                trainerId,
                reason,
                details: details.trim() || undefined,
                courseId,
            });
            reset();
            onClose();
            Alert.alert(t('report.success'), t('report.successBody'));
        } catch (e: any) {
            // 409 = a report from this student about this trainer is
            // already open; show the specific message rather than a
            // generic failure so the user knows it did register.
            const status = e?.response?.status;
            const msg = status === 409
                ? t('report.alreadyReported')
                : (e?.response?.data?.error || t('report.failed'));
            setSubmitting(false);
            Alert.alert(t('report.title'), msg);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
            <View style={styles.backdrop}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.sheetWrap}
                >
                    <View style={styles.sheet}>
                        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />

                        <View style={styles.header}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.title}>{t('report.title')}</Text>
                                {!!trainerName && <Text style={styles.target}>{trainerName}</Text>}
                            </View>
                            <TouchableOpacity onPress={handleClose} style={styles.closeBtn} disabled={submitting}>
                                <Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.subtitle}>{t('report.subtitle')}</Text>

                        <ScrollView
                            style={{ maxHeight: 320 }}
                            contentContainerStyle={{ paddingBottom: 8 }}
                            keyboardShouldPersistTaps="handled"
                        >
                            <Text style={styles.label}>{t('report.reasonLabel')}</Text>
                            {REASONS.map(code => {
                                const selected = reason === code;
                                return (
                                    <TouchableOpacity
                                        key={code}
                                        style={[styles.reasonRow, selected && styles.reasonRowActive]}
                                        onPress={() => setReason(code)}
                                        activeOpacity={0.75}
                                        disabled={submitting}
                                    >
                                        <Ionicons
                                            name={selected ? 'radio-button-on' : 'radio-button-off'}
                                            size={18}
                                            color={selected ? '#ff5454' : 'rgba(255,255,255,0.35)'}
                                        />
                                        <Text style={[styles.reasonText, selected && styles.reasonTextActive]}>
                                            {t(`report.reasons.${code}`)}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}

                            <Text style={[styles.label, { marginTop: 14 }]}>{t('report.detailsLabel')}</Text>
                            <TextInput
                                style={styles.input}
                                value={details}
                                onChangeText={setDetails}
                                placeholder={t('report.detailsPlaceholder')}
                                placeholderTextColor="rgba(255,255,255,0.3)"
                                multiline
                                editable={!submitting}
                                maxLength={1000}
                            />
                        </ScrollView>

                        <View style={styles.actions}>
                            <TouchableOpacity
                                style={styles.cancelBtn}
                                onPress={handleClose}
                                disabled={submitting}
                            >
                                <Text style={styles.cancelText}>{t('report.cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.submitBtn, (!reason || submitting) && styles.submitBtnDisabled]}
                                onPress={handleSubmit}
                                disabled={!reason || submitting}
                            >
                                {submitting
                                    ? <ActivityIndicator size="small" color="#ffffff" />
                                    : <Text style={styles.submitText}>{t('report.submit')}</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheetWrap: { width: '100%' },
    sheet: {
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        overflow: 'hidden', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28,
        borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(16,10,44,0.92)',
    },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    title: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
    target: { fontSize: 13, color: '#ff8f8f', marginTop: 2, fontWeight: '600' },
    closeBtn: {
        width: 34, height: 34, borderRadius: 17,
        backgroundColor: 'rgba(255,255,255,0.08)',
        justifyContent: 'center', alignItems: 'center',
    },
    subtitle: { fontSize: 12.5, color: 'rgba(255,255,255,0.55)', lineHeight: 18, marginTop: 8, marginBottom: 14 },
    label: {
        fontSize: 11, fontWeight: '700', color: '#7cce06',
        letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase',
    },
    reasonRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingVertical: 11, paddingHorizontal: 12, marginBottom: 6,
        borderRadius: 12, borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    reasonRowActive: {
        borderColor: 'rgba(255,84,84,0.5)',
        backgroundColor: 'rgba(255,84,84,0.10)',
    },
    reasonText: { fontSize: 14, color: 'rgba(255,255,255,0.75)', flex: 1 },
    reasonTextActive: { color: '#ffffff', fontWeight: '600' },
    input: {
        borderRadius: 12, borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.04)',
        color: '#ffffff', fontSize: 14,
        padding: 12, minHeight: 90, textAlignVertical: 'top',
    },
    actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    cancelBtn: {
        flex: 1, paddingVertical: 13, borderRadius: 14,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
        alignItems: 'center',
    },
    cancelText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },
    submitBtn: {
        flex: 1.4, paddingVertical: 13, borderRadius: 14,
        backgroundColor: '#d13b3b', alignItems: 'center', justifyContent: 'center',
    },
    submitBtnDisabled: { opacity: 0.45 },
    submitText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
});
