// The links at the bottom of public pages.
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav className="site-footer-links" aria-label="Legal, contact and partner links">
        <a href="/terms">Terms and Conditions</a>
        <a href="/privacy">Privacy Policy</a>
        <a href="mailto:serendiners@gmail.com">Contact</a>
        <a href="https://instagram.com/serendiners" target="_blank" rel="noopener noreferrer">Instagram</a>
        <a href="https://onmycompass.com" target="_blank" rel="noopener">On My Compass · sport near you</a>
      </nav>
      <span>© {new Date().getFullYear()} Serendine · 18+ only</span>
    </footer>
  );
}
