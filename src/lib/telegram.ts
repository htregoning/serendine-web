// Browser helpers for the Telegram mini app.

export type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: { user?: { allows_write_to_pm?: boolean }; start_param?: string };
  ready: () => void;
  expand: () => void;
  setHeaderColor: (c: string) => void;
  setBackgroundColor: (c: string) => void;
  requestWriteAccess?: (cb: (ok: boolean) => void) => void;
  showScanQrPopup?: (params: { text?: string }, cb: (text: string) => boolean | void) => void;
  closeScanQrPopup?: () => void;
};

const KEY = 'serendine-in-telegram';

// Remember for this session that we're inside Telegram, so later pages
// offer Telegram sign-in (Google sign-in doesn't work inside Telegram).
export function markTelegram() {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // ignore
  }
}

export function inTelegram(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

// A scanned table code is a link like https://serendine.com/t/abc123..., or a t.me link with startapp=.
export function tableTokenFromText(text: string): string | null {
  const web = text.match(/\/t\/([A-Za-z0-9_-]{6,64})/);
  if (web) return web[1];
  const tme = text.match(/[?&]startapp=([A-Za-z0-9_-]{6,64})/);
  return tme ? tme[1] : null;
}

export const TELEGRAM_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT ?? '';

export function telegramLink(token: string) {
  return TELEGRAM_BOT ? `https://t.me/${TELEGRAM_BOT}?startapp=${token}` : '';
}
