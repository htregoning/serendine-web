import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { telegramApi, webhookSecret } from '@/lib/telegram-server';

// One-click bot setup for the Serendine admin: open /api/telegram/setup while signed in.
// Connects the bot to this site, adds the "Open" menu button and the bot's description.
export async function GET(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return NextResponse.json({ ok: false, problem: 'TELEGRAM_BOT_TOKEN is not set in Vercel yet.' });

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc('is_platform_admin');
  if (!isAdmin) return NextResponse.json({ ok: false, problem: 'Sign in as the Serendine admin first, then open this page again.' }, { status: 403 });

  const origin = new URL(request.url).origin;
  const steps = {
    webhook: await telegramApi(botToken, 'setWebhook', {
      url: `${origin}/api/telegram/webhook`,
      secret_token: webhookSecret(botToken),
      allowed_updates: ['message'],
      drop_pending_updates: true,
    }),
    menuButton: await telegramApi(botToken, 'setChatMenuButton', {
      menu_button: { type: 'web_app', text: 'Open', web_app: { url: `${origin}/tg` } },
    }),
    description: await telegramApi(botToken, 'setMyDescription', {
      description:
        'Say hello to the next table. Scan the Serendine QR code at a restaurant, bar or event to chat with people in the room, anonymously until you both agree. 18+.',
    }),
    shortDescription: await telegramApi(botToken, 'setMyShortDescription', {
      short_description: 'Say hello to the next table 🥂 Anonymous until you both agree.',
    }),
    commands: await telegramApi(botToken, 'setMyCommands', {
      commands: [{ command: 'start', description: 'Open Serendine' }],
    }),
  };
  const ok = Object.values(steps).every((s) => s.ok);
  return NextResponse.json({
    ok,
    message: ok
      ? 'Telegram bot connected. Last step in @BotFather: Bot Settings › Configure Mini App › Enable, with this address: ' + `${origin}/tg`
      : 'Some steps failed; see details.',
    steps,
  });
}
