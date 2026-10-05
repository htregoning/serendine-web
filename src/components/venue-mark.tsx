/* eslint-disable @next/next/no-img-element */
import type { VenueAtTable } from '@/lib/types';

// The venue's logo if it has one, otherwise its first letter in a circle.
export default function VenueMark({ venue, size = 44 }: { venue: Pick<VenueAtTable, 'venue_name' | 'logo_url'>; size?: number }) {
  if (venue.logo_url) {
    return <img className="venue-logo" src={venue.logo_url} alt={venue.venue_name} style={{ height: size }} />;
  }
  return (
    <div className="avatar" style={{ background: 'var(--accent)', color: 'var(--on-accent)', width: size, height: size }}>
      {venue.venue_name.trim().charAt(0).toUpperCase()}
    </div>
  );
}
