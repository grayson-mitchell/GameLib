---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 15
subsystem: steam-bridge-drm
tags: [live-gate, release, publish, preflight]
requires: [56-13, 56-14]
provides:
  - 56-15-LIVE-GATE.md (contract run by 56-16)
  - GitHub pre-release steamclient-layer-cx26.3.0.39832
affects: [56-16]
key-files:
  created:
    - .planning/phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-15-LIVE-GATE.md
decisions:
  - "Pins unchanged: the archive built on 94fc98d7a printed pinned: match, so no re-pin"
  - "Helper licence uploaded as LICENSE and GPL text as COPYING, the names THIRD-PARTY-NOTICES states"
metrics:
  tasks: 4
  completed: 2026-10-28
---

# Phase 56 Plan 15: Publish the steamclient-layer component and author the live gate Summary

The component is a public pre-release whose bytes equal the signed-app pins, and the Grim Dawn / Raft / Ranch live-gate contract (11 items, Structural Reachability Review) is committed with its non-dev preflight recorded green. No game was launched.

## Release

- URL: https://github.com/grayson-mitchell/GameLib/releases/tag/steamclient-layer-cx26.3.0.39832 (pre-release, not latest)
- Target: 94fc98d7a9ebb09b54edd16bbe75b48594a9a2f2 (origin/main, contains native/steam-bridge/steamclient-layer, 11 files)
- Published by the operator by hand. The agent's own `gh release create` was denied by the permission system and was not retried.
- Digests: archive c58a40c67c5d9093970227327bcceb5c2e457bc81b0a58559d9cb65777aeb187 (5359548 bytes); COPYING 3972dc97...6986; LICENSE 3df3b172...72af; SHA256SUMS 9d9233f6...a00a (254 bytes). Fresh download of the archive equals `archiveSha256` and `archiveSize`.
- Pins not re-pinned.

## Commits

- 3e0f07035 docs(56-15): author live-gate contract
- 7909f4612 docs(56-15): record publish and non-dev preflight
- Task 1 and Task 3 produced no commit (staging is gitignored; Task 3 was a checkpoint).

## Task 3 signal text

Publish: the operator answered "Push main, then publish", then "Fix the blockers, then push" for the pre-push hook failures, and after publishing typed "done release resume 56-15". The contract was NOT separately reviewed by the operator; proceeding on the publish approval. No contract-change commit followed.

## For 56-16

- Session dir: `/tmp/gamelib-gate-20261028T081115Z/` (reuse it).
- Preflight PC1-PC5, PC7-PC10 all passed (values in the Run record). PC6 (operator restarts dev after PC4's rebuild, under `tee -a`) is yours.
- Test 3 CONDITIONAL: item 7b/7c (helper stderr refusal and init_registry lines) have no captured sink; no wine log sink is named by 56-12. Record which file, if any, carries wine stderr.
- Test 5 flagged pairs: (1) dev restart x census/live gamelib.log; (2) per-launch cumulative SIDECAR copies; (3) reinstall x PC7/item 2; (4) COMPDIR creation x PC8/item 1; (5) HKLM add x item 7a; (6) Phase 52 forwarder cleanup x item 8.
- Item 2 needs `enableSteamNativeInstall` ON (default) so the install is not delegated to Mac Steam.
- Diagnosis hints in contract section 3: WINEDLLPATH/CX_ENV fallback, the space in "Application Support", Valve CDN fetch, Serialized005.

## Deviations from Plan

None in code. Process note: Task 4's publish step was done by the operator because the permission classifier denied the agent's `gh release create`.

## Known Stubs

None.

## Self-Check: PASSED
