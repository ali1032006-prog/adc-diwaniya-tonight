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
