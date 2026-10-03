'use client';

import { useState } from 'react';

function b64url(bytes: Uint8Array) {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// One-time setup helper: makes the notification keys in this browser.
// Nothing is sent or stored; copy the two values into Vercel.
export default function PushKeys() {
  const [keys, setKeys] = useState<{ pub: string; priv: string } | null>(null);

  async function make() {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const x = fromB64url(jwk.x!);
    const y = fromB64url(jwk.y!);
    const pub = new Uint8Array(65);
    pub[0] = 4;
    pub.set(x, 1);
    pub.set(y, 33);
    setKeys({ pub: b64url(pub), priv: jwk.d! });
  }

  return (
    <main className="shell">
      <h1 className="display">Notification keys</h1>
      <p className="lede">
        One-time setup. This makes a key pair in your browser. Nothing is sent anywhere; copy both values into Vercel
        › Settings › Environment Variables, then redeploy.
      </p>
      {!keys ? (
        <button className="btn btn-primary" onClick={make}>Make keys</button>
      ) : (
        <div className="col" style={{ gap: 16 }}>
          <div className="col">
            <span className="label">NEXT_PUBLIC_VAPID_PUBLIC_KEY</span>
            <code className="card" style={{ wordBreak: 'break-all', userSelect: 'all' }}>{keys.pub}</code>
          </div>
          <div className="col">
            <span className="label">VAPID_PRIVATE_KEY (secret: never share it)</span>
            <code className="card" style={{ wordBreak: 'break-all', userSelect: 'all' }}>{keys.priv}</code>
          </div>
          <p className="small">Tip: tap a value once to select it all, then copy.</p>
        </div>
      )}
    </main>
  );
}
