---
created: 2026-09-20
title: "--dialog-margin-horizontal is declared on a bare .Dialog class that no element ever carries"
area: ui-dialogs
severity: medium
platform: any
ready: live-gate
source: "quick-260921-nub, surfaced while measuring the .Dialog__content/.Dialog__headerTitle census"
files:
  - src/frontend/components/UI/Dialog/index.css
  - src/frontend/components/UI/Dialog/components/Dialog.tsx
  - src/frontend/screens/Library/components/InstallModal/index.scss
  - src/frontend/components/UI/Winetricks/index.scss
  - src/frontend/index.scss
---

# `.Dialog` (bare) is never applied to any element — its one surviving token likely resolves nowhere

## Measured facts

`Dialog/index.css` declares `--dialog-margin-horizontal` on `.Dialog`, but **no element in `src/`
is ever given the bare class `Dialog`**: `Dialog.tsx` does not add it, and all ~25 consumers pass a
different literal through `PaperProps={{ className }}` (`notLoggedIn`, `uninstall-modal`,
`AboutDialog`, `InstallModal__dialog`, `errorDialog`, `progressDialog`, `ModifyInstall__dialog`).

So the token is declared in a scope that matches nothing, and its two external references resolve
to nothing at runtime:

- `InstallModal/index.scss:27` — `margin: var(--space-md) var(--dialog-margin-horizontal) 0` on
  the anticheat banner
- `Winetricks/index.scss:3` — `margin: 0 var(--dialog-margin-horizontal)` on the installWrapper

Both are non-inherited `margin` shorthands referencing the undefined token, but they do not fail
identically:

- `InstallModal/index.scss:27`'s shorthand covers all four sides of `.anticheatInfo` in one
  declaration. Because the token is undefined, the WHOLE declaration is invalid at computed-value
  time, so **all four margins** — top, right, bottom, and left — fall back to `0px`, not just the
  horizontal pair the shorthand names.
- `Winetricks/index.scss`'s `.installWrapper` keeps its `16px` top/bottom margins, because
  `margin-block: 1rem` is a SEPARATE declaration from the invalid
  `margin: 0 var(--dialog-margin-horizontal)` shorthand and survives the shorthand's invalidation
  independently. Only its inline (left/right) margins collapse to `0px`.

## Why the gate stays green

This is `cssTokenSweep.test.ts`'s own documented **blind spot B** ("this gate checks NAMES, not
SCOPES"), the same class as its worked `--search-bar-border` example. The gate is green and will
stay green — it can prove every `var(--x)` names something declared somewhere, but it cannot prove
the declaration's selector ever matches an element. The declaration must NOT be deleted to "fix"
this, because deleting it turns the gate red for the two references above
(`cssTokenSweep.test.ts`'s `ALLOWLIST` is `[]`).

## Measured live under WKWebView

2026-09-21, quick 260921-pec — measured live in a real browser engine, not inferred from source.
Evidence: `.planning/quick/260921-pec-record-the-live-wkwebview-measurements-i/evidence/wkresults.json`.

**Method:** a compiled Swift harness loaded the app's real Vite-served frontend
(`http://localhost:5173/`) into a real off-screen `WKWebView` — the same engine GameLib ships —
and evaluated a probe against it via `callAsyncJavaScript`. The app booted properly in that
harness: 143 stylesheets loaded, `bodyClass: midnightMirage`, `window.api` present.

**Margins, as shipped vs. under a `.Dialog` ancestor (positive control):**

| element | as shipped | under `.Dialog` ancestor (positive control) |
| --- | --- | --- |
| `.anticheatInfo` | `0px` top/right/bottom/left | `16px` top, `32px` right, `0px` bottom, `32px` left |
| `.installWrapper` | `16px` top/bottom, `0px` left/right | `16px` top/bottom, `32px` left/right |

**Token resolution:** `tokenAtRoot` and `tokenAtBody` both read `""` after the full
143-stylesheet boot. The same getter read `sanity_spaceMd` as `1em`, so the blank reading means
the token is genuinely undefined anywhere reachable in the cascade — not that the probe itself is
broken.

**Scope limit, stated plainly:** this measured CSS cascade resolution and selector parsing in
WebKit against the app's real stylesheets. It did NOT use the running app's own webview instance,
its React tree, or emotion's runtime-injected styles. For this question — does a custom property
declared on an unmatched selector resolve through the cascade? — that scope is sufficient: the
question is purely about cascade resolution, and it is now settled.

**Contamination warning:** the evidence JSON's `elementsCarryingBareDialogClass: 2` is NOT a
finding about the shipped app. It is an artifact of the probe itself, which injected exactly two
`.Dialog` wrapper elements as positive controls BEFORE counting, specifically so the "under a
`.Dialog` ancestor" column above would have something to measure against. Do not read that field
as evidence that any shipped element carries the bare `.Dialog` class — per `## Measured facts`
above, none does.

## Severity and readiness reasoning

`severity: medium`: this is a real defect with a live consequence on two surfaces —
`.anticheatInfo` loses all four margins and `.installWrapper` loses its two inline margins,
instead of the intended `32px` on each — now MEASURED rather than inferred. The blast radius is
unchanged: bounded to the same two `margin` declarations, not a `minor` polish item, but not
`major` either since neither surface is broken, just unmargined.

`ready: live-gate` (was `ready: code`): the decision that was still open when this file last read
`ready: code` — where the token should live — has now been made and shipped (see
`## Remedy shipped` below). What remains is no longer desk work: it is the live WKWebView
re-measurement that confirms the shipped edit actually changes what the browser renders. That
re-measurement is gated on the operator's Mac and the orchestrator's run, not on any further code
change here, so this item now reads `ready: live-gate` per the vocabulary table in this project's
`CLAUDE.md`. `platform` stays `any`: the underlying defect was, and remains, reproducible and
fixable on any machine — a CSS cascade resolution question, not something that needed this
specific Mac. Only the orchestrator's chosen *measuring instrument* for closing this item happens
to be a macOS WKWebView harness, and an instrument's platform requirement does not become the
defect's platform.

## Remedy shipped 2026-09-21 (quick 260921-q9v) — NOT YET CLOSED

**What shipped:** `--dialog-margin-horizontal: 32px` was moved out of the bare `.Dialog` rule in
`Dialog/index.css` and into the `:root` block of `src/frontend/index.scss`, grouped under a new
`/* Layout */` comment alongside the existing `/* Effects */` group (`--blur-light`,
`--blur-strong`). The now-entirely-dead bare `.Dialog { padding: 0; text-align: start; }` rule —
and the `quick-260921-nub` comment that had guarded its token — was deleted outright.
`Dialog/index.css` survives as a file (required by `Dialog/index.ts`'s `import './index.css'`)
with its two live rules, `.log-upload-result` and `.Dialog__footer`, unchanged.

**Why this remedy (moving to `:root`) and not either alternative considered:**

- **Rejected: apply the `Dialog` class to the Paper in `Dialog.tsx`.** This would make the bare
  rule match — and would therefore activate `padding: 0` and `text-align: start` on all ~25 Dialog
  consumers at once. That is a far wider visual change than the defect being fixed here, and it
  repeats the exact "reviving unreviewed styling as a side effect" pattern that `Dialog.tsx:109-120`
  already records as rejected precedent for this same component (reviving an unreviewed
  `min(700px, 85vw)`/`paddingTop` pair there would have changed sizing for all 25 Dialog consumers
  as an undiscussed side effect).
- **Rejected: repoint the two consumers (`InstallModal/index.scss:27`, `Winetricks/index.scss:3`)
  to a different token or a literal.** This would scatter a magic `32px` across two unrelated
  files and leave the orphan declaration behind in `Dialog/index.css`, unfixed and still
  documented as broken.
- **Chosen: move the declaration to `:root`.** `src/frontend/index.scss`'s `:root` block is
  already the home for exactly this kind of non-themed global layout constant — `--blur-light: 4px`
  and `--blur-strong: 16px` live there and are consumed from other stylesheets
  (`Login/index.scss:130`, `Login/components/Runner/index.css:11`). That file is loaded globally
  via `src/frontend/index.tsx:28`'s `import './index.scss'`, so both existing consumers now
  resolve without a single reference site changing.

**Why this does not violate the `## Why the gate stays green` warning above:** that section's "the
declaration must NOT be deleted" is a warning about the *declaration* — the
`--dialog-margin-horizontal: 32px` custom-property line — not about the `.Dialog` selector that
happened to surround it. `cssTokenSweep.test.ts` is a NAME gate (its own documented blind spot B:
it can prove a name is declared somewhere, not that the selector it sits on ever matches an
element). The declaration still exists, now in `:root` instead of on `.Dialog`, so the name is
still found and the gate stays green. Deleting the `.Dialog` rule around it removes zero
declarations — `padding: 0` and `text-align: start` were dropped, deliberately, because per
`## Measured facts` above no element in `src/` is ever given that bare class, so neither
declaration has ever applied to anything; re-homing them would have been the first rejected
option above, smuggled in under a token fix.

**Gates run, and what each one does and does not prove:**

- `grep -rn "dialog-margin-horizontal" src/` → exactly 3 hits, in exactly 3 files
  (`src/frontend/index.scss`, `InstallModal/index.scss`, `Winetricks/index.scss`), zero under
  `src/frontend/components/UI/Dialog/`.
- `pnpm codecheck` → clean, exit 0.
- `npx jest --selectProjects Frontend` → 167 suites / 2655 tests, all green, including
  `cssTokenSweep.test.ts`'s 2 tests. **This proves only that the NAME
  `--dialog-margin-horizontal` is declared somewhere findable by static analysis — not that
  anything renders differently.** `cssTokenSweep.test.ts`'s own header states it "can NEVER prove
  that anything renders," and this repo's Frontend jest project runs with `testEnvironment:
  'node'` — there is no CSS engine in that process to evaluate cascade or layout.
- `pnpm lint` → production `1119` warnings (ceiling `1124`, unchanged), tests `638` warnings
  (ceiling `638`, unchanged) — both scopes numerically identical to the pre-edit tree, as expected
  since this change touches only `.scss`/`.css` and ESLint here scopes to `.ts`/`.tsx`.
- `pnpm planning-gates` → 11/11 passed.

**Why this stays open, not closed:** the falsifiable prediction this remedy exists to satisfy has
not yet been re-measured live. Per `## Measured live under WKWebView` above,
`anticheatInfo_asShipped` must now read `16px` top, `32px` right, `0px` bottom, `32px` left, and
`installWrapper_asShipped` must now read `16px` top/bottom, `32px` left/right — i.e. the "as
shipped" column must become identical to the "under a `.Dialog` ancestor" positive-control column.
That re-measurement uses the same compiled Swift harness and probe quick `260921-pec` used
(`.planning/quick/260921-pec-record-the-live-wkwebview-measurements-i/evidence/wkprobe.swift` and
`.../evidence/probe_wk.js`) and is the orchestrator's to run, not this executor's. This item closes
only if that re-measurement confirms the prediction; until then it stays in `pending/`.

## Re-measured live 2026-09-21 — prediction CONFIRMED, item CLOSED

Evidence: `.planning/quick/260921-q9v-move-dialog-margin-horizontal-to-root-an/evidence/wkresults_after.json`.
Same harness, same probe, same dev server, same 143-stylesheet boot and `midnightMirage` body as
the `260921-pec` baseline — only the two stylesheet edits differ.

| element | BEFORE (`260921-pec`) | AFTER (this run) | PREDICTED | verdict |
| --- | --- | --- | --- | --- |
| `anticheatInfo_asShipped` | `0px/0px/0px/0px` | `16px/32px/0px/32px` | `16px/32px/0px/32px` | MATCH |
| `installWrapper_asShipped` | `16px/0px/16px/0px` | `16px/32px/16px/32px` | `16px/32px/16px/32px` | MATCH |

`tokenAtRoot` and `tokenAtBody` now both read `32px`, where the baseline read `""`.

**Two controls make this a result rather than a coincidence:**

1. **The positive-control column did NOT move.** `anticheatInfo_underDialogAncestor` and
   `installWrapper_underDialogAncestor` read identically before and after
   (`16px/32px/0px/32px` and `16px/32px/16px/32px`). That matters: the prediction was that the
   "as shipped" column would *become* the control column, and a control that drifted to meet the
   result would have proven nothing. It held still while the measured column moved to it.
2. **`sanity_spaceMd` still reads `1em`** through the same getter, so the non-blank token readings
   are the getter working, not a changed probe.

**Scope limit, unchanged and still binding:** this is CSS cascade resolution in WebKit against the
app's real stylesheets, not the running app's own webview, React tree, or emotion runtime styles.
It proves the two `margin` shorthands now resolve and compute to their authored values. It does
NOT prove anyone has looked at the anticheat banner or the Winetricks dialog on screen and judged
32px to be right — that was the authored intent before this defect was introduced, and restoring
authored intent is what this item was scoped to do.
