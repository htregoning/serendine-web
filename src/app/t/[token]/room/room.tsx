'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Chat, { type Conv } from './chat';
import { alertGuest, playSound, setTabCount, unlockAudio } from '@/lib/alerts';
import { notify } from '@/lib/push';
import NotifyToggle from '@/components/notify-toggle';
import Avatar, { forgetPhoto } from '@/components/avatar';
import { selfieThumbnail } from '@/lib/photo';
import Lobby from './lobby';
import { DrinksPanel } from '@/components/drinks';
import { MODE_LABELS, genderTag, type ChatMode, type RequestKind, type RequestStatus, type VenueAtTable } from '@/lib/types';

type Visit = { id: string; alias: string; mode: ChatMode; isOpen: boolean; optedIn: boolean; gender: string; hasPhoto: boolean };
type Person = { visit_id: string; alias: string; mode: ChatMode; zone: string; public_key: string | null; gender: string; has_photo: boolean };
type Req = { id: string; kind: RequestKind; status: RequestStatus };

const REQUESTS: Record<RequestKind, { ask: string; done: string }> = {
  waiter: { ask: 'Call a waiter', done: 'Waiter called' },
  bill: { ask: 'Bring the bill', done: 'Bill requested' },
  water: { ask: 'Water please', done: 'Water requested' },
};
const STATUS_TEXT: Record<RequestStatus, string> = {
  sent: 'Sent to staff',
  seen: 'On the way',
  done: 'Done',
  cancelled: 'Cancelled',
};

type Props = { token: string; venue: VenueAtTable; visit: Visit; menuUrl: string | null };

export default function Room({ token, venue, visit, menuUrl }: Props) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [tab, setTab] = useState<'people' | 'group' | 'service'>('people');
  const [hasPhoto, setHasPhoto] = useState(visit.hasPhoto);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [isOpen, setIsOpen] = useState(visit.isOpen);
  const [people, setPeople] = useState<Person[]>([]);
  const [requests, setRequests] = useState<Req[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [redeemedCode, setRedeemedCode] = useState<string | null>(null);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [unread, setUnread] = useState<Record<string, boolean>>({});
  const activeRef = useRef<string | null>(null);
  const statusRef = useRef<Record<string, RequestStatus>>({});
  const lastAtRef = useRef<Record<string, string>>({});

  useEffect(() => {
    unlockAudio();
  }, []);
  activeRef.current = activeId;

  const loadConvs = useCallback(async () => {
    const { data } = await supabase.rpc('my_conversations', { v: venue.venue_id });
    const list = (data as Conv[] | null) ?? [];
    // A chat whose latest activity moved on while it wasn't open (or the page was
    // hidden) has a new message from the other person: mark it and alert once.
    const prev = lastAtRef.current;
    let fresh = false;
    const marks: Record<string, boolean> = {};
    for (const c of list) {
      const before = prev[c.conversation_id];
      if (before && c.last_at > before && (c.conversation_id !== activeRef.current || document.hidden)) {
        fresh = true;
        if (c.conversation_id !== activeRef.current) marks[c.conversation_id] = true;
      }
    }
    lastAtRef.current = Object.fromEntries(list.map((c) => [c.conversation_id, c.last_at]));
    if (fresh) alertGuest();
    if (Object.keys(marks).length) setUnread((u) => ({ ...u, ...marks }));
    setConvs(list);
    setActiveId((id) => (id && !list.some((c) => c.conversation_id === id) ? null : id));
  }, [supabase, venue.venue_id]);

  // Chats: new conversations, flag changes and new messages arrive live.
  useEffect(() => {
    loadConvs();
    const channel = supabase
      .channel(`convs-${visit.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => loadConvs())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as { conversation_id: string; sender_visit: string };
        if (m.sender_visit !== visit.id) loadConvs();
      })
      .subscribe();
    const poll = setInterval(loadConvs, 8000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [supabase, visit.id, loadConvs]);

  useEffect(() => {
    setTabCount(Object.values(unread).filter(Boolean).length);
  }, [unread]);

  async function openChatWith(partnerVisit: string) {
    const existing = convs.find((c) => c.partner_visit === partnerVisit);
    if (existing) return openConv(existing.conversation_id);
    const { data, error } = await supabase.rpc('start_conversation', { theirs: partnerVisit });
    if (error || !data) return setNote('That person is no longer available to chat.');
    await loadConvs();
    openConv(data as string);
  }

  function openConv(id: string) {
    setNote(null);
    setActiveId(id);
    setUnread((u) => ({ ...u, [id]: false }));
  }

  const loadPeople = useCallback(async () => {
    const { data } = await supabase.rpc('room_presence', { v: venue.venue_id });
    setPeople((data as Person[] | null) ?? []);
  }, [supabase, venue.venue_id]);

  const loadRequests = useCallback(async () => {
    const { data } = await supabase
      .from('service_requests')
      .select('id, kind, status')
      .eq('visit_id', visit.id)
      .in('status', ['sent', 'seen'])
      .order('created_at', { ascending: false });
    const list = (data as Req[] | null) ?? [];
    const before = statusRef.current;
    if (list.some((r) => r.status === 'seen' && before[r.id] === 'sent')) {
      playSound('update');
    }
    statusRef.current = Object.fromEntries(list.map((r) => [r.id, r.status]));
    setRequests(list);
    const { data: red } = await supabase.from('offer_redemptions').select('code').eq('visit_id', visit.id).maybeSingle();
    setRedeemedCode((red as { code: string } | null)?.code ?? null);
  }, [supabase, visit.id]);

  // Who's open: refresh every few seconds while this guest is open.
  useEffect(() => {
    if (!isOpen) {
      setPeople([]);
      return;
    }
    loadPeople();
    const t = setInterval(loadPeople, 5000);
    return () => clearInterval(t);
  }, [isOpen, loadPeople]);

  // Live updates for this guest's service requests.
  useEffect(() => {
    loadRequests();
    const channel = supabase
      .channel(`requests-${visit.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_requests', filter: `visit_id=eq.${visit.id}` },
        () => loadRequests(),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'offer_redemptions', filter: `visit_id=eq.${visit.id}` },
        () => loadRequests(),
      )
      .subscribe();
    const poll = setInterval(loadRequests, 15000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [supabase, visit.id, loadRequests]);

  async function toggleOpen() {
    const next = !isOpen;
    setIsOpen(next);
    const { error } = await supabase.from('visits').update({ is_open: next }).eq('id', visit.id);
    if (error) setIsOpen(!next);
  }

  async function ask(kind: RequestKind) {
    if (requests.some((r) => r.kind === kind)) return;
    const { data, error } = await supabase
      .from('service_requests')
      .insert({ venue_id: venue.venue_id, table_id: venue.table_id, visit_id: visit.id, kind })
      .select('id')
      .single();
    if (error) setNote('That did not send. Please try again.');
    else {
      notify('new_request', (data as { id: string }).id);
      loadRequests();
    }
  }

  async function cancel(id: string) {
    await supabase.from('service_requests').update({ status: 'cancelled' }).eq('id', id);
    loadRequests();
  }

  async function savePhoto(file: File) {
    setPhotoBusy(true);
    try {
      const data = await selfieThumbnail(file);
      const { error } = await supabase.rpc('set_my_photo', { p_data: data });
      if (error) throw error;
      forgetPhoto(visit.id);
      setHasPhoto(true);
      setPhotoVersion((v) => v + 1);
    } catch {
      setNote('That photo did not upload. Please try again.');
    }
    setPhotoBusy(false);
  }

  async function removePhoto() {
    await supabase.rpc('clear_my_photo');
    forgetPhoto(visit.id);
    setHasPhoto(false);
    setPhotoVersion((v) => v + 1);
  }

  async function leave() {
    await supabase.rpc('end_visit', { p_visit: visit.id });
    router.replace(`/t/${token}`);
  }

  // Always the Serendine brand colours (venue colours can return with white-labelling).
  const style = {} as React.CSSProperties;
  const active = convs.find((c) => c.conversation_id === activeId);
  const anyUnread = Object.values(unread).some(Boolean);

  if (active) {
    return (
      <div style={style}>
        <Chat
          supabase={supabase}
          conv={active}
          myVisitId={visit.id}
          myTable={venue.table_label}
          drinksEnabled={venue.drinks_enabled !== false}
          onBack={() => setActiveId(null)}
          onChanged={loadConvs}
          onRemoved={(msg) => {
            setActiveId(null);
            setNote(msg);
            loadConvs();
            loadPeople();
          }}
        />
      </div>
    );
  }

  return (
    <main className="shell" style={style}>
      <div className="row">
        <div className="col grow" style={{ gap: 2 }}>
          <span className="display" style={{ fontSize: 26 }}>{venue.venue_name}</span>
          <span className="small">Table {venue.table_label} · {visit.alias}</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={leave}>Leave</button>
      </div>

      <div className="tabs" role="tablist" aria-label="Sections">
        <button className="tab" role="tab" aria-selected={tab === 'people'} onClick={() => setTab('people')}>
          People{tab !== 'people' && anyUnread ? ' •' : ''}
        </button>
        <button className="tab" role="tab" aria-selected={tab === 'group'} onClick={() => setTab('group')}>Group chat</button>
        <button className="tab" role="tab" aria-selected={tab === 'service'} onClick={() => setTab('service')}>Service</button>
      </div>

      {note && <p className="error" role="status">{note}</p>}

      <NotifyToggle supabase={supabase} who="guest" />

      <DrinksPanel supabase={supabase} myVisitId={visit.id} />

      {tab !== 'service' && (
          <div className="card row">
            <div className="col grow" style={{ gap: 4 }}>
              <strong>Open to chat</strong>
              <span className="small">
                {isOpen ? `Visible as ${visit.alias} · ${MODE_LABELS[visit.mode]}` : "You're hidden. Nobody can message you."}
              </span>
            </div>
            <button className="switch" role="switch" aria-checked={isOpen} aria-label="Open to chat" onClick={toggleOpen}>
              <span />
            </button>
          </div>
      )}

      {tab === 'group' &&
        (isOpen ? (
          <Lobby
            supabase={supabase}
            venueId={venue.venue_id}
            drinksEnabled={venue.drinks_enabled !== false}
            onChatWith={(id) => openChatWith(id)}
            onNote={(n) => {
              setNote(n);
              loadPeople();
              loadConvs();
            }}
          />
        ) : (
          <p className="card small">Switch on Open to chat to join the group chat for everyone here.</p>
        ))}

      {tab === 'people' && (
        <>
          <div className="card row">
            <Avatar supabase={supabase} visitId={visit.id} alias={visit.alias} hasPhoto={hasPhoto} size={56} version={photoVersion} />
            <div className="col grow" style={{ gap: 4 }}>
              <strong>{hasPhoto ? 'Your photo' : 'Add a selfie (optional)'}</strong>
              <span className="small">Shown only to people open to chat here tonight. Deleted when you leave.</span>
            </div>
            <div className="col" style={{ gap: 6 }}>
              <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                {photoBusy ? 'Saving…' : hasPhoto ? 'Retake' : 'Take selfie'}
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) savePhoto(f);
                    e.target.value = '';
                  }}
                />
              </label>
              {hasPhoto && (
                <button className="link-danger" style={{ minHeight: 32 }} onClick={removePhoto}>Remove</button>
              )}
            </div>
          </div>

          {venue.offer_enabled && visit.optedIn && (
            <div className="card offer col">
              <strong>{venue.offer_text}</strong>
              <span className="small">
                {redeemedCode
                  ? `Redeemed · ${redeemedCode}. Enjoy!`
                  : `Show this to your server at Table ${venue.table_label} to redeem.`}
              </span>
            </div>
          )}

          {convs.length > 0 && (
            <div className="col" style={{ gap: 10 }}>
              <span className="eyebrow">Your chats</span>
              {convs.map((c) => (
                <button key={c.conversation_id} className="card row" style={{ textAlign: 'left', minHeight: 64 }} onClick={() => openConv(c.conversation_id)}>
                  <Avatar supabase={supabase} visitId={c.partner_visit} alias={c.partner_alias} hasPhoto={c.partner_has_photo} />
                  <div className="col grow" style={{ gap: 4 }}>
                    <strong>
                      {c.partner_alias}
                      {genderTag(c.partner_gender) && <span className="small"> · {genderTag(c.partner_gender)}</span>}
                    </strong>
                    <span className="small">
                      {unread[c.conversation_id] ? 'New message' : c.i_keep && c.they_keep ? 'Connected' : 'Tap to open'}
                    </span>
                  </div>
                  {unread[c.conversation_id] && <span className="dot" style={{ background: 'var(--accent)' }} aria-label="Unread" />}
                </button>
              ))}
            </div>
          )}

          {isOpen ? (
            <div className="col" style={{ gap: 10 }}>
              <span className="eyebrow">Open to chat now · {people.length}</span>
              {people.length === 0 && (
                <p className="small">Nobody else is open yet. We&apos;ll show them here as soon as they switch on.</p>
              )}
              {people.map((p) => (
                <button
                  key={p.visit_id}
                  className="card row"
                  style={{ textAlign: 'left', minHeight: 72 }}
                  onClick={() => openChatWith(p.visit_id)}
                >
                  <Avatar supabase={supabase} visitId={p.visit_id} alias={p.alias} hasPhoto={p.has_photo} size={52} />
                  <div className="col grow" style={{ gap: 4 }}>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <strong>{p.alias}</strong>
                      {genderTag(p.gender) && <span className="small">{genderTag(p.gender)}</span>}
                      <span className={`tag tag-${p.mode}`}>{MODE_LABELS[p.mode]}</span>
                    </div>
                    <span className="small">{p.zone}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="col" style={{ alignItems: 'center', textAlign: 'center', padding: '48px 12px' }}>
              <span className="display" style={{ fontSize: 22 }}>It works both ways</span>
              <p className="small">Switch on Open to chat to see who else is open. Until then, nobody knows you&apos;re here.</p>
            </div>
          )}
          <a href="/connections" className="small" style={{ textAlign: 'center' }}>
            Your connections from other nights
          </a>
        </>
      )}

      {tab === 'service' && (
        <>
          {menuUrl ? (
            <a className="card row" href={menuUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text)', textDecoration: 'none' }}>
              <div className="col grow" style={{ gap: 3 }}>
                <strong>See the menu</strong>
                <span className="small">Tonight&apos;s menu from {venue.venue_name}</span>
              </div>
              <span aria-hidden>›</span>
            </a>
          ) : (
            <p className="card small">The menu isn&apos;t online yet. Ask your server.</p>
          )}

          <span className="eyebrow">Ask the staff</span>
          <div className="grid3">
            {(Object.keys(REQUESTS) as RequestKind[]).map((k) => {
              const active = requests.some((r) => r.kind === k);
              return (
                <button key={k} className="service-btn" data-active={active} onClick={() => ask(k)} aria-label={REQUESTS[k].ask}>
                  {active ? REQUESTS[k].done : REQUESTS[k].ask}
                </button>
              );
            })}
          </div>

          {requests.length > 0 && (
            <div className="col" style={{ gap: 10 }}>
              <span className="eyebrow">Your requests</span>
              {requests.map((r) => (
                <div key={r.id} className="card row" role="status">
                  <span className="dot" style={{ background: r.status === 'seen' ? 'var(--accent)' : 'var(--faint)' }} />
                  <div className="col grow" style={{ gap: 2 }}>
                    <strong>{REQUESTS[r.kind].done}</strong>
                    <span className="small">{STATUS_TEXT[r.status]}</span>
                  </div>
                  {r.status === 'sent' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => cancel(r.id)}>Cancel</button>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="small">Requests go straight to the staff screen with your table number. Pay with your server as usual.</p>
        </>
      )}
    </main>
  );
}
