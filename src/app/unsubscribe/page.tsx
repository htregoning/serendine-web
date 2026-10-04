import Logo from '@/components/logo';
import { validUnsubscribe, venueName } from '@/lib/unsubscribe-server';

export const metadata = { title: 'Unsubscribe · Serendine', robots: { index: false, follow: false } };

// The link at the bottom of every venue email. A button confirms, so email scanners can't unsubscribe people by accident.
export default async function Unsubscribe({ searchParams }: { searchParams: Promise<{ v?: string; u?: string; s?: string; done?: string }> }) {
  const { v = '', u = '', s = '', done } = await searchParams;
  const name = v ? await venueName(v) : null;
  const valid = validUnsubscribe(v, u, s);

  return (
    <main className="shell" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 20 }}>
      <Logo size={88} />
      {done === '1' ? (
        <>
          <h1 className="display">Unsubscribed</h1>
          <p className="lede">
            You won&apos;t get any more emails from {name ?? 'this venue'} through Serendine. You can still check in and chat as normal.
          </p>
        </>
      ) : done === '0' || (!valid && !done) ? (
        <>
          <h1 className="display">Unsubscribe</h1>
          <p className="lede">This link didn&apos;t work. Email serendiners@gmail.com and we&apos;ll remove you straight away.</p>
        </>
      ) : (
        <form method="post" action="/api/unsubscribe" className="col" style={{ gap: 16, alignItems: 'center' }}>
          <h1 className="display">Stop emails from {name ?? 'this venue'}?</h1>
          <input type="hidden" name="v" value={v} />
          <input type="hidden" name="u" value={u} />
          <input type="hidden" name="s" value={s} />
          <button className="btn btn-primary" type="submit">Unsubscribe</button>
        </form>
      )}
      <a className="small" href="/">serendine.com</a>
    </main>
  );
}
