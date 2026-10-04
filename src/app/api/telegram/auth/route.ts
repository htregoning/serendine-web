import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { telegramEmail, verifyInitData } from '@/lib/telegram-server';

// Signs a person in from inside the Telegram mini app.
// Telegram vouches for who they are (the signed launch data); we then open a
// normal Serendine session for a matching account, creating it the first time.
export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!botToken || !serviceKey || !url) {
    return NextResponse.json({ error: 'Telegram sign-in is not set up yet.' }, { status: 503 });
  }

  let body: { initData?: unknown; writeAccess?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const verified = verifyInitData(String(body.initData ?? ''), botToken);
  if (!verified) return NextResponse.json({ error: 'Telegram could not confirm who you are. Close and reopen the app.' }, { status: 401 });

  const tg = verified.user;
  const email = telegramEmail(tg.id);
  const fullName = [tg.first_name, tg.last_name].filter(Boolean).join(' ').trim() || (tg.username ? `@${tg.username}` : 'Telegram user');
  const meta = { full_name: fullName, telegram_id: tg.id, telegram_username: tg.username ?? null, provider: 'telegram' };

  const admin = createAdminClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // First visit: make the account. Later visits: this fails harmlessly because it exists.
  const created = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: meta });

  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error || !link.data?.properties?.hashed_token) {
    return NextResponse.json({ error: 'Sign-in failed. Please try again.' }, { status: 500 });
  }
  const userId = link.data.user?.id ?? created.data?.user?.id;
  if (!created.data?.user && userId) {
    // Keep their name current if they changed it in Telegram.
    await admin.auth.admin.updateUserById(userId, { user_metadata: meta });
  }

  const supabase = await createClient();
  let { error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: link.data.properties.hashed_token });
  if (error) ({ error } = await supabase.auth.verifyOtp({ type: 'email', token_hash: link.data.properties.hashed_token }));
  if (error) return NextResponse.json({ error: 'Sign-in failed. Please try again.' }, { status: 500 });

  // Notifications arrive as messages from the bot, once they've allowed it.
  if (userId && (tg.allows_write_to_pm || body.writeAccess === true)) {
    await admin
      .from('push_subscriptions')
      .upsert({ endpoint: `tg:${tg.id}`, user_id: userId, p256dh: 'telegram', auth: 'telegram' }, { onConflict: 'endpoint' });
  }

  const start = verified.startParam && /^[A-Za-z0-9_-]{6,64}$/.test(verified.startParam) ? verified.startParam : null;
  return NextResponse.json({ ok: true, start });
}
