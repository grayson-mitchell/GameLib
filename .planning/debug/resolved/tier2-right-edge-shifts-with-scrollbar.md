---
status: resolved
trigger: "Operator report 2026-10-03, verbatim: 'when you shrink the whole window vertially to create a scroll bar the items in the panel that are meant to be right justified (the search for games right edge, the filter > and the selected filter highlight all move to the right! (if anything you would expect to move to the left as the scroll bar reduces space), What should happen is that the position those controls are in when the scroll bar is present should stay the same when the scroll bar is removed! (i.e. use the most space option for those controls)'"
created: 2026-10-03
updated: 2026-10-03T03:10:00-00:00
phase: none
goal: find_and_fix
live_access: yes — operator is at the keyboard with a dev app already running (pid 79290, pnpm tauri:dev:run) and has confirmed macOS "Show scroll bars" is set to Always
---

# Debug Session: tier-2 right-justified controls shift RIGHT when a scrollbar appears

## Symptoms

### Expected behaviour

Shrinking the window vertically introduces a vertical scrollbar in the Games tier-2 panel. The
right-justified controls in that panel — the `.SearchBar`'s right edge, the filter disclosure
caret (`>`), and the selected-filter highlight — should sit at the SAME horizontal position
whether or not the scrollbar is present. The operator's words: "the position those controls are
in when the scroll bar is present should stay the same when the scroll bar is removed".

That requirement is what `scrollbar-gutter: stable` on `.NavShell__tier2Portal` already claims to
deliver. Its own in-situ comment states `stable` "reserves that track unconditionally, so the
content box is the same width scrolled or not and NOTHING can reflow on the transition".

### Actual behaviour

Those controls move **RIGHT** when the scrollbar appears.

Two things make this notable rather than routine:

1. **The direction is backwards.** A scrollbar that takes space should NARROW the content box and
   move right-justified content LEFT. Every desk-reachable explanation predicts LEFT.
2. **The preventive mechanism is switched ON.** The operator has confirmed macOS "Show scroll
   bars: Always", i.e. CLASSIC space-taking scrollbars. Per spec `scrollbar-gutter` applies only
   to classic scrollbars, so it IS in play here — not the documented macOS overlay no-op case.
   Platform is darwin 25.6.0, well past the Safari 18.2 WebKit that introduced support.

## Scope of the requirement

The fix must keep the scrollbar appearing and disappearing normally — the operator explicitly
framed it as the position holding "when the scroll bar is removed". Forcing a permanently visible
scrollbar (`overflow-y: scroll`) eliminates the variable by contradicting that, and would leave a
permanent scrollbar track in the panel for every classic-scrollbar user. If measurement shows
that is nevertheless the only workable fix, it must be reported as a trade-off for the operator to
accept or reject, not shipped silently.

## Hypotheses eliminated at the desk — do not re-run these

Each of these would ALSO have predicted a LEFT shift, which is why none of them explains the
report.

1. **Overflow clipping by an unshrinkable child.** Dead. `Header/index.css`,
   `SearchBar/index.scss` and `NavItem/index.scss` carry no `min-width`, no `flex-shrink: 0` and
   no `white-space: nowrap`. Every candidate child is `width: 100%`, which SHRINKS as the content
   box narrows.
2. **Viewport-width units** — the classic cause of content sitting under a scrollbar, since
   `100vw` includes the scrollbar in some engines. Dead: zero `vw` units anywhere in the tier-2
   chain.
3. **Negative margins or `calc(100% + ...)`** widening a child past its container. Dead: no
   matches in the chain.

## A stale premise worth re-measuring first

The `scrollbar-gutter` comment's arithmetic is written against a 204px column
("204 - 16 - 16 = 172px of text width"). `--tier2-width` became **256px** earlier today
(`4cbfe26b9`), and the panel was then restructured (`b6b685cb9`, `785c8b885`, `1cbc0494c`) and
polished (`ecac50461`). The gutter/padding calibration therefore predates both the width change
and the restructure. That does not by itself explain a scrollbar-dependent shift in the wrong
direction, but the surrounding reasoning is no longer measured against the live geometry.

Also load-bearing, from that same comment: the gutter reservation was PAID FOR by
`--tier2-row-padding-inline` dropping 16px to 12px in `NavItem/index.scss`, which is why those
were one edit and not two. Reserving without paying would make the "Manage collections" wrap
PERMANENT rather than intermittent — strictly worse than the 260815-mk1 defect being fixed. Do not
undo that trade without understanding it.

## What to measure

With the scrollbar both present and absent:

- `getComputedStyle(el).scrollbarGutter` on `.NavShell__tier2Portal` — is `stable` actually
  applied, or dropped/ignored?
- `clientWidth` vs `offsetWidth` on that container in both states. The difference IS the
  scrollbar's claim on the content box.
- `getBoundingClientRect()` on each named victim — the `.SearchBar` right edge, the filter
  disclosure caret, the selected-filter highlight — in both states, reporting the delta WITH ITS
  SIGN so the direction is established by measurement rather than recollection.
- **Which element is actually the scroll container here.** Confirm it is `.NavShell__tier2Portal`
  and not an ancestor: `.NavShell__tier2` is `overflow: hidden`, and the app's own scroll
  container is `.App .content` (`.App` is fixed at `height: 100vh; overflow: hidden`, so body does
  not scroll). If the bar belongs to a different box, every hypothesis above is aimed at the wrong
  one.

## Constraints on any fix

- `screens/Library/__tests__/tier2Portal.test.ts` forbids `space-between` (:105-107) and
  `position: sticky` (:102) anywhere in `Header/index.css`, and requires `.Header` keep
  `flex-direction: column` (:109-112).
- `components/UI/NavShell/__tests__/shellTokens.test.ts` pins `--tier2-width: 256px` by literal
  and counts occurrences — changing that token is a deliberate, gated act, not a side effect.
- Tier-2 width values must be divisible by 4. Learned over four documented attempts: fractional
  results (`254 x 1.25`, `254 x 1.75`) reintroduce a WKWebView hairline-divider bug.
- Forbidden tokens inside `.NavShell__tier2`: `--text-hover` (4 themes only, absent from base
  `body`) and all four `--navitem-*` (scoped to `.NavShell__tier2 .NavItem`). Also avoid
  `--border-color`, which resolves to #272f31 at 1.08-1.48:1 in 10 of 13 theme selectors and has
  an open todo.

## Verification

Gate baseline at HEAD `269cdfaf0`: `pnpm codecheck` clean; `pnpm lint`
`production: PASS | tests: PASS` at src 1105/1124 and tests 638/638 with ZERO headroom by design;
Frontend jest 182 suites / 3127 tests passing; `pnpm planning-gates` 12/12. A formatter check
belongs in the verify step, scoped to the exact explicit paths written and confirmed with
`npx prettier --file-info` expecting `{ "ignored": false }`.

Nothing in this repo renders a pixel under jest (`testEnvironment: 'node'`, no jsdom, no CSS
engine), so NO suite can prove this fixed. The live re-check belongs to the operator and is
outstanding by construction.

## Findings

Mechanism CONFIRMED by live measurement in the running dev app, both scrollbar states, symmetric
instrument (hidden off-screen probe div cross-checked against the `auto`-vs-`stable` toggle).

**Which box changed, and why:** `.NavShell__tier2Portal`'s `offsetWidth` is a CONSTANT 256px in
both states (it never changes — it's the fixed `--tier2-width` column). What changes is its
`clientWidth` (the content box `<Header>` is laid out against, since `Header` is `width: 100%` of
its portal parent):

| state | `overflow-y` fact | `clientWidth` | real scrollbar footprint | `scrollbar-gutter:stable` reservation |
|---|---|---|---|---|
| idle (window tall, no scrollbar) | `scrollHeight(323) < clientHeight`, not overflowing | **239px** | 0px (none drawn) | 17px (WRONG — reserves the platform default, not this page's real scrollbar) |
| active (window short, scrollbar visible) | `scrollHeight(539) > clientHeight`, overflowing | **246px** | 10px (confirmed via hidden-probe: `offsetWidth-clientWidth` of a scratch `overflow:scroll` div = 10px) | 10px (CORRECT here — `auto` and `stable` both give 246 in this state, i.e. they agree) |

Delta going idle -> active (scrollbar appears): `clientWidth` goes **239 -> 246, i.e. +7px**. The
content box WIDENS by 7px specifically because it was OVER-reserving by 7px while idle (17
reserved vs 10 actually needed) and that 7px of false reservation is given back the instant the
real scrollbar claims its correct 10px. Right-justified descendants (`.SearchBar` right edge,
filter caret, selected-filter highlight) track the content box's right edge, so they move RIGHT by
7px when the scrollbar appears — sign and magnitude both match the operator's report exactly, and
explain why the direction looked "backwards": the thing moving isn't being compressed by the
scrollbar, it's released from a bigger, invisible phantom reservation that was only there while
idle.

**Root cause:** `scrollbar-gutter: stable` in this WKWebView engine reserves a platform-default
width (~17px) for the as-yet-absent scrollbar instead of this page's actual scrollbar width
(10px) — so its own in-file comment's claim ("the content box is the same width scrolled or
not") is FALSE, empirically. This is a known, documented WebKit/WKWebView engine quirk, not
something specific to this file's CSS: corroborated by an external report of the identical
phenomenon (GitHub `tagrex/tagrex#375` — WKWebView's `stable` gutter reserving ~17px regardless of
the page's real scrollbar width).

**Ruled out:** manual CSS padding as a counter-fix. `clientWidth` already includes padding and is
unaffected by adding more of it — a live test confirmed `padding-inline-end: 10px` +
`scrollbar-gutter: auto` in the overflowing state still gave `clientWidth = 246` (unchanged), i.e.
padding STACKS additively with whatever the engine already reserves rather than substituting for
it. A fixed amount of CSS padding cannot fix a bug whose whole defect is that the reservation
amount is wrong ONLY in one of the two states (idle) and already correct in the other (active) —
any one fixed padding value is wrong in at least one state. There is no pure-CSS fix: the needed
"extra space" is conditional on whether a real scrollbar is currently occupying it, which is
exactly what `scrollbar-gutter: stable` is supposed to compute and gets wrong in WKWebView.

**Validated correction primitive (hidden-probe technique, the standard pattern `antd`'s
`getScrollBarSize()` uses):** create an off-screen `position:absolute;top:-9999px;overflow:scroll`
div, measure `offsetWidth - clientWidth` → true native scrollbar width, remove it. Live-measured
`sbw = 10` in BOTH states (matches the independently-derived 256-246=10 from the active state
exactly). Correction formula: when the portal is overflowing, correction = 0 (already correct);
when idle, `correction = (portal.offsetWidth - trueScrollbarWidth) - portal.clientWidth`.
Live-validated end to end:
- State A (overflowing): `{"sbw":10,"correction":0,"ow":256,"cw":246,"overflowing":true}`
- State B (idle): `{"sbw":10,"correction":7,"ow":256,"cw":239,"overflowing":false}`

Both match prediction exactly.

**Where a runtime fix can safely live:** `GamesPanel` (the portal target itself) is RULED OUT —
its jest test (`GamesPanel.test.tsx`) calls `GamesPanel()` as a plain function (not rendered),
mocks only `useContext`, leaves `useState`/`useEffect`/`useRef` wired to `jest.requireActual`
(a real hook added there throws "Invalid hook call" under that harness), and additionally pins
`element.ref` to be the EXACT `mockSetTarget` reference — ruling out even a ref-wrapping approach.
`Header/index.tsx` is clear: its own test (`tier2Portal.test.ts`) is a pure source-text/grep gate
with no invocation of the component function, so adding real hooks there is safe from a
test-breaking-mechanically perspective (checked against every literal assertion in that file).

Also relevant: this repo's Frontend jest project runs `testEnvironment: 'node'` (no jsdom
anywhere), so no jest suite can exercise or verify ANY DOM-measurement/ResizeObserver code,
regardless of which file it lives in. The only real verification channel for this class of fix is
live, in-browser measurement — which is what this session's instrument provides, and what the
operator's own re-check remains for.

## Resolution

root_cause: WKWebView's `scrollbar-gutter: stable` reserves a platform-default ~17px track for
the Games tier-2 portal's as-yet-absent scrollbar instead of the page's real 10px scrollbar width;
the reservation is only correct once the scrollbar actually appears (both measure 10px/246px
clientWidth then), so the portal's content box is 7px narrower while idle than while scrolling —
backwards from what `stable`'s own in-file comment claims and what "reserve space so nothing
moves" is supposed to guarantee.

fix: Added a self-calibrating runtime correction in `Header/index.tsx`: on mount and on every
resize of the portal, measure the true native scrollbar width via a hidden off-screen probe,
compute the idle-state shortfall against the portal's own `offsetWidth`, and widen `<Header>` by
exactly that many px (via `calc(100% + Npx)`) only while the portal is not overflowing — zero
effect once the real scrollbar is present (correction already 0 there), so right-justified
descendants sit at the SAME absolute position in both states. Also corrected the now-disproven
in-file comment on `.NavShell__tier2Portal` in `NavShell/index.scss`.

verification:
- Live instrument (primary — this is the only channel that can actually verify this class of
  fix): correction primitive validated symmetrically in both states BEFORE the fix was written —
  State A (overflowing) `{"sbw":10,"correction":0,"ow":256,"cw":246,"overflowing":true}`, State B
  (idle) `{"sbw":10,"correction":7,"ow":256,"cw":239,"overflowing":false}` — both match the
  signed-delta prediction exactly. The fix itself (the running `<Header>` widening by the
  live-measured correction) has NOT yet been re-observed live in the dev app after being written —
  that is the operator's own re-check, outstanding by construction (see below).
- `npx jest --config src/frontend/jest.config.js` (full Frontend project): 183/183 suites,
  3134/3134 tests passing (baseline was 182/3127; +1 suite/+7 tests from the new regression gate,
  zero regressions).
- `pnpm codecheck`: clean (`tsc --noEmit` + `tsc -p tsconfig.meta.json --noEmit`, zero output).
- `pnpm lint`: `production: PASS | tests: PASS`, `638 problems (0 errors, 638 warnings)` —
  identical to the 638/638 baseline recorded at session start, i.e. zero new warnings introduced
  by any changed/new file.
- `npx prettier --check` on all 4 non-ignored changed paths (`Header/index.tsx`,
  `NavShell/index.scss`, `headerTourAnchors.test.tsx`, `scrollbarGutterCorrection.test.ts`): all
  pass. `.planning/debug/tier2-right-edge-shifts-with-scrollbar.md` itself reports
  `{"ignored":true}` via `--file-info` — correctly skipped, not checked.
- `pnpm planning-gates`: 12/12 passed.
- Nothing above renders a pixel — the operator's own live re-check (resize the window, watch the
  search bar's right edge / filter caret / selected-filter highlight hold position across the
  scrollbar transition) is the only verification that can actually confirm this fix and remains
  OUTSTANDING. It must never be marked passed on this session's say-so.

files_changed:
- src/frontend/components/UI/Header/index.tsx (the runtime correction: `useRef` + `useLayoutEffect`
  + hidden-probe + `ResizeObserver`, widening `<Header>` by `calc(100% + Npx)` only while the
  portal is not overflowing)
- src/frontend/components/UI/NavShell/index.scss (corrected the now-disproven
  "same width scrolled or not" comment on `.NavShell__tier2Portal`'s `scrollbar-gutter: stable`)
- src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx (extended the existing
  `jest.mock('react', ...)` factory with `useRef`/`useLayoutEffect` stubs — required because this
  file calls `Header()` directly with no renderer/dispatcher, and the two new real hooks would
  otherwise throw "Invalid hook call"; same reasoning as every other stub already in that factory)
- src/frontend/components/UI/Header/__tests__/scrollbarGutterCorrection.test.ts (new, source-text
  regression gate — protects the fix's presence/shape only; cannot verify behaviour, no jsdom)

## Next action

status is `awaiting_human_verify`. The operator needs to resize the window vertically (tall ->
short, to introduce the tier-2 scrollbar, and back) and confirm the three named controls now hold
their horizontal position across the transition. On confirmation, move this file to
`.planning/debug/resolved/`, append a knowledge-base entry, and commit. If the shift is still
visible (even partially), report back — the ResizeObserver-driven recompute may need to also key
off list/filter-driven content changes (not just the portal's own box resize), which this session
scoped out as outside the reported trigger (window resize only).

## Resolution

**Operator live check PASSED (2026-10-03).** Window resized tall -> short -> tall; the search
bar's right edge, the filter disclosure caret and the selected-filter highlight all hold their
horizontal position across the scrollbar transition. This is the only evidence that can exist for
the fix working -- no suite in this repo renders a pixel.

**Operator chose option C: keep the runtime correction as written.** Three options were put to
them with costs stated:

- A. `.NavShell__tier2Portal::-webkit-scrollbar { width: 17px }` -- one CSS line, reservation and
  reality agree. REJECTED: hardcodes a platform default that breaks on any platform whose default
  differs, and leaves the panel's bar visibly fatter than the app's 10px.
- B. Stop setting a custom width globally, so reality and reservation both use the platform
  default. REJECTED: correct everywhere automatically, but changes scrollbar appearance app-wide
  and undoes a deliberate design choice.
- C. CHOSEN: keep the JS correction, which MEASURES the true scrollbar width rather than assuming
  it, and is therefore correct on any platform and under any OS scrollbar setting.

**Root cause, stated precisely, because the engine is only half of it.** `src/frontend/index.scss:57`
sets a global custom scrollbar at `width: 10px`. `scrollbar-gutter: stable` ignores that custom
width and reserves WebKit's PLATFORM DEFAULT of 17px. 17 - 10 = 7px, exactly the measured shift.
So this is a mismatch the app created for itself by customising the scrollbar width while relying
on a mechanism that reserves the uncustomised one -- not purely a WKWebView quirk. Any future
change to that 10px, or to `scrollbar-gutter` anywhere, should be made with that pairing in mind.

**Scoped out, deliberately, and still open:** the `ResizeObserver` watches the portal's own box
size, so a scrollbar that appears because the panel's CONTENT grew (switching filters or game
lists without resizing the window) is not covered. That was outside the reported trigger. If the
shift is ever seen without a window resize, this is the first place to look.
