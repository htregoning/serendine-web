'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import ProfileForm, { useMyProfile } from '@/components/profile-form';

// Your saved details: change them any time, or sign out (back to the Serendine home page).
export default function DetailsScreen() {
  const [supabase] = useState(() => createClient());
  const [profile, setProfile] = useMyProfile();
  const [saved, setSaved] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.assign('/');
  }

  return (
    <main className="shell">
      <a className="small" href="/me" style={{ alignSelf: 'flex-start' }}>‹ Your places and plans</a>
      {profile === null && <div style={{ flex: 1 }} />}
      {profile === undefined && <p className="card small">Saved details arrive with the next database update (0031).</p>}
      {profile && (
        <ProfileForm
          initial={profile}
          onSaved={(p) => {
            setProfile(p);
            setSaved(true);
          }}
          title="Your details"
          lede="Saved for every Serendine venue. Never shown to other guests."
          submitLabel="Save my details"
        />
      )}
      {saved && <p className="small" role="status" style={{ margin: 0 }}>Saved.</p>}
      <button className="btn btn-ghost btn-sm" onClick={signOut} style={{ alignSelf: 'center' }}>Sign out</button>
    </main>
  );
}
