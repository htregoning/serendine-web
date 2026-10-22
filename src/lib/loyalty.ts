// Loyalty: shared types.
export type LoyaltyKind = 'visits' | 'stamps';
export type MyCard = {
  venue_id: string;
  venue_name: string;
  scheme_id: string;
  scheme: string;
  kind: LoyaltyKind;
  item: string | null;
  target: number;
  reward: string;
  progress: number;
  ready: number;
};
