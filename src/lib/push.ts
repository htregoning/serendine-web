import type { createClient } from '@/lib/supabase/client';

type Client = ReturnType<typeof createClient>;

export type PushState = 'unsupported' | 'needs-home-screen' | 'blocked' | 'off' | 'on' | 'not-configured';

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function pushState(): Promise<PushState> {
  if (!PUBLIC_KEY) return 'not-configured';
  if (!('serviceWorker' in navigator)) return 'unsupported';
  if (!('PushManager' in window) || !('Notification' in window)) {
    return isIOS() && !isStandalone() ? 'needs-home-screen' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'off';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub ? 'on' : 'off';
}

// Ask permission, subscribe this device, and save it for the signed-in person.
export async function enablePush(supabase: Client): Promise<PushState> {
  const state = await pushState();
  if (state !== 'off' && state !== 'on') return state;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(PUBLIC_KEY) }));
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return 'off';
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
  });
  return error ? 'off' : 'on';
}

// Re-save an existing subscription quietly (e.g. after signing in on a shared device).
export async function refreshPush(supabase: Client) {
  try {
    if ((await pushState()) === 'on') await enablePush(supabase);
  } catch {
    // ignore
  }
}

// Ask the server to notify the right people. Fire-and-forget.
export function notify(kind: 'message' | 'request_update' | 'new_request', id: string) {
  fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, id }),
    keepalive: true,
  }).catch(() => {});
}
