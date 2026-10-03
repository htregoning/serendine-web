// Serendine mark: two glasses meeting in a toast, a question mark between them,
// inside a ring. Drawn from Harry's logo design.
export default function Logo({ size = 64, color = 'currentColor', ring = true }: { size?: number; color?: string; ring?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Serendine">
      {ring && <circle cx="50" cy="50" r="47" fill="none" stroke={color} strokeWidth="2.6" />}
      {/* question mark */}
      <path d="M45.5 25.5 a4.6 4.6 0 1 1 7.4 3.7 c-1.8 1.3 -2.9 2.4 -2.9 4.6" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="50" cy="38.6" r="1.6" fill={color} />
      {/* left glass */}
      <g transform="rotate(20 38 52)">
        <path d="M30 44 H46 C46.5 52 43 57 38 57 C33 57 29.5 52 30 44 Z" fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M30.6 50 H45.4 C44.6 54.5 41.8 57 38 57 C34.2 57 31.4 54.5 30.6 50 Z" fill={color} />
        <path d="M38 57 V70 M32.5 70.5 H43.5" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      </g>
      {/* right glass */}
      <g transform="rotate(-20 62 52)">
        <path d="M54 44 H70 C70.5 52 67 57 62 57 C57 57 53.5 52 54 44 Z" fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M54.6 50 H69.4 C68.6 54.5 65.8 57 62 57 C58.2 57 55.4 54.5 54.6 50 Z" fill={color} />
        <path d="M62 57 V70 M56.5 70.5 H67.5" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      </g>
    </svg>
  );
}
