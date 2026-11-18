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


# Re-run before the 2/3 handoff: Ali's change list 2 (ADC-LOG-764)

Run by hand again from `reference/audit.md`, every section (manual mode: the impeccable engine, detector and hooks are not installed, so each check below is a script or a look of my own), with `reference/craft-floor.md` read before the UI edits. Target: `fix/ADC-TSK-36-r2` after the seven items: repeated buttons removed (list in `duplicates-r2.md`), address with the pin, live scoring, game guides, logo launch then sign-in, the name Diwaniyatna, Me and S9 as menus. Evidence: the local build (`vite preview`) for the signed-out launch and sign-in, and the git-excluded render harness (mock `api.ts`/`supabase.ts`, never deployed) for every signed-in screen, because the Issue 52 hold still forbids reviewer or test accounts. Rendered: 13 signed-in routes x 9 sizes (117 measures, Arabic RTL: Tonight, Diwaniya, League, Inbox, Me menu, Me account, Me pings, S9 menu, S9 location, live score sheet, score setup, guides, S6); contrast script on 12 routes in night and day; English at 320x568; keyboard Tab into the Me menu; screenshots looked at for the splash, sign-in, Me menu, S9 menu and location, live sheet (390, 844x390, 1280), guides, S6 pin card, board. Untested: a physical phone, real signed-in data on dev (the SQL suite stands in: ali_changes2_test.sql), and Realtime between two real phones (the sheet reloads on `score_rounds`/`score_sheets` changes; the RLS that Realtime honours is tested in SQL).

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 4 | New text passes AA in both themes (only flag: League tab label measured against the track, not its madder pill, a false positive); every new control named; headings one h1, no jumps |
| 2 | Performance | 4 | Guides (17.6 kB) and the score sheet load on demand; the launch animates transform and opacity only; no new dependency |
| 3 | Theming | 4 | All new UI on existing tokens (raised/camel menu icons, saffron leader, madder-soft danger icon) |
| 4 | Responsive Design | 3 | Sign-in as a solo screen widened the phone layout to 402px in RTL (screen-in slide with no clipping frame); OSM credit link 23.4px tall |
| 5 | Implementation Integrity | 4 | One MenuRow pattern for Me, S9 and the League guides entry; one score-sheet flow replaces the one-shot form; the logo is the app icon's own motif |
| **Total** | | **19/20** | **Excellent (minor polish)** |

## Implementation Integrity Verdict

Pass. Live scoring is a real server object (score_sheets/score_rounds, one open sheet per table, RLS read for whoever may score that table, writes only through functions), so "survives refresh" and "synced for the table" come from the data, not from local storage. Finish reuses record_game, so the league and its checks stay one path. The address lives in the pin row, so it cannot drift from the pin's visibility rule. The guides are our own text in one file with the same shape in both languages (a test holds that). The splash is the icon's table-and-seats mark drawn in code, landing where the sign-in page shows it.

## Executive Summary

- Audit Health Score: **19/20** (Excellent), up from 18/20.
- Issues: P0 0, P1 1, P2 2, P3 2.
- Top issues: solo sign-in widened the RTL phone layout (P1); score sheet team names cut with an ellipsis mid-list (P2); OSM credit link under 24px (P2); Tarneeb 41 tracks team totals only (P3, documented in the guide); push fallback name in the deployed send-ping function (P3).
- Next steps: P1 and both P2s fixed in the polish pass below; P3s stated in the handoff.

## Detailed Findings by Severity

**[P1] Sign-in, now the first screen, widened the phone layout in Arabic**
- Location: `src/App.tsx` solo `main.screen--solo`, `src/styles.css`
- Category: Responsive
- Impact: at 390x844 the layout viewport became 402px (the 12px screen-in slide runs past the left edge in RTL, and the solo screen has no `.shell` around it to clip it), so Chrome zoomed the page out.
- WCAG/Standard: 1.4.10 Reflow
- Recommendation: `overflow-x: clip` on `html` and `#root`, the frame every screen sits in.
- Suggested command: /impeccable adapt

**[P2] Team names on the live scoreboard cut mid-list**
- Location: `.scoreboard__who`
- Category: Responsive
- Impact: with three players a team read "…، Abu Fahad، Bader"; the first name was lost.
- Recommendation: wrap to two lines and clamp, never a one-line ellipsis.
- Suggested command: /impeccable layout

**[P2] OpenStreetMap credit link 23.4px tall**
- Location: `.map__credit a` (S6 pin card, S9 map)
- Category: Accessibility (2.5.8)
- Impact: a hair under the 24px minimum target.
- Recommendation: inline-block with 5px block padding and matching negative margin (the line does not move).
- Suggested command: /impeccable harden

**[P3] Tarneeb 41 is scored per team**
- Location: score sheet (`teams` = 2 for every pack but Trix)
- Category: Implementation Integrity
- Impact: the 41 rule needs each player's own total; the sheet keeps the team's. The guide says so and tells the table to add the two partners for the team column.
- Recommendation: a per-player column set for Tarneeb 41 if Ali wants it (a follow-up, not in his list).
- Suggested command: /impeccable shape

**[P3] Deployed send-ping still has the old fallback title**
- Location: `supabase/functions/send-ping/index.ts` (repo updated)
- Category: Implementation Integrity (copy)
- Impact: only used when an inbox item has no diwaniya name; the repo now says Diwaniyatna, the deployed function changes at its next deploy.
- Recommendation: redeploy the function with the next backend change.
- Suggested command: /impeccable polish

Also checked and fine: reduced motion (the splash keeps only its 200ms fade, seats and wordmark do not move; rounds, guide and leader tag fade); the launch total 1.3s (under Ali's 1.5s); focus rings on menu rows (inset 2px), chip buttons, the 4-way guide tabs (roving tabindex, arrows mirrored in RTL, Home/End); the round inputs take Arabic digits and a minus for Trix; the finish button stays disabled until a round exists; no horizontal overflow at 117/117 measures after the fix; Terms "Location" now names the written address.

## Patterns & Systemic Issues

- Any screen rendered outside `.shell` needs a clipping frame for the RTL slide; the clip now sits on `html`/`#root`, so new solo screens inherit it.
- Settings-style pages share one MenuRow; section pages carry their title in the app bar, so the old in-panel h2 titles were removed instead of repeated.

## Positive Findings

- One clear place per action across the app (13 removals, the 3 deliberate pairs Ali ordered are listed for him to decide).
- The score sheet keeps the room's numbers big (clamp to 4.5rem) and the leader marked by text and colour, never colour alone.
- Guides are reachable from the exact place people need them (the sheet's "How to score" opens the game being scored).

## Recommended Actions

1. **[P1] `/impeccable adapt`**: clip the RTL slide at the app frame.
2. **[P2] `/impeccable layout`**: scoreboard names wrap and clamp.
3. **[P2] `/impeccable harden`**: OSM credit hit box.
4. **[P3] `/impeccable shape`**: per-player Tarneeb 41 columns, only if Ali asks.
5. **[P3] `/impeccable polish`**: redeploy send-ping with the next backend change, then the polish pass.

# Re-run before the 2/3 handoff: Ali's change list 3 (ADC-LOG-781)

Scope: every page and state the change list touched (top menu on every page, Inbox as a pushed page, Messages list / conversation / first message, the Score tab and its three "why not" states, the one-page Diwaniya tab with tap-to-edit, Place with Message host, the admin queue's reported words, the red remove/cancel buttons) plus the untouched pages for regressions. Run by hand from `reference/audit.md`, every section. Evidence: the local render harness (mock data, signed in as a mock "Ali", no real account, never deployed; Issue 52 hold), 113 measures (10 routes x 9 sizes in Arabic/night + 10 routes x 2 sizes in the day theme + 3 English/LTR), 120-letter unbroken words and 200% text at 320x568, screenshots looked at, and 144 jsdom tests. The rendered signed-in pass on real accounts is still owed (test accounts wait on Ali's direct word to Jinx, ADC-LOG-780).

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | Row editor dropped focus to the page after Save/Cancel (fixed: back to the row, Esc cancels) |
| 2 | Performance | 3 | Shared vendor chunk now carries the TopMenu name (333 kB, supabase-js + React); Messages lazy (9 kB) |
| 3 | Theming | 4 | --danger and --danger-soft in both themes; contrast 5.16:1 night, 4.86:1 day at worst |
| 4 | Responsive Design | 4 | 113/113 measures with no page overflow; desktop Diwaniya page uses two columns |
| 5 | Implementation Integrity | 4 | One Sheet, one MenuRow pattern, one EditRow; no new pattern copied twice |
| **Total** | | **18/20** | **Excellent (minor polish)** |

## Implementation Integrity Verdict

Pass. The new surfaces reuse the system instead of adding a second one: the top menu is the shared Sheet with menu rows; the Diwaniya page is one `Part` + `EditRow` + `Editor` pattern for all 13 facts (text, choice, number, area, location), each saving only its own field; every destructive control goes through one `.btn--danger` class (and the page's `RemoveButton` / `CancelButton`), words + icon + outline; conversations reuse the woven app bar, notes and the report sheet. One drift found and fixed: the Score sheet and League joined English names with the Arabic comma.

## Executive Summary

- Audit Health Score: **18/20** (Excellent)
- Issues: P0 0, P1 1 (fixed), P2 3 (fixed), P3 2 (one fixed, one left with reason)
- Top issues: the shared Sheet closed itself under React StrictMode (development only, but the history entry logic was fragile); the top-menu button stretched across the app bar (selector grew the button, not the title); focus loss after editing a row; the Arabic comma in English name lists; nested cards (tables inside the Tables part).
- Next: the rendered signed-in pass on real accounts once Ali tells Jinx (ADC-LOG-780), then Jayce reviews Messages and score_targets in 2/3.

## Detailed Findings by Severity

**[P1] Sheet popped its own history entry and closed at once (fixed)**
- Location: src/components/ui.tsx `Sheet`
- Category: Implementation Integrity
- Impact: in development (StrictMode mounts twice) the top menu never stayed open; the same effect would close any sheet that remounts.
- Recommendation: count mounts; push the history entry only once; pop it after the last unmount. Done; menu opens, Messages navigates, Back returns to Tonight (checked in the harness).
- Suggested command: /impeccable harden

**[P2] Menu button stretched across the app bar (fixed)**
- Location: src/styles.css `.appbar > .appbar__title + .top-menu`
- Category: Responsive
- Impact: the badge sat 130 px away from the three lines at 390 px.
- Recommendation: the button stays `flex: none` at the inline end; only the pushed title flexes. Done (button 48 px, badge on its corner).
- Suggested command: /impeccable layout

**[P2] Focus fell to the page after Save, Cancel or Esc in a row editor (fixed)**
- Location: src/screens/Board.tsx `EditRow` / `Editor`
- Category: Accessibility (WCAG 2.4.3 Focus Order)
- Impact: keyboard and switch users lose their place on a long page after every edit.
- Recommendation: return focus to the row; Esc cancels. Done, with a jsdom test.
- Suggested command: /impeccable harden

**[P2] Arabic comma in English name lists (fixed)**
- Location: src/screens/Score.tsx `names`, League history, the duplicate-seat note
- Category: Implementation Integrity (copy)
- Impact: "Tariq، Abu Fahad" in English.
- Recommendation: `c.common.sep` per language. Done; the old test that expected the Arabic comma in English was corrected.
- Suggested command: /impeccable clarify

**[P3] Tables were cards inside the Tables card (fixed)**
- Location: src/styles.css `.dw-part .table-block`
- Category: Implementation Integrity (craft floor: nested cards)
- Recommendation: inside a part a table is a row separated by a hairline. Done.
- Suggested command: /impeccable layout

**[P3] Bottom-nav labels truncate at 200% text (left as is)**
- Location: src/styles.css `.nav__label`
- Category: Responsive
- Impact: at 200% text the five labels ellipsize; icons and the active pill still carry the meaning and each link keeps its full accessible name. Same behaviour as rounds 1/3 and before, not new here.
- Recommendation: leave; a sixth tab is not coming (Inbox left the bar).
- Suggested command: /impeccable adapt

Also checked and fine: reduced motion (bubbles and the editor appear without movement; the nav pill re-keys and fades); hover, focus, disabled, loading (skeletons), empty (Messages, the Score tab's three reasons) and error (retry) states; Send stays disabled until there are words; characters-left hint from 200 left; blocked and messages-off states hide the box and say why; my words sit on the inline end in both directions; the back arrow and the send arrow mirror in RTL; the Diwaniya page names every row's action ("Edit Rules"), every Remove names who goes ("Remove · Bu Fahad"); one h1 per page and no heading jumps on all 10 routes; no unnamed control and no target under 24 px on any route (map tiles excluded, they are images); the Tonight chip row scrolls inside its own box (the only "wide" hit, a false positive); the push for a message never shows the words on the lock screen.

## Patterns & Systemic Issues

- Destructive actions now have one look across the app (Board, Place, Inbox, Score, Me, Admin, the area chips): red words, red outline, an X or bin icon. New ones must use `.btn--danger` with an icon.
- Facts the host owns live in one place (the Diwaniya page); the Place page only shows them. The old S9 routes land on the page.

## Positive Findings

- The one-page Diwaniya tab shows every fact on the page itself: nothing hides behind a menu, and editing is one tap where the fact is.
- The Score tab picks up the table without a single tap for a seated guest, and the three "why not" states each point at the next step.
- Messages keep safety visible where it matters: the money warning above every conversation, report on each received message, the 5-before-an-answer rule told before the first message.

## Recommended Actions

1. **[P1] `/impeccable harden`**: StrictMode-proof Sheet history (done).
2. **[P2] `/impeccable layout`**: menu button at the inline end (done).
3. **[P2] `/impeccable harden`**: focus back to the edited row, Esc cancels (done).
4. **[P2] `/impeccable clarify`**: comma per language (done).
5. **[P3] `/impeccable layout`**: no cards in cards on the Diwaniya page (done).
6. **[P3] `/impeccable polish`**: the polish pass below.

# Re-run before the 2/3 handoff: Ali's change list 4 (ADC-LOG-794)

Scope: every page and state the change list touched (Score setup with the room of names and chips, the Score tab's table switch, the Diwaniya page with settings inside Tonight, its dropdowns, the one Save and the unsaved bar, Location last, Tonight's Location and Game filters, Me and Preferences for the language fix) plus Tonight, League and Me for regressions. Run by hand from `reference/audit.md`, every section. Evidence: the local render harness (mock data, signed in as a mock "Ali"; git-excluded, never deployed) with 60 measures (6 routes x 9 sizes in Arabic, plus Tonight/Diwaniya/Score at 390 and 1280 in English + day theme), screenshots looked at (390 Arabic, 320 English, 1280 English), a live run of the language case (device Arabic, account English: stays Arabic, account moved to Arabic), and 158 jsdom tests.

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | Room names are real buttons named "Seat <name>"; dropdowns keep visible labels; one Save is the page's last control |
| 2 | Performance | 3 | No new dependency; one IntersectionObserver for the unsaved bar; bundle unchanged in size class |
| 3 | Theming | 4 | New pieces use --saffron, --raised, --danger tokens only; unsaved bar reads in both themes |
| 4 | Responsive Design | 4 | 60/60 measures without page overflow; dropdowns stack under their label below 480 px, capped at 26rem on desktop |
| 5 | Implementation Integrity | 3 | body `overflow-x: hidden` had made body a scroller, so no sticky element in the app ever stuck (fixed to clip) |
| **Total** | | **17/20** | **Good (one systemic CSS defect found and fixed)** |

## Implementation Integrity Verdict

Pass after one fix. The change list reuses the system: chips are the shared `Chips` (radio) for game and table, the room names are chip-shaped buttons with the same radius and hairline, the Diwaniya page keeps `Part` + `EditRow` for typed facts and adds one `SelectRow` / `AreaRow` for list facts, and every change waits in one draft saved by one `Save` (updateDiwaniya once, setPin once). Verified defect: `body { overflow-x: hidden }` under `html { overflow-x: clip }` turned the body into its own scroll box (computed overflow-y auto), so `position: sticky` (the composer, the section index, the save bar draft) never stuck. Fixed with `clip`.

## Executive Summary

- Audit Health Score: **17/20** (Good)
- Issues: P0 0, P1 1 (fixed), P2 3 (fixed), P3 2 (fixed)
- Top issues: a tapped name could overwrite a typed one; sticky broken app-wide by body overflow; long dropdown choices cut off on phones; desktop dropdowns stretched across the row; the room of names sat under six seats.
- Next: Jayce and Vi test the change list in 2/3 when Ambessa opens it.

## Detailed Findings by Severity

**[P1] A tap on a name could overwrite a name typed in a seat (fixed)**
- Location: src/screens/Score.tsx `seatPerson`
- Category: Implementation Integrity (data loss)
- Impact: typing "Tariq" in seat 1, then tapping Omar, replaced Tariq.
- Recommendation: the tapped name goes to the seat being typed in only while it is empty, else to the next empty seat; with every seat full it swaps the last seat typed in; chips disable when there is nowhere to go. Done, with a jsdom test.
- Suggested command: /impeccable harden

**[P2] No sticky element stuck anywhere (fixed)**
- Location: src/styles.css `body`
- Category: Implementation Integrity / Responsive
- Impact: the Messages composer and the section index scrolled away; the new unsaved-changes cue would have too.
- Recommendation: `overflow-x: clip` on body (html already clips). Done; body overflow-y now visible. Harness note: this Chrome hands back stale frames for some layers until the viewport is nudged, so sticky/fixed checks need a forced frame before trusting a screenshot.
- Suggested command: /impeccable adapt

**[P2] Long choices cut off in the Diwaniya dropdowns on phones (fixed)**
- Location: src/styles.css `.dw-field`
- Category: Responsive
- Impact: "يمكن للناس مراسلتك" showed as "يمكن للناس مراسا" at 390 px.
- Recommendation: below 480 px the label sits above a full-width dropdown. Done.
- Suggested command: /impeccable layout

**[P2] The room of names sat below all six seats (fixed)**
- Location: src/screens/Score.tsx `SetupSheet`
- Category: Implementation Integrity (flow)
- Impact: on a phone the names you tap were a scroll away from the seats they fill.
- Recommendation: the room sits right under "Who plays", above the teams. Done.
- Suggested command: /impeccable layout

**[P3] Desktop dropdowns stretched across the whole row (fixed)**
- Location: src/styles.css `.dw-field .input`
- Recommendation: max-width 26rem. Done.
- Suggested command: /impeccable layout

**[P3] The table chips touched the game label on the Score tab (fixed)**
- Location: src/styles.css `.score-now`
- Recommendation: 20 px below the table switch. Done.
- Suggested command: /impeccable layout

Also checked and fine: no `select` anywhere on the Score page and no "someone else" text; seated people prefilled; typed names that match one person in the room link to his account and count for the duplicate check ("ali" next to seated Ali is caught); each seat's clear button is 44 px and named "Clear seat N"; the Diwaniya page has exactly one Save, disabled with nothing to save, Discard in red with an X, unsaved count with Arabic agreement, Done / red Cancel / Esc on typed rows, focus back to the row; a co-host sees text, no dropdowns, no Save; leaving with unsaved changes asks; Tonight's Location dropdown lists only places with a night tonight, with counts, remembers the choice, and a saved place with nothing tonight stays pickable; one h1 and no heading jumps on all 6 routes at all sizes; no unnamed control; no target under 24 px; the language fix holds with the account saying English.

## Patterns & Systemic Issues

- Save behaviour on the Diwaniya page is now one model: change anything, it waits, one Save. Text facts still open in place because a typed value needs a box; list facts are the box.
- Overflow on html/body must be `clip`, never `hidden`: hidden silently disables every sticky element.

## Positive Findings

- Adding players needs no menus: the people at the table are already in, the rest are a tap away, and a typed name still lands on the right account.
- The language now follows the person's own choice on every page, and the account learns it once, wherever the switch was made.

## Recommended Actions

1. **[P1] `/impeccable harden`**: tapped names never overwrite typed ones (done).
2. **[P2] `/impeccable adapt`**: body overflow clip so sticky works (done).
3. **[P2] `/impeccable layout`**: dropdowns stack on phones; room above the teams (done).
4. **[P3] `/impeccable layout`**: desktop dropdown width, Score tab spacing (done).
5. **[P3] `/impeccable polish`**: the polish pass below.
