import { NextResponse } from 'next/server';
import { telegramApi, webhookSecret } from '@/lib/telegram-server';

type Update = { message?: { chat?: { id?: number; type?: string }; text?: string } };

// Replies when someone messages the bot directly, e.g. /start.
export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return NextResponse.json({ ok: true });
  if (request.headers.get('x-telegram-bot-api-secret-token') !== webhookSecret(botToken)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = (await request.json().catch(() => ({}))) as Update;
  const chat = update.message?.chat;
  if (!chat?.id || chat.type !== 'private') return NextResponse.json({ ok: true });

  const origin = new URL(request.url).origin;
  const text = (update.message?.text ?? '').trim();
  const start = text.match(/^\/start\s+([A-Za-z0-9_-]{6,64})$/);
  const url = start ? `${origin}/tg?to=/t/${start[1]}` : `${origin}/tg`;

  await telegramApi(botToken, 'sendMessage', {
    chat_id: chat.id,
    text:
      'Welcome to Serendine 🥂\n\nScan the QR code on your table, or tap below. ' +
      'Say hello to other tables, anonymously until you both agree.\n\n' +
      'Notifications for new messages and drinks will arrive here.',
    reply_markup: { inline_keyboard: [[{ text: 'Open Serendine', web_app: { url } }]] },
  });
  return NextResponse.json({ ok: true });
}
