'use client';

import { useEffect, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import { GRACE_DAYS, PLAN_LABEL, day, type VenuePlan } from '@/lib/plans';

type Client = ReturnType<typeof createClient>;

const CONTACT = 'mailto:serendiners@gmail.com?subject=Serendine%20plan';

// Managers only: the free trial countdown, payment reminders, and whether guests can check in.
export default function PlanBanner({ supabase, venueId }: { supabase: Client; venueId: string }) {
  const [p, setP] = useState<VenuePlan | null>(null);

  useEffect(() => {
    supabase.rpc('venue_plan', { v: venueId }).then(({ data, error }: { data: VenuePlan[] | null; error: unknown }) => {
      if (!error) setP((data ?? [])[0] ?? null); // nothing for staff, or before update 0028
    });
  }, [supabase, venueId]);

  if (!p) return null;
  const left = p.days_left ?? 0;
  const graceLeft = (end: string | null) =>
    end ? Math.max(0, Math.ceil((new Date(end).getTime() + GRACE_DAYS * 86400000 - Date.now()) / 86400000)) : 0;

  let tone: '' | 'warn' | 'stop' = '';
  let title = '';
  let body = '';
  switch (p.access) {
    case 'trial':
      tone = left <= 7 ? 'warn' : '';
      title = `Free trial · ${left} day${left === 1 ? '' : 's'} left`;
      body = `Runs until ${day(p.trial_ends_at)}. Choose a plan any time to carry on without a break.`;
      break;
    case 'paid':
      if (left > 7) return null; // nothing to say while comfortably paid
      tone = 'warn';
      title = `${PLAN_LABEL[p.plan]} · renews in ${left} day${left === 1 ? '' : 's'}`;
      body = `Paid until ${day(p.paid_until)}.`;
      break;
    case 'grace': {
      const n = graceLeft(p.plan === 'trial' ? p.trial_ends_at : p.paid_until);
      tone = 'warn';
      title = p.plan === 'trial' ? 'Your free trial has ended' : 'Your payment is due';
      body = `Guests can still check in for ${n} more day${n === 1 ? '' : 's'}. After that Serendine pauses here until the plan is renewed.`;
      break;
    }
    case 'ended':
      tone = 'stop';
      title = 'Serendine is paused here';
      body = 'Your plan has ended, so guests can’t check in. Your settings, menu and guest list are all kept. Renew to switch straight back on.';
      break;
    case 'off':
      tone = 'stop';
      title = 'Serendine is switched off here';
      body = 'Guests who scan a code are told it isn’t running right now. Contact us to switch it back on.';
      break;
    default:
      return null; // free or event plans
  }

  return (
    <div className={`plan-banner ${tone}`} role="status">
      <div className="col grow" style={{ gap: 2, minWidth: 220 }}>
        <strong>{title}</strong>
        <span className="small">{body}</span>
      </div>
      <a className="btn btn-primary btn-sm" href={CONTACT} style={{ textDecoration: 'none' }}>
        {p.access === 'trial' ? 'Choose a plan' : p.access === 'paid' ? 'Renew' : 'Talk to us'}
      </a>
    </div>
  );
}
