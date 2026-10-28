// Small line icons for the front page.
const PATHS: Record<string, string> = {
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2zM16 16h2v2h-2z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  people: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.8c2 .7 3.2 2.5 3.5 5.2',
  gift: 'M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.5-3.5-5-3.5-5-1.2C7 7 9 7 12 7zM12 7c1.5-3.5 5-3.5 5-1.2C17 7 15 7 12 7z',
  party: 'M4 20l4-12 8 8zM14 4l1 2M19 5l-2 2M20 10l-2-.5M10 3l.5 2',
  order: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  megaphone: 'M3 10v4h4l6 4V6L7 10zM17 9a4 4 0 0 1 0 6M19.5 6.5a7.5 7.5 0 0 1 0 11',
  know: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c.8-4 4-6.5 8-6.5s7.2 2.5 8 6.5',
  chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3M20 16V6',
};

export default function HomeIcon({ name, size = 22 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}
