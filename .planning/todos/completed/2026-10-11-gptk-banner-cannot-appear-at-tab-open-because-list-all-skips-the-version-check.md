---
created: 2026-10-10T22:49:00.000Z
title: GPTK environment banner (D-16) cannot appear at tab open - winetricks list-all never emits the unsupported-wine warning
area: winetricks
severity: medium
platform: macos
ready: code
found_by: "Phase 45 live gate 45-12 G6 (launch 1), 2026-10-10"
files:
  - src/backend/tools/index.ts
  - src/backend/tools/winetricksEnvironment.ts
  - src/backend/tools/winetricksOutputClassifier.ts
---

## Observation (operator, launch 1)

On first opening Alan Wake's Winetricks tab there was no banner and Show details read
`No output yet`. The banner appeared the moment the first `-q` install started (09:07:25 local)
with the correct copy, version 7.7, info styling, no dismiss control, and persisted afterwards.

## Measured cause

`recordUnsupportedWine` is fed only by classifying winetricks' own line
`warning: Your version of wine 7.7 is no longer supported upstream` (`UNSUPPORTED_WINE_RE`). That
line is printed by `winetricks_wine_setup`, but the script sets `export _W_wine_not_needed=1` for
every `list*` command except `list-installed` (script line 5471) and `winetricks_wine_setup` returns
before the version check (line 5119). A hand-run `winetricks list-all` under the same GPTK env
printed exactly one stderr line, `Executing cd ...`
(`/tmp/gamelib-gate-45-20261010T194049Z/probe-listall-gptk.stderr`).

So the tab-open `list-all` can never feed the banner; D-16's "visible on opening the tab" is
unreachable on this build. Options: derive the report from `wine --version` (the bottle's wine
binary is already known at `tools/index.ts` `wineBin`) at `list-all` time, or run a cheap
wine-touching winetricks command once per bottle open. The 45-LIVE-GATE.md contract note N11 and
G6's criterion assumed the opposite; the criterion stands as written and G6 is scored `issue`.

## Resolution (2026-10-11, quick 261011-iel, commits 3084aab25, bae7e3ea5)

(a) Mechanism: at list-all time, `runWithArgs` (`tools/index.ts`) now also runs
`Winetricks.checkWineVersion`, which calls `execFile(wineBin, ['--version'])` — no shell, the
list child's own env plus `WINEDEBUG=-all` — bounded at 5 s with `SIGKILL`, 16 KiB output, and
fired-and-forget exactly like the existing `checkDependencies` call. The resulting report reaches
the tab the same way an install-time report already does: a `winetricksQueueChanged` push, or a
direct `winetricksQueueState` read.

(b) Derivation: `parseWineVersionOutput`/`isUnsupportedWineVersion`
(`winetricksOutputClassifier.ts`) mirror winetricks' own steps exactly — script L5104/L5114's
sed-strip of the version line, then L5118's numeric (not string) comparison against the `,7.99`
threshold. For GPTK's `wine-7.7 (Game Porting Toolkit 1.1)` this yields the same `7.7` the
install-time warning already gave; a parity test checks the two derivations agree on one binary.

(c) Decision: a supported wine clears a stale record (writes `null`), rather than leaving a
record from a previously-open, older bottle in place for the rest of the sidecar's life. A
failed, timed-out, oversized, or unparseable probe changes nothing — absence of evidence is not
evidence, so only a definitive parse ever clears.

(d) Pins: `winetricksListAvailable.test.ts` adds `probes with the list-all child's wine binary,
args, and env`, `clears a stale record once the bottle is switched to a supported wine, and never
fires the listener on a no-op`, an unknown-never-clears test, a synchronous-throw test, and a
probe-bounds pin (`timeout: 5000`, `killSignal: 'SIGKILL'`, `maxBuffer: 16384`,
`encoding: 'utf8'`); the two pre-existing spawn-count pins there and in
`winetricksInstallLifecycle.test.ts` keep their original assertions verbatim and gained execFile
assertions alongside them. RED was observed both times before the matching GREEN: Task 1's RED
was 3 failing tests in `winetricksListAvailable.test.ts` (`unsupportedWineVersion` stayed `null`,
`mockExecFile` saw 0 calls); Task 2's RED was the clear-on-supported test's
`toHaveBeenCalledTimes(2)` failing with 1. Final GREEN: 127/127 across the 5 affected files.

(e) This fix is desk-verified only, not live-verified. `45-LIVE-GATE.md` G6 and `45-UAT.md` item 6
stay scored `issue` until an operator re-score on the next 45-12 live run: open Alan Wake's
Winetricks tab before starting any Apply in that launch, and record whether the banner is present
immediately, together with `wine64 --version` for that bottle.

(f) The gate file is deliberately left unannotated by this quick task: its dated run record is
its own text saying "the criteria above" were scored against the build as it stood that day, and
"nothing in `Results`" changes that after the fact — a re-score belongs to the next live run, not
a retroactive edit of a past one. `*-UAT.md`'s own item-shape convention makes a desk-only
re-score here the wrong place for it in any case.
