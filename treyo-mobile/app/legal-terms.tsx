import { useTranslation } from 'react-i18next';
import LegalDocumentScreen from '../components/LegalDocumentScreen';
import { TERMS_SECTIONS } from '../constants/legal';

export default function TermsOfServiceScreen() {
    const { t } = useTranslation();
    return (
        <LegalDocumentScreen
            title={t('settings.termsOfService')}
            intro="These Terms set out the rules for using Treyo — how accounts work, how courses are reviewed and published, and what we each expect of the other."
            sections={TERMS_SECTIONS}
        />
    );
}
