---
quick_id: 260819-m9f
slug: author-34-4-2-live-gate-rerun-6-contract
date: 2026-08-19
status: complete
phase_touched: 34.4.2
source_changed: false
requirements_ticked: [REQ-34.4.2-05]
---

# Summary: `34.4.2-LIVE-GATE-RERUN-6.md` authored, D-G4/D-G5 actioned

## What was done

**1. Authored `.planning/phases/34.4.2-*/34.4.2-LIVE-GATE-RERUN-6.md`** — the eighth blocking-gate
contract and deliberately the smallest in the phase's history: **five scored items (1, 2, 3(a), 4,
6(a)) in ONE continuous launch**, against RERUN-5's five items across five launches.
`verdict`/`run_date`/`items_passed` all `null`; every `Observed:`/`Verdict:` field empty.

**2. Actioned D-G4** — retired REQ-34.4.2-05 outright (`[x]`, RESOLVED-BY-RETIREMENT, explicitly
not delivered) and REQ-34.4.2-04's glyph half (box stays `[ ]`, its disconnect-route half is still
owed). Dropped sub-checks 3(b) and 3(c) as unfalsifiable against current source.

**3. Actioned D-G5** — item 6(b) inherited from RERUN-4's measured PASS rather than re-measured,
which retires **F-34.4.2-20** from a blocking contract defect to a standing note.

**4. Updated** `ROADMAP.md`'s status banner (the stale "Next: `/gsd-debug`" is struck and marked
discharged), `REQUIREMENTS.md` (REQ-04/-05 dispositions), and `deferred-items.md` (the full
decision record).

## Why the contract collapsed from five launches to one

- **3(c) alone justified a whole launch** and was guaranteed to pass: it asked an operator to
  relaunch the app to prove `GAMELIB_AUTOFILL_GLYPH=0` changes nothing, against an env var with
  **zero readers** in source. It never ran across eight gate attempts.
- **3(b)** grepped a transcript for three literals whose emitters do not exist in the binary.
- **6(b)** needed its own first-position launch and is already discharged.

What remains genuinely needs measuring, and all of it lives on one Humble login surface.

## The finding this authoring produced

**F-34.4.2-24 (NEW): every machine-evidence line number in RERUN-5 is stale.** The F-34.4.2-19 fix
moved `main.rs` by ~208 lines and `user.ts` by ~85; **10 of 14 cited locations drifted.** Copying
RERUN-5's citations forward would have pointed every evidence check at the wrong line while still
looking correct. All fourteen were re-resolved by grep and the drift table is inline in the
contract. Standing instruction added: re-resolve every quoted line number at authoring, never
inherit a predecessor's.

Two prior hazards were also promoted into contract rules: **F-34.4.2-21** (no sheet held open >8
minutes, under the 10-minute `LOGIN_WATCH_TIMEOUT_MS`; a self-closing sheet is the deadline firing,
not a defect) and the **LogWriter ordering caveat** (no PASS bar may depend on the on-disk order of
two sidecar lines).

## State after this task

| Requirement | Box | Owes |
|---|---|---|
| REQ-34.4.2-05 | `[x]` | Nothing — retired, mechanism deleted |
| REQ-34.4.2-04 | `[ ]` | Item 6(a), the disconnect route |
| REQ-34.4.2-09 | `[ ]` | A measured full-PASS gate run |

All other seven requirements were already ticked.

**Item 6(a) is the only never-measured behaviour in Phase 34.4.2.** F-34.4.2-12's fix
(`6bad86227`) has never been driven after a real login across eight gate attempts. Its precondition
— a completed Humble login — is exactly what F-34.4.2-19 was breaking, and that is now fixed.

## Verification

- **No source file was touched by this task.** Stated precisely, because
  `git diff --stat -- src src-tauri/src` is NOT empty at completion: it shows
  `src/backend/storeManagers/steam/__tests__/library.test.ts`, which belongs to a **concurrent
  session executing Phase 23.2-04** in this same repo (HEAD moved four commits during this task,
  `9083ed017` → `a1883b737`). That file is outside this task's scope, was never opened by it, and
  was deliberately left unstaged. This task's commit stages only its own four paths.
- All six prior gate documents byte-unchanged (`git status` shows none of them modified).
- Requirement boxes confirmed by grep: 04 `[ ]`, 05 `[x]`, 09 `[ ]`.
- All 14 literals re-resolved by grep against current source at authoring.

## Next

**A human operator session runs `34.4.2-LIVE-GATE-RERUN-6.md` on real macOS hardware.** No GSD
command advances this phase — `/gsd-execute-phase 34.4.2` finds zero incomplete plans, and the
`/gsd-debug` the roadmap previously named is discharged.

**If only one item gets run, run item 6(a).**
