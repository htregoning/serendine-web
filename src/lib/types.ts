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
};

export type RequestKind = 'waiter' | 'bill' | 'water';
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
