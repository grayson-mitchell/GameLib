---
phase: 36
slug: login-to-steam-crossfade-and-explicit-login-in-flight-mitiga
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-20
---

# Phase 36 — Validation Strategy

Per-phase validation contract for feedback sampling during execution. Derived from
`36-RESEARCH.md` § Validation Architecture, and mapped onto the **consolidated 3-plan set**
(36-01 / 36-02 / 36-03). The retired 5-plan numbering does not appear here.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29 via `ts-jest` |
| **Config file** | `jest.config.js` (root, `projects` array); `src/frontend/jest.config.js` (the only project in scope for this phase) |
| **Quick run command** | `npx jest src/frontend/screens/Login` |
| **Full suite command** | `npm run test:ci` (= `jest --runInBand --silent`, `package.json:42`) |
| **Stylesheet check** | `npx sass --no-source-map src/frontend/screens/Login/index.scss /dev/null` |
| **Type / lint** | `npm run codecheck` (= `tsc --noEmit`, `package.json:38`) **and** `npm run lint` (`package.json:53`) |
| **Estimated runtime** | Quick: sub-second per source gate · Full suite: multi-minute |

> **Hard constraint:** the frontend jest project is `testEnvironment: 'node'` — **no jsdom, no
> React Testing Library, no component-mounting harness** (`src/frontend/jest.config.js:4-14`
> documents this deliberately). Every test in this phase is therefore a **source-shape gate**:
> `readFileSync` + `stripSourceComments` + regex, PRESENCE/ABSENCE-labelled. Nothing in this
> phase's automated suite can observe motion, paint order, cascade resolution, or whether a real
> click does nothing. That is exactly what the plan 36-03 BLOCKING human gate exists for.
>
> **Do not resolve this by installing `jest-environment-jsdom`.** A package install is excluded
> from auto-fix and requires a human package-legitimacy checkpoint — out of scope for this phase.
>
> **Every gate assertion must be RED-proven by mutation and the mutation reverted** (`git diff
> --quiet` before the next one), with the mutation text and observed Jest failure recorded in the
> executing plan's SUMMARY.md. This repo has four ledgered instances of a green gate that guarded
> nothing, and one of a gate that was non-vacuous and RED-proven yet measured the wrong property.

---

## Sampling Rate

- **After every task commit:** `npx jest src/frontend/screens/Login` (three gate files, sub-second)
- **After every plan wave:** `npm run codecheck` **and** `npm run lint` — this repo has a ledgered
  lesson that a verifier passing `codecheck` says nothing about CI lint (separate workflow, `tsc`-only)
- **Before `/gsd-verify-work`:** `npm run test:ci` full suite green, **then** the plan 36-03
  BLOCKING human gate discharged
- **Max feedback latency:** ~2 seconds (per-file quick run)

---

## Per-Task Verification Map

*Phase 36 has real REQ IDs, so rows map by REQ-ID rather than by decision ID.*

| Task ID | Plan | Wave | REQ | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-----|------------|-----------------|-----------|-------------------|-------------|--------|
| T1 | 36-01 | 1 | REQ-36-01 | T-34.4.2-41 | All 8 censused dismissal paths funnel through one handler; zero `navigate` remains | census grep + source gate | `test $(grep -c 'navigate' src/frontend/screens/Login/components/SteamLogin/index.tsx) -eq 0` | ✅ extend (`steamLoginWindowChrome.test.ts`) | ⬜ pending |
| T2 | 36-01 | 1 | REQ-36-01, REQ-36-02 | T-34.4.2-39, T-34.4.2-41, T-36-01 | Unmount removal and explicit guard land in the SAME task, so no unguarded window exists | source gate | `test $(grep -v '^\s*//' src/frontend/screens/Login/index.tsx \| grep -c 'disabled={oldMac \|\| loginInFlight}') -eq 6` | ✅ rewrite (`loginInFlightUiReachability.test.tsx`) | ⬜ pending |
| T3 | 36-01 | 1 | REQ-36-02, REQ-36-03 | T-36-04 | Motion is a CSS `transition`, so `App.css:116-127` can neutralise it; `pointer-events: none` is guard layer 2 | stylesheet compile | `npx sass --no-source-map src/frontend/screens/Login/index.scss /dev/null` | ✅ n/a (compile check) | ⬜ pending |
| T4 | 36-01 | 1 | REQ-36-04 | T-34.4.2-39, F-36-01, F-36-02 | Gate narrates the mechanism actually in force; Epic/SIDLogin exception carried forward; focusability premise pinned | source gate (**RED-proven**) | `npx jest src/frontend/screens/Login` | ✅ both exist | ⬜ pending |
| T5 | 36-01 | 1 | REQ-36-03 | T-36-04, T-36-05 | Three-way duration agreement compared by extracted value, not three literals | source gate (**RED-proven**) | `npx jest src/frontend/screens/Login` | ❌ new, created in-task | ⬜ pending |
| T1 | 36-02 | 2 | REQ-36-05 | T-36-07, T-36-09 | Append-and-supersede preserved; F-36-01 / F-36-02 entered as named accepted-and-open | doc gate | `grep -c 'Fourteenth update' .planning/phases/34.4.2-*/34.4.2-PLATFORM-SCOPE.md` | ✅ exists | ⬜ pending |
| T2 | 36-02 | 2 | REQ-36-05 | T-36-08, T-36-09 | Truth 8 amended additively only; closed gate's verdict untouched | doc gate | `grep -c 'REQ-36-0' .planning/REQUIREMENTS.md` | ✅ exists | ⬜ pending |
| T1 | 36-03 | 3 | REQ-36-02, REQ-36-03 | T-34.4.2-39, T-34.4.2-41, T-36-10 | Tiles genuinely unreachable under real clicks; guard releases on every exit path | **manual-only** + full suite | `npm run test:ci` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

**None — no separate Wave 0 required.**

The only test file that does not yet exist is
`src/frontend/screens/Login/__tests__/loginCrossfade.test.ts`, and plan 36-01 **authors it in
Task 5, in the same plan and wave as the source it covers**. No task in this phase carries a
`MISSING — Wave 0 must create ...` verify placeholder, because no task's automated verify depends
on a test file that will not exist when that task runs:

- [x] 36-01 T1 is verified by a census grep against source, not by a not-yet-written test.
- [x] 36-01 T2 is verified by a source grep, not by the gate that Task 4 rewrites.
- [x] 36-01 T3 is verified by a `sass` compile, not by the gate that Task 5 creates.
- [x] 36-01 T4 extends/rewrites two gates that **already exist**
      (`steamLoginWindowChrome.test.ts`, `loginInFlightUiReachability.test.tsx`).
- [x] 36-01 T5 creates the one new gate and runs it in the same task.

This matches the resolution recorded for phase 34.15: plans that author their tests in the same
task as the source need no separate Wave 0.

---

## Manual-Only Verifications

**ONE BLOCKING human gate (plan 36-03), 10 scored items plus a precondition.** The animation is the
phase's headline deliverable and the reachability guard's real behaviour is a runtime property —
neither is observable from a `testEnvironment: 'node'` source gate.

| Behavior | REQ | Why Manual | Test Instructions |
|----------|-----|------------|-------------------|
| The two surfaces **cross in flight** — panel exits upward while the Dialog enters upward, both on screen simultaneously | REQ-36-03 | No source gate can see motion or overlap. A sequential handoff would pass every automated assertion in this phase while being exactly the design the operator rejected on 2026-08-20. | Items 1 and 2: click the Steam tile; confirm direction is up for both and that the movements OVERLAP |
| `.loginBackground` artwork stays painted under the Dialog scrim | REQ-36-03 | Paint order and cascade outcome are invisible to a text gate. | Item 3: confirm the photograph is discernible behind the scrim; a flat grey field is a FAIL |
| The other five tiles are **genuinely dead, not merely dimmed** | REQ-36-02 | `disabled` here is a React prop consumed by a JS early return, not a DOM attribute; only a real click proves it holds. | Item 5: three separate real click attempts (Epic, GOG, Amazon) plus 5-6 Tab presses; each observed independently |
| The guard **releases** on the close path and on a post-success path | REQ-36-02 | A latch that never clears is T-34.4.2-41 realised; only a live run can show release. | Items 7 and 9 |
| No scrollbar or clipping from `translateY(-100%)` | REQ-36-03 | A rendering-level claim no source gate in this repo can verify — deliberately NOT pre-patched with `overflow: hidden`. | Item 4; if it fails, add the property with evidence in hand rather than blind |
| Motion reduction still works | REQ-36-03 | The `disableAnimations` override is a computed-style outcome. | Item 10: toggle Settings → Accessibility, confirm an instant swap |

### Forcing-procedure constraints (mandatory — carried from this project's ledger)

- **Build with `pnpm tauri:dev`, NEVER plain `tauri dev`** — the latter serves a **stale static
  bundle** and would show the pre-change UI while reporting success.
- **No DevTools-console steps.** The Tauri DevTools console **cannot be pasted into** on this
  platform; no gate step may require typing or pasting an expression into it.
- **Precondition first.** Confirm the window exists and the Login screen renders before scoring
  anything else. A blank or unreachable surface scores **BLOCKED, never PASS** — this repo has a
  ledgered instance of a UAT `pass` covering a surface that could not render at all.
- **One observation per row.** Each of the 10 items is scored independently; a row with two halves
  can hide a failing half behind a passing one (live instance: `G-D05-BOTTLENAME`).
- **Absence is not evidence.** An unperformable step is **NOT ATTEMPTED with a reason**, never
  softened to PASS and never inferred from a neighbouring item.
- **Arithmetic must reconcile:** PASS + FAIL + BLOCKED + NOT ATTEMPTED = 10, plus the precondition.
- Items **1, 2, 3, 5, 6 and 7 are mandatory passes**; the phase does not close without them.

---

## Validation Sign-Off

- [x] All `auto` tasks carry an `<automated>` verify command — 7 of 7 (the 8th task is the
      checkpoint, which carries `<automated>npm run test:ci</automated>` plus a `<human-check>`)
- [x] Sampling continuity: no 3 consecutive tasks without an automated verify — every task has one
- [x] Wave 0 covers all `MISSING` references — n/a, no `MISSING` references exist (see above)
- [x] No watch-mode flags; no full-E2E commands in per-task verifies
- [x] Feedback latency < 20s for every per-task command
- [x] Every gate assertion is required to be demonstrated RED against a deliberate mutation before
      being accepted green, with the mutation reverted and `git diff --quiet` confirmed — required
      explicitly in 36-01 Tasks 4 and 5
- [x] The three-way duration assertion compares **extracted values**, not three independent literal
      checks — so changing exactly one of the three sources goes red (the actual failure mode)
- [x] The focusability-premise assertion measures the property directly against `Runner/index.tsx`
      rather than routing the check through a landmark element
- [x] Manual-only items are confined to a single BLOCKING gate with a concrete forcing procedure
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** materialized 2026-08-20 during `gsd-plan-checker` blocker remediation, from
`36-RESEARCH.md` § Validation Architecture. Content is complete and mapped to the consolidated
3-plan set. `status` stays `draft` and flips to `approved` on the checker's re-run — this file does
not claim an approval that has not happened.
