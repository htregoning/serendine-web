import Link from 'next/link';

export const metadata = { title: 'Privacy policy · Serendine' };

// DRAFT for legal review. Items in [brackets] must be completed before launch.
export default function Privacy() {
  return (
    <main className="legal">
      <Link href="/" className="small">← Serendine</Link>
      <h1 className="display">Privacy policy</h1>
      <p className="small">Draft for legal review · Last updated 3 October 2026</p>

      <p>
        Serendine lets guests in a venue say hello to other tables, ask staff for service and see the menu.
        This policy explains what we collect, why, and the choices you have. Serendine is operated by
        [Company legal name], [registered address], United Arab Emirates (&quot;we&quot;). Contact:
        [privacy@serendine.com].
      </p>

      <h2>The short version</h2>
      <ul>
        <li>Nobody in the room can see you until you switch on &quot;Open to chat&quot;.</li>
        <li>Your messages are end-to-end encrypted on your phone. We cannot read them, and nor can the venue.</li>
        <li>Your table number is only shown to another guest if you both agree.</li>
        <li>Chats are deleted when you leave, unless you and the other person both choose to keep in touch.</li>
        <li>The venue only receives your email if you tick the box to receive its offers.</li>
      </ul>

      <h2>What we collect</h2>
      <ul>
        <li><b>Account details</b> from the sign-in you choose (Google, Apple or email): your email address and a unique account ID. We do not receive your password.</li>
        <li><b>Visit details</b>: the venue and table you scanned, the name or alias you enter, what you&apos;re there for (friendly chat, networking or dating), whether you are open to chat, and when you arrived and left.</li>
        <li><b>Messages</b>: stored only in encrypted form. The keys to read them are created and kept on your device.</li>
        <li><b>Service requests</b> such as &quot;bring the bill&quot;, with your table number, sent to the venue&apos;s staff.</li>
        <li><b>Marketing consent</b>: whether you agreed to hear from the venue, and when.</li>
        <li><b>Safety records</b>: people you block, and reports you make, including any messages you choose to include in a report.</li>
        <li><b>Technical data</b> needed to run the service securely, such as sign-in cookies and basic server logs.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To provide the service you ask for: showing you who is open to chat, delivering messages and passing your requests to staff.</li>
        <li>To keep people safe: enforcing blocks, reviewing reports and removing people who break the house rules.</li>
        <li>To share your contact details with a venue, only where you have given consent.</li>
        <li>To meet legal obligations.</li>
      </ul>
      <p>We do not sell your personal data, and we do not use your messages for advertising. We cannot read them.</p>

      <h2>What the venue sees</h2>
      <p>
        Venue staff see service requests with table numbers, and the name or alias and table of guests who opted in
        to offers so they can redeem the welcome offer. Venue managers can download the email addresses of guests who
        opted in to their offers. Venues never see your messages or who you talk to.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Chats are deleted when either of you leaves, unless you both chose &quot;Keep in touch&quot;. Kept chats are deleted when either of you removes the connection or deletes their account.</li>
        <li>Visit and service-request records are kept for [12 months] for safety and service reporting, then deleted or anonymised.</li>
        <li>Marketing consent is kept until you withdraw it, plus a record of the consent as required by law.</li>
        <li>Reports and blocks are kept for as long as needed to keep the community safe, and at most [24 months] after the account concerned is closed.</li>
      </ul>

      <h2>Where your data is stored</h2>
      <p>
        Our database is hosted by Supabase in Singapore, and the website by Vercel. These providers process data for
        us under contract. Because this involves transfer outside the UAE, we rely on [the appropriate safeguard under
        UAE Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data, to be confirmed].
      </p>

      <h2>Your choices and rights</h2>
      <ul>
        <li>Stay hidden: simply leave &quot;Open to chat&quot; switched off.</li>
        <li>Block or report anyone from inside a chat.</li>
        <li>Withdraw marketing consent at any time by contacting the venue or us.</li>
        <li>Ask to access, correct or delete your data by emailing [privacy@serendine.com]. We will respond within [30 days].</li>
      </ul>

      <h2>Age</h2>
      <p>Serendine is only for people aged 18 and over.</p>

      <h2>Changes</h2>
      <p>If we change this policy in a meaningful way, we will tell you in the app before the change applies.</p>
    </main>
  );
}
