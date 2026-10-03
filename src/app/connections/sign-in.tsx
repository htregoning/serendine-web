'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function GuestSignIn() {
  const [supabase] = useState(() => createClient());
  const [error, setError] = useState<string | null>(null);

  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/connections` },
    });
    if (error) setError('Sign-in did not work. Please try again.');
  }

  return (
    <main className="shell" style={{ justifyContent: 'center' }}>
      <div className="eyebrow" style={{ color: 'var(--accent)' }}>Serendine</div>
      <h1 className="display">Your connections</h1>
      <p className="lede">Sign in with the account you used at the venue to see the people you kept in touch with.</p>
      <button className="btn btn-light" onClick={google}>Continue with Google</button>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
