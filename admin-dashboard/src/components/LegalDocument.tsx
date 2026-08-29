import Link from 'next/link';
import type { LegalSection } from '@/content/legal';
import { LEGAL_LAST_UPDATED, LEGAL_ENTITY_NAME } from '@/content/legal';

/**
 * Renders one legal document from the shared section data.
 *
 * Kept identical in structure to the mobile app's LegalDocumentScreen so
 * the same text reads the same way in both places — a user comparing the
 * website against the app should not find them differently organised.
 *
 * Strings beginning with "• " render as bullets; that convention is
 * defined alongside the LegalSection type and is why this does not just
 * map every string to a paragraph.
 */
export function LegalDocument({
    title,
    sections,
}: {
    title: string;
    sections: LegalSection[];
}) {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <header className="border-b border-border">
                <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
                    <Link href="/" className="text-xl font-semibold tracking-tight">
                        Treyo
                    </Link>
                    <Link href="/" className="text-sm text-muted hover:text-foreground">
                        Retour à l’accueil
                    </Link>
                </div>
            </header>

            <main className="mx-auto max-w-3xl px-6 py-12">
                <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                <p className="mt-2 text-sm text-muted">
                    {LEGAL_ENTITY_NAME} — Last updated: {LEGAL_LAST_UPDATED}
                </p>

                <div className="mt-10 space-y-10">
                    {sections.map((section) => (
                        <section key={section.heading}>
                            <h2 className="font-medium">{section.heading}</h2>
                            <div className="mt-3 space-y-3">
                                {section.body.map((line, i) =>
                                    line.startsWith('• ') ? (
                                        <p
                                            key={i}
                                            className="pl-4 text-sm leading-relaxed text-muted"
                                        >
                                            {line}
                                        </p>
                                    ) : (
                                        <p key={i} className="text-sm leading-relaxed text-muted">
                                            {line}
                                        </p>
                                    ),
                                )}
                            </div>
                        </section>
                    ))}
                </div>
            </main>

            <footer className="border-t border-border">
                <div className="mx-auto max-w-3xl px-6 py-8 text-xs text-muted">
                    <p>Sté Lean Consulting — SARL · RNE 1355462E</p>
                    <p className="mt-1">direction@leanconsulting.com.tn</p>
                </div>
            </footer>
        </div>
    );
}
