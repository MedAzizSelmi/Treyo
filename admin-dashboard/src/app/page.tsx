import Link from 'next/link';
import type { Metadata } from 'next';

/**
 * Public landing page for treyo.leanconsulting.com.tn.
 *
 * This route used to redirect straight to /login, so the bare domain
 * answered with an admin form. That domain is declared to SMT on the
 * ClicToPay Fiche Technique as "URL du serveur web du commerçant", and a
 * bank checking a merchant should not land on an internal tool.
 *
 * It also carries two obligations from the signed merchant contract that
 * previously had nowhere to live:
 *
 *   Article 2 — "Signaler au public, de façon apparente sur les supports
 *   de vente, l'acceptation des cartes."
 *
 *   "Le commerçant a l'obligation de donner accès à ses conditions
 *   générales de vente avant le paiement."
 *
 * Written in French: the contract, the bank and the customers are all
 * Tunisian. The linked legal documents are still in English, which is a
 * translation decision for LeanConsulting rather than a technical one.
 *
 * Deliberately a Server Component — `metadata` is not supported in
 * Client Components, and nothing here needs interactivity.
 *
 * Admin access is unchanged and still lives at /login.
 */

export const metadata: Metadata = {
    title: 'Treyo — Formations et accompagnement en Tunisie',
    description:
        'Treyo met en relation formateurs et apprenants en Tunisie. '
        + 'Paiement en ligne sécurisé par carte bancaire.',
};

const FEATURES = [
    {
        title: 'Trouvez un formateur',
        body: 'Parcourez les formateurs par domaine, niveau et spécialité, '
            + 'avec des recommandations adaptées à vos centres d’intérêt.',
    },
    {
        title: 'Rejoignez une session',
        body: 'Inscrivez-vous à des sessions en groupe ou individuelles, '
            + 'en présentiel ou en ligne, selon vos disponibilités.',
    },
    {
        title: 'Suivez votre progression',
        body: 'Retrouvez vos formations, vos échanges avec les formateurs '
            + 'et votre historique au même endroit.',
    },
];

/** Named, not logos: the marks are trademarked and not licensed to us. */
const CARDS = ['Visa', 'Mastercard', 'CIB'];

export default function Home() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <header className="border-b border-border">
                <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
                    <div>
                        <span className="text-xl font-semibold tracking-tight">Treyo</span>
                        <span className="ml-2 text-sm text-muted">par LeanConsulting</span>
                    </div>
                    <Link
                        href="/login"
                        className="text-sm text-muted transition-colors hover:text-foreground"
                    >
                        Espace administrateur
                    </Link>
                </div>
            </header>

            <main className="mx-auto max-w-5xl px-6">
                <section className="py-16 sm:py-24">
                    <h1 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                        La plateforme qui met en relation formateurs et apprenants en Tunisie.
                    </h1>
                    <p className="mt-4 max-w-xl text-muted">
                        Treyo réunit des formateurs qualifiés et des personnes qui souhaitent
                        se former, dans les domaines du numérique, du management, du design
                        et bien d’autres.
                    </p>
                </section>

                <section className="grid gap-6 border-t border-border py-12 sm:grid-cols-3">
                    {FEATURES.map((f) => (
                        <div key={f.title}>
                            <h2 className="font-medium">{f.title}</h2>
                            <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
                        </div>
                    ))}
                </section>

                {/* Article 2 of the merchant contract: card acceptance must be
                    visible on the sales channel, before any payment. */}
                <section className="border-t border-border py-12">
                    <h2 className="font-medium">Paiement sécurisé</h2>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
                        Les formations payantes se règlent par carte bancaire via ClicToPay,
                        la plateforme de paiement sécurisé de la Société Monétique Tunisie.
                        Toutes les transactions sont protégées par le protocole 3-D Secure.
                    </p>
                    <ul className="mt-5 flex flex-wrap gap-3">
                        {CARDS.map((card) => (
                            <li
                                key={card}
                                className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium"
                            >
                                {card}
                            </li>
                        ))}
                    </ul>
                    <p className="mt-4 text-sm text-muted">
                        Aucun frais supplémentaire n’est appliqué au paiement par carte.
                    </p>
                </section>

                <section className="border-t border-border py-12">
                    <h2 className="font-medium">Application mobile</h2>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
                        Treyo est disponible sur mobile. La publication sur l’App Store et
                        Google Play est en cours.
                    </p>
                </section>
            </main>

            <footer className="border-t border-border">
                <div className="mx-auto max-w-5xl px-6 py-10">
                    <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                        <Link href="/legal/terms" className="text-muted hover:text-foreground">
                            Conditions générales d’utilisation
                        </Link>
                        <Link href="/legal/privacy" className="text-muted hover:text-foreground">
                            Politique de confidentialité
                        </Link>
                        <a
                            href="mailto:direction@leanconsulting.com.tn"
                            className="text-muted hover:text-foreground"
                        >
                            Nous contacter
                        </a>
                    </nav>

                    <div className="mt-6 space-y-1 text-xs leading-relaxed text-muted">
                        <p className="font-medium text-foreground">Sté Lean Consulting — SARL</p>
                        <p>
                            162, Avenue de l’UMA, Immeuble Omrane Centre, Bureau B1.4,
                            La Soukra, Ariana 2036, Tunisie
                        </p>
                        <p>Registre de commerce / RNE : 1355462E</p>
                        <p>direction@leanconsulting.com.tn — +216 20 348 898</p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
