import { NextResponse } from 'next/server';
import { recordUnsubscribe, validUnsubscribe } from '@/lib/unsubscribe-server';

// One-click unsubscribe (from the email app's own button, or the confirm button on /unsubscribe).
export async function POST(request: Request) {
  const url = new URL(request.url);
  let v = url.searchParams.get('v') ?? '';
  let u = url.searchParams.get('u') ?? '';
  let s = url.searchParams.get('s') ?? '';
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null);
    v = String(form?.get('v') ?? v);
    u = String(form?.get('u') ?? u);
    s = String(form?.get('s') ?? s);
  }
  if (!validUnsubscribe(v, u, s)) return NextResponse.json({ ok: false }, { status: 400 });
  const ok = await recordUnsubscribe(v, u);
  if (type.includes('form')) return NextResponse.redirect(new URL(`/unsubscribe?v=${v}&done=${ok ? 1 : 0}`, url.origin), 303);
  return NextResponse.json({ ok });
}
