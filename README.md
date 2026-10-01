# Serendine

Say hello to another table. A web app that opens from a QR code on a restaurant
table: guests can switch on "Open to chat" and message other open guests, call
a waiter, ask for the bill and see the menu. Venues get their own branding, a
welcome offer and a staff screen.

## What's built so far

| Area | Status |
|---|---|
| Database, security rules, offer redemption, opted-in guest list | Done, tested |
| End-to-end encryption helpers | Done, tested |
| QR table page, sign-in (Apple, Google, email link), alias and 18+ check, offer opt-in | Done |
| The room: open-to-chat switch, who's open | Done |
| Service tab: call waiter, bill, water, menu PDF link | Done |
| Encrypted chat, share tables, keep in touch, block and report | Next |
| Staff screen (tablet) and manager settings | Next |

## How it fits together

- **Next.js** web app, hosted on **Vercel**.
- **Supabase** for sign-in, the Postgres database, live updates and menu PDF storage.
- Chat messages are encrypted on the guest's phone (`src/lib/crypto.ts`). The
  database only stores ciphertext; venue staff and managers have no access to chats.
- All privacy rules live in the database (`supabase/migrations/0001_init.sql`),
  so they hold no matter which screen asks.

## Setup

1. **Supabase › SQL Editor:** run `supabase/migrations/0001_init.sql`.
2. **Supabase › Authentication › Providers:** turn on Email; add Google and Apple
   when their developer accounts are ready.
3. **Supabase › Authentication › URL Configuration:** set the Site URL to the
   Vercel address and add `https://<your-address>/auth/callback` to Redirect URLs.
4. **Vercel:** import this repository and add the two variables in `.env.example`.
5. Sign in once on the live site, then run `supabase/first_venue.sql` with your
   email to create a test venue and get the table QR links.
