import { NextResponse } from 'next/server';
import { sendNotification, setVapidDetails, type WebPushError } from 'web-push';
import { createClient } from '@/lib/supabase/server';
import { sendTelegram } from '@/lib/telegram-server';

type Target = { endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string; tag: string };

const FUNCTIONS = {
  message: 'push_for_message',
  request_update: 'push_for_request_update',
  new_request: 'push_for_new_request',
  drink: 'push_for_drink',
  test: 'push_for_test',
  announcement: 'push_for_announcement',
  order: 'push_for_order',
  gathering: 'push_for_gathering',
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sends push notifications on behalf of the signed-in person. The database decides
// who may be notified (and only right after the person acted), so this can't be
// used to message strangers.
export async function POST(request: Request) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if ((!publicKey || !privateKey) && !botToken) return NextResponse.json({ sent: 0, reason: 'not configured' });

  let body: { kind?: unknown; id?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const kind = String(body.kind ?? '');
  const id = String(body.id ?? '');
  if (!(kind in FUNCTIONS) || (kind !== 'test' && !UUID.test(id))) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const supabase = await createClient();
  const fn = FUNCTIONS[kind as keyof typeof FUNCTIONS];
  const arg = kind === 'test' ? {} : kind === 'message' ? { c: id } : kind === 'drink' || kind === 'announcement' ? { p_id: id } : { r: id };
  const { data, error } = await supabase.rpc(fn, arg);
  if (error) {
    return NextResponse.json({ sent: 0, reason: error.code === 'PGRST202' ? 'database update missing' : 'error' });
  }

  if (publicKey && privateKey) {
    setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:serendiners@gmail.com', publicKey, privateKey);
  }

  const origin = new URL(request.url).origin;
  const targets = (data as Target[] | null) ?? [];
  let sent = 0;
  await Promise.all(
    targets.map(async (t) => {
      // Telegram users get a message from the bot instead of a browser notification.
      if (t.endpoint.startsWith('tg:')) {
        if (!botToken) return;
        const status = await sendTelegram(botToken, t.endpoint.slice(3), `${t.title}\n${t.body}`, `${origin}${t.url}`).catch(() => 0);
        if (status === 200) sent++;
        else if (status === 403) await supabase.rpc('prune_push_subscription', { p_endpoint: t.endpoint });
        return;
      }
      if (!publicKey || !privateKey) return;
      try {
        await sendNotification(
          { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
          JSON.stringify({ title: t.title, body: t.body, url: t.url, tag: t.tag }),
          { TTL: 600, urgency: 'high' },
        );
        sent++;
      } catch (e) {
        const status = (e as WebPushError).statusCode;
        if (status === 404 || status === 410) {
          await supabase.rpc('prune_push_subscription', { p_endpoint: t.endpoint });
        }
      }
    }),
  );
  if (kind === 'test' && targets.length === 0) return NextResponse.json({ sent: 0, reason: 'no devices' });
  return NextResponse.json({ sent, reason: sent === 0 && targets.length > 0 ? 'push service refused' : undefined });
}
