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
};

export type RequestKind = 'waiter' | 'bill' | 'water';
export type RequestStatus = 'sent' | 'seen' | 'done' | 'cancelled';
