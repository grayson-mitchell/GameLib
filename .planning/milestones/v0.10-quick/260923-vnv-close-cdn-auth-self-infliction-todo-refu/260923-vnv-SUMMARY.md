---
phase: quick-260923-vnv
status: complete
date: 2026-09-23
files_modified:
  - .planning/todos/pending/2026-09-16-whether-the-cdn-auth-token-failures-were-self-inflicted-is-untested.md
  - .planning/todos/completed/2026-09-16-whether-the-cdn-auth-token-failures-were-self-inflicted-is-untested.md
  - .planning/todos/pending/2026-09-16-the-2026-08-27-depot-stall-cause-is-unidentified-with-no-proposed-experiment.md
  - .planning/todos/completed/2026-08-27-stall-watchdog-leaves-the-download-running.md
---

# Quick 260923-vnv — CDN-auth self-infliction todo CLOSED as REFUTED, at the desk

**The todo was `ready: live-gate`. No live gate was run, and none should be.** The question was
answerable from captures already on disk, and the experiment the todo prescribed could not have
answered it.

## What was measured

Five distinct preserved captures. `md5` used to prove
`260907-ov3-evidence-35-02-ab-tauri-part1.log` is a byte-identical copy of
`gamelib.log.35-02-ab-tauri-part1` (`365915d1c4f226e0133a5987995c8e31`) and must not be
double-counted.

| capture                            | date       | app / depot                    | hosts | eresult | rawBodyBytes | `acquired` |
| ---------------------------------- | ---------- | ------------------------------ | ----- | ------- | ------------ | ---------- |
| `gamelib.log.35-02-ab-electron`    | 2026-08-28 | depot 40701                    | all 3 | 1       | 8            | **0**      |
| `gamelib.log.35-02-ab-tauri-part1` | 2026-08-28 | depot 40701                    | all 3 | 1       | 8            | **0**      |
| `260909-nzb/gamelib-control.log`   | 2026-09-09 | Avadon `112100` / depot 112102 | all 3 | 1       | 8            | **0**      |
| `260909-nzb/gamelib-gateA.log`     | 2026-09-09 | depot 112102                   | all 3 | 1       | 8            | **0**      |
| `260909-nzb/gamelib-gateB.log`     | 2026-09-09 | depot 112102                   | 3 + 1 | 1       | 8            | **0**      |

With the recorded Californium `402060` observations (depots 402062/402064, 2026-08-27 and
2026-09-07), the record spans **three titles, four depots, three dates**.

## Three findings

1. **No non-degraded baseline exists.** `CDN auth token acquired` appears **zero** times in every
   capture ever preserved. A self-inflicted *degradation* needs a working state to degrade from.
   None has ever been observed.
2. **The control log refutes the causal claim directly.** Cold CM connect `17:46:40`
   (`cellID=22`, 1629ms), plan built `17:46:41`, all three hosts empty at **`17:46:46`** — the
   FIRST token request of that session, with no cancelled large download preceding it in it.
3. **The response is a deliberate OK, not a rejection.** `eresult=1` is `k_EResultOK` (the branch
   is only reached *after* the `eresult !== ERESULT_OK` guard passes), body a constant
   `rawBodyBytes=8` across three unrelated titles. A throttle would surface as a non-OK `eresult`
   on the other warning line, and never has.

## The todo's own trap was FALSE, and that is half the closure

`## Traps` said the empty-token line is "emitted per attempt" and directed normalising per
attempt. Wrong: `cdnAuth.ts`'s `fetch()` writes each failing depot+host into `negativeCache` for
`CDN_AUTH_TOKEN_FAILURE_COOLDOWN_MS` (60s), during which `getToken` short-circuits to `''` with no
network call and **no log line**. gateB shows the real cadence — three lines at `17:46:46`, fourth
at `17:53:12`. The prescribed normalisation would have put our own chunk concurrency in the
denominator and measured the downloader, not Steam. The bullet was struck through and corrected
in place rather than deleted, so a reader who remembers the old claim finds its correction.

## Why the prescribed experiment was unrunnable

**Saturated instrument.** 3 of 3 hosts fail on first touch from a cold session, so there is no
headroom above baseline. Step 3 ("re-run and compare the rate") would have compared 3-of-3 against
3-of-3, reported no change, and that null would have been an artefact of the ceiling rather than
evidence about Steam — a green check proving nothing.

## Honest limits

- **Every capture is from one Steam account on one IP.** What is refuted is the within-session
  causal claim the todo posed. A standing permanent throttle on this account, present before the
  first capture, is **not** formally excluded and cannot be without a second account or IP. Stated
  in the closed todo rather than papered over. Not worth spending: the condition is benign (the
  parent measured Californium running straight through it at 7-9 MiB/s to 100% in 105s) and
  finding 3 explains it without invoking throttling.
- **No new capture was taken.** This is a re-reading of existing evidence, not a fresh gate.

## Carried before close

Per the carry-before-close discipline, the one finding the sibling needed was written to its live
home **before** the move: `2026-09-16-the-2026-08-27-depot-stall-cause...md` gained **row C** in
its *What has been ruled out — do not re-run these* table recording account/IP throttling as
**ELIMINATED**. That sibling has no candidate mechanism and now has one fewer.

Two live pointers repointed at `completed/`: the sibling's Related bullet and the closed parent
`2026-08-27-stall-watchdog-leaves-the-download-running.md`'s residual bullet. The `260916-bes`
PLAN/SUMMARY cite the pending path as a record of what was true then and were left byte-unchanged.

## Gates

- `pnpm planning-gates` — **12/12 PASS**.
- `git diff -- src/` and `git diff --cached -- src/` — **zero lines**. Docs-only, enforced.
- Staged-blob grep before commit (not the worktree), per the thrice-measured `git mv` trap: the
  file was edited in `pending/`, moved with plain `mv`, and `git show :<path>` confirmed
  `status: RESOLVED`, `rawBodyBytes=8`, `CDN_AUTH_TOKEN_FAILURE_COOLDOWN_MS` and the one-account
  limit all present in the **staged** content.
- `npx prettier --check` over the four written paths — exit 0, **but KNOWN-VACUOUS**: re-run with
  `--ignore-path /dev/null` and all three planning files warn, because `.prettierignore:29` is a
  bare `.planning`. The sibling was **already** non-conforming at HEAD (verified against
  `git show HEAD:<path>`), so nothing was regressed. Do not read the exit 0 as evidence these
  files are formatted.

## Deviation

None. Plan executed as written, inline rather than via a spawned executor: the whole task is the
measurement, which was already in this session's context, and handing it to a subagent would have
required re-deriving it.
