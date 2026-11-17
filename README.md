# adc-diwaniya-tonight

Diwaniya Tonight: open diwaniyas with live seats, a missing-seat ping, host join approvals, safety, and a shared league table (ADC-PRJ-4, build Task ADC-TSK-36).

- Research brief: ADC-RES-49 (Viktor). Design contract: ADC-RES-50 (UI direction: woven night, live seat ring). Both in Notion, Research & Ideas.
- Stack: Vite + React + TypeScript PWA, Supabase (dev project `diwaniya-tonight-dev`), Cloudflare Pages (`adc-diwaniya-tonight`).
- Arabic first (`dir=rtl`), English toggle. Logical CSS properties only, so both directions come from one layout.
- Navigation: bottom bar with 5 labelled tabs and a sliding pill on phones and tablets; a rail at 840px+ or in short landscape.
- Motion: transform and opacity only, M3 easing, crossfades under `prefers-reduced-motion`.

## Commands

```
npm install
npm test        # vitest
npm run build   # tsc + production build into dist/
npm run test:sql  # SQL behaviour + RLS tests against the dev project (needs SUPABASE_ENV_FILE)
SUPABASE_ENV_FILE=<env file> python3 scripts/live_smoke.py  # src/lib/api.ts end to end on dev with two throwaway accounts, deleted after (opens the email provider for the run only, then closes it)
SUPABASE_ENV_FILE=<env file> npm run seed:mock  # re-create the mock pilot data on dev (ruling F); tonight's nights get today's date
```

The app reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from a git-ignored `.env.local` at build time. The publishable key is meant for browsers; RLS and the RPCs guard the data.

## Screens

`src/lib/api.ts` holds every read and write; `src/lib/session.tsx` holds the Supabase session and profile. Hash routes: `#/pings` (S4 install and pings guide, shown after profile setup and from Me), `#/admin` (moderation queue, admins only), `#/welcome` (S1), `#/signin?mode=signin|register` (S2), `#/terms`, `#/tonight` (S5), `#/d/<id>` Diwaniya page with the request sheet (S6/S7) and report sheet (S15), `#/diwaniya` host board and followed list (S8), `#/settings/<id>` (S9), `#/score/<id>?table=<id>` full-screen scoring (S10), `#/league` (S11), `#/player/<id>` (S12), `#/inbox` (S13), `#/me` detailed settings (S14). Seats, requests, queues and the inbox refresh live through Realtime. Signed out, every screen teaches what it shows and offers Sign in / New account.

## Database (Supabase dev `diwaniya-tonight-dev`)

- `supabase/migrations/` holds every schema change, named with the version the server gave it. RLS is on for every table; `anon` has no grants at all.
- Area only until approval: the exact location sits in `diwaniya_pins`, readable by the host, co-hosts and approved guests once tonight's unlock time has passed.
- The core loop runs through RPCs (`request_seat`, `decide_request`, `cancel_request`, `check_in`, `mark_request`, `set_need_one`, `record_game`, `undo_game`, `player_stats`, `complete_profile`), each checking the caller itself. Requests, inbox items and need-one flags cannot be written directly.
- Blocking someone declines their open requests at your diwaniyas, drops their follow and hides your diwaniya, nights, seats, league and profile from them, both ways.
- `supabase/tests/core_test.sql` acts out host, co-host, guest, regular, stranger, blocked and under-age users in one rolled-back transaction.
- Ali's rulings (ADC-LOG-696/697): A Google sign-in only; B 18 and over (`private.min_age()`, checked in `complete_profile`); C every diwaniya is men only (no audience setting; the Terms say it; since Ali's order ADC-LOG-751 there is no per-user male checkbox, and `profile_private.male_confirmed_at` only keeps confirmations given before that); D reports go to Ali (write-only for users; the moderation queue comes in a later slice); F mock pilot data only (`supabase/seed/mock_pilot.sql`).
- v1 completion (`20261117201907_v1_complete.sql`, tested by `supabase/tests/v1_complete_test.sql`): pings reach phones through Web Push (an inbox insert trigger hands the item to the `send-ping` Edge Function with pg_net; its URL and shared secret live in Vault, the VAPID keys in the function's secrets); `push_subscriptions` is written only by `save_push_subscription`, which accepts only the browsers' own push services. 'Need one' pings followers and regulars, then (public diwaniyas) players who opted in to that game and that area, one round per table per 30 minutes. Hosts send up to 5 notes a night to approved guests (`announce`). `delete_my_account('DELETE')` removes the account and everything that is his. `player_relations` gives partner/rival/played-with stats.
- Moderation (ruling D): reports carry a status and a review note (reporters can read the status, never who reviewed it or the note); three different reporters with a real link to the target (an answered request there, a regular, a 7-day follower, or a shared night or game) hold a person or a diwaniya off Tonight until review, and every admin gets an inbox item and push when a hold starts. Hiding a person also records a hash of his Google identity in `private.banned_identities`, so deleting the account and signing in again is refused; `admin_unhide` lifts it. A held account can't delete itself until reviewed, and a hidden or held account can't manage, score, report, follow, queue or save a push device. The admin queue (`#/admin`, linked from Me only for admins) runs on `admin_*` RPCs that refuse anyone not in `private.admins`. That table is not exposed through the API: an admin is added by the database owner (`insert into private.admins (user_id) values ('<auth user id>')`) on Ali's word, after the account has signed in once.
- Co-hosts are invitations: the host invites from a player's page, the person accepts on Me (`accept_cohost`) or declines; only accepted co-hosts manage or get the managers' pings. Seat requests: two tries a night and five requests in any 10 minutes; a cancelled pending request pings nobody, and one person gets at most one push of the same kind per diwaniya every 2 minutes (the inbox keeps every item).
- `supabase/tests/signin_test.sql` covers ruling B, C and ADC-LOG-751: `complete_profile` takes no male argument, no profile without the Terms, 17 refused and 18 accepted, consents not editable, no audience column.

## Notes

- Assets and licences: `ASSET-LICENSES.md`. Fonts are bundled from npm and served from our own origin; no Google Fonts, no CDN scripts.
- Security headers and CSP: `public/_headers`. The service worker (`public/sw.js`) only shows pings and opens their deep link; it caches nothing. Push travels server-side (Edge Function -> the browser's push service), so the CSP gains no host.
- Edge Function: `supabase/functions/send-ping` (verify_jwt off; it checks the `x-push-secret` header itself, mutes quiet hours in Kuwait time and drops devices the push service reports gone). The client needs `VITE_VAPID_PUBLIC_KEY` in `.env.local`.
- Design notes for each review round live in `.impeccable/` (direction contract, audit-r<N>.md, polish-r<N>.md).
- Sign-in (S2, `#/signin`, `src/screens/SignIn.tsx`) is Google only, through Supabase Auth with PKCE: the person comes back to the same page with a one-time `?code=` that the client swaps for a session, then `src/lib/auth.ts` tidies the address bar and returns to the screen that asked. Register asks the date of birth (18+) and the Terms before Google; profile setup (S3) asks them again and the server enforces them. The email provider is closed on the project (`external_email_enabled: false`), so there is no password or email form and nothing sends mail. Terms and Privacy: `#/terms`.
- Google button: Google's own "G" from its Sign in with Google asset bundle, with the colours and padding of its branding guidelines (see `ASSET-LICENSES.md`). The callback URL `https://<ref>.supabase.co/auth/v1/callback` must be an Authorized redirect URI on the Google OAuth client.
- Merges to `main` happen only after review round 3/3, Jayce's sign-off, Vi's QA Pass and Ambessa's confirmation that Ali approved the project.
