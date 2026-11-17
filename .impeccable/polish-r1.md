# Impeccable polish, round 1/3 (ADC-TSK-36, Diwaniya Tonight v1)

Run by hand from `reference/polish.md`, with `reference/craft-floor.md` read before the edits and `reference/animate.md` for the new motion. Input: `audit-r1.md` (no prior critique snapshot exists; the critique-storage helper is not installed). Polished commits: 3b77ab6 and the handoff commit that carries these notes. Verified on the preview after each batch (74375d36, 6adc27b3, 5f225a43, 4a6826f1, then the handoff preview).

## 1. Establish the system

Read `.impeccable/direction.md`, ADC-RES-50 and the shared components (`ui.tsx`, `account.tsx`, `EmptyState`, `SeatRing`, `WovenBand`) and tokens in `styles.css`. Drift classified:
- missing token: ink on saffron (`#15111a` x3) -> `--on-saffron`;
- one-off implementation: none; the new screens reuse `panel`, `stat`, `tag`, `note`, `Field`, `PushBar`, `Skeleton`, `link-row`;
- conceptual mismatch: none; the admin queue sits outside the 5 tabs under Me, as the nav map says (ruling D);
- local defects: the P2/P3 list in the audit.

## 2. Gather the evidence

Used every new path myself on the preview, signed in as the seeded admin/host account, at 320-1920, Arabic and English: turned pings on (permission, FCM subscription, saved device), received a real push, muted one in quiet hours; sent an announcement from the board (reached the approved guest, log updated, 3 of 5 left); closed the night to see the quiet-night nudge; opened the admin queue (open / actioned / dismissed / hidden / summary); opened a player with shared games; opened Me down to delete account (button stays locked until the confirm word). States seen: loading skeletons, empty (queue empty text, no hidden, no shared games), error notes, success notes, disabled, long English names inside Arabic rows.

## 3. Triage

1. Broken or blocked tasks: none found.
2. Missing states: none; every new list has loading, empty and error.
3. Flow, hierarchy, responsive, drift: S4 actions wrapping, admin tab off-screen, heading order, report-card width at 1920.
4. Visual and motion: callout border, weights, badge size, missing feedback when pings come on, card vanishing abruptly after review.
5. Code and asset cleanup: unused `board.quiet` copy, hard-coded ink colour.

## 4. Polish the whole path

Flow and hierarchy
- Reviewed report cards now step out (opacity + scale 0.97, 180ms, accelerate easing) before the queue reloads, so the admin sees which card his action closed.
- Choosing an admin tab scrolls it into view inside the strip; the panel crossfades in (200ms decelerate).

Layout and type
- S4 actions stack full width under 600px and the label stays on one line; the text link sits under the button.
- Device-pings row in Me gets 10px block padding so its status line no longer sits on the hairline.
- Summary and hidden views stacked with the standard gap; report list goes to two columns from 1200px.
- Co-host button: wrapping variant (`btn--wrap`, 16px radius, 1.4 line height) instead of a squeezed pill.
- Arabic counts: `arCount` helper (one / two / 3-10 plural / 11+ singular) for followers, games, wins, open reports and devices; zero wins reworded ("ولم تفوزا بعد"); rivals line reworded so no digit sits alone after "بـ". Unit-tested in `src/v1.test.tsx`.

Colour, imagery and icons
- Report details: 1px hairline + raised fill + 12px radius (craft-floor ban on thick coloured side borders).
- `--on-saffron` token for selection, saffron button and badge ink.
- Unread badge 12px with tabular figures.
- Icons stay Phosphor regular/fill only, one stroke family.

Interaction and state
- Bell rings once (rotate, 520ms, transform only) when pings come on; never on load; none under reduced motion, where the filled bell and the status line carry the state.
- Inbox announcement body: regular weight, muted ink, under the bold title.
- Played-with links 44px minimum; admin tab chips have a visible focus ring.
- All new motion has a `prefers-reduced-motion` path (crossfade or none).

Content and code
- Removed the unused `board.quiet` strings (replaced by the real nudge).
- Terms (ar/en) now name the push data kept, the 3-reporter hold and account deletion; no new claims beyond what the code does.

## 5. Verify and finish

- Gates on the handoff commit: vitest 68/68, `tsc -b` + production build, Semgrep p/default + p/owasp-top-ten + p/secrets 0 findings, SQL tests core / signin / v1_complete green on dev.
- Multi-device: 9 pages (Tonight, Diwaniya, League, Inbox, Me, Pings, Admin, Player, Diwaniya page) x 9 sizes = 81/81 with no horizontal overflow and innerWidth equal to the emulated width; screenshots looked at for 320, 390, 844x390, 768, 1280 and 1920.
- DOM scan on the new pages: no unnamed controls, no unlabeled inputs, h1 -> h2 order.
- Not fixed in this pass (recorded): the bundle size (P2, needs the icon component from @phosphor-icons/core, a dependency change for its own slice); the once-seen stale badge (P3 watch item, not reproduced).
- motion-capture and the motion reviewer agent are not installed under ADC manual mode; motion was checked by stepping the animations in the browser and by reading the reduced-motion CSS. Substitution disclosed here.
