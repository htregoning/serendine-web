'use client';

// The 60-second script: what staff say at the table so guests actually scan.
export default function StaffScript({ offer }: { offer: string | null }) {
  const lines: [string, string][] = [
    ['When you seat them', '“Have you tried Serendine? It’s the little code on the table.”'],
    ['What it is', '“Scan it and you can say hello to other tables here tonight. Nobody sees your name or number, and you can switch it off any time.”'],
    ...(offer ? ([['The hook', `“And just for scanning: ${offer}.”`]] as [string, string][]) : []),
    ['If they look unsure', '“Even if you don’t chat, you can call us or see the menu from it.”'],
    ['If they say no', '“No problem at all, enjoy your evening.” Then leave it.'],
    ['Later, if the room is busy', '“There are a few tables chatting tonight, if you fancy joining in.”'],
  ];
  return (
    <details className="card col staff-script">
      <summary>
        <strong>What to say to tables</strong>
        <span className="small"> · 60 seconds</span>
      </summary>
      <ol className="col" style={{ gap: 10, margin: '12px 0 0', paddingInlineStart: 20 }}>
        {lines.map(([when, say]) => (
          <li key={when}>
            <span className="small">{when}</span>
            <div>{say}</div>
          </li>
        ))}
      </ol>
      <p className="small" style={{ marginBottom: 0 }}>
        Say it once, keep it light, and never push. Guests who choose to scan are the ones who chat.
      </p>
    </details>
  );
}
