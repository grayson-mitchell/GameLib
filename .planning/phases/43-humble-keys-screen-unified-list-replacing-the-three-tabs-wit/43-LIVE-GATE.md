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

## Verdict

**This section is authored empty. The author of this contract does not fill it in.** The operator
(plan 43-10 Task 2) fills every cell below from their own run, then plan 43-10 Task 3 transcribes
it verbatim into the `**VERDICT:**` line and disposes of the two folded todos accordingly.

| Item | Sub-check | Launch ordinal | Raw measurement | Threshold | Result (PASS/FAIL/NOT ATTEMPTED) |
|---|---|---|---|---|---|
| 1 | TYPE width, header vs. rows | | | ±2 CSS px agreement | |
| 2 | KEY width, shape: full-width button | | | ±2 CSS px agreement | |
| 2 | KEY width, shape: side-by-side pair | | | ±2 CSS px agreement | |
| 2 | KEY width, shape: bare text + text-link | | | ±2 CSS px agreement | |
| 2 | KEY width, shape: bare text, no control | | | ±2 CSS px agreement | |
| 2 | KEY width, shape: Pitfall-C disabled caption | | | ±2 CSS px agreement | |
| 3 | GAME left edge, logo row | | | ±2 CSS px agreement | |
| 3 | GAME left edge, no-logo row | | | ±2 CSS px agreement | |
| 3 | GAME left edge, UNPICKED row | | | ±2 CSS px agreement | |
| 3 | GAME title wraps (no overflow) on a long title | | | wraps, does not overflow its column | |
| 4 | Separator hairline present between rows | | | ≥3/255 RGB delta at seam | |
| 4 | Separator absent after last row | | | <3/255 RGB delta below last row | |
| 5 | Icon height vs. target 19.2px | | | ±2 CSS px | |
| 5 | Icon top-edge alignment to title, 1-line row | | | ±2 CSS px | |
| 5 | Icon top-edge alignment to title, 2-line row | | | ±2 CSS px | |
| 6 | Icon colour, light theme | | | matches `--text-secondary` resolved value | |
| 6 | Icon colour, dark theme | | | matches `--text-secondary` resolved value | |
| 7 | Title row / controls row left edge vs. row list | | | ±2 CSS px agreement | |
| 7 | Header row column boundaries vs. data rows | | | ±2 CSS px agreement (shared with item 1/2) | |
| — | Build command + exit status | | | release build, no `--debug` | |
| — | Bundle path recovered | | | `.app` from DMG, hash-verified | |
| — | `pgrep` count, before first launch | | | 0 | |
| — | `pgrep` count, while running (each launch) | | | 1 | |
| — | `pgrep` count, after final quit | | | 0 | |
| — | Closing inventory, zero-length files | | | none | |

The overall `**VERDICT:**` line itself is intentionally absent from this document — Task 3 adds it,
reading `PASS` or `FAIL n/m`, once the table above is filled from the operator's report.

