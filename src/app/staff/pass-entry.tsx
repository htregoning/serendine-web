'use client';

import { useState } from 'react';

// Staff: open a guest's pass by its typed code (when a camera isn't handy). Scanning the QR with the
// phone's camera opens the same page directly.
export default function PassEntry({ venueSlug }: { venueSlug: string }) {
  const [code, setCode] = useState('');
  const clean = code.toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, '');
  return (
    <form
      className="card col"
      style={{ gap: 8 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (clean.length === 8) window.location.assign(`/s/${clean}?v=${encodeURIComponent(venueSlug)}`);
      }}
    >
      <strong>Guest pass</strong>
      <span className="small">Point your phone camera at the guest&apos;s Serendine pass, or type the code under it.</span>
      <div className="row" style={{ gap: 8 }}>
        <input
          className="input grow"
          placeholder="ABCD-2345"
          autoCapitalize="characters"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Pass code"
          style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: 2 }}
        />
        <button className="btn btn-primary btn-sm" type="submit" disabled={clean.length !== 8}>Open</button>
      </div>
    </form>
  );
}
