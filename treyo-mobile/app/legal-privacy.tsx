import { useTranslation } from 'react-i18next';
import LegalDocumentScreen from '../components/LegalDocumentScreen';
import { PRIVACY_SECTIONS } from '../constants/legal';

export default function PrivacyPolicyScreen() {
    const { t } = useTranslation();
    return (
        <LegalDocumentScreen
            title={t('settings.privacyPolicy')}
            intro="This policy explains what personal data Treyo collects, why we collect it, who we share it with, and the rights you have over it."
            sections={PRIVACY_SECTIONS}
        />
    );
}
