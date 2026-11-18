# Impeccable polish, round 2/3 (ADC-TSK-36, Diwaniya Tonight v1)

Run by hand from `reference/polish.md`, with `reference/craft-floor.md` read before the edits and `reference/animate.md` for the motion check. Input: `audit-r2.md`, Jayce's round 1/3 findings ADC-SEC-16..20 (ADC-LOG-738), Vi's round 1/3 close (ADC-LOG-745: ADC-TSK-37 and the signed-out Tonight note). No critique snapshot exists (the critique-storage helper is not installed). Commits: 5726d15 (fixes), 9b8d644 (lazy screens, invite rows) and the commit that carries these notes. Checked on previews 74fed652 and 50b4de69.

## 1. Establish the system

Read `.impeccable/direction.md` (woven night, live seat ring), ADC-RES-50, `ui.tsx`, `account.tsx`, `EmptyState`, `styles.css` tokens. Drift classified:
- missing token: none (the new UI uses `tag--saffron`, `btn--primary`, `btn--quiet`, `--hairline`, `muted`);
- one-off implementation: none; the invites panel is a `panel` with the shared `people` list and the `people__row` wrap from r1;
- conceptual mismatch: co-host invites live on Me (account things live there) and are announced in the Inbox, matching how pings and admin were placed in r1; the invited state sits in Settings next to the co-host it belongs to;
- local defects: the audit list.

## 2. Gather the evidence

Signed out, on the preview, myself: first-run welcome (all three panels), register and sign-in, every tab's wall, Terms, Admin and Pings walls, at the 9 sizes, Arabic default. Welcome font trace at 390 with 4x CPU + Slow 4G (3 runs) and with the webfont blocked vs loaded on both builds. Signed in: not rendered this round (Agent Issue 52 hold, no accounts); the states were walked in code and in jsdom (`src/r2.test.tsx`): invites list, accept, empty (panel absent), inbox `cohost_invite` and `held` rows with their targets, the four new refusal sentences.

## 3. Triage

1. Broken or blocked tasks: none in the UI. On the server, unhiding a person left his diwaniyas hidden (fixed in the r2 migration).
2. Missing or misleading states: signed-out Tonight claimed no seats (fixed); new refusals needed their own words (added); invites needed an empty state (the panel simply isn't there without one).
3. Flow, hierarchy, responsive: invite rows at 320; Terms link hit box.
4. Visual and motion: welcome shift on font swap (ADC-TSK-37).
5. Code and asset cleanup: the entry chunk.

## 4. Polish the whole path

Flow and hierarchy
- Co-host is now an invitation: the host's button reads "Invite as co-host" and confirms "Invite sent. He becomes a co-host once he accepts."; Settings marks a pending one "Invite waiting"; the invitee gets one inbox item ("Invite to co-host <diwaniya>", leads to Me) and answers on Me in a panel that says what a co-host sees before he accepts.
- The admin gets "On hold after reports: <name>. Review it in the report queue." the moment a hold starts (leads to the queue), and each queue item says whether the reporter has a real link ("Knows them: counts toward a hold" / "No link to them: does not count toward a hold").
- Refusals name the rule and the way out: under review; two tries a night (try another diwaniya or night); slow down for a few minutes; a player who wasn't there (type him as a walk-in).

Layout and type
- Welcome: title reserves two lines (line-height 1.3, min-height 2 x 1.3em) and body two lines (2 x 1.6em); a one-line headline sits at the foot of its box (flex end), next to the line it introduces, so the extra room falls between the art and the headline, not between headline and body.
- Welcome on a landscape phone (844x390): the reserved two-line boxes pushed Next 64px under the fold (it was already 7px under on 2c8c9f3c). Under `(orientation: landscape) and (max-height: 499px)` the title and body get the width for one line (40ch / 60ch) and reserve one line, the seat ring is 80px and the bottom padding 12px, so the primary action sits inside the first screen. Same check at 320x568 found Next 6px under the fold: under `(orientation: portrait) and (max-height: 600px)` the ring is 136px and the gap 12px. Measured at all 9 sizes in Arabic and English: the primary action is inside the first screen everywhere.
- Invite rows wrap: the diwaniya, area and date take the line (`flex: 1 1 12rem`, `overflow-wrap: anywhere`), Accept and Decline stay together and drop beneath on narrow phones; 10px block padding like the other people rows.

Colour, imagery and icons
- New inbox kinds use Phosphor `UserGear` and `ShieldWarning`, fill weight, like the rest of the inbox; no new colours.

Interaction and state
- Terms link inside the consent sentence: 24px hit box from 2px vertical padding on the inline link, so the line height doesn't change. A first try with inline-block pushed the whole link onto its own line at 320 (seen on preview 5db4bdb8) and was dropped.
- Accept/Decline disable while the answer is in flight and refresh the session, so an accepted diwaniya appears on the Diwaniya tab at once.
- Motion: no new animation this round (animate.md: nothing here needs motion to explain state; the panel arrives with the screen's existing entrance). Lazy screens show the shared skeleton while their chunk loads, no spinner.

Content and code
- Ali's order ADC-LOG-751 (arrived during this pass): the "I confirm I am a man" checkbox is gone from Register (S2), profile setup (S3) and its line in Me; the Register lead now reads "Two things before Google: your age and the Terms"; the Terms keep the men-only line (ruling C) and now say the account confirms 18+ and accepts the Terms. Server side in migration `20261117214325_no_male_checkbox.sql`.
- Signed-out Tonight: "Tonight's seats show once you sign in" + why (hosts' homes stay private) instead of "No open seats near you tonight"; actions unchanged.
- Terms (ar/en) and the admin queue's rule line now say the hold counts only reporters who know the person or diwaniya, and that a hidden account can't come back with the same Google account; nothing beyond what the SQL does.
- My-data export lists the report columns a reporter may read instead of `*` (ADC-SEC-19); without it the export would now fail on the column grant.
- Settings, Score, Player, Terms, Pings and Admin load on demand (`React.lazy` + `Suspense` with the shared `Skeleton`): no chunk passes 600 kB any more (entry 378 kB + shared 298 kB; the six screens 0.5-23 kB each). The icon-weight part of the bundle stays for its own slice (an icon component from `@phosphor-icons/core` is a dependency change Jayce should see on its own).

## 5. Verify and finish

- Gates on the notes commit: SQL tests core / signin / v1_complete / r2_fixes green on dev; vitest 75/75; `tsc -b` + production build; Semgrep p/default + p/owasp-top-ten + p/secrets 0 findings.
- Multi-device: 10 signed-out routes x 9 sizes = 90/90 with no horizontal overflow and `innerWidth` equal to the emulated width; 0 unnamed controls; one h1 per route; no heading jumps. Screenshots looked at for welcome 320 and 390 and Tonight 1280.
- Welcome: boxes fixed at 62.4 / 51.2 px under the fallback face and under Readex Pro; 3/3 throttled traces CLS 0 (this harness did not reproduce the old shift either, so Vi's trace is the confirmation).
- Not done this round, recorded: the rendered signed-in look of the new UI (Agent Issue 52 hold, owed before the 2/3 handoff); the icon component (own dependency slice); motion-capture and the motion reviewer agent are not installed under ADC manual mode, so the one motion question (none added) was settled by reading the CSS and stepping the welcome panels.

---

# Polish re-run before the 2/3 handoff: Ali's change list (ADC-LOG-754)

Every step of `reference/polish.md`, on the same build as the audit re-run above.

## 1. Establish the system
Same world (direction.md): night-wool ground, madder actions and active pills, saffron for open seats and "need one", camel rims for things that are yours, Readex Pro, Phosphor regular/fill. Drift classified: the map overlay colours are a **local exception** (tiles are always a light map, so the credit and crosshair use fixed ink on cream in both themes); SectionIndex is a **missing shared pattern**, made once and used by S9 and Me; no new tokens were needed.

## 2. Gather the evidence
Used each path myself in the render harness at 390x844, 320x568, 844x390, 768x1024 and 1280x800, in Arabic and English, day and night: Tonight (Your night, scope chips, Request from the card), League (My diwaniyas, Season with a walk-in row), Score (roster seats, walk-in seat, duplicate seat), S6 (small map, Google Maps link, Score this table), S9 (five sections, map tap, touch drag, my location button, pin at centre), Me (preferences on top, jump row, ping areas dropdown), Inbox (Approve in place), Diwaniya board (Requests under the night header). States: loading skeletons, empty My diwaniyas, closed night, no pin yet, roster refused (42501), outside-Kuwait pin, location denied.

## 3. Triage
1. Broken: S9 cut off in RTL (P1). 2. States: none missing (needPin, noLocation, outside, notAllowed, noneInScope, empty My diwaniyas all present). 3. Flow/responsive: My diwaniyas stretch, tabs keyboard. 4. Visual: Your night alignment, Inbox actions floating outside their item. 5. Cleanup: `will-change` at rest, a stray screen-reader line in League, `lat`/`lng` strings no longer used.

## 4. Polish the whole path
- Flow and hierarchy: Requests moved under the night header on the board; Inbox actions now sit inside the request's own card (shared surface and radius) instead of floating below it.
- Layout and type: `.settings` column `minmax(0, 1fr)` (fixes the RTL clip); `.mine__item` align start; Your night name wrapped so it starts with its time line; Arabic count agreement for Tonight's count line and My diwaniyas' open count.
- Colour, imagery, icons: one icon per section heading (House, Article, DoorOpen, MapPin, UsersThree; SlidersHorizontal, IdentificationCard, BellRinging, LockKey, Database), all regular weight like the rest; pin in madder with a soft offset shadow.
- Interaction and state: League tabs got roving tabindex and arrows (RTL mirrored) plus Home/End; repeated buttons carry their diwaniya in the name; map keyboard (arrows, +/-, Enter) and a visible focus ring; drag cancels cleanly.
- Content and code: removed the stray `sr-only` time line, the `will-change` on the tile layer, and the unused `lat`/`lng` strings; Terms "Location" paragraph names OpenStreetMap and Google Maps; README and ASSET-LICENSES updated.

## 5. Verify and finish
Re-measured after the fixes: 72/72 (8 signed-in routes x 9 sizes) with no horizontal overflow, `innerWidth` equal to the emulated width, no target under 24px, no error notes; signed-out routes and the multi-device matrix re-run on the hash preview (handoff numbers). `npm test` 96/96, `tsc -b` clean, SQL 5/5 files green, Semgrep 0. Rendered look with real accounts still owed (Issue 52).


# Polish re-run before the 2/3 handoff: Ali's change list 2 (ADC-LOG-764)

Every step of `reference/polish.md`, on the same build as the audit re-run above.

## 1. Establish the system
Same world (direction.md): night-wool ground, madder primary and active pills, saffron for what is open or leading, camel for rims and section icons, Readex Pro, Phosphor regular/fill. Drift classified: the S9 and Me menus were a **missing shared pattern** (now `components/MenuRow.tsx`, also used by League's guides entry); the old SectionIndex jump row became **obsolete** and was deleted with its use; the one-shot score form was a **conceptual mismatch** with Ali's "track points during the game" and was replaced, not restyled; the splash reuses the icon's motif (**no new visual language**). No new tokens were needed.

## 2. Gather the evidence
Used each path in the local build and the harness at 320x568, 390x844, 844x390, 768x1024, 1280x800 (and the 9-size measure sweep), Arabic and English, night and day: first load (splash, then sign-in, no Welcome before sign-in), Me menu to each section and back, S9 menu to each section and back, S9 Location (address box, save), S6 pin card with the address above the map, score setup (pack, seats, start), live sheet (totals, leader, add round, undo a round, finish with the leader pre-picked, new game / undo game), guides (four games x two views, history not stacked), League (guides row, Season header score), board (one Score per table, no followed list). States: no rounds yet (finish disabled with a reason), sheet already open at the table (23505: joins it with a note), finished or discarded sheet, roster refused (42501), pin not yet unlocked (area only), empty address (nothing shown).

## 3. Triage
1. Broken: RTL layout widened on the solo sign-in screen (P1). 2. States: added "score at least one round", "a game is already being scored here", finished/discarded/undone notes. 3. Flow: Welcome moved after sign-in; repeated buttons removed (13, listed in duplicates-r2.md). 4. Visual: scoreboard name clamp; danger menu row keeps ink text with a madder icon (madder text on the night surface would be under 4.5:1). 5. Cleanup: SectionIndex deleted, Me/S9 in-panel titles removed (the app bar carries them), unused imports gone (tsc clean).

## 4. Polish the whole path
- Flow and hierarchy: launch, sign-in, Welcome, app, in that order; every settings section is one tap from its menu and back returns to the menu; the score sheet reads top-down as the game goes (totals, this round, the rounds, the end).
- Layout and type: scoreboard 2-up, 4-up for Trix from 600px; round inputs 64px with 2-2.75rem digits; rounds table fixed layout so long names truncate in the header only; guides in cards at 68ch measure.
- Colour, imagery, icons: one Phosphor icon per menu row in a raised square; saffron border for the leader and the finish panel; the splash and the sign-in art are the same mark.
- Interaction and state: every new button has busy/disabled; undo per round is a named icon button; discard asks first; finish names the winner it will send; guide tabs keyboard-complete.
- Content and code: name Diwaniyatna / ديوانيتنا in title, manifest, splash, sign-in header, Welcome, Terms, export filename, service worker and the push fallback (function redeploy owed); the guides are our own words; README and ASSET-LICENSES list the logo and guides as own work.

## 5. Verify and finish
Re-measured after the fixes: 117/117 (13 signed-in routes x 9 sizes) with no horizontal overflow and `innerWidth` equal to the emulated width, no target under 24px, no unnamed control, one h1 per screen and no heading jumps; contrast script clean in night and day (one false positive noted). `npm test` 117/117, `tsc -b` clean, `npm run build` clean, Semgrep 0, SQL 6/6 files green. The signed-out matrix on the hash preview is in the handoff numbers. Rendered look with real accounts still owed (Issue 52).

After the first preview deploy (35a20d82): sign-in is now the app's first screen, and on a phone in landscape (844x390) its Google button sat below the first screen. Fixed at the narrowest level: under `(orientation: landscape) and (max-height: 499px)` the solo sign-in hides the logo (already seen in the launch) and tightens the bar; the button now ends at about 305px of 390 in Arabic and English, and at 506-531px of 568 at 320x568. Re-deployed and the 9-size matrix re-run on the new hash (handoff numbers).

# Polish re-run before the 2/3 handoff: Ali's change list 3 (ADC-LOG-781)

Worked through `reference/polish.md` by hand, every step, on the harness (mock data, signed in, no real account) at 320, 390, 844x390, 1280 and 1920, Arabic and English, night and day.

## 1. Establish the system

DESIGN tokens (night wool, madder for actions and the pill, saffron for open seats and pings, camel for rims), the shared Sheet, MenuRow, notes, Field. Drift classified: the red for destructive actions was a missing token (added `--danger` / `--danger-soft` per theme, not madder, so a red Cancel never reads as the primary madder button); the row editor is a new shared pattern used 13 times, not a one-off; the menu sheet reuses MenuRow's look with a button variant (it closes the sheet before it navigates, so Back returns to the page).

## 2. Gather the evidence

Walked as a host (open night, approve and decline, add and clear seats, remove a table, edit name, area, usual night, who sees it, approvals, guest limit, messages, about, rules, address, directions, unlock minutes) and as a guest (Message host, first message, conversation, report a message, blocked, messages off, Score tab seated / approved / pending / none). Content lengths: 120-letter unbroken words in bubbles, thread rows, edit rows and the diwaniya name; 200% text.

## 3. Triage

1. Blocked: the menu sheet closed itself in development (StrictMode history pop). Fixed in `Sheet`.
2. States: focus loss after an edit; Esc did nothing in the editor. Fixed.
3. Layout drift: the menu button stretched; tables nested as cards. Fixed.
4. Copy: the Arabic comma in English names; "١ جديدة" without agreement (now رسالة جديدة / رسالتان جديدتان / N رسائل جديدة); the Score switcher said "Other tables" over the current one (now "Table" / "الطاولة"). Fixed.
5. Cleanup: the retired `Settings.tsx` and its route helpers removed; the old in-file `.btn--danger` (ink words, madder border) removed so only one definition remains.

## 4. Polish the whole path

- Flow: the menu closes before it navigates; Back from Inbox or Messages returns to the page it was opened on. Message host on the diwaniya page opens the existing conversation instead of a second one (the first message creates it, then the page is replaced, so Back goes to the diwaniya, not to an empty composer).
- Layout and type: every part on the Diwaniya page shares one title style (icon + 1.125rem/700); edit rows keep the label column at 38% (min 7rem) and stack under 360 px; desktop puts Tonight and Tables full width and the rest in two columns.
- Colour: destructive red reaches 5.16:1 on the raised night surface with its own tint and 4.86:1 on the raised day surface; it never stands alone (icon + word + outline).
- Interaction: Ctrl/Cmd+Enter sends a message, Enter makes a new line; Send disabled until there are words; reporting quotes the words back before sending.
- Motion: bubbles rise 6 px and fade in 220 ms, the editor 4 px in 200 ms, both off under reduced motion; transform and opacity only (the CSS contract test still passes).

## 5. Verify and finish

113/113 measures without page overflow (10 routes x 9 sizes Arabic/night, 10 x 2 day, 3 English), one h1 and no heading jumps everywhere, no unnamed controls, no targets under 24 px. Tests 144/144 (the new src/ali3.test.tsx covers all six items, including the danger-token contrast), build with the prod-bundle guard, Semgrep clean. Diff read through: no debug output, no orphaned styles, the harness stays git-excluded. Still owed before the 2/3 handoff: the rendered signed-in pass on the real test accounts (ADC-LOG-780).

# Polish re-run before the 2/3 handoff: Ali's change list 4 (ADC-LOG-794)

Worked through `reference/polish.md` by hand, every step, on the harness (mock data, signed in, no real account) at all 9 sizes in Arabic and at 390 and 1280 in English with the day theme.

## 1. Establish the system

Tokens and shared parts as before (Chips, Field, Part, EditRow, notes, `.btn--danger`). Drift classified: the Score page's dropdowns were a conceptual mismatch with the rest of the app's quick choices (chips) and are now `Chips`; the room of names is a one-off chip-shaped button (it is an action, not a choice, so not `Chips`); per-field Save on the Diwaniya page was a conceptual mismatch with Ali's one-Save model and became one draft; the body overflow was a local defect with an app-wide effect.

## 2. Gather the evidence

Walked as a host on the Diwaniya page (change who sees it, approvals, messages and the area from the dropdowns; edit name, usual night, guest limit, rules, address and directions, unlock minutes; Cancel one, Discard all, Save all; reload with changes waiting) and as a player on Score (switch table by chip, game by chip, tap names into seats, type a guest, type an account holder's name, clear a seat, start with a duplicate). Tonight: every governorate and area option, game chips, clear filters, a remembered place with nothing tonight. Me: device Arabic with the account saying English.

## 3. Triage

1. Data loss: a tap could replace a typed name. Fixed.
2. States: no cue that changes were waiting while the Save was out of sight. Added a small bar above the nav ("1 change not saved · Go to Save"), shown only while the Save is off screen; it points at the one Save and saves nothing itself.
3. Layout drift: cut-off dropdown text on phones, stretched dropdowns on desktop, room below the seats, tight Score tab spacing. Fixed.
4. Motion: the unsaved bar rises 8 px and fades in 220 ms, off under reduced motion; the room buttons press to 0.96, off under reduced motion; transform and opacity only.
5. Cleanup: `WALK_IN`, the old per-field `Editor`, `ChoiceRow`/`ChoiceEditor`, `AreaEditor`, the Settings part and its `GearSix` import, the Tonight scope chips and open-seats checkbox and `Me`'s account-to-device effect removed; old tests moved to the new interactions.

## 4. Polish the whole path

- Flow: Score page goes table, game, who plays (room first, then seats), start; Diwaniya page goes settings, the night, requests, tables, people, about and rules, location, Save; Tonight goes your night, Location + Game, the list.
- Layout and type: dropdown rows share the typed rows' label column from 480 px up and stack below; the Save block spans both desktop columns.
- Colour: changed fields carry a saffron edge (dropdowns) or a saffron dot (typed rows), the same colour as the Save block's edge while changes wait.
- Interaction: chips disable when no seat can take a name; Save disabled until something changed and while saving; Discard only while something waits; errors (empty name, out-of-range number, address without a pin) show above Save and stop it.
- Copy: "In the room", "Tap a name to seat him in the next empty seat, or type a name", "Seat <name>", "Clear seat N", "Location", "All of Kuwait", "All of <governorate> (n)", "<area> (n)", "N changes not saved", "Everything is saved", "Discard changes", "Go to Save", Arabic for each with agreement.

## 5. Verify and finish

60/60 harness measures without page overflow, one h1 and no heading jumps, no unnamed control, no target under 24 px. Tests 158/158 (src/ali4.test.tsx covers all four items; the language test was red on 333a91c first), build with the prod-bundle guard, Semgrep clean. Diff read through: no debug output, no orphaned styles; the harness's mock additions stay git-excluded. Email sign-up/sign-in not built (held for Ali's mail ruling).
