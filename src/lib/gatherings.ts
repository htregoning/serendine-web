// Plan a night out: shared types and helpers.

export type Gathering = {
  id: string;
  code: string;
  title: string;
  starts_at: string;
  party_size: number;
  note: string | null;
  status: 'requested' | 'confirmed' | 'suggested' | 'declined' | 'cancelled';
  suggested_at: string | null;
  venue_note: string | null;
  venue_id: string;
  venue_name: string;
  venue_slug: string;
  place: string | null;
  organiser_name: string | null;
  going: number;
  i_am_organiser: boolean;
  my_rsvp: 'going' | 'maybe' | 'no' | null;
  members: { name: string; rsvp: 'going' | 'maybe' | 'no' }[];
  offer_text?: string | null; // after update 0027
};

export const TIME_ZONE = 'Asia/Dubai';

// "Fri 10 Oct, 20:00" in Dubai time, whatever the phone's setting.
export function when(iso: string, locale?: string) {
  return new Date(iso).toLocaleString(locale ?? 'en-GB', {
    timeZone: TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// A date and time typed on the form (Dubai time) → an exact moment.
export function fromDubaiLocal(date: string, time: string) {
  return new Date(`${date}T${time}:00+04:00`).toISOString();
}

export function inviteUrl(origin: string, code: string) {
  return `${origin}/g/${code}`;
}

export function whatsappLink(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export const STATUS_TEXT: Record<Gathering['status'], string> = {
  requested: 'Waiting for the venue to confirm',
  confirmed: 'Confirmed by the venue',
  suggested: 'The venue suggested another time',
  declined: "The venue can't take this booking",
  cancelled: 'Called off',
};
