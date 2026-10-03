import Link from 'next/link';

export const metadata = { title: 'Terms of use · Serendine' };

// DRAFT for legal review. Items in [brackets] must be completed before launch.
export default function Terms() {
  return (
    <main className="legal">
      <Link href="/" className="small">← Serendine</Link>
      <h1 className="display">Terms of use</h1>
      <p className="small">Draft for legal review · Last updated 3 October 2026</p>

      <p>
        These terms apply when you use Serendine, operated by [Company legal name], [registered address], United Arab
        Emirates (&quot;we&quot;). By signing in, you agree to them and to our <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>Who can use Serendine</h2>
      <p>You must be 18 or over, and use your own account. One account per person.</p>

      <h2>House rules</h2>
      <ul>
        <li>Be kind. Take no for an answer, including silence.</li>
        <li>No harassment, threats, hate, sexual content sent without clear consent, or spam.</li>
        <li>Don&apos;t pretend to be someone else in a way that misleads or harms people.</li>
        <li>Don&apos;t approach someone at their table unless they have shared their table with you.</li>
        <li>Don&apos;t use Serendine to sell, solicit or promote anything without the venue&apos;s permission.</li>
        <li>Follow the venue&apos;s own rules and staff instructions.</li>
      </ul>
      <p>
        We may suspend or remove anyone who breaks these rules, and may share information with the venue or the
        authorities where the law requires it or someone&apos;s safety is at risk.
      </p>

      <h2>Your messages</h2>
      <p>
        Messages are end-to-end encrypted, so we cannot read them unless someone includes them in a report. You are
        responsible for what you send. Think before sharing personal details such as your phone number.
      </p>

      <h2>Meeting people</h2>
      <p>
        Serendine helps people start a conversation; it does not check who they are beyond their sign-in account. Use
        your own judgement when sharing your table or meeting someone, and tell venue staff if you feel unsafe.
      </p>

      <h2>Venue offers and service</h2>
      <p>
        Offers are made by the venue, not by us, and are subject to the venue&apos;s terms and applicable law. Service
        requests are passed to the venue&apos;s staff; we cannot guarantee how quickly they respond.
      </p>

      <h2>The service</h2>
      <p>
        We provide Serendine as it is and may change, pause or end features. To the extent allowed by law, we are not
        responsible for the behaviour of other guests or venues, or for losses arising from your use of the service.
        Nothing in these terms limits rights you have under UAE consumer law.
      </p>

      <h2>Ending your use</h2>
      <p>You can stop using Serendine at any time and ask us to delete your account at [privacy@serendine.com].</p>

      <h2>Law</h2>
      <p>These terms are governed by the laws of [the Emirate of Dubai and the federal laws of the UAE].</p>
    </main>
  );
}
