export type ChatMode = 'friendly' | 'networking' | 'dating';

export const MODE_LABELS: Record<ChatMode, string> = {
  friendly: 'Friendly chat',
  networking: 'Networking',
  dating: 'Dating',
};

export type VenueAtTable = {
  venue_id: string;
  venue_slug: string;
  venue_name: string;
  accent: string;
  offer_enabled: boolean;
  offer_text: string;
  table_id: string;
  table_label: string;
  drinks_enabled?: boolean;
  kind?: 'venue' | 'event';
  starts_at?: string | null;
  ends_at?: string | null;
  place?: string | null;
  requests_enabled?: boolean;
  zone?: string;
  // The venue's look and the chat modes it offers (after database update 0019).
  theme?: import('./theme').VenueTheme | null;
  logo_url?: string | null;
  allowed_modes?: ChatMode[];
};

// "Table 12" at a restaurant, "North Stand" at an event.
export function whereLabel(v: Pick<VenueAtTable, 'kind' | 'table_label'>) {
  return v.kind === 'event' ? v.table_label : `Table ${v.table_label}`;
}

// Whether an event is open for check-in right now (3 hours either side).
export function eventWindow(v: Pick<VenueAtTable, 'kind' | 'starts_at' | 'ends_at'>): 'open' | 'early' | 'over' {
  if (v.kind !== 'event') return 'open';
  const now = Date.now();
  if (v.starts_at && now < new Date(v.starts_at).getTime() - 3 * 3600000) return 'early';
  if (v.ends_at && now > new Date(v.ends_at).getTime() + 3 * 3600000) return 'over';
  return 'open';
}

export function eventDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

export type RequestKind = 'waiter' | 'bill' | 'water' | 'order' | 'again' | 'other' | 'help';
// The buttons a venue can offer guests, in the order they appear ("help" is always available).
export const REQUEST_BUTTONS: Exclude<RequestKind, 'help'>[] = ['order', 'again', 'waiter', 'bill', 'water', 'other'];
export type RequestStatus = 'sent' | 'seen' | 'done' | 'cancelled';

export type Gender = 'male' | 'female' | 'unspecified';

export const GENDER_LABELS: Record<Gender, string> = {
  male: 'Male',
  female: 'Female',
  unspecified: 'Prefer not to say',
};

// Short label shown next to a name; nothing for "prefer not to say".
export function genderTag(g?: string | null): string | null {
  return g === 'male' ? 'Male' : g === 'female' ? 'Female' : null;
}
