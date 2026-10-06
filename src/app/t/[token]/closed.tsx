import Logo from '@/components/logo';

// What a guest sees when they scan a code at a venue where Serendine is switched off or paused.
export default function Closed({ venueName }: { venueName: string }) {
  return (
    <main className="shell" style={{ justifyContent: 'center', textAlign: 'center', alignItems: 'center' }}>
      <Logo size={72} />
      <h1 className="display" style={{ fontSize: 28 }}>Serendine isn&apos;t running at {venueName} right now</h1>
      <p className="lede">Enjoy your evening, and ask your server if you need anything.</p>
      <a className="btn btn-ghost btn-sm" href="/" style={{ textDecoration: 'none' }}>About Serendine</a>
    </main>
  );
}
