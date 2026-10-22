'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import ProfileForm, { useMyProfile } from '@/components/profile-form';
import Linkify from '@/components/linkify';
import PrivacyShield from '@/components/privacy-shield';

type Area = { slug: string; name: string; lat: number; lng: number };
type Me = { area: string | null; area_name: string | null; alias: string | null; suggested_alias: string | null; can_join: boolean };
type Post = { id: number; area: string; area_name: string; alias: string; body: string; created_at: string; mine: boolean; can_hide: boolean };
type Count = { area: string; area_name: string; people: number };
type Venue = { id: string; name: string; slug: string; area_name: string; place: string | null; has_logo: boolean; brand_version: number; accent: string; groups_enabled: boolean; here_now: number };

// Nearest neighbourhood centre, worked out on this phone. The position itself is never sent anywhere.
function nearest(areas: Area[], lat: number, lng: number) {
  const km = (a: Area) => {
    const r = Math.PI / 180;
    const d = Math.sin(((a.lat - lat) * r) / 2) ** 2 + Math.cos(lat * r) * Math.cos(a.lat * r) * Math.sin(((a.lng - lng) * r) / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(d));
  };
  const best = [...areas].sort((x, y) => km(x) - km(y))[0];
  return best && km(best) <= 6 ? best : null;
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit' });

export default function NearbyScreen() {
  const [supabase] = useState(() => createClient());
  const [profile, setProfile] = useMyProfile();
  const [me, setMe] = useState<Me | null | undefined>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [choosing, setChoosing] = useState(false);

  const loadMe = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_area');
    setMe(error ? undefined : (((data as Me[] | null) ?? [])[0] ?? undefined));
  }, [supabase]);

  useEffect(() => {
    loadMe();
    supabase.from('areas').select('slug, name, lat, lng').order('name').then(({ data }: { data: Area[] | null }) => setAreas(data ?? []));
  }, [supabase, loadMe]);

  if (me === null || profile === null) return <main className="shell" />;
  if (me === undefined) return <main className="shell"><p className="card small">Neighbourhood rooms arrive with the next database update (0035).</p></main>;

  if (profile && !profile.complete) {
    return (
      <main className="shell">
        <ProfileForm
          initial={profile}
          onSaved={(p) => {
            setProfile(p);
            loadMe();
          }}
          title="A few details, just once"
          lede="Neighbourhood rooms are 18+ only, so we need your saved details first. They're never shown to anyone in the room."
          submitLabel="Continue"
        />
      </main>
    );
  }
  if (!me.can_join) {
    return (
      <main className="shell" style={{ justifyContent: 'center' }}>
        <h1 className="display">Neighbourhood rooms are 18+</h1>
        <p className="lede">They&apos;re only open to adults with saved details.</p>
        <a className="btn btn-ghost" href="/me" style={{ textDecoration: 'none' }}>Back</a>
      </main>
    );
  }
  if (!me.area || choosing) {
    return (
      <Chooser
        supabase={supabase}
        areas={areas}
        alias={me.alias ?? me.suggested_alias ?? ''}
        current={me.area}
        onJoined={() => {
          setChoosing(false);
          loadMe();
        }}
        onCancel={me.area ? () => setChoosing(false) : undefined}
      />
    );
  }
  return <Room supabase={supabase} me={me} onChange={() => setChoosing(true)} />;
}

function Chooser({
  supabase, areas, alias: initialAlias, current, onJoined, onCancel,
}: {
  supabase: ReturnType<typeof createClient>; areas: Area[]; alias: string; current: string | null; onJoined: () => void; onCancel?: () => void;
}) {
  const [area, setArea] = useState<string>(current ?? '');
  const [alias, setAlias] = useState(initialAlias);
  const [rules, setRules] = useState(false);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function locate() {
    if (!navigator.geolocation) return setNote('Your phone can’t share its location here. Pick your area below.');
    setLocating(true);
    setNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const hit = nearest(areas, pos.coords.latitude, pos.coords.longitude);
        if (hit) {
          setArea(hit.slug);
          setNote(`You look to be in ${hit.name}. Change it below if not.`);
        } else {
          setNote('We couldn’t place you in a Dubai neighbourhood yet. Pick the nearest one below.');
        }
      },
      () => {
        setLocating(false);
        setNote('Location wasn’t allowed. Pick your area below instead.');
      },
      { enableHighAccuracy: false, maximumAge: 600000, timeout: 10000 },
    );
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!area) return setNote('Pick your area.');
    if (!alias.trim()) return setNote('Choose a screen name.');
    if (!rules) return setNote('Please agree to the room rules.');
    setBusy(true);
    const { error } = await supabase.rpc('join_area', { p_area: area, p_alias: alias.trim() });
    setBusy(false);
    if (error) return setNote(error.message);
    onJoined();
  }

  return (
    <main className="shell">
      <a className="small" href="/me" style={{ alignSelf: 'flex-start' }}>‹ Your places and plans</a>
      <div className="col" style={{ gap: 6 }}>
        <h1 className="display" style={{ fontSize: 30, margin: 0 }}>Chat nearby</h1>
        <p className="lede" style={{ margin: 0 }}>
          Join your neighbourhood&apos;s room and chat with people there and in the areas next door.
        </p>
      </div>
      <form className="col" style={{ gap: 16 }} onSubmit={join}>
        <button type="button" className="btn btn-ghost" onClick={locate} disabled={locating || areas.length === 0}>
          {locating ? 'Finding your area…' : 'Use my location to find my area'}
        </button>
        <span className="small" style={{ marginTop: -8 }}>Your phone works out the area itself. Your exact location never leaves your phone and is never shown to anyone.</span>
        {note && <p className="small" role="status" style={{ margin: 0, color: 'var(--text)' }}>{note}</p>}
        <div className="col">
          <label className="label" htmlFor="nb-area">Your area</label>
          <select id="nb-area" className="input" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Choose…</option>
            {areas.map((a) => (
              <option key={a.slug} value={a.slug}>{a.name}</option>
            ))}
          </select>
        </div>
        <div className="col">
          <label className="label" htmlFor="nb-alias">Screen name</label>
          <input id="nb-alias" className="input" maxLength={30} placeholder="e.g. Sam, or Marina Runner" value={alias} onChange={(e) => setAlias(e.target.value)} />
          <span className="small">The only thing people in the room see about you.</span>
        </div>
        <label className="check">
          <input type="checkbox" checked={rules} onChange={(e) => setRules(e.target.checked)} />
          <span>I&apos;m 18+ and I&apos;ll be kind, take no for an answer, and never post anyone&apos;s address or live location (including my own).</span>
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Joining…' : 'Join the room'}</button>
        {onCancel && <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>}
      </form>
    </main>
  );
}

function Room({ supabase, me, onChange }: { supabase: ReturnType<typeof createClient>; me: Me; onChange: () => void }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [counts, setCounts] = useState<Count[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastId = useRef(0);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('area_feed', { p_after: 0 });
    const list = ((data as Post[] | null) ?? []).slice().reverse(); // oldest first, like a chat
    const newest = list.length ? list[list.length - 1].id : 0;
    setPosts(list);
    if (newest > lastId.current) setTimeout(() => endRef.current?.scrollIntoView({ block: 'end' }), 50);
    lastId.current = newest;
  }, [supabase]);

  useEffect(() => {
    load();
    supabase.rpc('area_counts').then(({ data }: { data: Count[] | null }) => setCounts(data ?? []));
    supabase.rpc('area_venues').then(({ data }: { data: Venue[] | null }) => setVenues(data ?? []));
    const poll = setInterval(load, 7000);
    return () => clearInterval(poll);
  }, [supabase, load]);

  const nearby = useMemo(() => counts.filter((c) => c.area !== me.area), [counts, me.area]);
  const here = counts.find((c) => c.area === me.area)?.people ?? 0;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc('post_area', { p_body: text.trim() });
    setBusy(false);
    if (error) return setMsg(error.message);
    setText('');
    load();
  }

  async function act(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setMenu(null);
    const { error } = await fn();
    setMsg(error ? error.message : ok);
    load();
  }

  async function leave() {
    await supabase.rpc('leave_area');
    window.location.assign('/me');
  }

  return (
    <main className="shell nearby">
      <PrivacyShield />
      <header className="col" style={{ gap: 4 }}>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <a className="small grow" href="/me">‹ Back</a>
          <button className="btn btn-ghost btn-sm" onClick={onChange}>Change area</button>
        </div>
        <h1 className="display" style={{ fontSize: 28, margin: 0 }}>{me.area_name}</h1>
        <span className="small">
          {here} here{nearby.length ? ` · nearby: ${nearby.map((c) => c.area_name).join(', ')}` : ''} · you&apos;re <b>{me.alias}</b>
        </span>
      </header>

      {venues.length > 0 && (
        <section className="col" style={{ gap: 8 }} aria-label="Places nearby on Serendine">
          <span className="eyebrow">On Serendine nearby</span>
          <div className="nearby-venues">
            {venues.map((v) => (
              <div key={v.id} className="nearby-venue">
                {v.has_logo ? (
                  <img src={`/api/logo/${v.id}?v=${v.brand_version}`} alt="" className="venue-pick-logo" />
                ) : (
                  <span className="venue-pick-logo" style={{ background: v.accent }}>{v.name.charAt(0).toUpperCase()}</span>
                )}
                <strong style={{ fontSize: 14 }}>{v.name}</strong>
                <span className="small">{v.area_name}{v.here_now > 0 ? ` · ${v.here_now} in now` : ''}</span>
                {v.groups_enabled && (
                  <a className="small" href={`/plan?v=${encodeURIComponent(v.slug)}`}>Plan a night here</a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="nearby-rules small">18+ · Be kind · Never post addresses or live locations · Tap ⋯ on a post to report or block.</p>

      <div className="col nearby-feed" style={{ gap: 10 }}>
        {posts.length === 0 && <p className="small" style={{ textAlign: 'center', margin: '24px 0' }}>Quiet so far. Say hello to the neighbourhood.</p>}
        {posts.map((p) => (
          <div key={p.id} className={p.mine ? 'nearby-post mine' : 'nearby-post'}>
            <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
              <strong className="grow" style={{ fontSize: 14 }}>
                {p.mine ? 'You' : p.alias} <span className="small" style={{ fontWeight: 400 }}>· {p.area_name} · {timeOf(p.created_at)}</span>
              </strong>
              <button className="nearby-more" aria-label="Post options" onClick={() => setMenu(menu === p.id ? null : p.id)}>⋯</button>
            </div>
            <span style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}><Linkify text={p.body} /></span>
            {menu === p.id && (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {p.mine ? (
                  <button className="btn btn-ghost btn-sm" onClick={() => act(() => supabase.rpc('delete_my_area_post', { p_id: p.id }), 'Deleted.')}>Delete</button>
                ) : (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => act(() => supabase.rpc('report_area_post', { p_id: p.id, p_reason: null }), 'Reported and blocked. Thank you for telling us.')}>Report</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => act(() => supabase.rpc('block_area_poster', { p_id: p.id }), `${p.alias} is blocked. They aren't told.`)}>Block</button>
                  </>
                )}
                {p.can_hide && !p.mine && (
                  <button className="btn btn-ghost btn-sm" onClick={() => act(() => supabase.rpc('hide_area_post', { p_id: p.id }), 'Hidden from the room.')}>Hide (moderator)</button>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {msg && <p className="small" role="status" style={{ margin: 0 }}>{msg}</p>}
      <form className="row nearby-compose" style={{ gap: 8 }} onSubmit={send}>
        <input className="input grow" maxLength={500} placeholder={`Say something to ${me.area_name}…`} value={text} onChange={(e) => setText(e.target.value)} aria-label="Message" />
        <button className="btn btn-primary" type="submit" disabled={busy || !text.trim()}>Send</button>
      </form>
      <button className="link-quiet small" style={{ alignSelf: 'center' }} onClick={leave}>Leave the room</button>
    </main>
  );
}
