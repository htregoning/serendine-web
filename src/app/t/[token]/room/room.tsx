'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Chat, { type Conv } from './chat';
import { alertGuest, playSound, setTabCount, unlockAudio } from '@/lib/alerts';
import { notify } from '@/lib/push';
import VenueNews from '@/components/venue-news';
import Buzz from '@/components/buzz';
import NotifyToggle from '@/components/notify-toggle';
import Avatar, { forgetPhoto } from '@/components/avatar';
import { selfieThumbnail } from '@/lib/photo';
import Lobby from './lobby';
import Extras, { type MyExtras } from './extras';
import { DrinksPanel } from '@/components/drinks';
import { useT } from '@/components/lang';
import VenueMark from '@/components/venue-mark';
import { MODE_LABELS, REQUEST_BUTTONS, genderTag, type ChatMode, type RequestKind, type RequestStatus, type VenueAtTable } from '@/lib/types';

type Visit = { id: string; alias: string; mode: ChatMode; isOpen: boolean; optedIn: boolean; gender: string; hasPhoto: boolean };
type Person = { visit_id: string; alias: string; mode: ChatMode; zone: string; public_key: string | null; gender: string; has_photo: boolean };
type Req = { id: string; kind: RequestKind; status: RequestStatus; note?: string | null; claimed_name?: string | null };

const REQUESTS: Record<RequestKind, { ask: string; done: string }> = {
  order: { ask: 'Ready to order', done: 'Ready to order' },
  again: { ask: 'Same again', done: 'Same again' },
  waiter: { ask: 'Call a waiter', done: 'Waiter called' },
  bill: { ask: 'Bring the bill', done: 'Bill requested' },
  water: { ask: 'Water please', done: 'Water requested' },
  other: { ask: 'Ask for anything', done: 'Request sent' },
  help: { ask: 'I need help', done: 'The manager has been told' },
};
const QUICK_ASKS = ['Napkins', 'Cutlery', 'Clear the plates', 'High chair', 'Card machine', 'Ice'];
const STATUS_TEXT: Record<RequestStatus, string> = {
  sent: 'Sent to staff',
  seen: 'On the way',
  done: 'Done',
  cancelled: 'Cancelled',
};

type Props = {
  token: string;
  venue: VenueAtTable;
  visit: Visit;
  menuUrl: string | null;
  firstVisit?: boolean;
  requestButtons?: RequestKind[];
};

// Line icons for the service bar.
const ICONS: Record<RequestKind | 'menu', string> = {
  order: 'M9 3h6v3H9zM6 5h12v16H6zM9 11h6M9 15h4',
  again: 'M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5',
  other: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12ZM12 9v6M9 12h6',
  help: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z',
  waiter: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  bill: 'M6 2h12v20l-3-2-3 2-3-2-3 2V2zM9 7h6M9 11h6M9 15h4',
  water: 'M12 2.7s6 6.3 6 11.3a6 6 0 0 1-12 0c0-5 6-11.3 6-11.3z',
  menu: 'M4 4h7v16H4zM13 4h7v16h-7z',
};
const SHORT: Record<RequestKind, string> = {
  order: 'Ready to order', again: 'Same again', waiter: 'Waiter', bill: 'Bill', water: 'Water', other: 'Ask for…', help: 'Help',
};

function Icon({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export default function Room({ token, venue, visit, menuUrl, firstVisit = false, requestButtons = ['waiter', 'bill', 'water'] }: Props) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const t = useT();
  const where = venue.kind === 'event' ? venue.table_label : `${t('Table')} ${venue.table_label}`;
  const [tab, setTab] = useState<'people' | 'group' | 'chats'>('people');
  // The optional details sheet opens once straight after check-in, and whenever the guest taps their name.
  const [extrasOpen, setExtrasOpen] = useState(firstVisit);
  const [askOpen, setAskOpen] = useState<'other' | 'help' | null>(null);
  const [askText, setAskText] = useState('');
  const [me, setMe] = useState<MyExtras>({ mode: visit.mode, gender: visit.gender, optedIn: visit.optedIn });
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
    // Drop ?welcome=1 so a refresh doesn't reopen the sheet.
    if (firstVisit) window.history.replaceState(null, '', `/t/${token}/room`);
  }, [firstVisit, token]);
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
    const q = (cols: string) =>
      supabase
        .from('service_requests')
        .select(cols)
        .eq('visit_id', visit.id)
        .in('status', ['sent', 'seen'])
        .order('created_at', { ascending: false });
    // Who's coming and the guest's note arrive with database update 0023.
    let res = await q('id, kind, status, note, claimed_name');
    if (res.error) res = await q('id, kind, status');
    const list = ((res.data as unknown) as Req[] | null) ?? [];
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

  async function ask(kind: RequestKind, text?: string) {
    if (kind !== 'other' && requests.some((r) => r.kind === kind)) return;
    const note = text?.trim().slice(0, 200);
    const { data, error } = await supabase
      .from('service_requests')
      .insert({ venue_id: venue.venue_id, table_id: venue.table_id, visit_id: visit.id, kind, ...(note ? { note } : {}) })
      .select('id')
      .single();
    if (error) setNote(t('That did not send. Please try again.'));
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
      setNote(t('That photo did not upload. Please try again.'));
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
    router.replace(`/thanks/${visit.id}`);
  }

  // Colours, type and logo come from the venue's theme (see the table layout).
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
          isEvent={venue.kind === 'event'}
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

  const unreadCount = Object.values(unread).filter(Boolean).length;
  const showRequests = venue.requests_enabled !== false && venue.kind !== 'event';
  const buttons = REQUEST_BUTTONS.filter((k) => requestButtons.includes(k));

  async function sendAsk() {
    if (!askOpen) return;
    if (askOpen === 'other' && !askText.trim()) return;
    await ask(askOpen, askText);
    setAskOpen(null);
    setAskText('');
  }

  return (
    <main className="shell room" style={style}>
      <header className="row room-head">
        <VenueMark venue={venue} size={40} />
        <div className="col grow" style={{ gap: 1, minWidth: 0 }}>
          <span className="display room-venue">{venue.venue_name}</span>
          <button className="room-me" onClick={() => setExtrasOpen(true)} aria-label={t('Your details for tonight')}>
            {where} · {t("You're {name}", { name: visit.alias })}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={leave}>{t('Leave')}</button>
      </header>

      <div className="tabs" role="tablist" aria-label="Sections">
        <button className="tab" role="tab" aria-selected={tab === 'people'} onClick={() => setTab('people')}>{t('People')}</button>
        <button className="tab" role="tab" aria-selected={tab === 'group'} onClick={() => setTab('group')}>{t('Group')}</button>
        <button className="tab" role="tab" aria-selected={tab === 'chats'} onClick={() => setTab('chats')}>
          {t('Chats')}
          {unreadCount > 0 && <span className="tab-badge" aria-label={t('{n} unread', { n: unreadCount })}>{unreadCount}</span>}
        </button>
      </div>

      {note && <p className="error" role="status">{note}</p>}

      <VenueNews supabase={supabase} venueId={venue.venue_id} visitId={visit.id} venueName={venue.venue_name} />
      <DrinksPanel supabase={supabase} myVisitId={visit.id} />

      {tab !== 'chats' && (
        <div className="card row open-card">
          <Avatar supabase={supabase} visitId={visit.id} alias={visit.alias} hasPhoto={hasPhoto} size={44} version={photoVersion} />
          <div className="col grow" style={{ gap: 2 }}>
            <strong>{t('Open to chat')}</strong>
            <span className="small">
              {isOpen ? t('Visible as {name} · {mode}', { name: visit.alias, mode: t(MODE_LABELS[me.mode]) }) : t("You're hidden. Nobody can message you.")}
            </span>
          </div>
          <button className="switch" role="switch" aria-checked={isOpen} aria-label={t('Open to chat')} onClick={toggleOpen}>
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
          <p className="card small">{t('Switch on Open to chat to join the group chat for everyone here.')}</p>
        ))}

      {tab === 'people' && (
        <>
          <NotifyToggle supabase={supabase} who="guest" />
          {isOpen ? (
            <div className="col" style={{ gap: 0 }}>
              <div className="row list-head">
                <span className="eyebrow grow">{t('Open to chat now · {n}', { n: people.length })}</span>
                <Buzz token={token} compact />
              </div>
              {people.length === 0 && (
                <p className="small" style={{ padding: '12px 2px' }}>{t("Nobody else is open yet. We'll show them here as soon as they switch on.")}</p>
              )}
              {people.map((p) => {
                const tag = genderTag(p.gender);
                return (
                  <div key={p.visit_id} className="row person-row">
                    <Avatar supabase={supabase} visitId={p.visit_id} alias={p.alias} hasPhoto={p.has_photo} size={46} />
                    <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
                      <strong className="person-name">{p.alias}</strong>
                      <span className="small">
                        {[t(MODE_LABELS[p.mode]), tag ? t(tag) : '', p.zone].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <button className="btn btn-outline btn-sm" onClick={() => openChatWith(p.visit_id)}>{t('Say hello')}</button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="col" style={{ alignItems: 'center', textAlign: 'center', padding: '40px 12px' }}>
              <span className="display" style={{ fontSize: 22 }}>{t('It works both ways')}</span>
              <p className="small">{t("Switch on Open to chat to see who else is open. Until then, nobody knows you're here.")}</p>
              <Buzz token={token} compact />
            </div>
          )}

          <div style={{ flex: 1 }} />

          {venue.offer_enabled && (
            me.optedIn ? (
              <div className="offer-row" role="status">
                <span className="grow">
                  <b style={{ color: 'var(--accent)' }}>{venue.offer_text}</b>
                  <br />
                  <span className="small">
                    {redeemedCode ? t('Redeemed · {code}. Enjoy!', { code: redeemedCode }) : t('Show this to your server at {where} to redeem.', { where })}
                  </span>
                </span>
              </div>
            ) : (
              <div className="offer-row">
                <span className="grow small"><b style={{ color: 'var(--accent)' }}>{t('Welcome offer')}</b> · {venue.offer_text}</span>
                <button className="btn btn-primary btn-sm" onClick={() => setExtrasOpen(true)}>{t('Get it')}</button>
              </div>
            )
          )}

          {requests.length > 0 && (
            <div className="col" style={{ gap: 8 }}>
              {requests.map((r) => (
                <div key={r.id} className="card row" role="status" style={{ padding: '10px 14px' }}>
                  <span className="dot" style={{ background: r.status === 'seen' ? 'var(--accent)' : 'var(--faint)' }} />
                  <div className="col grow" style={{ gap: 0 }}>
                    <strong style={{ fontSize: 14 }}>{r.kind === 'other' && r.note ? r.note : t(REQUESTS[r.kind].done)}</strong>
                    <span className="small">
                      {r.status === 'seen' && r.claimed_name
                        ? t('{name} is on the way', { name: r.claimed_name })
                        : t(STATUS_TEXT[r.status])}
                    </span>
                  </div>
                  {r.status === 'sent' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => cancel(r.id)}>{t('Cancel')}</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {(showRequests || menuUrl) && (
            <nav className="service-bar" aria-label={t('Ask the staff')}>
              {showRequests &&
                buttons.map((k) => {
                  const active = k !== 'other' && requests.some((r) => r.kind === k);
                  return (
                    <button
                      key={k}
                      className="service-tile"
                      data-active={active}
                      onClick={() => (k === 'other' ? setAskOpen('other') : ask(k))}
                      aria-label={t(REQUESTS[k].ask)}
                    >
                      <Icon d={ICONS[k]} />
                      {active ? t('Asked') : t(SHORT[k])}
                    </button>
                  );
                })}
              {menuUrl && (
                <a className="service-tile" href={menuUrl} target="_blank" rel="noopener noreferrer">
                  <Icon d={ICONS.menu} />
                  {venue.kind === 'event' ? t('Programme') : t('Menu')}
                </a>
              )}
            </nav>
          )}
          <button className="help-link" onClick={() => setAskOpen('help')}>
            <Icon d={ICONS.help} />
            {t('Need help discreetly?')}
          </button>
        </>
      )}

      {askOpen && (
        <div className="sheet-backdrop" onClick={() => setAskOpen(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="ask-title" onClick={(e) => e.stopPropagation()}>
            <span className="sheet-grip" aria-hidden="true" />
            {askOpen === 'other' ? (
              <>
                <div className="col" style={{ gap: 4 }}>
                  <h2 id="ask-title" className="display" style={{ margin: 0, fontSize: 24 }}>{t('Ask for anything')}</h2>
                  <span className="small">{t('Goes straight to the staff with your table number.')}</span>
                </div>
                <div className="chips">
                  {QUICK_ASKS.map((q) => (
                    <button key={q} type="button" className="chip" aria-pressed={askText === t(q)} onClick={() => setAskText(t(q))}>
                      {t(q)}
                    </button>
                  ))}
                </div>
                <label htmlFor="ask-text" className="label">{t('Or write your own')}</label>
                <input id="ask-text" className="input" maxLength={120} value={askText} onChange={(e) => setAskText(e.target.value)} placeholder={t('e.g. Can we move to a bigger table?')} />
              </>
            ) : (
              <>
                <div className="col" style={{ gap: 4 }}>
                  <h2 id="ask-title" className="display" style={{ margin: 0, fontSize: 24 }}>{t('Need help discreetly?')}</h2>
                  <span className="small">
                    {t("Only the manager is told, with your table. They'll come over quietly. Use it if anyone is making you uncomfortable, or for anything you'd rather not say out loud.")}
                  </span>
                </div>
                <label htmlFor="ask-text" className="label">{t('Anything they should know? (optional)')}</label>
                <input id="ask-text" className="input" maxLength={120} value={askText} onChange={(e) => setAskText(e.target.value)} />
              </>
            )}
            <div className="row" style={{ gap: 10 }}>
              <button className="btn btn-ghost grow" onClick={() => { setAskOpen(null); setAskText(''); }}>{t('Cancel')}</button>
              <button className="btn btn-primary grow" onClick={sendAsk} disabled={askOpen === 'other' && !askText.trim()}>
                {askOpen === 'help' ? t('Tell the manager') : t('Send')}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'chats' && (
        <>
          {convs.length === 0 ? (
            <div className="col" style={{ alignItems: 'center', textAlign: 'center', padding: '40px 12px' }}>
              <span className="display" style={{ fontSize: 22 }}>{t('No chats yet')}</span>
              <p className="small">{t('Say hello to someone on the People tab, and your chat will appear here.')}</p>
            </div>
          ) : (
            <div className="col" style={{ gap: 0 }}>
              {convs.map((c) => (
                <button key={c.conversation_id} className="row person-row chat-row" onClick={() => openConv(c.conversation_id)}>
                  <Avatar supabase={supabase} visitId={c.partner_visit} alias={c.partner_alias} hasPhoto={c.partner_has_photo} size={46} />
                  <div className="col grow" style={{ gap: 2, minWidth: 0, textAlign: 'start' }}>
                    <strong className="person-name">{c.partner_alias}</strong>
                    <span className="small" style={unread[c.conversation_id] ? { color: 'var(--accent)', fontWeight: 700 } : undefined}>
                      {unread[c.conversation_id] ? t('New message') : c.i_keep && c.they_keep ? t('Connected') : t('Tap to open')}
                    </span>
                  </div>
                  {unread[c.conversation_id] && <span className="dot" style={{ background: 'var(--accent)' }} aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
          <a href="/connections" className="small" style={{ textAlign: 'center', marginTop: 8 }}>
            {t('Your connections from other nights')}
          </a>
        </>
      )}

      {extrasOpen && (
        <Extras
          supabase={supabase}
          venue={venue}
          visitId={visit.id}
          alias={visit.alias}
          current={me}
          hasPhoto={hasPhoto}
          photoVersion={photoVersion}
          photoBusy={photoBusy}
          onPhoto={savePhoto}
          onRemovePhoto={removePhoto}
          onClose={() => setExtrasOpen(false)}
          onSaved={(next) => {
            setMe(next);
            setExtrasOpen(false);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}
