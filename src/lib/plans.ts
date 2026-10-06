// Plans and trial status, shared by the admin pages and the staff screen.

export type PlanName = 'trial' | 'starter' | 'venue' | 'group' | 'event' | 'free';
export type Access = 'off' | 'open' | 'trial' | 'paid' | 'grace' | 'ended';
export type VenuePlan = {
  plan: PlanName;
  access: Access;
  trial_ends_at: string | null;
  paid_until: string | null;
  days_left: number | null;
  switched_off: boolean;
};

export const PLAN_LABEL: Record<PlanName, string> = {
  trial: 'Free trial',
  starter: 'Starter · AED 299/mo',
  venue: 'Venue · AED 599/mo',
  group: 'Group · AED 449/venue',
  event: 'Event (one-off)',
  free: 'Free (no end date)',
};

export const GRACE_DAYS = 7;

export function day(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

// A short status line, e.g. "Trial · 12 days left", "Paid until 6 Nov 2026", "Switched off".
export function statusLine(p: Pick<VenuePlan, 'plan' | 'access' | 'trial_ends_at' | 'paid_until'>) {
  const left = (iso: string | null) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000) : 0);
  switch (p.access) {
    case 'off':
      return 'Switched off';
    case 'open':
      return p.plan === 'event' ? 'Event' : 'Free';
    case 'trial': {
      const n = left(p.trial_ends_at);
      return `Trial · ${n} day${n === 1 ? '' : 's'} left`;
    }
    case 'paid':
      return `Paid until ${day(p.paid_until)}`;
    case 'grace': {
      const end = p.plan === 'trial' ? p.trial_ends_at : p.paid_until;
      const n = Math.max(0, left(end) + GRACE_DAYS);
      return `${p.plan === 'trial' ? 'Trial ended' : 'Payment due'} · pauses in ${n} day${n === 1 ? '' : 's'}`;
    }
    case 'ended':
      return 'Paused · plan ended';
  }
}

// yyyy-mm-dd for <input type="date">, in Dubai time.
export function dateInput(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' }) : '';
}

// The end of a Dubai calendar day, as an exact moment.
export function endOfDubaiDay(date: string) {
  return new Date(`${date}T23:59:00+04:00`).toISOString();
}

// A date n days or months on from today (or from a given date if later), as yyyy-mm-dd.
export function addFrom(base: string | null, days: number, months = 0) {
  const start = base && new Date(base).getTime() > Date.now() ? new Date(base) : new Date();
  start.setMonth(start.getMonth() + months);
  start.setDate(start.getDate() + days);
  return start.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
}
