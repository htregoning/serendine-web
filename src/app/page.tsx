export default function Home() {
  return (
    <main className="shell" style={{ justifyContent: 'center' }}>
      <div className="eyebrow" style={{ color: 'var(--accent)' }}>Serendine</div>
      <h1 className="display">Someone in this room might be worth meeting.</h1>
      <p className="lede">
        Scan the code on your table to say hello to another table, call a waiter or see the menu.
      </p>
      <p className="small">For venues: get in touch to bring Serendine to your tables.</p>
    </main>
  );
}
