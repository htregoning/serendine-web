import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Google, Apple and email sign-in links all return here.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  // Only allow redirects back into this site.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
  }
  return NextResponse.redirect(`${origin}${safeNext}${safeNext.includes('?') ? '&' : '?'}signin=failed`);
}
