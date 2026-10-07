import WorkTheme from '@/components/work-theme';

// Staff pages use the plain, businesslike look (the main staff screen adds the venue's accent colour).
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WorkTheme />
      {children}
    </>
  );
}
