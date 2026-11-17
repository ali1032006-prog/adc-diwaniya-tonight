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
```

## Database (Supabase dev `diwaniya-tonight-dev`)

- `supabase/migrations/` holds every schema change, named with the version the server gave it. RLS is on for every table; `anon` has no grants at all.
- Area only until approval: the exact location sits in `diwaniya_pins`, readable by the host, co-hosts and approved guests once tonight's unlock time has passed.
- The core loop runs through RPCs (`request_seat`, `decide_request`, `cancel_request`, `check_in`, `mark_request`, `set_need_one`, `record_game`, `undo_game`, `player_stats`, `complete_profile`), each checking the caller itself. Requests, inbox items and need-one flags cannot be written directly.
- Blocking someone declines their open requests at your diwaniyas, drops their follow and hides your diwaniya, nights, seats, league and profile from them, both ways.
- `supabase/tests/core_test.sql` acts out host, co-host, guest, regular, stranger, blocked and under-age users in one rolled-back transaction.
- Waiting on Ali's rulings: B minimum age (`private.min_age()`, 18 for now), C audience (`diwaniyas.audience`, default `all`), D moderation (reports are write-only until then).

## Notes

- Assets and licences: `ASSET-LICENSES.md`. Fonts are bundled from npm and served from our own origin; no Google Fonts, no CDN scripts.
- Security headers and CSP: `public/_headers`.
- Design notes for each review round live in `.impeccable/` (direction contract, audit-r<N>.md, polish-r<N>.md).
- Sign-in waits on Ali's ruling A (Google sign-in or an approved mail sender); nothing that sends email ships without an approved sender.
- Merges to `main` happen only after review round 3/3, Jayce's sign-off, Vi's QA Pass and Ambessa's confirmation that Ali approved the project.
