---
phase: quick-260929-v1v
plan: 01
subsystem: release
tags: [phase-38, 38-W05, linux, appimage, glibc, live-gate]
status: complete
commits: 1
plan_head_before: 34ca8bd0c5d95ab6b1bc959f2791d06f0af9391d
requirements: [QUICK-260929-V1V, REQ-35-20]
key-files:
  created:
    - .planning/quick/260929-v1v-run-phase-38-item-38-w05-live-on-linux-s/appimage_provenance.cjs
    - .planning/quick/260929-v1v-run-phase-38-item-38-w05-live-on-linux-s/appimage_smoke.ts
    - .planning/quick/260929-v1v-run-phase-38-item-38-w05-live-on-linux-s/evidence/
    - .planning/todos/pending/2026-09-29-ci-linux-appimage-glibc-2-39-not-launchable-on-glibc-2-35.md
  modified:
    - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
    - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
    - .planning/phases/35-electron-cutover-remove-the-electron-build/35-LIVE-GATE.md
actuals:
  tasks: 3
  commits: 1
---

# Quick 260929-v1v: Phase 38 sitting 10, `38-W05` FAIL

**VERDICT: FAIL. The CI-produced Linux AppImage exits with code 1 after 65 ms on this glibc 2.35 host:
`GLIBC_2.39 not found`, no window. Item `38-W05` stays open.**

## Artifact and provenance bound

`GameLib_0.7.0_amd64.AppImage`, 192399864 bytes, sha256
`ac849f1b41204358f2d4689e10eda654edab5e25b47344ddc5640a6355b072c9`, downloaded by the operator from
the DRAFT release `v0.7.0` (no Actions artifact exists for run `35942560790`). `PROVENANCE_OK=operator-accepted`:
the `.sig` and `latest.json` were never downloaded (operator replied "continue" to a download-or-skip
prompt), so the signature was NOT verified and the commit under gate `19b5e3a9e` is unproven from the
bytes (`COMMIT_BYTES_19b5e3a9=0`). PROVEN: size, sha256, ELF plus AppImage type-2 magic, and that the updater
key at `19b5e3a9e` is `9A02F7E0C9FC04C7` and unchanged at HEAD.

## Census prediction against outcome

`PREDICTION=GLIBC_INCOMPATIBLE`, written before the launch: `gamelib-shell` needs `GLIBC_2.39`, 50 of 175
ELF files reference glibc above 2.35, no libc bundled. Observed: 47 not-found lines (1x 2.39, 45x 2.38,
1x 2.36) across 38 objects. Matched.

## Identity and survival

None to report. Direct launch (`chmod +x` 664 to 775 in place, exec, no install step, no extract-and-run) under
a fresh `createFakeHomeProfile`, in its own session/group (`SETSID_PROVEN=yes`, pid 163023). The FUSE
mount is evidenced only by the `/tmp/.mount_GameLiDknhOH/usr/lib/...` paths in the loader's stderr (it was gone before
the 250 ms mountinfo poll), so `DIRECT_LAUNCH=unknown`. No window, no samples, no screenshots.

## Exit observation and limit

Not applicable: the shell died before spawning the sidecar (`SIDECAR_ORPHAN=no`). Cold-profile only. `NO_ORPHANS=yes`,
profile disposed, inhibitor group and launch group empty, no mount left.

## Ledger counts

Before 7 open / 19 discharged / 10 retired, audit-uat total 426; after 7 / 19 / 10, total 426. One dated in-place key
`sitting_10_2026_09_29` on `38-W05` (`ledger_inplace_check` and `ledger-check` PASS). ROADMAP.md untouched. One todo filed.

## Deviations from plan

1. **[Premise correction, planned]** No Actions artifact `.zip`; the asset came from the draft release.
2. **[Operator decision]** No `.sig` or `latest.json`, so the signature and latest.json checks are SKIP and
   `PROVENANCE_OK=operator-accepted`. `appimage_provenance.cjs`'s signature path was therefore never exercised against a real `.sig`.
3. **[Rule 1 - own bug]** `baseline.env` first carried `HOST_GLIBC=glibc 2.35` unquoted, which broke sourcing
   (`2.35: command not found`); fixed by quoting before the commit.
4. **[Harness limit]** The 250 ms mountinfo poll missed the 65 ms mount, so `DIRECT_LAUNCH=unknown`.
   `census-run.txt` was written as an extra file. A child-exit teardown reports `LAUNCH_GROUP_GONE_MS=0` and
   `SIDECAR_EXIT_S=0.00`, which mean "nothing existed", not "fast exit".
5. **[Method]** The ledger/HUAT edits were made with scoped Python string replacements rather than the Edit tool
   (same effect: single-occurrence asserts); the LIVE-GATE paragraph used Edit.
6. **[Isolation observation]** `~/.local/share/com.gamelib.spike029` was newer than the stamp. Its last write predates the
   launch by 0.55 s and the app died at exec; a concurrent spike-029 session (untracked `.planning/spikes/029-*` appeared
   during the sitting) is the likely writer. Not this run; verdict unaffected.
7. **[Orchestrator instruction]** The PLAN.md was committed in the records commit; this SUMMARY is NOT committed
   (left for the orchestrator with STATE).

## Commit

`6b74bedc6` docs(quick-260929-v1v): Phase 38 sitting 10, fifth Linux sitting -- 38-W05 FAIL (not pushed).

## Self-Check: PASSED

Evidence files, todo, commit `6b74bedc6` and the `planning-gates` run (12/12) were re-checked after the commit.
