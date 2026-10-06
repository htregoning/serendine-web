'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { createClient } from '@/lib/supabase/client';
import { PLAN_LABEL, addFrom, dateInput, day, endOfDubaiDay, statusLine, type PlanName, type VenuePlan } from '@/lib/plans';

type Client = ReturnType<typeof createClient>;

// Admin only: plan, trial and payment dates, switching the venue on and off, and deleting it.
export default function PlanPanel({ supabase, venueId, venueName }: { supabase: Client; venueId: string; venueName: string }) {
  const router = useRouter();
  const [p, setP] = useState<VenuePlan | null | undefined>(undefined);
  const [plan, setPlan] = useState<PlanName>('trial');
  const [trialEnds, setTrialEnds] = useState('');
  const [paidUntil, setPaidUntil] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('venue_plan', { v: venueId });
    if (error) return setP(null); // before update 0028
    const row = ((data as VenuePlan[] | null) ?? [])[0] ?? null;
    setP(row);
    if (row) {
      setPlan(row.plan);
      setTrialEnds(dateInput(row.trial_ends_at));
      setPaidUntil(dateInput(row.paid_until));
    }
  }, [supabase, venueId]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const { error } = await fn();
    setBusy(false);
    if (error) return setErr(error.message);
    setMsg(ok);
    load();
  }

  const save = () =>
    act(
      () =>
        supabase.rpc('admin_set_plan', {
          v: venueId,
          p_plan: plan,
          p_trial_ends: trialEnds ? endOfDubaiDay(trialEnds) : null,
          p_paid_until: paidUntil ? endOfDubaiDay(paidUntil) : null,
        }),
      'Plan saved.',
    );

  async function remove() {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc('admin_delete_venue', { v: venueId, p_confirm_name: confirmName });
    setBusy(false);
    if (error) return setErr(error.message);
    router.push('/admin');
  }

  if (p === undefined) return null;
  if (p === null) {
    return <p className="card small">Plans, trials and switching off need database update 0028.</p>;
  }

  const paidPlan = plan === 'starter' || plan === 'venue' || plan === 'group';
  return (
    <section className="card col" style={{ gap: 14 }} aria-label="Plan and status">
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <strong className="grow" style={{ fontSize: 18 }}>Plan and status</strong>
        <span className={`pill plan-${p.access}`}>{statusLine(p)}</span>
      </div>

      <div className="col" style={{ gap: 6 }}>
        <label className="label" htmlFor="plan-pick" style={{ margin: 0 }}>Plan</label>
        <select id="plan-pick" className="input" value={plan} onChange={(e) => setPlan(e.target.value as PlanName)} style={{ maxWidth: 320 }}>
          {(Object.keys(PLAN_LABEL) as PlanName[]).map((k) => (
            <option key={k} value={k}>{PLAN_LABEL[k]}</option>
          ))}
        </select>
      </div>

      {plan === 'trial' && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="col">
            <label className="label" htmlFor="trial-end" style={{ margin: 0 }}>Trial ends</label>
            <input id="trial-end" className="input" type="date" value={trialEnds} onChange={(e) => setTrialEnds(e.target.value)} style={{ width: 180 }} />
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTrialEnds(addFrom(p.trial_ends_at, 7))}>+ 1 week</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTrialEnds(addFrom(p.trial_ends_at, 0, 1))}>+ 1 month</button>
        </div>
      )}

      {paidPlan && (
        <div className="col" style={{ gap: 6 }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="col">
              <label className="label" htmlFor="paid-until" style={{ margin: 0 }}>Paid until</label>
              <input id="paid-until" className="input" type="date" value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} style={{ width: 180 }} />
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPaidUntil(addFrom(p.paid_until, 0, 1))}>+ 1 month paid</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPaidUntil(addFrom(p.paid_until, 0, 12))}>+ 1 year paid</button>
          </div>
          <span className="small">Record a payment here when it arrives (bank transfer, card link). Card payments will update this automatically later.</span>
        </div>
      )}

      <span className="small">
        When a trial or paid period ends, the venue gets 7 days&apos; grace (managers see a reminder), then guests can&apos;t check in until it&apos;s
        extended. Staff screens and settings keep working.
      </span>
      <button className="btn btn-primary btn-sm" onClick={save} disabled={busy} style={{ alignSelf: 'flex-start' }}>Save plan</button>

      <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '4px 0', width: '100%' }} />

      <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="col grow" style={{ gap: 2, minWidth: 220 }}>
          <strong>{p.switched_off ? 'Switched off' : 'Switched on'}</strong>
          <span className="small">
            {p.switched_off
              ? 'Guests who scan a code see "Serendine isn\'t running here right now". Nothing is deleted.'
              : 'Switching off checks everyone out and stops new check-ins straight away. You can switch back on any time.'}
          </span>
        </div>
        <button
          className={p.switched_off ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
          disabled={busy}
          onClick={() => act(() => supabase.rpc('admin_switch_venue', { v: venueId, p_on: p.switched_off }), p.switched_off ? 'Switched on.' : 'Switched off.')}
        >
          {p.switched_off ? 'Switch on' : 'Switch off'}
        </button>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '4px 0', width: '100%' }} />

      {!showDelete ? (
        <button className="link-danger" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => setShowDelete(true)}>Delete this venue…</button>
      ) : (
        <div className="col" style={{ gap: 8 }}>
          <strong style={{ color: 'var(--danger)' }}>Delete {venueName} for good</strong>
          <span className="small">
            This removes the venue and everything in it: tables and QR codes, the team, visits, chats, orders, the guest list, ratings and
            planned nights. It can&apos;t be undone. To pause it instead, switch it off.
          </span>
          <label className="small" htmlFor="del-name">Type <b>{venueName}</b> to confirm</label>
          <input id="del-name" className="input" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" style={{ maxWidth: 360 }} />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-sm btn-danger" disabled={busy || confirmName.trim() !== venueName} onClick={remove}>Delete for good</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowDelete(false); setConfirmName(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {(msg || err) && <p className={err ? 'error' : 'small'} role="status" style={{ margin: 0 }}>{err ?? msg}</p>}
      {p.paid_until && !paidPlan && <span className="small">Last paid until {day(p.paid_until)}.</span>}
    </section>
  );
}
