import type { Metadata } from 'next';
import { LegalDocument } from '@/components/LegalDocument';
import { TERMS_SECTIONS } from '@/content/legal';

export const metadata: Metadata = {
    title: 'Conditions générales d’utilisation — Treyo',
    description: 'Conditions générales d’utilisation de la plateforme Treyo.',
};

export default function TermsPage() {
    return <LegalDocument title="Terms of Service" sections={TERMS_SECTIONS} />;
}
