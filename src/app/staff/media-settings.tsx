'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// Manager switches for photos and videos.
export default function MediaSettings({ venueId, privateOn, groupOn }: { venueId: string; privateOn: boolean; groupOn: boolean }) {
  const [supabase] = useState(() => createClient());
  const [priv, setPriv] = useState(privateOn);
  const [group, setGroup] = useState(groupOn);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(field: 'photos_private' | 'photos_group', value: boolean, undo: () => void) {
    setMsg(null);
    const { error } = await supabase.from('venues').update({ [field]: value }).eq('id', venueId);
    if (error) {
      undo();
      setMsg('That did not save. Please try again.');
    } else setMsg('Saved.');
  }

  return (
    <div className="card col" style={{ gap: 12 }}>
      <strong>Photos and videos</strong>
      <label className="check">
        <input type="checkbox" checked={priv} onChange={(e) => { const v = e.target.checked; setPriv(v); save('photos_private', v, () => setPriv(!v)); }} />
        <span>Guests can send photos and short videos in private chats (encrypted; only the two of them can see them)</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={group} onChange={(e) => { const v = e.target.checked; setGroup(v); save('photos_group', v, () => setGroup(!v)); }} />
        <span>Guests can post photos to the group chat, once a member of staff approves each one</span>
      </label>
      <span className="small">Private chat photos are deleted after 7 days, group ones the next day. Guests can save anything to their phone.</span>
      {msg && <p className="small" role="status" style={{ margin: 0 }}>{msg}</p>}
    </div>
  );
}
