---
created: 2026-09-11
title: "Humble Keys title wrap, sort label placement, and owned-badge contrast fixes are unverified live"
area: humble-keys-ui
status: OPEN
severity: minor
platform: any
ready: live-gate
source: "260911-t0p, quick task fixing four UI defects on the Humble Keys screen (source-text pins only, no rendered/computed-style adjudicator exists in this repo's frontend jest project -- testEnvironment: 'node', no jsdom)"
files:
  - src/frontend/screens/Humble/Keys/index.css
  - src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts
resolves_phase: null
---

# Humble Keys title wrap, sort label placement, and owned-badge contrast fixes are unverified live

## Why this todo exists

260911-t0p fixed three CSS-only defects on the Humble Keys screen. All three fixes are pinned by
source-text regex assertions in `humbleKeysStylesheet.test.ts` (with SANITY negative-control
siblings proving each anchor is not vacuously true), because the frontend jest project's
`testEnvironment: 'node'` has no jsdom/CSS engine — it cannot render anything or compute a style,
only inspect the source text of `index.tsx`/`index.css`. Source-text correctness is therefore
adjudicated and closed; **rendered/visual correctness of all three is not**, and needs a live
`tauri:dev` (or packaged) run to confirm the CSS actually produces the intended layout and colour
in a real WKWebView. This mirrors the same P2 constraint already recorded in `43-LIVE-GATE.md`.

## Three items for the next REQ-43-19 live-gate run

1. **`Humble Keys` h4 title wraps to two lines.** Measurable claim: the `<h4>` renders on **one
   line** at the app's default window width. Method: pixel measurement of the title element's
   rendered height (a single-line height, not a two-line wrapped height) or its computed
   `white-space` — not a visual scan. Source pin already holding:
   `humbleKeysStylesheet.test.ts` describe block `'Humble Keys title no longer yields to
   SearchBar (REQ-43-19, 260911-t0p defect 1)'`, which pins `flex-shrink: 0` and
   `white-space: nowrap` on `.humbleKeysTitle`. This todo adjudicates *rendering*, not *source* —
   the source pin already holds.

2. **`Sort` label renders above the picker instead of beside it.** Measurable claim: the `Sort`
   label renders to the **right** of the select, vertically centred with it, and the select is
   not collapsed to its `min-width: 100px` floor (`index.css:711`'s documented fallback for an
   unsized grid track). Method: pixel measurement of the label's bounding box relative to the
   select's bounding box (same-row check: overlapping vertical centre, label's left edge to the
   right of the select's right edge) — not a visual scan. Source pin already holding:
   `humbleKeysStylesheet.test.ts` describe block `'Humble Keys sort picker label sits beside, not
   above, the select (REQ-43-19, 260911-t0p defect 2)'`, which pins
   `grid-template-areas: 'select label'` and an explicit `grid-template-columns` on
   `.humbleKeysSortPicker`. This todo adjudicates *rendering*, not *source*.

3. **`Likely owned on Steam` badge is unreadable on light themes.** Measurable claim: the badge
   text measures **≥ 4.5:1** contrast against `body.nord-light`'s background, with `#3e532d` on
   `#eceff4` = **7.35:1** as the predicted value (the `--success` token's documented nord-light
   resolution, replacing the raw `--status-success` token measured at 1.46:1). Method: colour
   sampling of the rendered badge text against its background and a contrast-ratio calculation —
   not a visual scan (per this repo's own `measure-colour-before-scoring-a-ui-contract` lesson:
   "not red" is not sufficient, the ratio must be computed). Source pin already holding:
   `humbleKeysStylesheet.test.ts` describe block `'Humble Keys owned-badge contrast fix
   (REQ-43-19, 260911-t0p defect 4)'`, which pins `.humbleKeyOwnedBadge { color: var(--success) }`
   and asserts the raw `var(--status-success)` token occurs exactly once file-wide (its one
   remaining, unrelated use), not on this badge. This todo adjudicates *rendering*, not *source*.

## Scope

`ready: live-gate` — the fixes are landed and source-pinned; only rendered/visual verification on
a live run is outstanding. `platform: any` — none of the three is platform-specific; the
adjudicating harness happening to be the operator's Mac is incidental, not a requirement.

## 2026-09-11 UPDATE — items 1 and 3 ADJUDICATED; item 2 re-opened by two later changes

Live gate run: `260911-t0p-UAT.md` (quick task `260911-t0p`), measured from `screencapture`
pixels on a running `tauri:dev` build, not scored by eye.

- **Item 1 (title one line) — PASS, CLOSED.** Exactly one dark-text band at 21.0 CSS px over the
  title's own column range. *Near-miss worth keeping:* a first scan found TWO bands and would
  have scored a FALSE FAIL; the second band is 11.0 CSS px — the `Last synced` indicator in
  `--text-xs`, a different element. Band-count alone is not sufficient; check glyph height.
- **Item 3 (owned-badge contrast) — PASS, CLOSED.** Badge text sampled `#425231` against
  `#eceff4` = **7.34:1** measured, versus the 7.35:1 predicted here (residue is antialiasing).
  Pre-fix `#0ce396` = 1.46:1. Clears 4.5:1 AA.
- **Item 2 (sort label placement) — STILL OPEN, and its claim has CHANGED.** The original claim
  ("label renders to the RIGHT of the select") was measured PASS and then **deliberately
  reversed**: on seeing it, the operator asked for label-first, shipped by `260911-ue4`
  (`a2c670f2a`) as `grid-template-areas: 'label select'`. Separately `260911-umj` (`e368075c3`)
  shrank the select 40px → 34px app-wide. **Restated measurable claim for the next run:** the
  `Sort` label renders to the **LEFT** of the select, vertically centred against the **34px**
  control, with `Expiring soonest` not clipped in the `12rem` track. The horizontal sub-claims
  were re-confirmed post-flip; the **vertical centring against the new 34px height has NOT been
  measured**.

Also unmeasured by any run so far: `260911-umj`'s own app-wide claim that `SearchBar` and
`SelectField` both render at **34 CSS px** on Humble Keys, Settings, InstallModal and the
Library header. Those figures are the executing agent's; the orchestrator's attempted
independent re-measure was **invalidated** (the app had been left on a different screen and the
scan returned a nonsense 80.0 px), so they are unconfirmed.

## 2026-09-11 RESOLVED — item 2 re-measured against the 34px control; all three items now PASS

Re-measured on the live `tauri:dev` window after `260911-ue4` (label flip) and `260911-umj`
(34px shrink), with the operator having navigated back to Humble Keys:

- **Label is LEFT of the select.** `Sort` glyph ink x=221.0..246.0 CSS; select box
  x=258.0..454.5 CSS (**197.0 px wide**, track unchanged). Gap 12.0 CSS px = `--space-sm`.
- **Vertically centred against the 34px control.** Select box measured **border-to-border
  141.0..174.0 = 34.0 CSS px** exactly — the declared height took effect. The label's ink band
  (152.0..163.5) sits **entirely within** it; ink-centre offset **3.50 CSS px**, essentially
  unchanged from the 3.0 px measured against the old 40px control, so it is the same
  no-descender artifact and NOT a misalignment introduced by the shrink.
- **`Expiring soonest` is NOT clipped.** ⚠ A crude ink-extent heuristic first reported
  `CLIPPED? YES` — a **FALSE POSITIVE**: it counted the painted dropdown arrow (drawn as a dark
  `linear-gradient` background-image in the right ~40px of chrome) as text ink. Confirmed
  complete by inspecting the capture. Recording this because the pixel method that correctly
  caught a false FAIL on item 1 produced a false FAIL of its own here — the measurement must be
  validated against WHAT it is measuring, not just executed.

Also independently confirmed on this screen: `SearchBar` renders at **34.0 CSS px** (header
band 58.0..91.5), matching `260911-umj`'s claim.

**Still unconfirmed, carried forward:** `260911-umj`'s 34px figures for **Settings,
InstallModal and the Library header** remain the executing agent's measurements. Only Humble
Keys has been independently re-measured.

**~~Remaining open question, not a defect:~~ BOTH HALVES RESOLVED — annotated 2026-09-18 when
this section was recovered (see the note below); the text above was written 2026-09-11 and went
stale within hours.**

- **The drop shadow is GONE.** The original text said `SelectField/index.css:17` "still carries
  `box-shadow: 0px 4px 4px rgba(0, 0, 0, 0.25)`" and awaited an operator decision. That decision
  was taken the SAME DAY: `0265026ba` ("drop the shared SelectField drop shadow; ratify the
  off-scale 34px", 2026-09-11, ancestor of `main`) removed it. `grep box-shadow` on that file now
  returns nothing, and line 17 — the exact line cited above — is today the opening of the comment
  recording the decision: _"260911-umj follow-up, operator decision: no drop shadow."_
- **The `5px`-vs-token question is settled too.** It was answered in favour of the token by
  `260912-d84`, which swapped the shared `.humbleKeysColumnHeader, .humbleKeyRow` `column-gap`
  from `var(--space-md)` to `var(--space-md-fixed)`; its todo is closed in `completed/` as
  `2026-09-11-humble-keys-game-column-header-label-sits-5px-left-of-row-titles-unverified-live.md`.

Note that `260912-d84`'s fix, like this todo, is closed `-unverified-live`: the source token is
pinned by test, but no live render has confirmed it.

## Provenance of this section — it was written 2026-09-11 and committed 2026-09-18

**This entire `## 2026-09-11 RESOLVED` section sat UNCOMMITTED in the working tree for seven
days, and the commit that claims to contain it does not.** `fa44e58db`
("docs(260911-umj): close the live-gate todo — item 2 re-measured against the 34px control",
2026-09-11) is a **pure rename**: `git show --name-status -M` reports `R100`
`pending/... -> completed/...`, and its diffstat is `1 file changed, 0 insertions(+),
0 deletions(-)`. A `git mv` commits the content at `HEAD`, silently dropping unstaged working-tree
edits — so the re-measurement the commit message advertises was never in it.
`git log --all -S "RESOLVED — item 2 re-measured"` returns **nothing**: this text had never been
committed anywhere until now.

Nothing detected it. `planning-gates` was green throughout, because a todo that is missing a
section it was never known to have is indistinguishable from one that is complete.

Two consequences worth carrying:

1. **A commit message is not evidence its content landed.** This one names the measurement
   precisely and contains none of it. Check `R100`/`RM` in `--name-status -M`, and assert the
   staged blob, not the working tree.
2. **Recovered text must be re-checked before it is trusted.** Both claims in the closing
   paragraph above had gone stale within hours of being written, and committing them verbatim
   seven days later would have shipped two false statements into a closed todo.
