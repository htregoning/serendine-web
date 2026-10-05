import { themeCss } from '@/lib/theme';
import type { VenueTheme } from '@/lib/theme';

// Wraps a guest screen in the venue's colours and type, with a small "Powered by Serendine".
// With the standard Serendine look it adds nothing.
export default function VenueThemeFrame({ theme, children }: { theme: VenueTheme | null | undefined; children: React.ReactNode }) {
  const css = themeCss(theme);
  if (!css) return <>{children}</>;
  return (
    <div className="themed">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {children}
      <a className="powered-by" href="/" target="_blank" rel="noopener">
        Powered by <span>Serendine</span>
      </a>
    </div>
  );
}
