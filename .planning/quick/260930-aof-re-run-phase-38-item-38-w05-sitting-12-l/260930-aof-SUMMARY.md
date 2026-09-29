---
phase: quick-260930-aof
plan: 01
subsystem: release
tags: [phase-38, 38-W05, linux, appimage, live-gate, discharge]
status: complete
commits: 1
plan_head_before: b438cc90129c8f35d42e479c026c07fa98afa706
requirements: [QUICK-260930-AOF, REQ-35-20]
key-files:
  created:
    - .planning/quick/260930-aof-re-run-phase-38-item-38-w05-sitting-12-l/appimage_smoke.ts
    - .planning/quick/260930-aof-re-run-phase-38-item-38-w05-sitting-12-l/evidence/
  modified:
    - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
    - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
    - .planning/phases/35-electron-cutover-remove-the-electron-build/35-LIVE-GATE.md
    - .planning/ROADMAP.md
    - .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md
    - src/backend/__tests__/releaseWorkflow.test.ts
  moved:
    - .planning/todos/completed/2026-09-29-ci-linux-appimage-glibc-2-39-not-launchable-on-glibc-2-35.md
    - .planning/todos/completed/2026-09-30-host-nvidia-driver-library-mismatch-blocks-38-w05-scoring.md
actuals:
  tokens: 60000
  tasks: 3
  commits: 1
---

# Quick 260930-aof: Phase 38 sitting 12, `38-W05` PASS

**VERDICT: PASS. CAUSE_CLASS: none.** With the host's NVIDIA kernel-module/userspace mismatch cleared by a reboot, the
ubuntu-22.04-built AppImage launched directly with NO workaround, showed a window at 265 ms, kept all 11 samples plus a t=30
observation alive with its bundled sidecar, and reached an interactive Library UI. `38-W05` is discharged.

## Artifact and provenance bound

`GameLib_0.7.0_amd64(1).AppImage`, 195123704 bytes, sha256 `d7648c37e7721bcb10fc56018b41e531b8cb6a649856d8daeffb24eddcf35943`
(the same bytes sitting 11 scored, PROVEN_7), draft release `v0.7.0`, run `36556473399`, tag `v0.7.0-glibc-test1`, commit under
gate `b48e8948f` (41 commits behind HEAD). Launched as a hash-identical scratchpad copy; the Downloads file is unchanged (mode 664,
same mtime). `PROVENANCE_OK=operator-accepted`: minisign NOT verified, the run/tag/commit binding rests on the operator's account
(`COMMIT_BYTES_HITS=0`), the ubuntu-22.04 build base is inferred (five explicit `NOT_PROVEN` lines).

## GPU state, delta from sitting 11, and how the rules applied

Sitting 11: proprietary module 580.159.03 on kernel 7.0.11 vs userspace 580.173.02 (mismatch). Sitting 12: open kernel module
580.173.02 = userspace 580.173.02, `nvidia-smi` runs, kernel 7.1.1-76070101-generic, booted 2026-09-30 07:38:36, so the reboot changed
kernel and module flavour as well as version. `NVIDIA_MISMATCH=no` at baseline and `NVIDIA_MISMATCH_AT_LAUNCH=no` re-measured just
before the launch. Precedence: loader FAIL did not fire (0 glibc, 0 missing-library lines); CONFOUNDED and gpu-stack-non-mismatch
did not fire (`EGL_CONFOUND_LINES=0`); every PASS clause met. One scored launch (`SCORED=yes`, `EXTRA_ENV=(none)`,
`HARNESS_OK=1`, no repeat). No diagnostic arm ran (it exists only for a gpu-* cause).

## Census prediction, GPU prediction and control against observation

Census before launch, negative control PASS (sitting-10 artifact reproduced `GLIBC_INCOMPATIBLE`: 175 ELF, 50 above host,
`GLIBC_2.39`). New census reproduced sitting 11's exactly (`CENSUS_REPRODUCES_S11=yes`): max `GLIBC_2.35`, 0 of 182 ELF above host,
GLIBCXX 3.4.30 = host, no libc bundled, one unresolved NEEDED (`ld-linux-aarch64.so.1`, arm64 `comet`, already filed).
`BUNDLED_GPU_LIBS=0`: the artifact ships no libEGL/libGL/libgbm/libdrm of its own. `PREDICTION=MISSING_LIBS` read as
expected-to-launch; `GPU_PREDICTION=no-EGL-abort-expected`. Both matched the observation.

## Identity, survival, sidecar, UI

Window `GameLib`, `_NET_WM_PID` 20055, exe `/tmp/.mount_GameLihcGIHB/usr/bin/gamelib-shell` on a `fuse.` mount, pgrp = launch pgid,
`SETSID_PROVEN=yes`, `DIRECT_LAUNCH=yes`. 11 of 11 samples alive/visible/same-pid; shell, sidecar and window alive at t=30; no exit
event before teardown. Bundled sidecar pid 20114 (own group, exe inside the mount), alive at s=10 and t=30, stream shows it
signalled READY. Streams: 0 GLIBC, 0 missing-so, 0 EGL confound, 0 `libEGL warning`, 0 panic lines. Three viewed screenshots,
pixel-identical, 1575 colours: Library tab with navigation, search, filters, ADD GAME and the GameLib 0.7.0 what's-new dialog over an
empty library (`USABLE_UI=yes`).

## Exit observation and its limit

SIGTERM to the shell pid alone; the sidecar drained on stdin EOF in 0.26 s, `SIDECAR_ORPHAN=no`, no launch-group remainder, mount
gone. Cold profile only; it cannot see the `260913-901` class of real-profile-armed handles.

## Ledger counts

Before 7 open / 19 discharged / 10 retired, audit-uat total 426; after 6 / 20 / 10, total 425 (`ledger-check` PASS on every
assertion, `audit-uat` by_phase 38 = 6, `parse_gap_files: 0`). `38-W05` moved to `human_verification_discharged` with `result:` directly
after `id` and both older sitting keys kept. ROADMAP, LIVE-GATE and HUMAN-UAT carry sitting 12; `pnpm planning-gates` 12/12.

## Todo dispositions

- Glibc todo: moved to `completed/` (`status: RESOLVED`, closing section answering UNVERIFIED items 1-3; items 4-7 stated open);
  the one comment in `releaseWorkflow.test.ts` now names its `completed/` path (1 line changed; prettier and the 109-test jest suite pass).
- NVIDIA-mismatch todo: moved to `completed/` with a closing section (mismatch fixed by the reboot; `EGL_WARNING_LINES=0`).
- GTK-box todo: append-only addendum (prerequisite measured cleared; the spike-029 re-run with the workaround unset is still pending).
- New todos filed: none (no trigger fired; `CENSUS_FINDING_ALREADY_FILED=yes`).

## Deviations from plan

1. **[Rule 3 - guard]** HEAD was the protected branch `main` (`git.base-branch --is-protected` returned `true`), so the task commit was
   made on a new branch `quick-260930-aof` created from `main`, not on `main`. The orchestrator must merge that branch (or otherwise
   land it); nothing was pushed.
2. **[Method]** The harness copy, evidence and record edits used scoped Python replacements that assert a single occurrence.
   `STATE.md`, the PLAN and this SUMMARY were not staged, per the orchestrator.

## Known Stubs

None.

## Follow-up

The `release-tauri.yml` header's "UNPROVEN LIVE: no run has executed on ubuntu-22.04" paragraph is now stale; it is deliberately not
edited here (the workflow is out of this sitting's scope).

## Commits

`c0963ce1f` docs(quick-260930-aof): Phase 38 sitting 12, seventh Linux sitting -- 38-W05 PASS (branch `quick-260930-aof`). Not pushed.

## Self-Check: PASSED

Evidence files, the harness, the moved todos, the commit, `ledger-check`, `pnpm planning-gates`, prettier and the `releaseWorkflow`
jest suite were re-checked; no GameLib process, mount, inhibitor, fake profile or staged copy remains, and `~/Downloads` is unchanged.
