import { createHmac, timingSafeEqual } from 'node:crypto';

export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  allows_write_to_pm?: boolean;
};

// Checks that Mini App launch data really came from Telegram for our bot.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export function verifyInitData(initData: string, botToken: string, maxAgeSeconds = 86400) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  params.delete('hash');
  const check = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(check).digest();
  const given = Buffer.from(hash, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) return null;

  try {
    const user = JSON.parse(params.get('user') ?? 'null') as TelegramUser | null;
    if (!user || typeof user.id !== 'number') return null;
    return { user, startParam: params.get('start_param') };
  } catch {
    return null;
  }
}

export const TELEGRAM_EMAIL_DOMAIN = 'telegram.serendine.com';

export function telegramEmail(id: number) {
  return `tg-${id}@${TELEGRAM_EMAIL_DOMAIN}`;
}

// Sends a notification as a Telegram message with a button that opens the right screen.
export async function sendTelegram(botToken: string, chatId: string, text: string, url: string) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[{ text: 'Open Serendine', web_app: { url } }]] },
    }),
  });
  return res.status;
}

// The secret Telegram sends with every webhook call, derived from the bot token.
export function webhookSecret(botToken: string) {
  return createHmac('sha256', 'serendine-webhook').update(botToken).digest('hex').slice(0, 48);
}

export async function telegramApi(botToken: string, method: string, body: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; description?: string };
}
