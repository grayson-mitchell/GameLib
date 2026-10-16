---
phase: 35-electron-cutover-remove-the-electron-build
plan: 29
subsystem: live-gate-rerun
tags: [live-gate, packaged-artifact, wake-lock, deep-link, tray, epic-logout, power-assertions]
requires:
  - phase: 35-electron-cutover-remove-the-electron-build (plans 35-20, 35-21, 35-23, 35-27)
provides:
  - "A re-run record per criterion in 35-LIVE-GATE.md, measured against a named build identity"
  - "REQ-35-20's zero-FAIL closure condition met on the packaged macOS arm64 artifact"
  - "A standing method correction: power-assertion criteria are scored by OWNING PROCESS, never by the system-wide counter"
  - "Three new deferred items (D-35-29-01/02/03) and one gate contract defect, raised by running the gate"
affects: [39, "any future live gate touching power assertions or Epic logout"]
tech-stack:
  - pmset -g assertions (owner-attributed scoring)
  - binarycookies on-disk jar read (product-external cookie evidence)
status: complete
completed: 2026-08-31
---

# Plan 35-29 — Live-gate re-run

## What this plan was for

Plan `35-19`'s blocking gate returned **FAIL — 17 PASS / 4 FAIL**. Four gap-closure plans then
landed code against those four FAILs. This plan re-ran only what the fixes touched: the four FAIL
criteria (6, 10, 14, 16), criterion 21's re-measure per `D-35-19-15`, and three regression checks
(4, 5, 15) on surfaces the fixes could plausibly have broken.

## Result

**8 criteria measured, 8 PASS, 0 FAIL, 0 NOT ATTEMPTED.** `REQ-35-20`'s zero-FAIL closure condition
is met.

**No `Expected` was softened.** Every FAIL cleared because code landed, not because the contract
moved. Build identity: `/Applications/GameLib.app`, `CFBundleShortVersionString 0.7.0`, `gamelib-shell`
bundle mtime `Aug 31 07:54:39 2026`.

| criterion | verdict | decisive evidence |
| --- | --- | --- |
| 4 regression | PASS | `SteamGame: launching appId 1124300 via steam://rungameid/1124300`; `35-21`'s allow-list did not break `steam://` |
| 5 regression | PASS **both halves** | menu rows + About opened; **zero** `tray About` WARN against a sink proven live (`10 -> 11 [shell]` lines across the window) |
| 6 | PASS | `games.recent` holds `{"appName":"1124300",...,"runner":"steam"}` AND the tray entry launched |
| 10 | PASS (qualified) | `startup protocol URL present` -> `Received gamelib://launch?appName=1124300` -> `steam://rungameid/` |
| 14 | PASS (UI half unobserved) | `[refreshLibrary] runner=legendary **origin=push**`, distinct from boot's `origin=mount` |
| 15 regression | PASS | held + released, correct parentage `gogdl 57763 -> 56212` |
| 16 | PASS | system assertion cleared **1-5s after** `Finished Installation`, gone for 110s, game still running |
| 21 | PASS on contract | `user.json` REMOVED; login **required credentials** |

## The three things worth carrying forward

### 1. The system-wide power-assertion counter is unusable — score by owner

`PreventUserIdleSystemSleep` was permanently non-zero from `powerd` **and from a `caffeinate`
belonging to the measuring agent's own tooling**, which respawned on a ~300s cycle across four pids
(`56484`, `57126`, `57622`, `57775`, `57893`). Scoring criteria 15/16 from the top-level counter
would have manufactured a **false FAIL**, repeatedly. All verdicts were taken from the **"Listed by
owning process"** section. This is now written into `35-LIVE-GATE.md` as standing practice.

### 2. Handle identity found what counts would have hidden

The plan required recording assertion HANDLES, not just counts. That requirement paid: at
download-end the display assertion's handle **changed** (`0x000518f900058ce9` ->
`0x0005193e00058d1e`, elapsed reset to `00:00:00`), revealing that `unlock()` — which has no
per-kind selector — drops **both** assertions and then re-acquires the game's. There is therefore a
sub-second window at download-end where display-sleep prevention lapses with a game still running.
Harmless in practice, invisible to a count-based reading, and now recorded.

### 3. This cycle's own fix does not work in the field

`D-35-19-15` prescribed porting Humble's cookie census to Epic logout. Plan `35-23` implemented it
correctly — and at logout it returns `UNSUPPORTED_OR_ERROR` on all five hosts, because the census
read requires a login window and **logout has none**. The clear path has a pristine-window fallback;
the census path does not. Filed as **`D-35-29-01`**.

Its unit tests pass: the no-window branch is asserted to *not break logout*, not asserted to
*produce evidence*. A test proving "the census never breaks logout" passes while the census never
works.

## Two self-corrections made during the run, recorded so the false readings are not inherited

- **A label defect that did not exist.** An intermediate reading suggested the emitted assertion
  label omitted its article and that the contract's `Expected` was wrong. `od -c` on the live
  assertion gives `"GameLib: a game is running"` — the contract is **correct**. Caught before it
  reached the gate document.
- **A fixture that could not have passed.** Criteria 15/16 were first attempted with a Steam title.
  A Steam launch bypasses `launchEventCallback`, so `libraryStatus` never sees `'playing'` and
  GameLib holds no assertion at all — the fixture was structurally incapable of producing the
  measured value. Re-derived from code before consulting the original run, which had made the same
  substitution for the same reason. Endless Sky (GOG) used instead.

## Deviations from the plan

- **Criterion 16(b) ordering.** The plan specifies download-first-then-game; the operator ran
  game-first-then-download. Accepted and recorded as **more** exposing: F-35-08-A was `unlock()`
  gated on the whole pending set being empty, so a game already running at download-end is exactly
  the state that used to strand the system assertion.
- **Criterion 21 seeding step — BLOCKED, no vehicle exists.** The Tauri build embeds no browser
  view (`WebviewUnavailablePanel.tsx:43`), so nothing can create a non-primary Epic cookie. Handled
  by taking an **independent on-disk jar read** instead, which confirmed the vacuous-zero condition
  *before* the gesture rather than discovering it after.
- **Criteria 5 and 21 run on a terminal-launched instance** to give criterion 5 a stderr sink.
  Verified this did not change the cookie jar under test (bundle-id-keyed jar written by that
  instance; process-name-keyed jar stayed stale).

## What this plan did NOT close

- **`D-35-19-15`** — the multi-domain Epic cookie widening remains unproven live, and is now known
  to be **unreachable-by-construction** on this build. Both closure routes were unavailable.
- **Criterion 10's AppleEvent path** — deep-link delivery proven via argv only.
- **Criterion 14's visible repaint** — backend and push proven; the paint was not observed.

## New items raised

`D-35-29-01` (census inert at logout) · `D-35-29-02` (residual primary-domain Epic cookies, cause
not established) · `D-35-29-03` (tray About window opens unfocused) · criterion 5 contract defect
(its `Sink:` names a file its `eprintln!`-only call sites cannot write to).

Two out-of-scope UI defects were filed as standing todos rather than absorbed, both deliberately
without `resolves_phase:` so Phase 35's completion cannot auto-close them.
