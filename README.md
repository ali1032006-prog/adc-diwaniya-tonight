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
```

## Notes

- Assets and licences: `ASSET-LICENSES.md`. Fonts are bundled from npm and served from our own origin; no Google Fonts, no CDN scripts.
- Security headers and CSP: `public/_headers`.
- Design notes for each review round live in `.impeccable/` (direction contract, audit-r<N>.md, polish-r<N>.md).
- Sign-in waits on Ali's ruling A (Google sign-in or an approved mail sender); nothing that sends email ships without an approved sender.
- Merges to `main` happen only after review round 3/3, Jayce's sign-off, Vi's QA Pass and Ambessa's confirmation that Ali approved the project.
