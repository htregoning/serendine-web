import VenueThemeFrame from '@/components/venue-theme-frame';

// Planning pages use the calm guest look.
export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return <VenueThemeFrame theme={null}>{children}</VenueThemeFrame>;
}
