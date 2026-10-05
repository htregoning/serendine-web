import { createClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/;

// A venue's logo as an image file, so phones can cache it (the ?v= in the link changes when it's replaced).
export async function GET(request: Request, { params }: { params: Promise<{ venue: string }> }) {
  const { venue } = await params;
  if (!UUID.test(venue)) return new Response('Not found', { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.rpc('venue_logo', { v: venue });
  const m = typeof data === 'string' ? DATA_URL.exec(data) : null;
  if (!m) return new Response('Not found', { status: 404 });
  const versioned = new URL(request.url).searchParams.has('v');
  return new Response(Buffer.from(m[2], 'base64'), {
    headers: {
      'Content-Type': m[1],
      'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
