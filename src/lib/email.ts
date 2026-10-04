import { createHmac } from 'node:crypto';

// Sending email through Resend (https://resend.com). Server only.

export type Email = { to: string | string[]; subject: string; html: string; text: string; replyTo?: string; headers?: Record<string, string> };

export function emailConfigured() {
  return !!process.env.RESEND_API_KEY;
}

const FROM = () => process.env.EMAIL_FROM || 'Serendine <hello@serendine.com>';

// Sends up to 100 emails per request; returns how many Resend accepted.
export async function sendEmails(emails: Email[]): Promise<number> {
  const key = process.env.RESEND_API_KEY;
  if (!key || emails.length === 0) return 0;
  let ok = 0;
  for (let i = 0; i < emails.length; i += 100) {
    const batch = emails.slice(i, i + 100).map((e) => ({
      from: FROM(),
      to: Array.isArray(e.to) ? e.to : [e.to],
      subject: e.subject,
      html: e.html,
      text: e.text,
      ...(e.replyTo ? { reply_to: e.replyTo } : {}),
      ...(e.headers ? { headers: e.headers } : {}),
    }));
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    }).catch(() => null);
    if (res?.ok) {
      const out = (await res.json().catch(() => null)) as { data?: unknown[] } | null;
      ok += Array.isArray(out?.data) ? out!.data!.length : batch.length;
    }
  }
  return ok;
}

export function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// The branded wrapper every Serendine email uses.
export function layout(title: string, bodyHtml: string, footerHtml: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#0B1A3A;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0B1A3A;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px">
<tr><td style="padding:0 8px 20px;color:#FF7DB8;font-size:13px;font-weight:bold;letter-spacing:4px;text-transform:uppercase">Serendine</td></tr>
<tr><td style="background:#12244D;border:1px solid #2D4A88;border-radius:16px;padding:28px;color:#FFC7E1;font-size:16px;line-height:1.55">
<h1 style="margin:0 0 16px;color:#FF2E93;font-size:24px;line-height:1.25">${esc(title)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:18px 8px;color:#CC6AA0;font-size:12px;line-height:1.5">${footerHtml}</td></tr>
</table></td></tr></table></body></html>`;
}

function secret() {
  return process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

export function unsubscribeSig(venueId: string, userId: string) {
  return createHmac('sha256', secret()).update(`${venueId}:${userId}`).digest('hex').slice(0, 32);
}

export function unsubscribeUrl(origin: string, venueId: string, userId: string) {
  return `${origin}/unsubscribe?v=${venueId}&u=${userId}&s=${unsubscribeSig(venueId, userId)}`;
}

export type WeekNumbers = {
  check_ins: number;
  guests: number;
  new_guests: number;
  returning_guests: number;
  opted_in: number;
  drinks: number;
  offers: number;
  requests: number;
  avg_rating: number | null;
  ratings: number;
  low_ratings: number;
  avg_answer_seconds: number | null;
};

export function answerTime(s: number | null) {
  if (s === null || s === undefined) return '–';
  if (s < 60) return `${s} sec`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${r} sec` : `${m} min`;
}

// The Monday report for one venue.
export function reportEmail(venueName: string, n: WeekNumbers, guestsUrl: string) {
  const rows: [string, string][] = [
    ['Check-ins', String(n.check_ins)],
    ['Guests', String(n.guests)],
    ['New guests', String(n.new_guests)],
    ['Returning guests', String(n.returning_guests)],
    ['Opted in to your offers', String(n.opted_in)],
    ['Drinks sent between tables', String(n.drinks)],
    ['Welcome offers used', String(n.offers)],
    ['Table requests', String(n.requests)],
    ['Average answer time', answerTime(n.avg_answer_seconds)],
    ['Average rating', n.avg_rating !== null && n.ratings > 0 ? `${n.avg_rating} / 5 from ${n.ratings}` : 'No ratings yet'],
  ];
  const table = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 0;border-top:1px solid #2D4A88;color:#FFC7E1">${esc(k)}</td><td align="right" style="padding:8px 0;border-top:1px solid #2D4A88;color:#FF2E93;font-weight:bold">${esc(v)}</td></tr>`,
    )
    .join('');
  const low =
    n.low_ratings > 0
      ? `<p style="margin:16px 0 0;color:#FF7DB8"><b>${n.low_ratings} guest${n.low_ratings === 1 ? '' : 's'}</b> rated 3 stars or fewer. Their comments are on your Guests page.</p>`
      : '';
  const html = layout(
    `${venueName}: your week on Serendine`,
    `<p style="margin:0 0 12px">Here's how the last 7 days went.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:15px">${table}</table>${low}
<p style="margin:24px 0 0"><a href="${esc(guestsUrl)}" style="display:inline-block;background:#FF2E93;color:#0B1A3A;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:999px">Open your guest list</a></p>`,
    `You get this every Monday as a manager of ${esc(venueName)} on Serendine. Turn it off on your staff screen under Manager.`,
  );
  const text = `${venueName}: your week on Serendine\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nGuest list: ${guestsUrl}`;
  return { subject: `${venueName}: your week on Serendine`, html, text };
}

// A venue's message to a past guest.
export function campaignEmail(venueName: string, subject: string, body: string, unsubscribe: string) {
  const paras = esc(body)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  const html = layout(
    subject,
    `<p style="margin:0 0 14px;color:#FF7DB8;font-weight:bold">From ${esc(venueName)}</p>${paras}`,
    `You're getting this because you asked ${esc(venueName)} for offers when you checked in with Serendine. <a href="${esc(unsubscribe)}" style="color:#FF7DB8">Unsubscribe from ${esc(venueName)}</a>.`,
  );
  const text = `From ${venueName}\n\n${body}\n\nUnsubscribe: ${unsubscribe}`;
  return { html, text };
}
