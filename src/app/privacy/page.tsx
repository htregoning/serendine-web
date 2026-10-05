import Link from 'next/link';

export const metadata = { title: 'Privacy policy · Serendine' };

// To be reviewed by a lawyer before wider launch (company details to add once incorporated).
export default function Privacy() {
  return (
    <main className="legal">
      <Link href="/" className="small">← Serendine</Link>
      <h1 className="display">Privacy policy</h1>
      <p className="small">Last updated 5 October 2026</p>

      <p>
        Serendine lets guests in a venue say hello to other tables, ask staff for service and see the menu.
        This policy explains what personal data we collect, why, who it is shared with, how long we keep it and the
        choices you have. Serendine is run from Dubai, United Arab Emirates (&quot;Serendine&quot;, &quot;we&quot;). If you
        have any question about your data, email us at serendiners@gmail.com.
      </p>

      <h2>The short version</h2>
      <ul>
        <li>Nobody in the room can see you until you switch on &quot;Open to chat&quot;.</li>
        <li>Your messages are end-to-end encrypted on your phone. We cannot read them, and nor can the venue.</li>
        <li>Your table number is only shown to another guest if you both agree.</li>
        <li>Chats are deleted when you leave, unless you and the other person both choose to keep in touch.</li>
        <li>The venue you check in at sees your name, email address, and when and at which table you visited. It never sees your messages or who you talk to.</li>
        <li>The venue may only send you offers and marketing if you tick the box to receive them.</li>
      </ul>

      <h2>What we collect</h2>
      <ul>
        <li><b>Account details</b> from the sign-in you choose (Google, email link, or Telegram): your name, email address, profile picture where the provider supplies one, and a unique account ID. We never receive your password.</li>
        <li><b>Optional details you add</b>: whether you identify as male, female or prefer not to say, and an optional selfie, shown only to other guests open to chat at the same venue and deleted when you leave.</li>
        <li><b>Ratings and comments</b> you give after a visit. They go to that venue&apos;s managers with your name and table.</li>
        <li><b>Your birthday</b> (day and month only), if you add it. It is shared only with venues whose offers you agreed to receive.</li>
        <li><b>Notification details</b>: if you turn notifications on, the address your browser or Telegram gives us for sending them.</li>
        <li><b>Visit details</b>: the venue and table you scanned, the name or alias you enter, what you&apos;re there for (friendly chat, networking or dating), whether you are open to chat, and when you arrived and left.</li>
        <li><b>Private messages</b>: stored only in encrypted form. The keys to read them are created and kept on your device.</li>
        <li><b>Photos and videos</b>: ones you send in a private chat are encrypted on your phone before upload, so only you and the person you sent them to can open them; they are deleted after 7 days. Ones you post to a group chat are checked by the venue&apos;s staff before anyone else sees them, and deleted the next day. Photos are resized on your phone, which also removes hidden details such as where they were taken. If you report someone, the photos in your recent messages are sent with the report.</li>
        <li><b>Group chat messages</b>: messages you post to a venue&apos;s group chat are not encrypted. Everyone open to chat at that venue can read them, and they are deleted after the night (within 12 hours).</li>
        <li><b>Service requests</b> such as &quot;bring the bill&quot;, with your table number, sent to the venue&apos;s staff.</li>
        <li><b>Marketing consent</b>: whether you agreed to hear from the venue, and when.</li>
        <li><b>Safety records</b>: people you block, and reports you make, including any messages you choose to include in a report.</li>
        <li><b>Technical data</b> needed to run the service securely, such as sign-in cookies and basic server logs.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To provide the service you ask for: showing you who is open to chat, delivering messages and passing your requests to staff.</li>
        <li>To keep people safe: enforcing blocks, reviewing reports and removing people who break the house rules.</li>
        <li>To give the venue you visit a record of your visit (your name, email, date, time and table), so it can look after returning guests and follow up on your visit.</li>
        <li>To let the venue send you offers and marketing, only where you have given consent.</li>
        <li>To meet legal obligations.</li>
      </ul>
      <p>We do not sell your personal data, and we do not use your messages for advertising. We cannot read your private messages.</p>

      <h2>Seren, the AI host</h2>
      <p>
        Some venues turn on Seren, an AI host that posts in the venue&apos;s group chat when it goes quiet and replies when
        someone mentions it. Seren is always labelled as AI. To write its messages, the most recent group chat messages
        (up to 12 from the last two hours, with the names people chose to show) and the venue&apos;s current offer and
        announcements are sent to our AI provider, Anthropic. Seren never sees private chats, photos, email addresses or
        any account details. Anthropic processes this only to provide the service to us and does not use it to train its
        models. If you don&apos;t want your words passed to Seren, don&apos;t post in the group chat of a venue that uses it.
      </p>

      <h2>Information we receive from Google</h2>
      <p>
        If you sign in with Google, Google shares your name, email address and profile picture with us, and nothing
        else. We do not ask for access to your Gmail, contacts, calendar, Drive or any other Google data. We use this
        information only to create and secure your Serendine account, to show the venue you visit who checked in, and to
        contact you about your account. We do not sell it, use it for advertising, or transfer it to anyone except the
        service providers listed below who help us run Serendine, and the venue you check in at as described in this
        policy. Serendine&apos;s use of information received from Google APIs adheres to the{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>,
        including the Limited Use requirements. You can remove Serendine&apos;s access at any time in your Google Account
        under Security › Third-party apps and services, and ask us to delete your data as described below.
      </p>

      <h2>Who we share it with</h2>
      <ul>
        <li><b>The venue you check in at</b>, as described in the next section.</li>
        <li><b>Other guests</b>, only what you choose to show: your name or alias, what you&apos;re there for, gender if you chose one, and your selfie, and only while you are open to chat.</li>
        <li><b>Service providers</b> who run the service for us: Supabase (database and sign-in), Vercel (website hosting), Resend (email delivery), Anthropic (AI for Seren, the group chat host, where a venue turns it on), Google, Apple and Telegram (sign-in and notifications) and browser push services. They may only use it to provide their service to us.</li>
        <li><b>Authorities</b>, where the law requires it.</li>
      </ul>

      <h2>What the venue sees</h2>
      <p>
        Venue staff see service requests with table numbers, and the name or alias and table of guests who opted in
        to offers so they can redeem the welcome offer. Venue managers see a guest list of everyone who checked in
        there: your name, email address, the name or alias you used, the dates and times of your visits, which table
        you sat at, whether you used the welcome offer and whether you agreed to receive offers. They can download this
        list and keep private notes about returning guests. Venues never see your messages, who you talk to, what you are
        there for (friendly chat, networking or dating), your gender or your photo.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Chats are deleted when either of you leaves, unless you both chose &quot;Keep in touch&quot;. Kept chats are deleted when either of you removes the connection or deletes their account.</li>
        <li>Visit and service-request records are kept for 12 months for safety and service reporting, then deleted or anonymised.</li>
        <li>Marketing consent is kept until you withdraw it, plus a record of the consent as required by law.</li>
        <li>Selfies are deleted when your visit ends. Your account details are kept until you ask us to delete your account.</li>
        <li>Reports and blocks are kept for as long as needed to keep the community safe, and at most 24 months after the account concerned is closed.</li>
      </ul>

      <h2>Where your data is stored</h2>
      <p>
        Our database is hosted by Supabase in Singapore, and the website by Vercel. These providers process data for
        us under contract. Because this involves transfer outside the UAE, we protect it with the contractual safeguards
        that UAE Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data requires. All data is encrypted
        in transit, and messages between guests are end-to-end encrypted.
      </p>

      <h2>Your choices and rights</h2>
      <ul>
        <li>Stay hidden: simply leave &quot;Open to chat&quot; switched off.</li>
        <li>Block or report anyone from inside a chat.</li>
        <li>Withdraw marketing consent at any time with the unsubscribe link in any venue email, or by contacting the venue or us.</li>
        <li>Ask to access, correct or delete your data by emailing serendiners@gmail.com. We will respond within 30 days.</li>
        <li>Delete your account and the data linked to it by emailing serendiners@gmail.com from the address you signed in with.</li>
      </ul>

      <h2>Age</h2>
      <p>Serendine is only for people aged 18 and over.</p>

      <h2>Changes</h2>
      <p>If we change this policy in a meaningful way, we will tell you in the app before the change applies.</p>
    </main>
  );
}
