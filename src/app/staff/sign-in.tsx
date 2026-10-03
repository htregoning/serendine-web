'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function StaffSignIn() {
  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function google() {
    const next = window.location.pathname + window.location.search;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) setError('Sign-in did not work. Please try again.');
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname)}`, shouldCreateUser: false },
    });
    if (error) setError('We could not send the link. Is this the email your venue registered?');
    else setSent(true);
  }

  return (
    <main className="shell" style={{ justifyContent: 'center' }}>
      <div className="eyebrow" style={{ color: 'var(--accent)' }}>Serendine · Staff</div>
      <h1 className="display">Sign in to your staff screen</h1>
      <button className="btn btn-light" onClick={google}>Continue with Google</button>
      <div className="divider">or</div>
      {sent ? (
        <p className="card small">Check your email and open the link on this device.</p>
      ) : (
        <form className="col" onSubmit={send}>
          <label className="label" htmlFor="staff-email">Venue email</label>
          <input
            id="staff-email"
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn btn-primary" type="submit">Send sign-in link</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </main>
  );
}
