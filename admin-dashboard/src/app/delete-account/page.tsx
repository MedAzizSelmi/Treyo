import { Trash2, Smartphone, Mail, ShieldCheck } from 'lucide-react';

export const metadata = {
  title: 'Delete your Treyo account',
  description: 'How to permanently delete your Treyo account and what happens to your data.',
};

/**
 * The web half of account deletion.
 *
 * Google Play requires apps that create accounts to offer deletion both
 * inside the app and through a publicly reachable URL that a user can
 * find without installing anything — this page is that URL, and it is
 * what gets submitted in the Play Console's data-safety form.
 *
 * It intentionally does not delete anything by itself: deletion needs
 * the password, and a public form that accepts an email address would be
 * a way to harass other people's accounts. It documents the in-app route
 * and the email fallback for users who have lost access to the app.
 */
export default function DeleteAccountPage() {
  return (
    <div className="min-h-screen px-4 py-16">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-11 h-11 rounded-xl bg-danger/10 border border-danger/25 flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-danger" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Delete your Treyo account</h1>
            <p className="text-sm text-muted">Treyo — LeanConsulting</p>
          </div>
        </div>

        <Section icon={Smartphone} title="From the app">
          <ol className="list-decimal list-inside space-y-1.5 text-sm text-foreground/85">
            <li>Open Treyo and sign in.</li>
            <li>Go to <strong>Settings → Security</strong>.</li>
            <li>Tap <strong>Delete account</strong>.</li>
            <li>Confirm with your password.</li>
          </ol>
          <p className="text-sm text-muted mt-3">
            The account is deleted immediately and you are signed out.
          </p>
        </Section>

        <Section icon={Mail} title="If you can't access the app">
          <p className="text-sm text-foreground/85">
            Write to{' '}
            <a href="mailto:direction@leanconsulting.com.tn" className="text-accent hover:underline">
              direction@leanconsulting.com.tn
            </a>{' '}
            from the email address registered on the account, with the subject
            &ldquo;Account deletion&rdquo;. We verify the request comes from the
            account holder before acting on it, and complete the deletion within
            30 days.
          </p>
        </Section>

        <Section icon={ShieldCheck} title="What is deleted, and what is kept">
          <p className="text-sm text-foreground/85 mb-3">
            <strong className="text-white">Deleted:</strong> your name, email address,
            phone number, postal address, profile photo, biography, CV, and every
            profile detail — plus your notifications, saved items, search history,
            reactions and activity history. Your sign-in credentials are destroyed, so
            the account can no longer be used.
          </p>
          <p className="text-sm text-foreground/85 mb-3">
            <strong className="text-white">Kept:</strong> enrolment and payment records,
            which we are required to retain as accounting documents; and the ratings
            you left on courses and trainers, which other people&apos;s averages depend
            on. The written part of your reviews is erased and your name no longer
            appears on them.
          </p>
          <p className="text-sm text-foreground/85">
            Messages you sent in a group conversation remain visible to that
            group&apos;s members, attributed to a deleted user. If you are a trainer,
            your courses are withdrawn and are no longer offered to learners.
          </p>
        </Section>

        <p className="text-xs text-muted mt-10">
          Deletion is permanent and cannot be undone.
        </p>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card border border-border rounded-2xl p-6 mb-5">
      <h2 className="flex items-center gap-2 text-base font-bold text-white mb-3">
        <Icon className="w-4 h-4 text-accent" />
        {title}
      </h2>
      {children}
    </section>
  );
}
