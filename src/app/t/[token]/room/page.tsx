import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { venueAtTable } from '@/lib/venue-server';
import type { ChatMode } from '@/lib/types';
import Room from './room';

export default async function RoomPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();

  const venue = await venueAtTable(token);
  if (!venue) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/t/${token}`);

  const { data: visit } = await supabase
    .from('visits')
    .select('id, alias, mode, is_open, marketing_opt_in, table_id, gender')
    .is('ended_at', null)
    .maybeSingle();
  if (!visit || visit.table_id !== venue.table_id) redirect(`/t/${token}`);

  const { data: photo } = await supabase.rpc('visit_photo', { v: visit.id });

  const { data: v } = await supabase.from('venues').select('menu_pdf_path').eq('id', venue.venue_id).single();
  const menuUrl = v?.menu_pdf_path
    ? supabase.storage.from('menus').getPublicUrl(v.menu_pdf_path as string).data.publicUrl
    : null;

  return (
    <Room
      token={token}
      venue={venue}
      menuUrl={menuUrl}
      visit={{
        id: visit.id as string,
        alias: visit.alias as string,
        mode: visit.mode as ChatMode,
        isOpen: visit.is_open as boolean,
        optedIn: visit.marketing_opt_in as boolean,
        gender: (visit.gender as string) ?? 'unspecified',
        hasPhoto: typeof photo === 'string' && photo.length > 0,
      }}
    />
  );
}
