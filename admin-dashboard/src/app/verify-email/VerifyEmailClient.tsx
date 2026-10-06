'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

type State = { kind: 'working' } | { kind: 'ok' } | { kind: 'error'; message: string };

export default function VerifyEmailClient() {
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<State>({ kind: 'working' });
  // The token is one-use: React's development double-render would spend it
  // on the first call and report "already used" on the second.
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    if (!token) {
      setState({ kind: 'error', message: 'This link is missing its token.' });
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || data.message || 'This link is invalid or has expired.');
        }
        setState({ kind: 'ok' });
      } catch (err) {
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Something went wrong.',
        });
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Treyo</h1>
          <p className="text-muted text-sm mt-2">Email verification</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-xl text-center">
          {state.kind === 'working' && (
            <>
              <Loader2 className="w-10 h-10 text-accent mx-auto mb-3 animate-spin" />
              <p className="text-sm text-muted">Verifying your email…</p>
            </>
          )}

          {state.kind === 'ok' && (
            <>
              <CheckCircle2 className="w-10 h-10 text-accent mx-auto mb-3" />
              <p className="text-foreground font-semibold mb-1">Email verified</p>
              <p className="text-sm text-muted">
                Your account is confirmed. You can sign in from the Treyo app.
              </p>
            </>
          )}

          {state.kind === 'error' && (
            <>
              <XCircle className="w-10 h-10 text-danger mx-auto mb-3" />
              <p className="text-foreground font-semibold mb-1">Verification failed</p>
              <p className="text-sm text-muted">{state.message}</p>
              <p className="text-xs text-muted mt-3">
                You can request a new link from the app&apos;s sign-in screen.
              </p>
            </>
          )}
        </div>

        <p className="text-center text-xs text-muted mt-6">Treyo</p>
      </div>
    </div>
  );
}
