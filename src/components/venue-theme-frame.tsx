import { themeCss } from '@/lib/theme';
import type { VenueTheme } from '@/lib/theme';

// Wraps a guest screen in the venue's colours and type, with a small "Powered by Serendine".
// With the standard Serendine look it only calms the colours (no footer: the brand is already everywhere).
export default function VenueThemeFrame({ theme, children }: { theme: VenueTheme | null | undefined; children: React.ReactNode }) {
  const css = themeCss(theme);
  if (!theme || theme.preset === 'serendine') {
    return (
      <div className="guest">
        <style dangerouslySetInnerHTML={{ __html: css }} />
        {children}
      </div>
    );
  }
  return (
    <div className="guest themed">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {children}
      <a className="powered-by" href="/" target="_blank" rel="noopener">
        Powered by <span>Serendine</span>
      </a>
    </div>
  );
}
