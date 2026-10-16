# REQ-43-19 Live Gate — Column Geometry, Row Separator, and the Two Folded Todos

**Author:** the executing agent for plan 43-10, Task 1.
**Standing rule this document obeys (`live-gate-contract-authoring.md`, decision D-E): the author
of a gate contract may never also run it or score it.** Everything below Task 1's authoring work —
building, launching, measuring, and filling the Verdict table — belongs to a human operator who is
not this document's author. If you are the agent that wrote this file, stop here. Do not run the
build, do not take a screenshot, do not fill any cell in the Verdict table below.

No automated test in this repository can reach what this document measures.
`src/frontend/jest.config.js` sets `testEnvironment: 'node'` — there is no jsdom, no browser
automation, nothing that can compute a rendered width, a resolved `currentColor`, or whether a 1px
border painted. Every item below requires a live, rendered, packaged build.

---

## Scope — the seven geometry items, plus the two folded todos

| # | Claim | Source |
|---|---|---|
| 1 | The `TYPE` column's rendered width is identical on the column-header row and on every data row. | `43-UI-SPEC.md` § Column Geometry Contract |
| 2 | The `KEY` column's rendered width is identical across all five KEY-scenario row shapes (full-width single button, side-by-side pair, bare text + small text-link, bare text no control, Pitfall-C disabled caption). | `43-UI-SPEC.md` § Column Geometry Contract, § KEY-Column Scenario Matrix |
| 3 | The `GAME` column's title wraps rather than overflowing on a long title, and its left edge does not shift between a logo row, a no-logo row, and an UNPICKED row (empty `TYPE` cell). | `43-UI-SPEC.md` § Column Geometry Contract |
| 4 | The row separator renders as a visible hairline between rows and is absent after the last row. | `43-UI-SPEC.md` § "The row-separator landmine"; `index.css:187-212` |
| 5 (folded todo 1) | The store logo's size, position, and alignment to the title's line-box in the new `TYPE` column. | `.planning/todos/pending/2026-09-08-humble-key-row-store-icon-geometry-unverified-live.md` |
| 6 (folded todo 2) | The store logo's `fill: currentColor` resolves to the intended colour in at least two themes, at least one dark. | `.planning/todos/pending/2026-09-08-humble-key-row-store-logo-fill-currentcolor-unverified-live.md` |
| 7 | The controls row and column-header row align with the data rows' column boundaries. | `43-UI-SPEC.md` § Screen Layout Contract items 2-3 |

Item numbering below matches this table exactly, because Task 3's disposition of the two folded
todos is keyed to items 5 and 6 specifically (a PASS on item 5 closes the geometry todo; a PASS on
item 6 closes the `fill: currentColor` todo).

---

## Preconditions

| ID | Precondition | Why |
|---|---|---|
| P1 | Zero pre-existing `gamelib-shell` processes before the first launch (`pgrep -fl gamelib-shell` returns nothing). | Dual-sink standard: a second instance splits `[shell]` while sharing `gamelib.log` — the most dangerous undetected evidence shape the standard names. |
| P2 | Build a fresh, genuinely release-mode packaged `.app` — **not** `tauri:dev`, **not** `tauri build --debug`. | See "Devtools is not reachable in the required build" row in the Reachability Review below — this precondition is itself load-bearing for every item's measurement method. |
| P3 | Recover the `.app` from the built DMG, never from `bundle/macos/` and never by un-tarring the sibling `GameLib.app.tar.gz`. | `tauri build` deletes `bundle/macos/GameLib.app` as its last step after making the DMG; the `.tar.gz` left behind is a stale updater artifact from whenever it was last produced, not this build. |
| P4 | Confirm the recovered `.app`'s binary is this build, not a stale one, by hash. | Closes the same staleness hole P3 guards against — a directory timestamp updating does not mean the artifact inside is fresh. |
| P5 | Trigger one fresh Humble sync and confirm the Keys screen is populated before any measurement. | Landmine 6: `humble_library.json` was wiped to `{}` on 2026-09-07 by a test-clobbering defect; an empty list is not scorable. |
| P6 | Do a shape inventory pass before scoring anything: for each of the eight `HumbleKeyScenarioId` values (`login-and-claim`, `claim-and-gift`, `gift-only`, `settled`, `override-pending`, `override-undo`, `expired`, `pick`), tally whether at least one row of that shape is visible after the sync. | The approximate state counts available at authoring time (roughly REVEALED 9 / REDEEMED 13 / UNREVEALED 4 / UNREDEEMABLE 7 across 33 entitlements) are stale by the time the gate runs, and several of items 1/2/3's five shapes depend on scenarios this axis does not resolve (`ownedElsewhere`, override state, UNPICKED). Do not guess from the authoring-time counts — observe. |
| P7 | Do **not** click "Not the same game" or any ownership-override control solely to manufacture a test row. | `humbleSetOwnershipOverride`/`humbleClearOwnershipOverride` persist a real, permanent change to the operator's real Humble ownership data (`HumbleKeyRow/index.tsx:415,439`). A live gate must not mutate the state it exists to observe. Only score `override-pending`/`override-undo` if a row already carries that shape from real prior use; otherwise mark that sub-check NOT ATTEMPTABLE. |
| P8 | Perform exactly one sync at the start of the session. Do not re-sync mid-session unless an item explicitly requires it. | Test 5 finding — see "Requirement-interaction (Test 5)" below. A second sync can reorder/rename rows between an earlier item's screenshot and a later item's, silently invalidating row-identity assumptions across items. |
| P9 | If switching themes for item 6 causes an app relaunch (rather than a live in-app toggle), treat it as a new launch: assert single-instance again, archive `gamelib.log` again under the new ordinal, and record the new ordinal against item 6. | Test 5 finding — a relaunch is on the standard's own "anything that RESTARTS the app" hunting-list trigger. |
| P10 | Do not open the `HumbleClaimWizard` (the "Claim"/"Finish activation"/"Activate" click target) for any item in this contract — it can briefly display a real, usable Humble redemption code (`revealedKey` state, `HumbleClaimWizard/index.tsx:91,244`). Every measurement here is against the row list's RESTING state; no item requires opening that wizard. | T-43-01 (threat register): the gate performs no reveal and no redemption by design — the resting row list never displays a code. If a screenshot accidentally captures the wizard open, discard and retake it rather than redacting and keeping it. |
| P11 | Before pasting any raw excerpt of `terminal.log` or an archived `gamelib.log` into a report or into this document, scan it for a key-shaped token (Humble codes are dash-separated alphanumeric groups) and redact any match. Only measurements and status lines may be quoted verbatim. | T-43-01 (threat register): `gamelib.log` is a real session log for a signed-in Humble session; the shipping redaction discipline at `adapter.ts:610-620` covers what the backend logs, not what a human pastes into a markdown file afterward. |

---

## Devtools is not reachable in the required build (structural finding, recorded before any run)

`open_devtools()` is called only under `#[cfg(debug_assertions)]` at every call site in
`src-tauri/src/main.rs` (`main.rs:1667`, `main.rs:3280`, `main.rs:6437`, `main.rs:6705`).
`src-tauri/Cargo.toml`'s `tauri` dependency declares `features = ["tray-icon", "image-png"]` only —
no `devtools` feature, and no other code path opens it. P2 requires a true release build (no
`--debug`), which compiles with `debug_assertions` off. **Any sub-check that planned to use the
Tauri/WKWebView devtools console (`getBoundingClientRect()`, `getComputedStyle()`, or any other
console read) against the required build is IMPOSSIBLE — the console is unreachable in that build,
full stop, not merely inconvenient.**

**Rewrite applied before publishing this contract:** every geometry measurement below (items 1, 2,
3, 7) uses a screenshot with a known-scale reference instead of a devtools read, exactly as
`43-UI-SPEC.md`'s own interfaces note anticipates ("If AX cannot see the row, fall back to a
screenshot with a known-scale reference and measure in pixels"). The macOS Accessibility Inspector
is offered as a first-choice alternative per item, with the screenshot method as the method that is
always reachable regardless of whether AX exposes the relevant elements — this repo has recorded
that the accessibility API is blind to some Tauri surfaces and a picker-driven gate run can measure
nothing at all, so the screenshot method is authored as the primary path, not the fallback, to
avoid another such null run.

---

## Structural Reachability Review

34 data rows (excluding the header row itself): 7 rows for the 7 numbered items (one row per item,
each covering that item's sub-checks in its Evidence column), 11 rows for the 11 preconditions
(P1-P11), 6 rows for the 6 evidence-capture instructions named in the protocol below (session
directory, append-only `tee -a`, per-launch delimiter, `gamelib.log` archiving, single-instance
`pgrep` assertion, closing inventory), 1 row for the devtools finding above, 6 rows for the
Test 1/2/3/4/5/6 sweeps, and 3 rows for named Test-7 scenario-reachability findings that apply
across multiple items (`login-and-claim` structural exclusion, override-shape data-mutation guard,
Pitfall-C timing window). 7+11+6+1+6+3 = 34. P10 and P11 were added after the original authoring
pass to close a T-43-01 gap (see their own Preconditions rows above), so this count and their two
review rows below post-date the rest of the review table.

| Item/sub-check/precondition | Surface it names | What it asks for | Verdict | Evidence |
|---|---|---|---|---|
| Devtools console as a measurement method | Tauri/WKWebView devtools, gated by `debug_assertions` | A DOM-level `getBoundingClientRect()`/`getComputedStyle()` read against the required release build | IMPOSSIBLE — rewritten above to screenshot + known-scale reference | `src-tauri/src/main.rs:1667,3280,6437,6705` (`#[cfg(debug_assertions)]`); `src-tauri/Cargo.toml:37` (no `devtools` feature) |
| Item 1 — TYPE column width identical, header + every row | `.humbleKeysColumnHeader` / `.humbleKeyRow` shared grid template | A rendered-pixel measurement, not the CSS declaration | REACHABLE | `src/frontend/screens/Humble/Keys/index.css` (combined selector, "ONE combined selector" comment); measured via screenshot method below |
| Item 2 — KEY column width identical across 5 shapes | Same shared grid template, 3rd track | Rendered-pixel measurement across scenario rows | CONDITIONAL — depends on which of the 8 `HumbleKeyScenarioId` shapes P6's inventory finds present; see the three Test-7 rows below | `HumbleKeyRow/index.tsx:164-172` (`HumbleKeyScenarioId` union) |
| Item 3 — GAME column wraps, left edge stable across logo/no-logo/UNPICKED | `.humbleKeyGameCell`, `min-width: 0` | Rendered-pixel left-edge comparison + visual wrap confirmation | CONDITIONAL — logo and no-logo rows REACHABLE (31 steam + 1 gog_keyless branded, 1 generic no-logo); UNPICKED row's reachability depends on P6's inventory (0 UNPICKED rows in the approximate counts available at authoring time) | `HumbleKeyRow/index.tsx:687-718` (TYPE cell, `!isUnpicked` gate) |
| Item 4 — row separator hairline present between rows, absent after last | `.humbleKeyRow` border-bottom, `:last-child` reset | A measured colour delta at the seam pixel row, not a visual impression | REACHABLE (33 entitlements guarantee at least 2 adjacent rows and a last row) | `index.css:200-212` |
| Item 5 (folded todo 1) — logo size/position/alignment in new TYPE column | `.humbleKeyRowStoreLogo`, `.humbleKeyRowTitle` line-box | Measured icon height + top-edge alignment on 1-line and 2-line rows | CONDITIONAL — 1-line rows REACHABLE (most steam rows); 2-line row (an `ownedElsewhere` badge present, per the todo's own suggested verification) depends on P6 finding at least one `ownedElsewhere` row | `index.css` (`--humble-key-row-title-line-height: 1.2` comment); `_typography.scss:30` (root `font-size: 16px`, so target height = 19.2px) |
| Item 6 (folded todo 2) — `fill: currentColor` resolves correctly, 2 themes | `.humbleKeyRowStoreLogo { color: var(--text-secondary) }` | A measured RGB colour value per theme, not a description | REACHABLE — steam (31 rows) and gog_keyless (Racine, GOG-branded TYPE cell) both give a logoed row regardless of Racine's own claim-state, which is unrelated to TYPE-cell rendering | `index.css:265-272`; `HumbleKeyRow/index.tsx:65-76` (`resolveStoreLogo`) |
| Item 7 — controls row + header row align with data rows | Title row, controls row, `.humbleKeysColumnHeader` | Left-edge alignment of the controls row/title row against the row list's own left edge, plus header-vs-row column boundary alignment (shared with item 1/2's method) | REACHABLE | `43-UI-SPEC.md` § Screen Layout Contract items 1-3 |
| P1 — zero pre-existing instances | `gamelib-shell` process | A `pgrep` count of 0 before first launch | REACHABLE | `pgrep -fl gamelib-shell` |
| P2 — true release build, no `--debug` | `tauri build` vs `tauri build --debug` | A release compile, confirmed by the devtools-unavailability check itself (if devtools opens, the build was not release) | REACHABLE | `tauri-dev-packaged-ships-a-stale-sea-sidecar` finding: `--debug` takes the dev-sidecar path under `debug_assertions`; release path never runs `node` (`main.rs:6694` comment) |
| P3 — recover `.app` from DMG, not `bundle/macos/` | `tauri build`'s own cleanup step | A `hdiutil attach`/`ditto`/`hdiutil detach` sequence | REACHABLE | `hdiutil`, `ditto` are stock macOS tools |
| P4 — binary hash matches this build | `Contents/MacOS/gamelib-shell` vs `target/release/gamelib-shell` | A `shasum -a 256` equality | REACHABLE | `shasum` is a stock macOS tool |
| P5 — fresh sync, populated list | Humble sync pipeline | Observation of a non-empty Keys list plus the `Humble sync finished:` log line | REACHABLE, with SINK clause: this line is `logInfo` (sidecar), reaches `~/Library/Logs/GameLib/gamelib.log` only, never the tee'd terminal transcript — read it from the archived `gamelib.log`, not the transcript | `src/backend/humble/library.ts:1082-1084` |
| P6 — shape inventory before scoring | All 8 `HumbleKeyScenarioId` values | A tally of which shapes are present post-sync | REACHABLE (the inventory itself is just observation) | `HumbleKeyRow/index.tsx:164-172,209-276` (`resolveKeyScenario`) |
| P7 — do not manufacture override rows | `humbleSetOwnershipOverride`/`humbleClearOwnershipOverride` | A negative instruction, not a measurement | REACHABLE (the guard is followable; see the override Test-7 row below for what it forecloses) | `HumbleKeyRow/index.tsx:414-416,438-440` |
| P8 — one sync at session start only | Humble sync pipeline, row identity across items | A discipline constraint on the operator's run order | REACHABLE | See Test 5 pairing-pass row below |
| P9 — theme switch may require relaunch | App relaunch, single-instance assertion, `gamelib.log` rotation | A conditional branch in the evidence-capture protocol | REACHABLE | See Test 5 pairing-pass row below |
| P10 — never open the claim wizard | `HumbleClaimWizard`'s `revealedKey` state | A negative instruction against a real-code-reveal surface, not a measurement | REACHABLE — the guard is followable because no item's measurement method requires the wizard open; every item scores against the resting row list | `HumbleClaimWizard/index.tsx:91,244` |
| P11 — redact key-shaped tokens before quoting logs | Any raw `terminal.log`/`gamelib.log` excerpt pasted into a report or this document | A human-applied scan-and-redact step on operator-authored prose, not an automated check | REACHABLE, with a caveat: this is a discipline instruction, not a structural guarantee — nothing in this repo greps the operator's own write-up for leaked codes before it is committed. The instruction is followable but not independently verifiable by this document | `adapter.ts:610-620` (the backend's own redaction, cited for contrast — it does not cover human-pasted excerpts) |
| Evidence-capture: session directory, created once, UTC-timestamped | `/tmp/gamelib-gate-<ISO8601-UTC>/` | A directory that cannot collide with a prior or later run | REACHABLE | Protocol step 1; `mkdir -p` is a stock command |
| Evidence-capture: terminal transcript appended, never truncated | `$SESSION/terminal.log` | `tee -a`, never bare `tee`, never `>` | REACHABLE — every command in the protocol below pipes through `tee -a "$SESSION/terminal.log"`, confirmed by re-reading the protocol's own command blocks before publishing this contract | Protocol steps 2-11 (every `tee -a` call) |
| Evidence-capture: per-launch delimiter line | `terminal.log` | A literal, greppable launch-boundary marker | REACHABLE | Protocol step 5: `echo "=== GATE LAUNCH ${N} — ..." | tee -a "$SESSION/terminal.log"`; a reader can `grep -n '^=== GATE LAUNCH'` to find section boundaries |
| Evidence-capture: `gamelib.log` archived per launch, before rotation | `~/Library/Logs/GameLib/gamelib.log` and its `.old` sibling | A copy taken before the next launch's first write renames it | REACHABLE, SINK-correct: this is the same sidecar-`logInfo` sink P5 already reads from, archived under a launch-numbered filename | `src/backend/logger/log_writer.ts:72-74` (`existsSync` then `renameSync` to `.old`); protocol step 6 |
| Evidence-capture: single-instance assertion, before and after each launch | `gamelib-shell` process | A `pgrep` count recorded at both boundaries, not just once | REACHABLE | Protocol steps 2, 5, 11 |
| Evidence-capture: closing inventory | `$SESSION/` | `ls -la` plus `wc -l` on every captured file, so a zero-length capture is caught while the app is still open | REACHABLE | Protocol step 11 |
| Test 1 (origin/scheme) sweep | Every item/precondition in this document | Does any item require a URL/origin the shipping code rejects before the surface renders? | REACHABLE — N/A. No item in this document opens a URL, a login window, or any origin-gated surface; the entire gate is a rendered-DOM-and-CSS measurement on an already-open screen. Applied and found nothing, not skipped. | n/a |
| Test 2 (concurrency) sweep | Every item/precondition in this document | Does any item require two things driven at once that platform modality forbids? | REACHABLE — N/A. Every item here is sequential (build, launch, sync, observe, screenshot, measure); nothing asks the operator to drive two UI actions simultaneously. Applied and found nothing. | n/a |
| Test 3 (log-line emitter, SINK clause) sweep | Every literal log line this document cites | Grep + sink identification for each | REACHABLE — the only cited log line is P5's `Humble sync finished:`, already given the SINK clause in its own row above. No other item or precondition cites a log line. | `src/backend/humble/library.ts:1082-1084` |
| Test 4 (absence-observability) sweep | Item 4's "absent after the last row" sub-check | Would presence of the border after the last row have been observable? | REACHABLE, and confirmed FALSIFIABLE, not a bare structural guarantee: `.humbleKeyRow:last-child { border-bottom: none }` (`index.css` immediately below the border declaration) is a real CSS override that a regression could delete, and its presence-vs-absence is the same measured colour-delta technique item 4 already uses — sample the seam pixel row below the visually-last row and confirm no delta, using the identical method that WOULD show a delta if the override were removed. | `index.css:213-215` (`.humbleKeyRow:last-child`) |
| Test 5 (requirement-interaction) pairing pass | State-mutating requirements {P5's sync, P9's possible theme-switch relaunch} against evidence-bearing requirements {items 1-7's screenshots, P5's archived `gamelib.log` line} | Does satisfying a state-mutating requirement destroy an evidence-bearing one? | REACHABLE, one pair flagged and mitigated: {re-sync} × {an earlier item's already-captured screenshot of specific rows} — a second sync can reorder or remove rows, invalidating row-identity assumptions in prior screenshots. Mitigated by P8 (one sync, at session start, before any item's screenshot). Second pair {theme-switch relaunch} × {single-instance assertion, `gamelib.log` archive} — mitigated by P9 (treat relaunch as a new launch ordinal). No other pair among the considered set destroys evidence. | This document's P8, P9 |
| Test 6 (pre-existing external state) sweep | `humble_library.json`/backing store; the recovered `.app`'s freshness; Racine's `revealedAt` annotation | Does any item's premise assume a clean state that external state can silently invalidate? | REACHABLE, three premises checked with positive confirmation, not absence-of-data inference: (a) "the library is populated" is confirmed by P5's positive sync-finished line + visible list, not by the mere absence of a wipe; (b) "the build is fresh" is confirmed by P4's hash equality, not by directory mtimes; (c) Racine's claim state is UNVERIFIED per the plan's own build-context note — item 6 does not depend on Racine's claim state (TYPE-cell rendering is state-independent), so this uncertainty does not invalidate item 6's premise. | P4, P5 rows above; `HumbleKeyRow/index.tsx` TYPE cell renders regardless of `humbleKey.state` |
| Test 7 — `login-and-claim` structurally excluded for this operator | Scenario 1 (`login-and-claim`), full-width-button shape family | Whether the operator can reach a full-width "log in and claim" button in their real library | CONDITIONAL, leaning NOT ATTEMPTABLE for this specific scenario: `resolveKeyScenario` only returns `'login-and-claim'` when `storeLoginConnected === false` for a steam/gog/epic-family platform (`HumbleKeyRow/index.tsx:266-273`). The operator's GameLib is already Steam-connected (this is a Steam-first launcher and the operator's own machine), so every steam row has `storeLoginConnected === true`; the library's only non-steam entries are 1 `gog_keyless` (explicitly excluded from this branch by platform check) and 1 `generic` (`getGameLibLoginStore` returns null for it, so the branch never applies). **If P6's inventory confirms zero `login-and-claim` rows, mark this sub-check NOT ATTEMPTABLE with this reason rather than attempting to fabricate the precondition (e.g. by disconnecting Steam in-app), which would itself be a destructive, out-of-scope state change.** The full-width-button SHAPE overall may still be reachable via `'pick'` or `'gift-only'` — see item 2/3's Verdict cells and P6. | `HumbleKeyRow/index.tsx:257-276` |
| Test 7 — override-shape reachability is data-mutation-guarded | `'override-pending'`/`'override-undo'` shapes | Whether the operator can reach both override shapes without mutating real ownership data | CONDITIONAL: only REACHABLE if P6's inventory finds a row already in one of these shapes from real prior use. P7 forbids manufacturing one by clicking the override control. If P6 finds neither shape present, mark both NOT ATTEMPTABLE — do not click to create one. | `HumbleKeyRow/index.tsx:405-445` |
| Test 7 — Pitfall-C caption is a timing-dependent window | Scenario `'2a'` (Pitfall-C), `claimAction.keyindexResolved === false` | Whether the operator can observe the disabled "Sync to enable claiming" caption before keyindex resolution completes | CONDITIONAL: this is a race between the sync completing and the keyindex resolving, per the plan's own build-context note about Racine's `revealedAt` timing being unverified. Observe immediately after triggering P5's sync, before assuming resolution is complete. If keyindex resolution completes before it can be observed even once, mark NOT ATTEMPTABLE as a legitimate timing gap, not an authoring failure. | `HumbleKeyRow/index.tsx:505-534` |

**Zero surviving IMPOSSIBLE rows.** The one IMPOSSIBLE verdict recorded above (devtools as a
measurement method) was rewritten before publication — every item's final measurement method uses
the screenshot-based technique in the Evidence-capture protocol below, not devtools.

---

## Evidence-capture protocol

Follow this exactly. Every command below is meant to be pasted verbatim, with `$SESSION` and `$N`
substituted as instructed.

### 1. Session directory (once, before the first launch)

```bash
SESSION="/tmp/gamelib-gate-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$SESSION"
```

Never reuse a prior run's directory. This is a fresh, UTC-timestamped directory so no two runs'
evidence can ever mix.

### 2. Zero pre-existing instances (P1)

```bash
pgrep -fl gamelib-shell | tee -a "$SESSION/terminal.log"
```

Must print nothing. If it prints anything, quit every `GameLib`/`gamelib-shell` process and repeat
until empty before proceeding. The run is not scorable while this is nonzero.

### 3. Build (P2, true release, no `--debug`)

```bash
rm -rf src-tauri/target/release/bundle
{
  echo "=== GATE BUILD — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$SESSION/terminal.log"
  pnpm exec vite build && \
  pnpm build:sidecar-sea && \
  pnpm build:decompress-worker-dev && \
  pnpm exec tauri build
} 2>&1 | tee -a "$SESSION/terminal.log"
```

Record the exact command line and its exit status in the Verdict table's build-record row.

### 4. Recover the `.app` from the DMG (P3) and verify provenance (P4)

```bash
DMG=$(ls src-tauri/target/release/bundle/dmg/*.dmg | head -1)
hdiutil attach "$DMG" -nobrowse -quiet -mountpoint "$SESSION/mnt"
ditto "$SESSION/mnt/GameLib.app" "$SESSION/GameLib.app"
hdiutil detach "$SESSION/mnt" -quiet

shasum -a 256 "$SESSION/GameLib.app/Contents/MacOS/gamelib-shell" | tee -a "$SESSION/terminal.log"
shasum -a 256 src-tauri/target/release/gamelib-shell | tee -a "$SESSION/terminal.log"
```

The two hashes must be identical. If they are not, the DMG's binary does not match this build —
do not proceed; rebuild and re-recover.

### 5. Launch — LAUNCH 1

```bash
N=1
echo "=== GATE LAUNCH ${N} — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$SESSION/terminal.log"
open "$SESSION/GameLib.app"
```

Wait for the window to appear, then:

```bash
pgrep -fl gamelib-shell | tee -a "$SESSION/terminal.log"
```

Must show exactly 1 line. Any other count aborts the run.

### 6. Sync and confirm populated (P5)

Trigger a Humble library sync from the app's own refresh control (not a CLI command — this is a
UI action). Wait for it to finish, then confirm the Keys screen shows a non-empty list, then
archive the log (this must happen before the next launch's first write renames it to `.old`):

```bash
cp ~/Library/Logs/GameLib/gamelib.log "$SESSION/gamelib-launch-${N}.log" 2>/dev/null
cp ~/Library/Logs/GameLib/gamelib.log.old "$SESSION/gamelib-launch-${N}.old.log" 2>/dev/null
grep -n "Humble sync finished:" "$SESSION/gamelib-launch-${N}.log" | tee -a "$SESSION/terminal.log"
```

The grep must find at least one match. Record the `gamekeys=N` count it reports.

### 7. Shape inventory (P6)

Scroll the full Keys list once. For each of `login-and-claim`, `claim-and-gift`, `gift-only`,
`settled`, `override-pending`, `override-undo`, `expired`, `pick`, and UNPICKED, note whether at
least one row exhibits it. Do not click anything to manufacture a shape (P7) — only tally what is
already there. Record this tally in the Verdict table before scoring items 1, 2, 3, or 5.

### 8. Screenshot + known-scale measurement (items 1, 2, 3, 7)

Get the window's bounds in points:

```bash
osascript -e 'tell application "System Events" to tell (first process whose name is "GameLib") to get {position, size} of front window' | tee -a "$SESSION/terminal.log"
```

Record the reported `{x, y}` and `{width, height}` as `WIN_X, WIN_Y, WIN_W, WIN_H`.

Screenshot the window (interactive click-to-select, exact window, no shadow):

```bash
screencapture -x -o -W "$SESSION/capture-${N}-columns.png"
```

Click the GameLib window when the cursor changes. Never save to a path starting with `.` —
`screencapture` refuses dotfile paths and exits 0 while writing nothing; the filenames above are
safe.

Read the screenshot's pixel dimensions:

```bash
sips -g pixelWidth -g pixelHeight "$SESSION/capture-${N}-columns.png" | tee -a "$SESSION/terminal.log"
```

Compute the scale factor: `SCALE = pixelWidth / WIN_W`. On a 2x Retina display this should be
close to 2.0; record the actual computed value, not an assumption.

**Measuring an x-coordinate without devtools:** open the screenshot in Preview.app. Use the
rectangular Selection tool, and drag a selection starting at the image's top-left corner (0,0)
out to the target point (the left edge of the "GAME" header label, the left edge of a row's title
text, the left edge of the "KEY" header label, the left edge of a row's KEY-column content). The
selection's reported width (visible live while dragging, or via Tools > Show Inspector) equals
that point's x pixel coordinate, because the selection started at the origin. Divide by `SCALE` to
get the CSS px x-coordinate.

**Item 1 (TYPE width) and item 3 (GAME left edge) threshold:** the x-coordinate of the "GAME"
header label's left edge, and of the title-text left edge on every sampled row (at least one
branded/logoed row, the one no-logo `generic` row, and an UNPICKED row if P6's inventory finds
one), must agree within **±2 CSS px** of each other. Record every measured x-coordinate and the
resulting spread.

**Item 2 (KEY width) threshold:** the x-coordinate of the "KEY" header label's left edge, and of
the KEY-column content's left edge on every sampled shape from P6's inventory that is REACHABLE per
the Structural Reachability Review, must agree within **±2 CSS px** of each other. For any shape
P6 found absent (marked NOT ATTEMPTABLE per the review), record that explicitly rather than
leaving it blank.

**Item 7 threshold:** the x-coordinate of the title-row heading's left edge and the controls row's
sort-picker left edge must agree with the row-list's own left edge (TYPE column's left edge) within
**±2 CSS px**.

### 9. Row separator (item 4)

Crop a screenshot region spanning two adjacent rows' boundary and, separately, the region below the
visually-last row. Use Digital Color Meter (`/System/Applications/Utilities/Digital Color
Meter.app`) in RGB mode to sample the pixel colour exactly on the seam row and on a pixel 3px above
and below it.

**Threshold:** a hairline is confirmed PASS where at least one RGB channel differs by **≥3** (out
of 255) between the seam pixel and its 3px-offset neighbours, for every inter-row boundary sampled
(at least 3 boundaries). Below the last row, the same sample must show **no such delta** (all
channels within 2 of their neighbours) — this is the falsifiable absence check from Test 4.

### 10. Icon geometry and colour (items 5, 6)

Using the same screenshot-plus-Preview technique: measure the icon's cropped height in pixels,
divide by `SCALE`, and compare to the target `19.2px` (`calc(16px * 1.2)`, from `_typography.scss`
root `font-size: 16px` and the `1.2` line-height ratio) — **threshold ±2 CSS px**. Measure the
icon's top-edge y-coordinate against the title text's top-edge y-coordinate on a 1-line row and
(if P6/item-3's inventory found one) a 2-line row — **threshold ±2 CSS px** for "flush aligned".

For item 6, switch the app theme (light/dark) — if this triggers a relaunch, follow P9 and start a
new launch ordinal — and use Digital Color Meter to sample the icon's rendered RGB in each theme.
Record the raw RGB triple per theme per platform (steam, and gog_keyless/Racine if present) as the
measurement — a colour value, never a subjective description of the icon's visibility.

### 11. Closing inventory

While the app is still open, before quitting:

```bash
ls -la "$SESSION/" | tee -a "$SESSION/terminal.log"
wc -l "$SESSION"/* | tee -a "$SESSION/terminal.log"
```

Confirm no file shows `0` for `wc -l` (a zero-length capture) and no file shows `0` bytes in the
`ls -la` listing. A zero-length capture must be visible now, not discovered during write-up.

Then quit the app and confirm zero instances remain:

```bash
pgrep -fl gamelib-shell | tee -a "$SESSION/terminal.log"
```

Must print nothing.

---

## Verdict — run 1 (20260911T043842Z), run 2 (20260911T062945Z), and run 3 (20260911T075450Z)

**This section was authored empty. The author of this contract did not fill it in.** The operator
(plan 43-10 Task 2) fills every cell below from their own run, then plan 43-10 Task 3 transcribes
it verbatim into the `**VERDICT:**` line and disposes of the two folded todos accordingly.

> **FILLED 2026-09-11 by plan 43-10 Task 3 (RUN 1)**, from the measured run recorded in
> `/tmp/gamelib-gate-20260911T043842Z/terminal.log` (28.5 KB transcript, 24 evidence files,
> raw numbers in `measurements-raw.txt`, scorecard in `verdict-notes.txt`). The pre-run
> instruction above is preserved verbatim as the record of how this document was authored; it is
> no longer an instruction. Build under test: `gamelib-shell` sha256 `92e31568…f3d08`, source
> `d60fcc85c` — **note this predates `2c68c17fe`**, the gift-gate fix, which is why item 2's
> side-by-side pair is NOT ATTEMPTABLE here and would need a rebuild to score.

> **RE-RUN 2026-09-11 by quick task 260911-qds (RUN 2)**, transcribed verbatim from
> `/tmp/gamelib-gate-20260911T062945Z/measurements-rerun.md`, preserved at
> `43-11-evidence/measurements-rerun.md`. Build under test: `gamelib-shell` sha256
> `1cd1e843…3f5a`, HEAD `0d2ae9862`, which **carries `2c68c17fe`** (the gift-gate fix run 1 was
> missing) and `c690a117a` (the divider-fallback + scoped-`gogIcon` fix from quick `260911-p6s`).
> Run 2 re-scores exactly the three sub-checks that changed as a result of those two commits —
> item 4's separator-present check, item 6's light-theme icon colour, and item 2's side-by-side
> pair, now reachable for the first time. Every other sub-check's run-1 value stands unrevisited;
> run 2 did not re-measure them.

> **RE-RUN 2026-09-11 by quick task 260911-s4f (RUN 3)**, transcribed verbatim from
> `/tmp/gamelib-gate-20260911T075450Z/measurements-run3.md`, preserved at
> `43-12-evidence/measurements-run3.md`. Build under test: HEAD `3ccc6e689`, carrying `2c68c17fe`
> (the gift-gate fix), `c690a117a` (the divider-fallback + scoped-`gogIcon` fix from quick
> `260911-p6s`), and `e344f589d` (the left-alignment fix from quick `260911-r8u`, the operator's
> resolution of the design-decision todo runs 1 and 2 could not close); `gamelib-shell` sha256
> `50d3c940…c3211`. Run 3 re-scores exactly the four sub-checks that changed as a result of
> `e344f589d` — item 2's KEY-column header-vs-content alignment, item 3's GAME-column alignment,
> item 4's separator (re-confirmed on new theme backgrounds), and item 6's icon colour
> (re-confirmed on new sampled rows). Every other sub-check's earlier value stands unrevisited;
> run 3 did not re-measure them.

| Run | Item | Sub-check | Launch ordinal | Raw measurement | Threshold | Result |
|---|---|---|---|---|---|---|
| 1 | 1 | TYPE width, header vs. rows | 1 | data content left edge **220.0** on all 18 rows sampled, spread **0.0**; header "Type" label centred 271.5 vs track centre 272.0 | ±2 CSS px agreement | PASS |
| 1 | 2 | KEY width, shape: full-width button | 1 | 1124.0 → 1443.5 (Hard West 2, CryoFall, Racine) | ±2 CSS px agreement | PASS |
| 1 | 2 | KEY width, shape: side-by-side pair | — | shape cannot render: `claimAction` needs `!ownedElsewhere`, `giftAction` needed `ownedElsewhere` | ±2 CSS px agreement | SUPERSEDED by run 2 (was NOT ATTEMPTABLE) |
| 2 | 2 | KEY width, shape: side-by-side pair | 1 | KEY-column CONTENT left edge **934.0 CSS px** across all 7 sampled shapes (Hard West 2, Asguaard, Californium, Crusader Kings III, CryoFall, Darkest Dungeon, Dex), spread **0.0**; the `"Key"` HEADER label's left edge is **1085.5**, a **151.5 CSS px** divergence. The Asguaard row now renders the Claim+Gift pair side by side (`Activate` + `Gift on Humble`), so this sub-check is ATTEMPTABLE for the first time (gift-gate fix `2c68c17fe`). Scored **FAIL** against the contract's literal metric (header label left edge vs content left edge) — **not** re-scored against the friendlier content-to-content metric after seeing the result. See the retitled note below. | ±2 CSS px agreement | SUPERSEDED by run 3 (was **FAIL**) |
| 3 | 2 | KEY width, header vs. content, re-scored after the `e344f589d` alignment fix | 1 | `"Key"` header label left edge **934.5**, KEY-column content left edge **934.0** on all 7 sampled rows, spread **0.5 CSS px**. Same literal header-vs-content metric run 2 failed at 151.5 divergence — the metric did not move, the layout did. | ±2 CSS px agreement | PASS |
| 1 | 2 | KEY width, shape: bare text + text-link | 1 | left edge 1124.0 (Californium, Darkest Dungeon, FRONTIERS) | ±2 CSS px agreement | PASS |
| 1 | 2 | KEY width, shape: bare text, no control | 1 | left edge 1124.0 (Crusader Kings III; Alchemy VTT generic) | ±2 CSS px agreement | PASS |
| 1 | 2 | KEY width, shape: Pitfall-C disabled caption | — | no row in the library carries `keyindexResolved === false` | ±2 CSS px agreement | NOT OBSERVED |
| 1 | 3 | GAME left edge, logo row | 1 | title-text left edges **618.5..702.5**, spread **84.0** (capture 1); see note below | ±2 CSS px agreement | SUPERSEDED by run 3 (was **FAIL**) |
| 1 | 3 | GAME left edge, no-logo row | 1 | generic row title-text left edge **486.0** vs logo rows 626.5..702.5, spread **216.5** (capture 2) | ±2 CSS px agreement | SUPERSEDED by run 3 (was **FAIL**) |
| 3 | 3 | GAME title-to-title left-edge agreement, re-scored after the `e344f589d` alignment fix — coverage across logo/GOG-logo/no-logo shapes | 1 | Sample composition, stated explicitly so the coverage claim is auditable: capture-2-top.png (near-black theme) gave **6 titles, all Steam-logo rows** — Aksun Playtest, Dredge, Fabledom, Persona 5 Royal, Warhammer 40,000: Rogue Trader, Settlement Survival, left edges 340.0-341.0, spread **1.0**. A second sample from capture-3-gog.png (light theme, taken to close the gap that the first six were all logoed) gave **9 titles covering all three TYPE-cell shapes** — 7 Steam-logo rows, 1 GOG-logo row (Racine), 1 no-logo/"Other"-text-label row (Alchemy VTT) — left edges 340.5-341.0, spread **0.5**. **Combined: 15 rows, two themes, three TYPE-cell shapes, title left edges 340.0-341.0, total spread 1.0 CSS px.** This directly supersedes both run-1 FAIL rows above (84.0 and 216.5) with evidence covering the same shapes, not by inference — the no-logo sub-check specifically is now covered by the Alchemy VTT row, not left unaddressed. | ±2 CSS px agreement | PASS |
| 3 | 3 | GAME header label left edge vs. title left edges (new sub-check, first attemptable now that title-to-title agreement is resolved) | 1 | `"Game"` header label left edge **335.5**; six title left edges (capture-2-top.png sample) 340.0-341.0. Header-vs-titles divergence **5.5 CSS px**, EXCEEDS ±2. Scored against this contract's literal per-row metric applied to the header cell — **not** re-scored against the friendlier title-to-title agreement (1.0, which would trivially PASS) after seeing the result, matching the discipline already applied to item 3's run-1 rows and item 2's run-2 row. Cause unestablished; tracked by `2026-09-11-humble-keys-game-column-header-label-sits-5px-left-of-row-titles.md`. | ±2 CSS px agreement | **FAIL** |
| 1 | 3 | GAME left edge, UNPICKED row | — | P6 inventory: **0** UNPICKED entitlements in the library | ±2 CSS px agreement | NOT ATTEMPTABLE |
| 1 | 3 | GAME title wraps (no overflow) on a long title | 1 | longest title occupies 475.5 of a 768.0 track — no overflow, but no wrap triggered either | wraps, does not overflow its column | NOT ATTEMPTABLE |
| 1 | 4 | Separator hairline present between rows | 1 | dark theme `[20,23,41]`: delta **108–109**. dark theme `[26,28,33]`: delta **11–19**. light theme `[237,239,244]`: delta **2** | ≥3/255 RGB delta at seam | SUPERSEDED by run 2 (was **FAIL** (light theme only; PASS in both dark themes)) |
| 2 | 4 | Separator hairline present between rows | 1 | light theme `[237,239,244]`: 7 separators, each full-width at 107/107 sampled columns, peak seam `[209,210,215]` → max channel delta **29** (was 2). dark theme `[26,28,33]`: peak seam `[51,57,64]` → max channel delta **31** (was 11–19). Predicted-value corroboration: `color-mix(in srgb, currentColor 14%, transparent)` with `--text-default #20242c` over `[237,239,244]` computes `[208,211,216]`; measured `[209,210,215]`, agreement within ±1 — confirms the PASS is attributable to the new `color-mix` declaration actually painting, not to a theme change. | ≥3/255 RGB delta at seam | SUPERSEDED by run 3 (was PASS) |
| 3 | 4 | Separator hairline present between rows, re-confirmed on new theme backgrounds | 1 | near-black bg `[8,10,11]` seam `[41,47,49]` → max channel delta **38**; light bg `[237,239,244]` seam `[208,209,215]` → max channel delta **30**; 7 separators, 103/103 sampled columns. Four distinct theme backgrounds have now passed across runs 2 and 3 (deltas 29, 30, 31, 38). | ≥3/255 RGB delta at seam | PASS |
| 1 | 4 | Separator absent after last row | 1 | max channel delta below the final row = **2**, measured in dark `[26,28,33]` where a present separator reads 11–19 | <3/255 RGB delta below last row | PASS |
| 1 | 5 | Icon height vs. target 19.2px | 1 | Steam **19.0 × 19.0**; GOG **19.0 × 17.5** (viewBox 34:31 in a square box → 19.2 × 31/34 = 17.5) | ±2 CSS px | PASS |
| 1 | 5 | Icon top-edge alignment to title, 1-line row | 1 | deltas **−1.5 to −3.5** across 8 rows | ±2 CSS px | INCONCLUSIVE — metric compares an icon BOX top to a glyph INK top; ~2–3px is the expected internal-leading gap at 16px/1.2 |
| 1 | 5 | Icon top-edge alignment to title, 2-line row | — | no 2-line row exists (no title wraps) | ±2 CSS px | NOT ATTEMPTABLE |
| 1 | 6 | Icon colour, light theme | 1 | Steam `[57,59,64]` == `--text-secondary #393b41`. **GOG `[33,36,43]` ≠ `--text-secondary`** | matches `--text-secondary` resolved value | SUPERSEDED by run 2 (was **FAIL** (GOG; Steam passes)) |
| 2 | 6 | Icon colour, light theme | 1 | GOG glyph (Racine) ink `[57,59,64]`; Steam glyph (Paths & Danger) ink `[57,59,64]`; Steam glyph (Satellite Reign) ink `[57,59,64]`; `--text-secondary #393b41` = `[57,59,65]`. All three match the token within ±1 — GOG now matches Steam exactly. Fixed by the scoped `.humbleKeyRowStoreLogo .gogIcon { fill: currentColor }` escape (quick `260911-p6s`); `_colors.scss:101`'s global `.gogIcon` rule and `GamePage/index.css:619` deliberately untouched. | matches `--text-secondary` resolved value | SUPERSEDED by run 3 (was PASS) |
| 3 | 6 | Icon colour, light theme, re-confirmed on new sampled rows | 1 | GOG glyph (Racine) ink `[57,59,64]`; Steam glyphs (Darkest Dungeon, Satellite Reign, Dex) each ink `[57,59,64]`; `--text-secondary #393b41` = `[57,59,65]`. All four match the token within ±1 and are identical to each other. The bboxes independently corroborate the OPEN non-square-glyph todo (`2026-09-11-gog-logo-svg-renders-non-square-and-is-malformed.md`): GOG renders 19.0 × 17.5 against Steam's square 19.0 × 19.0. | matches `--text-secondary` resolved value | PASS |
| 1 | 6 | Icon colour, dark theme | 1 | Steam `[177,177,177]` == `--text-secondary #b1b1b1` | matches `--text-secondary` resolved value | PASS (Steam) |
| 1 | 7 | Title row / controls row left edge vs row list | 1 | controls row 220.5 vs row-list 220.0, spread **0.5** | ±2 CSS px agreement | PASS |
| 1 | 7 | Header row column boundaries vs data rows | 1 | tracks identical on header and rows: TYPE 220.0→324.0, GAME 340.0→1108.0, KEY 1124.0→1444.0 | ±2 CSS px agreement (shared with item 1/2) | PASS |
| 1 | — | Build command + exit status | — | `pnpm exec vite build && pnpm build:sidecar-sea && pnpm build:decompress-worker-dev && pnpm exec tauri build` → **exit 0**, 2026-09-11T04:40:26Z | release build, no `--debug` | PASS |
| 1 | — | Bundle path recovered | — | `GameLib_0.7.0_aarch64.dmg` → `$SESSION/GameLib.app`; `gamelib-shell` sha256 `92e31568…f3d08` identical to `target/release/gamelib-shell` | `.app` from DMG, hash-verified | PASS |
| 1 | — | `pgrep` count, before first launch | — | 0 (asserted twice) | 0 | PASS |
| 1 | — | `pgrep` count, while running (each launch) | 1 | 1 throughout; PID 50567 unchanged across the whole session | 1 | PASS |
| 1 | — | `pgrep` count, after final quit | — | **app was not quit** — session left running at the operator's discretion | 0 | NOT PERFORMED |
| 1 | — | Closing inventory, zero-length files | — | none (24 evidence files, all non-zero) | none | PASS |
| 2 | — | Build command + exit status | — | `pnpm exec vite build && pnpm build:sidecar-sea && pnpm build:decompress-worker-dev && pnpm exec tauri build` → **exit 0** | release build, no `--debug` | PASS |
| 2 | — | Bundle path recovered | — | `GameLib_0.7.0_aarch64.dmg` (101,411,459 bytes) → `$SESSION/GameLib.app`; `gamelib-shell` sha256 `1cd1e843…3f5a` identical on both sides; `bundle/macos/` confirmed emptied by tauri's own cleanup step (P3) | `.app` from DMG, hash-verified | PASS |
| 2 | — | `pgrep` count, before first launch | — | 0, `p1-precondition.log` | 0 | PASS |
| 2 | — | `pgrep` count, while running (each launch) | 1 | 1 (window CGWindowID 4428, 1280x800 pt, launch showed exactly 1 instance) | 1 | PASS |
| 2 | — | `pgrep` count, after final quit | — | the run-2 provenance evidences no post-quit `pgrep` — not invented as a PASS | 0 | NOT RECORDED (run 2) |
| 2 | — | Closing inventory, zero-length files | — | the run-2 provenance evidences no closing inventory — not invented as a PASS | none | NOT RECORDED (run 2) |
| 3 | — | Build command + exit status | — | `pnpm exec vite build && pnpm build:sidecar-sea && pnpm build:decompress-worker-dev && pnpm exec tauri build` → **exit 0** | release build, no `--debug` | PASS |
| 3 | — | Bundle path recovered | — | `.app` recovered from the DMG; `bundle/macos/` emptied by tauri's own cleanup step (P3); `gamelib-shell` sha256 `50d3c940d9aa007325d60b31d85997bc121759d52505eb145c65c5a1b54c3211` identical on both sides (P4); DMG 101,415,126 bytes | `.app` from DMG, hash-verified | PASS |
| 3 | — | `pgrep` count, before first launch | — | 0, `p1-precondition.log` (the run-2 instance, PID 61734, was quit by the orchestrator) | 0 | PASS |
| 3 | — | `pgrep` count, while running (each launch) | 1 | 1, window CGWindowID 4705, 1280x800 pt, captures 2560x1600, SCALE 2.0000 exact; P2 release build, no `--debug` | 1 | PASS |
| 3 | — | P5 sync | 1 | `Humble sync finished: gamekeys=34 fetched=6/6 frozen=28 ok=6 schema_error=0` (19:57:13) — the same 34 keys as runs 1 and 2, so all three runs are like-for-like | non-empty synced list | PASS |
| 3 | — | Alignment declarations present in the embedded renderer bundle, confirmed BEFORE measuring | — | All three of `e344f589d`'s declarations (`align-items: flex-start` on `.humbleKeyGameCell`, `text-align: start` on `.humbleKeysColumnHeader`, `text-align: start` on `.humbleKeyRowTitle`) confirmed present in `build/renderer` before any measurement was taken. This row exists because run 1's verdict was undermined by a build that predated a fix (`d60fcc85c`, missing `2c68c17fe`) — this pre-measurement check is the countermeasure that closed that hole, and it is what makes run 3's numbers trustworthy. | fix present in the measured build | PASS |
| 3 | — | `pgrep` count, after final quit | — | the run-3 provenance evidences no post-quit `pgrep` — the app is still running (PID 70156) at the operator's discretion, per this plan's own hard constraint not to touch it — not invented as a PASS | 0 | NOT PERFORMED (run 3) |
| 3 | — | Closing inventory, zero-length files | — | the run-3 provenance evidences no closing inventory — not invented as a PASS | none | NOT RECORDED (run 3) |

**Historical run-2 census** (post run-1+run-2 edit, before run 3 was transcribed; retitled here,
numbers kept verbatim, so this document does not carry two live counts):

```
awk '/^## Verdict/,/^### Note on item/' 43-LIVE-GATE.md | grep '^| ' \
  | awk -F'|' '{print $(NF-1)}' | sed 's/^ *//;s/ *$//' | sort | uniq -c | sort -rn
```

     19 PASS
      3 NOT ATTEMPTABLE
      3 **FAIL**
      2 NOT RECORDED (run 2)
      1 SUPERSEDED by run 2 (was NOT ATTEMPTABLE)
      1 SUPERSEDED by run 2 (was **FAIL** (light theme only; PASS in both dark themes))
      1 SUPERSEDED by run 2 (was **FAIL** (GOG; Steam passes))
      1 Result
      1 PASS (Steam)
      1 NOT PERFORMED
      1 NOT OBSERVED
      1 INCONCLUSIVE — metric compares an icon BOX top to a glyph INK top; ~2–3px is the expected internal-leading gap at 16px/1.2

`PASS` (19) and `PASS (Steam)` (1) are both PASS — the item-6 dark-theme row's cell text differs
only because it names which glyph passed, not because its verdict differs. Excluding the header
row (`Result`, 1) and the three `SUPERSEDED …` buckets (1 + 1 + 1 = 3): **20 PASS / 3 FAIL across
23 scored.** 6 further rows are unscored and dispositioned: 3 NOT ATTEMPTABLE, 1 NOT OBSERVED,
1 INCONCLUSIVE, 1 NOT PERFORMED, plus 2 NOT RECORDED (run 2) counted separately.

**This matches the planner's cross-check prediction of 20 PASS / 3 FAIL across 23 scored exactly.**
An earlier hand-computed draft of this section (before this awk command was actually executed
against the edited table) miscounted the FAIL bucket as 5 rather than 3, by double-counting the
`SUPERSEDED` rows into the FAIL total instead of excluding all three of them. Running the plan's
own command, verbatim, against the file as committed produces the number above; per the plan's own
instruction ("if your count differs, your count is the answer"), the executed command's output —
not any hand arithmetic — is what this VERDICT line reports.

> **SUPERSEDED BY RUN 3 — this is the historical run-1+run-2 verdict, NOT the current one.**
> The current verdict is the `**VERDICT:**` line further down this document (run 1 + run 2 + run 3
> combined). This block is preserved unedited as the record of how the run-2 verdict was reached
> and recounted; it is not deleted, because the counting-discipline note above it is the evidence
> that the recount was executed rather than hand-derived. Note that the `ready: human` todo it
> cites below has since been RESOLVED (the operator decided left-alignment on 2026-09-11) and the
> three FAIL rows it reports are now all `SUPERSEDED by run 3` with PASS.

**VERDICT (SUPERSEDED, run 1 + run 2 only): FAIL — 20 PASS / 3 FAIL across 23 scored sub-checks
(`SUPERSEDED` rows excluded).** 6 further sub-checks are unscored and explicitly dispositioned: 3 NOT ATTEMPTABLE,
1 NOT OBSERVED, 1 INCONCLUSIVE, 1 NOT PERFORMED, plus 2 NOT RECORDED (run 2).

**Phase 43 does not close on this verdict.** Three FAIL rows remain, and all three trace to the
same single cause: the inherited `.App { text-align: center }` rule (`src/frontend/App.css:24`).
Item 3 fails twice (GAME column, logo row and no-logo row, run 1) and item 2 fails once (KEY
column, run 2) — three sub-checks, one root cause, tracked as an open `ready: human` design-decision
todo (`2026-09-11-humble-keys-game-titles-are-centre-aligned-by-inherited-app-rule.md`), not a
defect with an obvious code fix. The other two run-1 FAIL rows (item 2 side-by-side pair, item 6
GOG colour) are the ones run 2 superseded to PASS and no longer block anything. Phase 43 closes
once a human decides whether centring is intended (restate the two gate items' metric against
track boundaries) or accidental (add `align-items: flex-start` / `text-align: start` locally) —
see that todo for the two remedy paths.

**Run-3 census** (post run-3 edit, this document's live count — executed against the file as
committed, not predicted):

```
awk '/^## Verdict/,/^### Note on item/' 43-LIVE-GATE.md | grep '^| ' \
  | awk -F'|' '{print $(NF-1)}' | sed 's/^ *//;s/ *$//' | sort | uniq -c | sort -rn
```

```
     27 PASS
      3 SUPERSEDED by run 3 (was **FAIL**)
      3 NOT ATTEMPTABLE
      2 SUPERSEDED by run 3 (was PASS)
      2 NOT RECORDED (run 2)
      1 SUPERSEDED by run 2 (was NOT ATTEMPTABLE)
      1 SUPERSEDED by run 2 (was **FAIL** (light theme only; PASS in both dark themes))
      1 SUPERSEDED by run 2 (was **FAIL** (GOG; Steam passes))
      1 Result
      1 PASS (Steam)
      1 NOT RECORDED (run 3)
      1 NOT PERFORMED (run 3)
      1 NOT PERFORMED
      1 NOT OBSERVED
      1 INCONCLUSIVE — metric compares an icon BOX top to a glyph INK top; ~2–3px is the expected internal-leading gap at 16px/1.2
      1 **FAIL**
```

`PASS` (27) and `PASS (Steam)` (1) are both PASS, for the same reason as the run-2 census above.
Excluding the header row (`Result`, 1) and every `SUPERSEDED …` bucket (3 + 2 + 1 + 1 + 1 = 8):
**28 PASS / 1 FAIL across 29 scored.** 10 further rows are unscored and dispositioned: 3 NOT
ATTEMPTABLE, 1 NOT OBSERVED, 1 INCONCLUSIVE, 1 NOT PERFORMED, 1 NOT PERFORMED (run 3), 1 NOT
RECORDED (run 3), plus 2 NOT RECORDED (run 2).

**This matches the plan's own stated expectation: "one remaining FAIL (item 3) is the
expectation."** The count agrees — the single surviving `**FAIL**` row is item 3's new
header-vs-titles sub-check (335.5 vs 340.0–341.0, divergence 5.5, EXCEEDS ±2). Per the same
counting discipline as the run-2 census: the executed command's output, not hand arithmetic, is
what this line reports, and here the two agree.

**VERDICT: FAIL — 28 PASS / 1 FAIL across 29 scored sub-checks (run 1 + run 2 + run 3 combined,
`SUPERSEDED` rows excluded).** 10 further sub-checks are unscored and explicitly dispositioned: 3
NOT ATTEMPTABLE, 1 NOT OBSERVED, 1 INCONCLUSIVE, 1 NOT PERFORMED, 1 NOT PERFORMED (run 3), 1 NOT
RECORDED (run 3), plus 2 NOT RECORDED (run 2).

**Phase 43 does not close on this verdict.** The three FAIL rows the run-2 verdict carried —
item 3 twice (GAME column, logo row and no-logo row, run 1) and item 2 once (KEY column, run
2) — are now all `SUPERSEDED by run 3` with PASS, resolved by `e344f589d`'s alignment fix (items
2 and 4 and 6 also flipped from PASS-with-old-evidence to PASS-with-run-3-evidence, since run 3
re-measured them under the same build). **One new FAIL row remains, and it is not the same
defect**: item 3's `GAME` column header label sits 5.5 CSS px left of the row titles it labels
(335.5 vs 340.0–341.0), a small, previously-masked offset that the 216.5 px centring spread hid
until `e344f589d` shrank it away. This is tracked as an open `ready: code` todo
(`2026-09-11-humble-keys-game-column-header-label-sits-5px-left-of-row-titles.md`), not the
`ready: human` design-decision todo the run-2 verdict pointed at — that todo's centring question
is now moot, since titles agree with each other to 1.0 CSS px and no longer diverge by alignment
choice. Phase 43 closes once the header offset's cause is established (a `tauri:dev` DOM
inspection, per that todo) and fixed.

### Note on item 3's run-1/run-2 FAIL rows (now SUPERSEDED) and item 3's new run-3 FAIL row — the metric failed, the property did not

**As of run 3, every FAIL row this note originally discussed is `SUPERSEDED by run 3` with PASS.**
`e344f589d` fixed the `.App { text-align: center }` inheritance this whole note is about — item
3's two run-1 rows and item 2's run-2 row are all superseded (see the Verdict table and the
run-3 census above). The analysis below is kept verbatim as the historical record of *why* those
three rows failed and *what property held anyway* while they did; it is no longer live scoring.
A distinct, much smaller FAIL survives item 3 under run 3 — see the paragraph after this note's
original text for that one.

Both item-3 FAILs (run 1) were against this contract's **stated metric** ("the title-text left edge on every
sampled row must agree within ±2 CSS px"). Scored honestly, they fail: the spread is 84.0 and 216.5.

The property item 3 exists to protect — *"the `GAME` column's left edge never shifts row to row"* —
**holds, and was measured**: the TYPE cell's content left edge is 220.0 and the KEY cell's is 1124.0
on **all 18 rows across both captures, spread 0.0**, including the no-logo `generic` row (220.5,
spread 0.5). The grid tracks are immovable.

The two diverge because the GAME titles are **centre-aligned**, so their left edges track title
length while the column box stays put. All 18 title centres land within **723.3..724.0** against a
track centre of 724.0 (spread 0.7). Cause: `.App { text-align: center }`
(`src/frontend/App.css:24`) is inherited app-wide; `.humbleKeyColumnCell` defends itself with
`align-items: flex-start`, `.humbleKeyGameCell` does not. Title-text left edge is only a valid
proxy for column left edge under left alignment, which the Column Geometry Contract never asserts.

Recorded as FAIL rather than silently re-scored against the friendlier metric. Whether centred
titles are intended is a design decision, not a gate outcome.

**Run 2's item-2 FAIL is the same rule, a second time, in a different column.** Once the
side-by-side pair became reachable (`2c68c17fe`), the contract's literal metric for item 2 is the
`"Key"` header label's left edge against the column content's left edge — and those diverge for
the same structural reason as item 3: `.humbleKeyColumnCell` (the header cell) inherits
`.App { text-align: center }` with no local `align-items: flex-start` override for its label, while
the content rows below it are left-aligned by their own row layout. Measured: 7 sampled KEY-column
content shapes all start at **934.0**, spread **0.0** — the column box itself is exactly as
immovable as items 1 and 7 already proved. The `"Key"` header label centres inside its own track
(934.0→1254.0, width 320.0, centre 1094.0) at left edge **1085.5** — 8.5 px left of true centre,
consistent with variable glyph width around a centred anchor, not with any left-alignment. Divergence
from the content's 934.0 is **151.5 CSS px**, far outside the ±2 px threshold. This was scored FAIL
against the literal header-vs-content metric, matching how item 3 was handled — **not** re-scored
against the friendlier content-vs-content metric (934.0 vs 934.0, spread 0.0, which would trivially
PASS) after seeing that number. Same root cause as item 3, same disposition: a design-decision
todo, not a code defect with an obvious fix.

**Run 3's item-3 FAIL is a different rule, not the same one recurring.** With the centring defect
gone, run 3 remeasured title-to-title agreement directly: six titles in `capture-2-top.png` land
340.0–341.0, spread 1.0 CSS px, comfortably inside ±2 — and the run-3 ADDENDUM sample (nine more
rows from `capture-3-gog.png`, covering the GOG-logo and no-logo TYPE-cell shapes the first
sample lacked) confirms the same spread across 15 rows, two themes, three TYPE-cell shapes. That
sub-check now PASSes and is recorded as its own row rather than folded into a superseded one. What
remains is a **new** sub-check this document could not previously attempt: the `"Game"` header
label's own left edge (335.5) against those now-converged title left edges (340.0–341.0) — a
divergence of 5.5 CSS px, still outside ±2. This was scored against that literal per-row metric,
**not** re-scored against the friendlier title-to-title number that had just passed — the same
discipline this note already applied twice above. Cause is not established (see the todo,
`2026-09-11-humble-keys-game-column-header-label-sits-5px-left-of-row-titles.md`); the header is
three plain `<span>` grid items (`Keys/index.tsx:634-638`) while the title is a plain `<span>` with
no padding (`HumbleKeyRow/index.tsx:729`), so no obvious markup asymmetry explains it. Filed as a
`ready: code` todo, distinct from the (now-moot) `ready: human` centring todo the run-1/run-2 rows
pointed at.

---

## Declared deviations from this document's own protocol

1. **Measurement method.** Step 8 prescribes dragging a selection in Preview.app and sampling with
   Digital Color Meter. Every x-coordinate and RGB value above was instead read **programmatically**
   from the saved PNGs (`upng-js`). Same pixels, same thresholds, but deterministic and
   re-verifiable by anyone from `capture-*.png` — no hand-drag error term. The GUI method was also
   not merely inconvenient but unusable for part of the run (see defect 4).
2. **P8 (one sync) could not be honoured.** See defect 1.
3. **P9 (theme switch = new launch ordinal) was not honoured.** The operator changed theme twice
   mid-session (dark `[20,23,41]` → light → dark `[26,28,33]`) without the run being paused, so no
   new ordinal was opened and `gamelib.log` was not re-archived per switch. **No item was scored
   across a switch** — items 1/2/3/7 come from capture 1 alone, item 4's light row is explicitly
   labelled by theme — so no measurement is contaminated, but the protocol step was skipped and is
   recorded as skipped rather than quietly satisfied.
4. **The app was not quit**, so the closing `pgrep == 0` assertion is NOT PERFORMED.

### Run-2-scoped deviations (20260911T062945Z, quick task 260911-qds)

5. **P5's "one sync" came from automatic startup, not the refresh control.** As in run 1's deviation
   2 / defect 1, `GlobalState.componentDidMount()` fires a sync at launch before any operator action
   is possible. Run 2 did not additionally trigger a manual sync (run 1 did, and hit the same
   P5/P8 conflict twice). The contract's *intent* — measure against library data that reflects a
   completed sync, not a stale/empty pre-sync state — is satisfied: the sync that ran was allowed to
   finish before any capture. The letter of "trigger a sync from the refresh control" was not
   honoured, same underlying defect as run-1 defect 1, not re-litigated here.
6. **`osascript`/System Events remained unusable for window geometry**, confirming run-1 defect 2
   independently on this session's process. `gamelib-shell` again reports 0 AX windows via System
   Events regardless of process-name correction. Window geometry was obtained via CoreGraphics/JXA
   (`ObjC.castRefToObject` bridging `CGWindowListCopyWindowInfo`'s CFArray into JXA-usable objects),
   not the GUI-scripting path the contract prescribes. Recorded because **a zero window count from
   this probe is not evidence of absence of the window** — it is evidence the probe cannot see AX
   windows in this app at all, a distinction the contract's own language does not draw and a future
   reader must not mistake for "no window was open."
7. **Window-ID capture succeeded this run with the target window on a different Space than the
   operator's terminal**, directly contradicting run-1 defect 4's finding that
   `screencapture -l <windowid>` fails with *"could not create image from window"* across Spaces.
   Run 2 used `screencapture -l 4428` (the CGWindowID obtained via the CoreGraphics/JXA path in
   deviation 6) successfully with GameLib's window on a Space other than the active one. **Run-1's
   defect-4 text is left intact above, unedited** — this entry records the contradiction as an
   open question, not a correction: the two runs may differ in wry/WKWebView window backing-store
   behaviour, in which Space each was "active" at capture time, in some other environmental variable
   neither run captured, or run 1's finding may itself have been an artifact of a transient state.
   No claim is made here about which run is "correct"; a future contract revision should treat
   `screencapture -l` reliability across Spaces as unresolved, not as fixed by this run.
8. **Item 6's light-theme colour measurement used the in-app search box** to isolate the three
   sampled rows (Racine, Paths & Danger, Satellite Reign) rather than scrolling, since the
   full unfiltered list no longer fit the visible capture area after the gift-gate fix added a
   second control to the Asguaard row. This stays within P7 (no DevTools, no non-UI state
   mutation) — the search box is ordinary in-app UI, and filtering does not alter row rendering,
   only row inclusion.

### Run-3-scoped deviations (20260911T075450Z, quick task 260911-s4f)

Numbering continues from run 2, which used 5-8 above (four items, not three) — the plan text
that authored this task predicted run 3 would start at 8; the document's actual tail is 9.

9. **The app launched to the Library tab, not Humble Keys**, so the operator navigated manually;
   `capture-1-probe.png` documents the launch state.
10. **"Redeemable keys only" was turned OFF** for the item-3 sample, so the row set would be
    large and title lengths varied.
11. **Item 6 again used the search box** to surface Racine — filtering, not shape manufacture, so
    within P7 (which prohibits ownership-override clicks, not filtering). Reprises the same
    run-2 deviation (8) above.
12. **Items 2 and 3 were measured in a near-black theme while items 4 and 6 were measured in a
    light theme**, because 2 and 3 are geometry and theme-independent whereas 4 and 6 are colour.
    No item was scored across a theme switch.

## Contract defects found BY this run

These are defects in **this document**, not in the software under test. All four run-1 defects
below survived the 34-row Structural Reachability Review, and three share one blind spot: the
review verified that the *things being measured* were reachable, never that its own *instructions
would execute*.

1. **P5 and P8 are mutually unsatisfiable.** P5 mandates triggering a sync from the app's refresh
   control; `GlobalState.componentDidMount()` (`GlobalState.tsx:1716`) has always already run one
   at launch. Every possible run of this contract produces ≥2 syncs, so P8 ("exactly one sync") can
   never hold. Measured live: syncs finished 16:42:06 (automatic, `origin=mount`) and 16:43:21
   (operator). Harmless here — both preceded every screenshot, and the two summary lines are
   byte-identical — but P8 needs rewriting to "no sync after the first measurement".
2. **Step 8's bounds command cannot work.** It names process `"GameLib"`; System Events knows the
   process as **`gamelib-shell`** and errors `-1719` as written. Correcting the name does not
   rescue it: AX reports **0 windows** for the wry window in either case. Window bounds must come
   from CoreGraphics (`CGWindowListCopyWindowInfo`), which returned them immediately.
3. **Item 2's "side-by-side pair" was never reachable.** Not library-specific — structural, for
   every key and every user. The review's Test 7 rows checked shape reachability against *this
   operator's data* and correctly flagged `login-and-claim` and the override shapes, but never
   asked whether the pair was reachable **at all**. Fixed after the run in `2c68c17fe`.
4. **The prescribed measurement method is unusable across Spaces.** With the app on a different
   macOS Space from the operator's editor, `screencapture -l <windowid>` fails with *"could not
   create image from window"* (a window on an inactive Space has no readable backing store) and
   region capture only ever sees the active Space. Any future contract must either require both
   windows on one Space or specify a timed/burst capture. **See run-2 deviation 7 above: this
   finding did not reproduce on the next run**, under conditions this document did not capture
   closely enough to say whether they differed.

### Run-2-scoped contract defect (20260911T062945Z, quick task 260911-qds)

5. **`claim-and-gift` is `resolveKeyScenario`'s fall-through default, not a dedicated branch.**
   `resolveKeyScenario()` (`HumbleKeyRow/index.tsx:210-278`, full path
   `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx`) gates the `gift-only`
   branch on `isGiftableSpare` (`:256`, requiring `ownedElsewhere && UNREVEALED`) but has no
   equivalent named condition for the side-by-side pair — `claim-and-gift` is simply what the
   function returns at `index.tsx:277` (`return 'claim-and-gift'`) when none of the earlier `if`
   branches matched. This was proven
   live via the Alchemy VTT row, which this document's own P6 Structural Reachability Review
   inventory (Test 7) never flagged, because Test 7 checks named `HumbleKeyScenarioId` values
   against the operator's library data, not against the function's control-flow structure — a
   fall-through default has no name to search the inventory for. Consequence for this contract:
   **item 2's side-by-side pair could not be found through the prescribed P6 shape-inventory
   process at all**, in either run. Run 2 located it only by direct pixel observation of the
   Asguaard row after the gift-gate fix (`2c68c17fe`) made it visible, not by consulting the
   inventory. A future revision of P6 needs a control-flow read of `resolveKeyScenario`, not just a
   data census against its named branches, to catch scenarios reachable only via fall-through.


### Run-3-scoped contract defect (20260911T075450Z, quick task 260911-s4f)

`measurements-run3.md` surfaced no new defect in this document itself. Run 3 exposed a defect in
the *software under test* (the GAME header offset, now filed as
`2026-09-11-humble-keys-game-column-header-label-sits-5px-left-of-row-titles.md`), but nothing
in the run 3 evidence points at a flaw in this contract's own preconditions, evidence-capture
protocol, or Structural Reachability Review — recorded here as a finding, not an omission.
