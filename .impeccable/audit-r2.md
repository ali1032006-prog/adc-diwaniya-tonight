# Impeccable audit, round 2/3 (ADC-TSK-36, Diwaniya Tonight v1)

Run by hand from `reference/audit.md` (ADC manual mode: launcher, detector and motion-capture are not installed), with `reference/craft-floor.md` and `reference/animate.md` read for the new UI and motion. Target: the round 1/3 fix build on branch `fix/ADC-TSK-36-r2` (commits 5726d15 and 9b8d644, check preview `https://50b4de69.adc-diwaniya-tonight.pages.dev`), after Jayce's round 1/3 (ADC-SEC-16..20) and Vi's (ADC-TSK-37 plus her signed-out note). Fixes are in `polish-r2.md`.

**What this run could and could not see.** Ambessa's hold (ADC-LOG-744, Agent Issue 52) stands: no reviewer or test accounts and no extra sign-in path on dev until Ali rules, and sign-in is Google only. So the rendered pass covers every signed-out surface (10 routes x 9 sizes, Arabic RTL default) and the welcome font-swap trace; the new signed-in UI from this round (co-host invites on Me, the invited tag in Settings, the two new inbox kinds, the admin queue's "counts toward a hold" line, the new refusal messages) was audited in code and in the DOM tests of `src/r2.test.tsx`, not on a rendered screen. That rendered signed-in look is owed before the 2/3 handoff, once Ali has ruled on accounts; the handoff is held until then anyway.

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | Terms link inside the consent sentence 199x20 (passes 2.5.8 only by the inline exception) |
| 2 | Performance | 3 | One 740 kB chunk (r1 P2) still carried the rarely opened screens; the icon weight itself stays |
| 3 | Theming | 4 | New UI uses existing tokens only (`tag--saffron`, `btn--primary`, `--hairline`); no new hard-coded colour |
| 4 | Responsive Design | 3 | Invite rows would squeeze the diwaniya name beside two buttons at 320 (code read) |
| 5 | Implementation Integrity | 3 | Signed-out Tonight claimed "no open seats near you" when it simply can't show any (Vi 1/3) |
| **Total** | | **16/20** | **Good (address weak dimensions)** |

## Implementation Integrity Verdict

Pass. The round's new surfaces are built from the system, not beside it: the invites panel is a standard `panel` with the shared `people` list, the invited state reuses `tag tag--saffron` (saffron already means "waiting on someone" in this world), the hold alert and invite reuse the inbox row with Phosphor `ShieldWarning` and `UserGear` in the same fill weight as the other kinds, and every new refusal has its own plain sentence in both languages instead of the generic "not open to you". One content integrity defect was verified and fixed (the misleading signed-out Tonight empty state).

## Executive Summary

- Audit Health Score: **16/20** (Good), up from 14/20 in r1.
- Issues: P0 0, P1 1, P2 3, P3 2.
- Top issues: welcome headline/body move when Readex Pro swaps in (ADC-TSK-37, CLS 0.114 at 390 on Vi's throttled trace); signed-out Tonight says there are no seats; the 740 kB entry chunk; invite rows on 320; the Terms link's 20px hit box.
- Next steps: all fixed in the polish pass (polish-r2.md) except the icon-weight part of the bundle (see P2 below); rendered signed-in look owed before 2/3.

## Detailed Findings by Severity

**[P1] Welcome headline and body re-wrap when the webfont swaps in (ADC-TSK-37)**
- Location: `src/styles.css` `.welcome__title`, `.welcome__body`; `@fontsource-variable/readex-pro` uses `font-display: swap`
- Category: Performance (layout stability) / Responsive
- Impact: on a slow phone the first-run screen jumps twice (title 31 -> 62 -> 31 px, body 26 -> 51 -> 26 px); CLS 0.114 > 0.1, the product bar's smooth-motion line.
- Standard: Core Web Vitals CLS <= 0.1
- Recommendation: reserve the two-line box for both, so either face fits without moving anything.
- Suggested command: /impeccable optimize

**[P2] Signed-out Tonight says "no open seats near you"**
- Location: `src/screens/Tonight.tsx` `NeedsAccountOrTeach`
- Category: Implementation Integrity (misleading state)
- Impact: a visitor (and Vi in 1/3) can't tell whether pilot nights exist; the copy states something false: there may be many seats, the app just doesn't show them before sign-in.
- Recommendation: say that tonight's seats show after sign-in and why (hosts' homes stay private), keep Sign in and Open your diwaniya as the actions.
- Suggested command: /impeccable clarify

**[P2] Entry chunk 740 kB (r1 P2, carried over)**
- Location: `src/App.tsx` static imports of every screen; `@phosphor-icons/react` (each icon ships six weights)
- Category: Performance
- Impact: slower first load on mobile data. Lighthouse mobile perf on welcome/Tonight is 0.98/0.99 (Vi 1/3), so the effect is small today but grows with each screen.
- Recommendation: load Settings, Score, Player, Terms, Pings and Admin on demand behind a skeleton; the icon-weight part needs an icon component from `@phosphor-icons/core` (a dependency change, its own slice).
- Suggested command: /impeccable optimize

**[P2] Co-host invite rows on narrow phones (new UI, code read)**
- Location: `src/screens/Me.tsx` `CohostInvites`, `.people li` is a non-wrapping flex row
- Category: Responsive
- Impact: at 320 a long diwaniya name plus area plus date sits beside Accept and Decline and gets squeezed to a sliver.
- Recommendation: wrap the row; the name block takes the line and the two answers drop under it together.
- Suggested command: /impeccable adapt

**[P3] Terms link in the consent sentence is 20px tall**
- Location: `src/components/consent.tsx`, `.consent a` (measured 199x20 at every size)
- Category: Accessibility (touch target)
- Impact: passes WCAG 2.5.8 by the inline-text exception, but it is the one link a new user must open before registering.
- Recommendation: 24px hit box with matching negative margin so the line does not move.
- Suggested command: /impeccable adapt

**[P3] Unhiding a person left his diwaniyas hidden (found while testing SEC-17)**
- Location: `public.admin_unhide` (v1_complete)
- Category: Implementation Integrity (state)
- Impact: the admin restores a person and his diwaniya stays off Tonight with no way to see why in the person's view.
- Recommendation: bring back exactly the diwaniyas the hide took down (same `hidden_at`).
- Suggested command: /impeccable harden

## Patterns & Systemic Issues

- Server rules that refuse an action now come with a reason the screen can name (under review, two tries a night, slow down, player not here). The pattern to keep: every new SQLSTATE + message pair gets its own sentence in `copy.ts` and a test in `r2.test.tsx`, so no new rule falls back to "something went wrong".
- Font loading: any headline that sits in a centred, fixed composition needs a reserved box; the welcome screen was the only one found (the tabs' headers are single-line and left-aligned at the top, so a re-wrap there pushes nothing above the fold).

## Positive Findings

- 90/90 route-size combinations with no horizontal overflow and `innerWidth` equal to the emulated width: welcome, Tonight, sign-in/register, Me, League, Inbox, Diwaniya, Terms, Admin and Pings (signed-out walls) at 320x568, 360x640, 390x844, 430x932, 844x390, 768x1024, 1024x768, 1280x800 and 1920x1080.
- Same scan: 0 unnamed controls, exactly one h1 per route, no heading-level jumps; the only target under 24px was the inline Terms link.
- Welcome boxes measured with the webfont blocked (fallback face) and loaded: title 62.4 / body 51.2 px under both on the fix build, 31.2 / 25.6 px on 2c8c9f3c. The swap can no longer change the layout. (This harness's Chrome did not reproduce Vi's re-wrap on the old build under 4x CPU + Slow 4G either, CLS 0 there too, so Vi's retest on her trace is the real confirmation.)
- No new colour, radius or shadow values; reduced-motion paths unchanged and still explicit.
- Every security fix is enforced in SQL and covered by `supabase/tests/r2_fixes_test.sql`; the screens only explain the refusals.

## Recommended Actions

1. **[P1] /impeccable optimize**: reserve the welcome title/body boxes (ADC-TSK-37).
2. **[P2] /impeccable clarify**: honest signed-out Tonight state.
3. **[P2] /impeccable optimize**: lazy-load the rarely opened screens; icon component later as its own dependency slice.
4. **[P2] /impeccable adapt**: wrap the invite rows.
5. **[P3] /impeccable adapt**: 24px Terms link.
6. **[P3] /impeccable harden**: unhide brings back the person's diwaniyas.
7. **/impeccable polish**: final pass.

---

# Re-run before the 2/3 handoff: Ali's change list (ADC-LOG-754)

Run by hand again from `reference/audit.md` (every section), with `reference/craft-floor.md` read before the UI edits. Target: `fix/ADC-TSK-36-r2` after the seven items (area dropdown + My area filter, Me/S9 regrouped, league fix, guest scoring, map location, My diwaniyas, fewer taps). Evidence: the hash preview of this commit for signed-out routes, and a local render harness (git-excluded `vite.harness.config.ts` that swaps `api.ts`/`supabase.ts` for mocks, never deployed) for every signed-in screen, because the Issue 52 hold still forbids reviewer or test accounts. Rendered: 8 signed-in routes x 9 sizes (72 measures, Arabic RTL) plus English at 320x568, 844x390, 1280x800 and the night theme; synthesized touch drag on the map (Chrome CDP touch events, emulated 390x844 phone); keyboard on the League tabs. Untested: a physical phone, and real data on dev (the SQL tests and Ali's own two games stand in for it).

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | League view switch was role=tablist without arrow keys; repeated "Approve"/"Score a game" names with no context |
| 2 | Performance | 4 | Map asks only the tiles in view (6 at 390x240, z16); no map library; `will-change` left on the tile layer at rest |
| 3 | Theming | 4 | New UI on existing tokens (madder pill, camel rims, saffron seats); map overlay colours fixed on purpose (tiles are always light) |
| 4 | Responsive Design | 3 | S9 sections pushed past the left edge in RTL (the jump row's nowrap width sized the grid column); My diwaniyas cards stretched with gaps at 844x390 |
| 5 | Implementation Integrity | 4 | Seven items built from the shared panel, chip, status and link-row patterns; one new shared piece (SectionIndex) used by both long pages |
| **Total** | | **18/20** | **Excellent (minor polish)** |

## Implementation Integrity Verdict

Pass. The league bug was fixed at its root (the season view dropped every typed-name row), not papered over in the screen; the new score sheet links people from `score_roster` so names and accounts stop drifting apart. The map is drawn from OSM tiles by our own 300-line component instead of a library, which keeps the CSP to one image host and the bundle flat. Area pickers are native selects grouped by governorate, so phones open their own picker. Me and S9 share one SectionIndex pattern; the League switch reuses the nav's sliding-pill motion.

## Executive Summary

- Audit Health Score: **18/20** (Excellent), up from 16/20.
- Issues: P0 0, P1 1, P2 3, P3 2.
- Top issues: S9 clipped in RTL (P1); League tabs without arrow keys (P2); repeated button names (P2); My diwaniyas cards stretched in landscape (P2); Your night name alignment in LTR (P3); Arabic count agreement on Tonight's count line (P3).
- Next steps: all fixed in the polish pass below; the rendered look on real signed-in accounts stays owed until Ali rules on Agent Issue 52.

## Detailed Findings by Severity

**[P1] S9 sections run past the left edge in Arabic**
- Location: `src/screens/Settings.tsx` `.settings` grid, `src/styles.css` (`.settings`)
- Category: Responsive
- Impact: every S9 field and the Save buttons were cut off on the left at every phone size; no scrollbar, because the shell clips x.
- WCAG/Standard: 1.4.10 Reflow
- Recommendation: `grid-template-columns: minmax(0, 1fr)` on `.settings` and `min-width: 0` on the jump row.
- Suggested command: /impeccable adapt

**[P2] League view switch: tabs without arrow keys**
- Location: `src/screens/League.tsx` LeagueBody
- Category: Accessibility
- Impact: keyboard and screen-reader users expect arrows between tabs and one tab stop.
- WCAG/Standard: ARIA APG Tabs pattern; 2.1.1
- Recommendation: roving tabindex, ArrowLeft/Right (mirrored in RTL), Home/End.
- Suggested command: /impeccable harden

**[P2] Same name on many buttons**
- Location: Inbox Approve/Decline, Your night Sit now / Score a game / Open, Tonight card Request a seat, My diwaniyas Score a game
- Category: Accessibility
- Impact: a screen-reader list of buttons reads "Approve, Approve, Approve".
- WCAG/Standard: 2.4.6, 2.4.9
- Recommendation: aria-label that adds the diwaniya (and the time for inbox items).
- Suggested command: /impeccable clarify

**[P2] My diwaniyas cards stretch in two columns**
- Location: `.mine__item` at 840px+ and 844x390
- Category: Responsive
- Impact: the shorter card spreads its lines apart to match its neighbour.
- Recommendation: `align-content: start` on the card and its link.
- Suggested command: /impeccable layout

**[P3] Your night: Arabic name sits at the far edge in English**
- Location: `.your-night__name`
- Category: Responsive (bidi)
- Impact: the name and its time line start on opposite sides.
- Recommendation: wrap the `<bdi>` in a span and `justify-items: start`.
- Suggested command: /impeccable polish

**[P3] "٣ ديوانية مفتوحة الليلة"**
- Location: `copy.ts` `tonight.live` (Arabic)
- Category: Implementation Integrity (copy)
- Impact: 3-10 take the plural in Arabic; this read as a mistake.
- Recommendation: one/two/3-10/11+ agreement as in `arCount`.
- Suggested command: /impeccable clarify

Also checked and fine: contrast of the new text (status chips, saffron seat counts, map credit #1E1824 on 85% cream) in day and night; focus rings on every new control (section index, map, zoom, area chip remove, seg tabs); targets 36-44px (area chip remove 36x36, map buttons 40x40, tabs 44); reduced motion (pill and chips fade, no translate); no horizontal overflow at 72/72 measures after the fixes; map drag under touch pans the map and does not scroll the page, `pointercancel` clears the drag.

## Patterns & Systemic Issues

- Grid items that hold a horizontally scrolling row need `minmax(0, 1fr)` columns; `.screen__body` and `.panel` had it, new wrappers did not. Rule kept in the polish notes.
- Repeated action buttons in lists need names with their row's subject; added on every new list.

## Positive Findings

- One shared jump row (SectionIndex) for both long settings pages, buttons not #anchors so the hash router is never confused.
- Map that honours the OSM policy by construction: tiles in view only, Referer per tile, attribution never hidden, CSP widened by exactly one image host.
- The score sheet now prevents the two errors Ali's test games show (typed own name, same player twice) before the server refuses them.

## Recommended Actions

1. **[P1] `/impeccable adapt`**: fix the S9 grid column in RTL.
2. **[P2] `/impeccable harden`**: arrow keys on the League tabs.
3. **[P2] `/impeccable clarify`**: context in repeated button names; Arabic count agreement.
4. **[P2] `/impeccable layout`**: My diwaniyas cards in two columns.
5. **[P3] `/impeccable polish`**: Your night name alignment, then the polish pass.
