---
phase: 73-steam-depot-download-pipeline-in-rust
plan: 16
subsystem: verification
tags: [steam-depot, rust, parity, tier2, live-corpus]
requires: [73-14, 73-15]
provides:
  - 73-PARITY.md: real-corpus TS vs Rust parity report, codec coverage, D-17 timings, operator verdict
affects: [73-17]
key-files:
  created:
    - .planning/phases/73-steam-depot-download-pipeline-in-rust/73-PARITY.md
key-decisions:
  - "ACF diffs (download-state counters, Stellaris DownloadType/TargetBuildID) are Steam's own rewrite after adoption; neither writer emits them; D-14 met on file trees, ACF write-time equivalence covered by the Tier 1 goldens"
  - "Collision path not exercised live (covered by Tier 1 fixtures); XCOM: Enemy Unknown (200510) is the candidate for a future live check"
  - "Peak RSS not sampled: accepted as a known D-17 evidence gap"
requirements-completed: [P73-A, P73-G, D-14, D-17]
duration: multi-session (operator-driven)
completed: 2026-11-09
---

# Phase 73 Plan 16: Real-corpus parity run and D-17 comparison Summary

A live TS-vs-Rust run on Civ V, DREDGE, Stellaris, HUMANKIND, Schedule I and a shared-redist job (Amnesia) produced identical file trees (SHA1, modes, BSD flags), all outcomes `completed`, non-zero vz/vsza/pk coverage, and the operator approved it; the D-15 first gate is met.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 | 825d3a7e3 | Corpus decision recorded (Isaac dropped, it is 32-bit and redirected to the bottle) |
| 2 | d6e09ebab, ca898a34f, and the redist notes commits | TS and Rust installs on the same connection, timings and set-aside/restore notes |
| 3 | final PARITY commit | Sweep, codec coverage, edge paths, D-17 table |
| 4 | final commit | Operator verdict APPROVED |

## Results

- File trees identical for the four parity titles and the shared-redist tree; Schedule I differs only in four runtime artifacts from launching the game.
- Codec coverage: vz=105616, vsza=19923, pk=16364. Mach-O +x exercised (HUMANKIND `macho=21`); shared redist exercised (Amnesia, `acf=none`).
- D-17 wall time, Rust/TS: Civ V 1.07, DREDGE 0.84, Stellaris 0.99, HUMANKIND 1.12, Schedule I 1.34 (different byte totals on the two sides).

## Deviations from Plan

1. **Sweep exit code 1, not 0 (explained).** The sweep flags ACF counter fields `BytesToDownload`, `BytesDownloaded`, `BytesToStage`, `BytesStaged` on all four titles and `DownloadType`/`TargetBuildID` on Stellaris. The operator's verdict: these are Steam's rewrite after adoption, not a pipeline defect (neither writer emits `BytesToStage`, `DownloadType` or `TargetBuildID`; both use the same bytes rule at `acf.rs:289` and `finalize.ts:147`). Task 3's `exit code: 0` verify therefore cannot pass. The sweep and goldens were not edited.
2. **Isaac dropped; Schedule I replaced as redist title.** The Binding of Isaac is 32-bit and was redirected to the bottle. Schedule I opts into no shared redists (`optIn=[]`), so Amnesia: The Dark Descent (57300) covers the shared-redist bullet.
3. **Collision path not exercised live.** Every outcome line had `collisions=0`. Accepted; Tier 1 fixtures cover it. Candidate for a later live check: XCOM: Enemy Unknown (200510).
4. **Peak RSS not sampled.** Known evidence gap for D-17.
5. **No TS per-depot status map.** The TS-run log was rotated and the TS path logs no per-depot outcome, so the sweep compared overall status only.

## Incidents (not part of the parity result)

- `defaultSteamPath` had been set to the parity steamapps folder, giving a false "Steam hasn't been opened" prompt and a failed uninstall of the real Civ V; restored.
- Civ V was uninstalled from the real library to install into the parity library; it needs reinstalling there.
- The authenticated Steam session closes 60 s after the last lease release (`AUTH_SESSION_IDLE_GRACE_MS`), so Play must follow Refresh within a minute for the redist job to run.
- Follow-up: the sidecar was left orphaned (parent pid 1) after Ctrl-C of `tauri dev` on three occasions; it should honour the exit-at-stdin-EOF contract.
- Amnesia exited abnormally after 11 s in the TS redist run (`overlay-exit-abnormal`); unrelated to the depot pipeline, not investigated.

## Still to restore (left to the orchestrator and operator)

The `.ts-parity`/`.ts-out` copies and the parity library, both bottle ledgers (`.parity-bak`), the real-library Civ V reinstall. See 73-PARITY.md.

## Known Stubs

None.

## Threat Flags

None. T-73-61 (0 real-path matches in 73-PARITY.md; sweep input and samples kept in the scratchpad and deleted), T-73-62 (dedicated parity library; the six Phase 74 fixtures not touched), T-73-63 (the report carries the sweep output, exit code and per-title outcome lines).

## Self-Check: PASSED

- FOUND: 73-PARITY.md, this SUMMARY
- FOUND commits: 825d3a7e3, d6e09ebab, ca898a34f
