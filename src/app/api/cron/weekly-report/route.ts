import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { emailConfigured, reportEmail, sendEmails, type WeekNumbers } from '@/lib/email';

// Every Monday morning (see vercel.json) Vercel calls this to email each venue's managers.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || !emailConfigured()) {
    return NextResponse.json({ ok: false, problem: 'Supabase service key or Resend key missing' });
  }
  const admin = createAdminClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin.rpc('weekly_report_rows');
  if (error) return NextResponse.json({ ok: false, problem: error.message });

  type Row = WeekNumbers & { venue_name: string; venue_slug: string; manager_emails: string[] };
  const origin = process.env.SITE_URL || new URL(request.url).origin;
  const emails = ((data as Row[] | null) ?? [])
    .filter((r) => r.manager_emails?.length > 0 && (r.check_ins > 0 || r.ratings > 0 || r.requests > 0))
    .map((r) => ({ to: r.manager_emails, ...reportEmail(r.venue_name, r, `${origin}/staff/guests?v=${r.venue_slug}`) }));
  const sent = await sendEmails(emails);
  return NextResponse.json({ ok: true, venues: emails.length, sent });
}
