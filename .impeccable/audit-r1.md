# Impeccable audit, round 1/3 (ADC-TSK-36, Diwaniya Tonight v1)

Run by hand from `reference/audit.md` (ADC manual mode: launcher, detector and motion-capture are not installed). Target: the whole finished v1 on preview `https://5132d0e1.adc-diwaniya-tonight.pages.dev` (commit c5e0863), every page of the nav map signed in as a throwaway admin/host account seeded on dev (sample diwaniya with an open night, two tables, seats, a pending and an approved request, inbox items, two scored games, three tagged reports), in Arabic (RTL, default) and English, day theme, at 320, 360, 390, 430, 844x390, 768, 1024, 1280 and 1920. Evidence: screenshots and DOM scans in the harness workspace `audit-r1/`, plus the live push and SQL checks named below. The fixes are in `polish-r1.md`.

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | Admin queue jumped h1 -> h3; played-with name links as narrow as 22px |
| 2 | Performance | 2 | One 731 kB JS chunk (200 kB gzip): each Phosphor React icon ships all six weights |
| 3 | Theming | 3 | `#15111a` hard-coded three times for ink on saffron instead of a token |
| 4 | Responsive Design | 3 | Pings guide's primary button wrapped to two lines at 390; wide report cards at 1920 |
| 5 | Implementation Integrity | 3 | A 3px coloured callout border (craft-floor ban); Arabic count agreement wrong in new copy |
| **Total** | | **14/20** | **Good (address weak dimensions)** |

## Implementation Integrity Verdict

Pass. The new surfaces (S4 pings guide, moderation queue, announcements, quiet-night nudge, partner/rival stats, delete account) are built from the existing system: woven band under every app bar, seat ring as the S4 hero, the shared `panel`, `stat`, `tag`, `note`, `Field`, `PushBar` and `Skeleton` pieces, madder for actions, saffron only for pings and the unread badge, camel for supporting marks. Nothing is a generic template; the S4 hero reuses the product's own signature (a Kout ring one seat short). Verified issues were isolated, not systemic (listed below).

## Executive Summary

- Audit Health Score: **14/20** (Good)
- Issues: P0 0, P1 0, P2 7, P3 6
- Top issues: Arabic count agreement in new strings ("٣ متابع ينتظرون"); the 3px coloured border on report details; pings primary action wrapping to two lines on phones; admin heading order; the bundle size from Phosphor's all-weights icons.
- Next steps: polish pass on every P2/P3 that is local (done, see polish-r1.md); bundle size recorded as a follow-up because the fix swaps the icon package (a dependency change).

## Detailed Findings by Severity

**[P2] Arabic count agreement wrong in new copy**
- Location: `src/lib/copy.ts` (nudge.followers, relations.*, admin.openCount, pings.devices)
- Category: Implementation Integrity (content)
- Impact: Arabic is the default language; "٣ متابع ينتظرون", "١ لعبة", "٠ فوز معاً" read as machine text.
- Recommendation: one/two/3-10/11+ agreement helper; reword the zero cases.
- Suggested command: /impeccable clarify

**[P2] Coloured 3px border on report details**
- Location: `src/styles.css` `.report-card__details`
- Category: Implementation Integrity (craft-floor ban: coloured border-left/right above 1px on callouts)
- Recommendation: hairline border + raised fill, 12px radius like the other inset blocks.
- Suggested command: /impeccable polish

**[P2] Pings primary action wraps to two lines on phones**
- Location: `src/screens/Pings.tsx` actions row, `.actions-row .btn { flex: 1 1 140px }`
- Category: Responsive
- Impact: the main action of S4 looks broken at 360-430 ("شغّل / التنبيهات" split), the text link beside it wraps too.
- Recommendation: stack the actions full width under 600px, keep the label on one line.
- Suggested command: /impeccable adapt

**[P2] Admin queue heading order h1 -> h3**
- Location: `src/screens/Admin.tsx` report cards, hidden and summary panels
- Category: Accessibility (WCAG 1.3.1, heading structure)
- Recommendation: h2 for each report and panel title.
- Suggested command: /impeccable harden

**[P2] Played-with name links below 44px**
- Location: `src/screens/Player.tsx` played-with list (`بدر` measured 22x26)
- Category: Accessibility / Responsive (touch target; passes 2.5.8 only by spacing)
- Recommendation: 44px min height and width on those links.
- Suggested command: /impeccable adapt

**[P2] Selected admin tab can sit off-screen**
- Location: `src/screens/Admin.tsx` tab strip at 360-390
- Category: Responsive
- Impact: choosing "Summary" leaves the active chip scrolled out of view; the user loses where he is.
- Recommendation: scroll the chosen tab into view inside the strip.
- Suggested command: /impeccable adapt

**[P2] Bundle size: 731 kB JS (200 kB gzip) in one chunk**
- Location: `@phosphor-icons/react` named imports (51 icons, each with all six weights)
- Category: Performance
- Impact: slower first load on mobile data; parse cost on low-end phones.
- Recommendation: an in-repo icon component that bundles only the regular and fill SVG paths from `@phosphor-icons/core` (the package ADC-RES-50 named), then code-split Score and Admin. Dependency change, so it goes in its own slice, not this polish.
- Suggested command: /impeccable optimize

**[P3] Device-pings link row sub-line sits on the hairline**
- Location: `src/screens/Me.tsx` pings panel, `.link-row`
- Recommendation: 10px block padding on the row content.

**[P3] Announcement text in the Inbox in the same 600 weight as the title**
- Location: `.inbox__item--unread .inbox__text > bdi` also hit the body
- Recommendation: regular weight, muted ink for the note body.

**[P3] Co-host button label wraps inside a full pill**
- Location: `src/screens/Player.tsx` "اجعله مشرفاً مساعداً · <diwaniya>"
- Recommendation: a wrapping button variant with a 16px radius.

**[P3] Summary stats touch the reasons panel; hidden/summary lists without stack spacing**
- Location: `src/screens/Admin.tsx`

**[P3] Unread badge numerals at 11px**
- Location: `.nav__badge`; Readex Pro's "٦" reads like "١" at that size
- Recommendation: 12px, tabular figures.

**[P3] Ink-on-saffron colour hard-coded three times**
- Location: `src/styles.css` `::selection`, `.btn--saffron`, `.nav__badge`
- Recommendation: a `--on-saffron` token.

Observed once, not reproduced: the Inbox badge showed "١" against 6 unread right after two server-side inbox inserts; three reloads and route changes afterwards all showed 6 (the glyph-size finding above may explain it). Left as a watch item for QA, not a fix.

## Patterns & Systemic Issues

- New Arabic strings were written with a bare number + singular noun; every counted string needs the agreement helper (now `arCount` in copy.ts, tested).
- Icon imports are the single largest weight in the bundle; the fix is structural (icon component), not per screen.

## Positive Findings

- 81/81 page-size combinations with no horizontal overflow (9 pages x 9 sizes) on the polished build; the rail takes over at 844x390 and from 840px wide as designed.
- Real Web Push end to end in this Chrome: the S4 button asked permission, subscribed through FCM, the device row saved through the RPC; a server-side inbox item reached the browser as an RTL notification titled "إعلان من …" with the deep link `/#/d/<id>`; inside quiet hours the function muted it (`skipped: quiet hours`), and a dead token (404) dropped the device row.
- Moderation RPCs, holds and hides are server-side and covered by `supabase/tests/v1_complete_test.sql`; the screen is a view on them, never the guard.
- Reduced motion has an explicit alternative for every new motion (crossfade or none), and the bell ring and card exit are transform/opacity only.
- No unnamed buttons or links and no unlabeled inputs on any new page (DOM scan).

## Recommended Actions

1. **[P2] /impeccable clarify**: Arabic count agreement on nudge, relations, admin counts and devices.
2. **[P2] /impeccable adapt**: stack the S4 actions on phones, keep the active admin tab in view, 44px played-with links.
3. **[P2] /impeccable harden**: h2 for report cards and admin panels.
4. **[P2] /impeccable polish**: replace the coloured callout border; spacing and weights listed under P3.
5. **[P2] /impeccable optimize**: icon component from @phosphor-icons/core (own slice, dependency change).
6. **[P3] /impeccable polish**: final pass.
