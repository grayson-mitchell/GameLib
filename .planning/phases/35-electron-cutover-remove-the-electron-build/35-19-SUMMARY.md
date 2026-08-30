---
phase: 35-electron-cutover-remove-the-electron-build
plan: 19
subsystem: verification
tags:
  [live-gate, packaged-build, macos, deep-link, wake-lock, store-accounts, D-16, REQ-35-20]

# Dependency graph
requires:
  phase: 35-electron-cutover-remove-the-electron-build
  provides: "35-18's package.json/esbuild electron removal — the packaged artifact this gate measures could not exist until the electron devDependency and the --external:electron alias were gone"
provides:
  - "35-LIVE-GATE.md RUN — 20 of 21 criteria measured against the PACKAGED macOS arm64 .app (16 PASS / 4 FAIL / 1 NOT ATTEMPTED)"
  - "The standing 34.6 Step 8 FAIL is DISCHARGED (criterion 21), closing 35-09's outstanding Task 3 and 35-VALIDATION row 35-09-03"
  - "F-35-08-A / D-35-08-02 re-measured on a PACKAGED artifact for the first time — it REPRODUCES (criterion 16)"
  - "35-AB-RETEST.md item 3 (openDialog missing from LONG_RUNNING_CHANNELS, BLOCKS D-16 GATE) re-discharged against the packaged release build (criterion 13)"
  - "D-08 / REQ-35-06 discharged live — the wake lock is a real IOKit assertion, no longer Phase 33's -1 no-op (criterion 15)"
  - "15 new deferred items D-35-19-01..15, including two latent data-loss/user-facing defects"
affects: [35-phase-verification, deferred-items, 35-VALIDATION]

# Tech tracking
status: NOT COMPLETE — success_criteria UNMET
---

# Phase 35 Plan 19 — Blocking Live Gate: Run Summary

## Verdict

**The plan is NOT COMPLETE.** Its `success_criteria` requires *"Every `Observed:` field filled with
what was actually seen, following 34.18-LIVE-GATE.md precedent: 21/21, no blank fields."* The run
reached **20/21**. Criterion 17 was never measured.

This is recorded as a failure rather than closed over, because this repo has the documented pattern
where *a plan's task criteria all pass while its `success_criteria` fails*
(`task-criteria-can-all-pass-while-success-criteria-fails` — the 35-08 gate went 5/5 green over a
live defect). Task-level work here did complete; the plan's own bar did not.

| | count |
| --- | --- |
| PASS | 16 |
| FAIL | 4 (criteria 6, 10, 14, 16) |
| NOT ATTEMPTED | 1 (criterion 17) |
| blank fields | 0 |

## The headline result

**All four FAILs trace to pre-existing or upstream-inherited code. Not one was introduced by the
Electron cutover.** That is the question D-16 existed to answer, and it is answered — but note the
gate answered it by *finding four real defects*, not by finding nothing.

| criterion | defect | origin |
| --- | --- | --- |
| 6 | Steam launches never record a recent game | architectural (protocol handoff); introduction point NOT established |
| 10 | `RUNNERS` enum omits `steam`, so deep links can never resolve a Steam title | upstream Heroic `7ba121ec5f`, 2025-01-10 |
| 14 | `installed.json` watcher updates backend state but never the renderer | upstream Heroic `82ec176c7`, 2022-11-22 |
| 16 | F-35-08-A: a "download is in progress" assertion outlives its download | inherited caller logic; 35-08 made a latent bug live |

## What the gate discharged

- **The standing `34.6` Step 8 FAIL** — Epic logout now requires credentials (criterion 21). Also
  closes 35-09's outstanding Task 3 and `35-VALIDATION.md` row `35-09-03`.
- **`35-AB-RETEST.md` item 3** (`openDialog` missing from `LONG_RUNNING_CHANNELS`, marked
  `TAURI-ONLY` / `BLOCKS D-16 GATE`) — re-discharged against the packaged release artifact, which the
  prior discharge was never measured against (criterion 13).
- **D-08 / REQ-35-06** — the wake lock was verified as a real IOKit assertion held and released, not
  Phase 33's no-op that returned `-1` and held nothing (criterion 15).
- **F-35-08-A / D-35-08-02** — measured on a packaged artifact for the first time. It **reproduces**;
  it is not a dev-build artefact (criterion 16).

## Defects found (15 deferred items, D-35-19-01 .. D-35-19-15)

Ranked by what should be fixed first:

1. **D-35-19-08 — latent data loss.** `utils.ts:1287` tests move success as `code !== 1`, then
   `rm -rf`s the source install. rsync's 2/10/11/12/**23**/24/30 all read as success — a partial
   transfer would delete the original. It did not fire only because openrsync happens to exit 1 on a
   bad flag.
2. **D-35-19-07 — move-install is broken for every macOS 15+ user.** macOS ships openrsync, which
   rejects **two** of the flags (`--no-human-readable`, `--info=name,progress`). The second is
   load-bearing: the progress parser reads that exact format. The existing `mv` fallback never
   engages because its guard is `which rsync`, which succeeds.
3. **D-35-19-13 — Epic library never refreshes at startup.** A race: the refresh runs while
   connectivity is still `'check-online'`, so `isOnline()` is false and `isEpicServiceOffline()`
   returns "offline" without ever querying Epic (whose status API reports *operational*). Nothing
   retries.
4. **D-35-19-05 / D-35-19-09** — Steam absent from the deep-link runner enum; watcher never notifies
   the renderer.
5. **D-35-19-11 / -10 / -12** — wake-lock assertion anomalies (mislabelled system assertion,
   duplicate display assertion, `powerDisplayId` never reset).
6. **D-35-19-04** — bare `gamelib://` scheme routing does not deliver on the test machine; cause
   UNRESOLVED, needs a clean-machine retest. Criteria 10-12 worked around it with `open -a`, which is
   exactly what would mask it in production.

Resolved during the run: **D-35-19-01** (Keychain prompts were "Allow" vs "Always Allow", not a
defect) and **D-35-19-02** (sink 2 *is* alive when packaged; the residual is narrower — 55
`eprintln!` sites reach stderr only).

## Measurement problems found in the gate itself

These are findings *about the contract*, and matter as much as the defects:

- **Criterion 16's prescribed gesture cannot detect the defect it exists to catch.** With a game and
  a download both active the counts read 1 and 1 — the stated "best case" — because the `lock`
  guard's `!isSleepBlocked` suppresses the game's spurious acquire once the download holds one. A
  re-runner following the contract literally would record a **false PASS**. Only
  game-without-download, or download-finishing-under-a-game, exposes it.
- **Criterion 21 did not exercise what it was written to prove** (D-35-19-15). The
  `EPIC_COOKIE_HOSTS` widening exists for residual cookies on *non-primary* Epic domains; all four
  cleared **0**, meaning "none present", not "clear works". Only the primary domain — the case the
  old code already handled — exercised a real removal.
- **Criterion 13's sink did not exist on the instance it was to be measured on.** Its failure
  signature is a raw `eprintln!`; criteria 10-12 ran on an instance launched via `open -a`, which
  captures no stderr. The app had to be relaunched under a captured transcript first, and the
  positive control verified, before the criterion could mean anything.
- **A gate-created orphan nearly produced a false FAIL** (criterion 15). Killing the criterion-13
  instance orphaned a game launched by the criterion-11 deep link; it survived reparented to
  `launchd`, so the first wake-lock run showed a running game with no assertion. Caught only because
  the game's PID was *lower* than the app's.
- **`gamelib.log` truncates on every launch** (D-35-19-14), so cross-session absence checks against
  it are invalid. This is what made the criterion-15 confusion hard to see.

## Evidence-quality notes

Two PASSes are weaker than they look and are flagged in place so they are not cited as equivalent:

- **Criterion 20 (Epic durability)** proves credential *persistence* only, never server acceptance —
  Epic was never contacted (D-35-19-13). Its precondition also deviated: the Epic login was created
  during criterion 14 of this same run, not inherited from a prior session. A reviewer reading the
  precondition strictly should downgrade it to NOT ATTEMPTED; the facts to make that call are in the
  record.
- **Criterion 19 (Humble logout)** is the strongest of the four account criteria — genuine
  pre-existing state, server-accepted session (`fetched=7/7 ok=7 denied=0 expired=0`) 20 minutes
  before logout, and a cookie **census** (`verdict=SUPPORTED_NONEMPTY, total=9`) that makes its
  `cleared 0` self-interpreting. **That census is a ready-made fix for criterion 21's ambiguity and
  should be ported to the Epic path.**

## Deviations from the contract

| deviation | reason | recorded in |
| --- | --- | --- |
| Criteria 10-12 used `open -a <bundle>` instead of bare `open "gamelib://…"` | bare scheme routing never delivered on this machine; cause unresolved | criterion 11, D-35-19-04 |
| Criterion 15 used a GOG title, not criterion 4's Steam title | the wake-lock release lives in the post-session block criterion 6 proved Steam never reaches; using Steam would conflate two defects | criterion 15 |
| Criterion 19 run after 20 and 21 | its own text says "placed LAST among 18-19-20-21", contradicting its "criterion 18 immediately before" precondition | criterion 19 |
| Criterion 17 not run | requires the debug-packaged build; operator closed the run | criterion 17 |

The Steam wake-lock case and criterion 17's updater path are both **untested**, not passed.

## Follow-up required before this plan can close

1. Run criterion 17 against `pnpm tauri:dev:packaged`.
2. Re-test criterion 21 with non-primary Epic cookies seeded and *confirmed present* first
   (D-35-19-15) — without the confirm-present step the re-test reproduces the same vacuous zero.
3. Re-test D-35-19-04 on a clean macOS account or VM with a single registered GameLib.app.
4. Amend criterion 16's gesture sequence so it can detect F-35-08-A.

## Files modified

- `.planning/phases/35-electron-cutover-remove-the-electron-build/35-LIVE-GATE.md` — 21 `Observed:`
  and `Verdict:` fields filled; frontmatter `status`, `verdict`, `runner`, `session_dir` updated.
- `.planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md` — 15 items
  appended (D-35-19-01 .. D-35-19-15).

No production code was changed by this plan. Every defect above is recorded, not fixed.

## Task commits

`aef146502` (contract authored, prior session) · `4bc1f2bc4` · `d0ce9a672` · `25b508d8f` ·
`5ae5a6fed` · `939f9fa95` · `98766076c` · `82af35b67` · `9af097c64` · `c762d3e0f` · `2b9c0949d` ·
`39f3d145f` · `3a107d99c`
