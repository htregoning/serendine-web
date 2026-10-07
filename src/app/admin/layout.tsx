import WorkTheme from '@/components/work-theme';

// Admin pages use the plain, businesslike look.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WorkTheme />
      {children}
    </>
  );
}
