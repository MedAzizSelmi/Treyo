'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api';
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';

/**
 * Deliberately not using the shared axios instance: that one attaches the
 * admin token and redirects to /login on 401. This page is public and is
 * reached by learners and trainers from an email.
 */
export default function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The backend's message says which case it is: link already used,
        // expired, or invalid. Showing it beats a generic failure.
        throw new Error(data.error || data.message || 'This link is invalid or has expired.');
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Treyo</h1>
          <p className="text-muted text-sm mt-2">Choose a new password</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
          {!token ? (
            <p className="text-sm text-danger">
              This link is missing its token. Request a new password reset from the app.
            </p>
          ) : done ? (
            <div className="text-center">
              <CheckCircle2 className="w-10 h-10 text-accent mx-auto mb-3" />
              <p className="text-foreground font-semibold mb-1">Password updated</p>
              <p className="text-sm text-muted">
                You can now sign in with your new password in the Treyo app.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">New password</label>
                <div className="relative">
                  <input
                    type={show ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    className="w-full px-4 py-3 pr-11 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition"
                  >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Confirm password</label>
                <input
                  type={show ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50 transition"
                />
              </div>

              {error && (
                <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-sm text-danger">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-accent text-black font-bold rounded-xl hover:bg-accent/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? (<><Loader2 className="w-4 h-4 animate-spin" /> Updating…</>) : 'Update password'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-muted mt-6">
          Treyo &bull; Secure password reset
        </p>
      </div>
    </div>
  );
}
