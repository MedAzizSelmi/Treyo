import type { Metadata } from 'next';
import { LegalDocument } from '@/components/LegalDocument';
import { PRIVACY_SECTIONS } from '@/content/legal';

export const metadata: Metadata = {
    title: 'Politique de confidentialité — Treyo',
    description: 'Politique de confidentialité de la plateforme Treyo.',
};

export default function PrivacyPage() {
    return <LegalDocument title="Privacy Policy" sections={PRIVACY_SECTIONS} />;
}
