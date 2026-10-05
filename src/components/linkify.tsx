// Turns web addresses in a message into links that open in a new tab.
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"]+)/gi;

export default function Linkify({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[1];
    // Leave trailing punctuation outside the link ("see example.com." → link without the full stop).
    const trail = /[.,!?;:)\]'’]+$/.exec(url)?.[0] ?? '';
    if (trail) url = url.slice(0, -trail.length);
    const start = m.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    const href = url.startsWith('www.') ? `https://${url}` : url;
    parts.push(
      <a key={start} href={href} target="_blank" rel="noopener noreferrer nofollow ugc" className="msg-link">
        {url}
      </a>,
    );
    last = start + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
