import { Suspense } from 'react';
import ResetPasswordForm from './ResetPasswordForm';

/**
 * Where the password-reset email lands.
 *
 * The token arrives in the query string and is spent by POST
 * /api/auth/reset-password. Before this page existed the email pointed at
 * a path nobody served, so a reset could be requested but never completed.
 *
 * The form is a client component because it reads the query string;
 * useSearchParams requires a Suspense boundary or the production build
 * fails with "Missing Suspense boundary with useSearchParams".
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
