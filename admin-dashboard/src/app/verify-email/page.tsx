import { Suspense } from 'react';
import VerifyEmailClient from './VerifyEmailClient';

/**
 * Where the email-verification link lands. The token is spent by POST
 * /api/auth/verify-email; before this page existed the link pointed at a
 * path nobody served, so accounts could never be verified from the email.
 *
 * Suspense boundary for the same reason as the reset page: the client
 * component reads the query string with useSearchParams.
 */
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <VerifyEmailClient />
    </Suspense>
  );
}
