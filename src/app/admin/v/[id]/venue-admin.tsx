'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Table = { id: string; label: string; zone: string; qr_token: string; guests_now: number };
type Member = { user_id: string | null; invite_id: string | null; email: string; role: 'manager' | 'staff'; pending: boolean };

export default function VenueAdmin({ venue, me }: { venue: { id: string; slug: string; name: string }; me: string }) {
  const [supabase] = useState(() => createClient());
  const [name, setName] = useState(venue.name);
  const [tables, setTables] = useState<Table[]>([]);
  const [team, setTeam] = useState<Member[]>([]);
  const [edit, setEdit] = useState<Record<string, { label: string; zone: string }>>({});
  const [addCount, setAddCount] = useState(2);
  const [addZone, setAddZone] = useState('Terrace');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'manager' | 'staff'>('manager');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');

  const load = useCallback(async () => {
    const [t, m] = await Promise.all([
      supabase.rpc('admin_tables', { v: venue.id }),
      supabase.rpc('admin_team', { v: venue.id }),
    ]);
    setTables((t.data as Table[] | null) ?? []);
    setTeam((m.data as Member[] | null) ?? []);
  }, [supabase, venue.id]);

  useEffect(() => {
    setOrigin(window.location.origin);
    load();
  }, [load]);

  async function run(p: PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setErr(null);
    setMsg(null);
    const { error } = await p;
    if (error) setErr(error.message);
    else setMsg(ok);
    load();
    return !error;
  }

  const zones = Array.from(new Set(tables.map((t) => t.zone)));

  return (
    <main className="admin">
      <header className="admin-head">
        <Link href="/admin" className="small">← All venues</Link>
        <div className="grow" />
        <Link className="btn btn-ghost btn-sm" href={`/staff?v=${venue.slug}`} style={{ textDecoration: 'none', color: 'var(--text)' }}>Staff screen</Link>
        <Link className="btn btn-primary btn-sm" href={`/staff/stickers?v=${venue.slug}`} style={{ textDecoration: 'none' }}>Print QR stickers</Link>
      </header>

      <form
        className="row"
        style={{ gap: 10, flexWrap: 'wrap' }}
        onSubmit={(e) => {
          e.preventDefault();
          run(supabase.rpc('admin_rename_venue', { v: venue.id, p_name: name }), 'Name saved.');
        }}
      >
        <label htmlFor="vname" style={{ position: 'absolute', left: -9999 }}>Venue name</label>
        <input id="vname" className="input display" style={{ fontSize: 26, height: 56, maxWidth: 520 }} value={name} onChange={(e) => setName(e.target.value)} />
        {name.trim() !== venue.name && <button className="btn btn-ghost btn-sm" type="submit">Save name</button>}
      </form>

      {(msg || err) && <p className={err ? 'error' : 'card small'} role="status">{err ?? msg}</p>}

      <div className="admin-two">
        <section className="col" style={{ gap: 12 }}>
          <div className="row" style={{ alignItems: 'baseline' }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>Tables</h2>
            <span className="small">{tables.length} tables · {zones.length} area{zones.length === 1 ? '' : 's'}</span>
          </div>
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Area</th>
                  <th>Here now</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {tables.map((t) => {
                  const e = edit[t.id];
                  return (
                    <tr key={t.id}>
                      {e ? (
                        <>
                          <td>
                            <input className="input admin-cell" aria-label="Table number" maxLength={20} value={e.label} onChange={(ev) => setEdit({ ...edit, [t.id]: { ...e, label: ev.target.value } })} />
                          </td>
                          <td>
                            <input className="input admin-cell" aria-label="Area" maxLength={40} list="zones" value={e.zone} onChange={(ev) => setEdit({ ...edit, [t.id]: { ...e, zone: ev.target.value } })} />
                          </td>
                          <td>{t.guests_now}</td>
                          <td className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEdit(({ [t.id]: _drop, ...rest }) => rest)}>Cancel</button>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={async () => {
                                if (await run(supabase.rpc('admin_update_table', { p_table: t.id, p_label: e.label, p_zone: e.zone }), 'Table saved.')) {
                                  setEdit(({ [t.id]: _drop, ...rest }) => rest);
                                }
                              }}
                            >
                              Save
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td><b>{t.label}</b></td>
                          <td>{t.zone}</td>
                          <td>{t.guests_now}</td>
                          <td className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEdit({ ...edit, [t.id]: { label: t.label, zone: t.zone } })}>Edit</button>
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Copy this table's check-in link"
                              onClick={() => {
                                navigator.clipboard?.writeText(`${origin}/t/${t.qr_token}`);
                                setMsg(`Link for table ${t.label} copied.`);
                              }}
                            >
                              Copy link
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Make a new QR code; the old sticker stops working"
                              onClick={() => {
                                if (window.confirm(`New QR code for table ${t.label}? The old sticker will stop working.`)) {
                                  run(supabase.rpc('admin_new_qr', { p_table: t.id }), `Table ${t.label} has a new QR code. Reprint its sticker.`);
                                }
                              }}
                            >
                              New QR
                            </button>
                            <button
                              className="link-danger"
                              onClick={() => {
                                if (window.confirm(`Delete table ${t.label}?`)) run(supabase.rpc('admin_delete_table', { p_table: t.id }), `Table ${t.label} deleted.`);
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <datalist id="zones">
              {zones.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </div>
          <form
            className="card row"
            style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}
            onSubmit={(e) => {
              e.preventDefault();
              run(supabase.rpc('admin_add_tables', { v: venue.id, p_count: addCount, p_zone: addZone }), `${addCount} table${addCount === 1 ? '' : 's'} added.`);
            }}
          >
            <div className="col" style={{ width: 110 }}>
              <label className="label" htmlFor="add-count">Add tables</label>
              <input id="add-count" className="input" type="number" min={1} max={100} value={addCount} onChange={(e) => setAddCount(Number(e.target.value))} />
            </div>
            <div className="col grow">
              <label className="label" htmlFor="add-zone">In area</label>
              <input id="add-zone" className="input" list="zones" maxLength={40} value={addZone} onChange={(e) => setAddZone(e.target.value)} />
            </div>
            <button className="btn btn-primary" type="submit">Add</button>
          </form>
        </section>

        <section className="col" style={{ gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Team</h2>
          <div className="card col" style={{ gap: 0, padding: 0 }}>
            {team.length === 0 && <p className="small" style={{ padding: 16 }}>No managers or staff yet.</p>}
            {team.map((m) => (
              <div key={m.user_id ?? m.invite_id ?? m.email} className="row" style={{ padding: '12px 16px', borderTop: '1px solid var(--line)' }}>
                <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
                  <span style={{ overflowWrap: 'anywhere' }}>{m.email}</span>
                  <span className="small">{m.role === 'manager' ? 'Manager' : 'Staff'}{m.pending ? ' · invited, not signed in yet' : ''}</span>
                </div>
                {m.pending ? (
                  <button className="link-danger" onClick={() => run(supabase.rpc('admin_cancel_invite', { p_invite: m.invite_id }), 'Invite cancelled.')}>Cancel</button>
                ) : m.user_id !== me ? (
                  <button className="link-danger" onClick={() => run(supabase.rpc('admin_remove_member', { v: venue.id, p_user: m.user_id }), `${m.email} removed.`)}>Remove</button>
                ) : (
                  <span className="small">You</span>
                )}
              </div>
            ))}
          </div>
          <form
            className="card col"
            style={{ gap: 10 }}
            onSubmit={async (e) => {
              e.preventDefault();
              setErr(null);
              setMsg(null);
              const { data, error } = await supabase.rpc('admin_invite', { v: venue.id, p_email: inviteEmail, p_role: inviteRole });
              if (error) return setErr(error.message);
              setMsg(
                data === 'added'
                  ? `${inviteEmail} added as ${inviteRole}.`
                  : `${inviteEmail} invited. They join automatically the first time they sign in with Google at ${origin}/staff`,
              );
              setInviteEmail('');
              load();
            }}
          >
            <strong>Add a manager or staff member</strong>
            <span className="small">
              Managers can change settings, tables and the team. Staff only see the staff screen. They sign in with this email
              (Google or email link).
            </span>
            <label className="label" htmlFor="inv-email">Email</label>
            <input id="inv-email" className="input" type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            <div className="chips">
              {(['manager', 'staff'] as const).map((r) => (
                <button key={r} type="button" className="chip" aria-pressed={inviteRole === r} onClick={() => setInviteRole(r)}>
                  {r === 'manager' ? 'Manager' : 'Staff'}
                </button>
              ))}
            </div>
            <button className="btn btn-primary" type="submit">Add to team</button>
          </form>
        </section>
      </div>
    </main>
  );
}
