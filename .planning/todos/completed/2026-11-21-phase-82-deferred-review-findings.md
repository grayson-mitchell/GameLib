---
created: 2026-11-21
title: "Phase 82 review findings deferred by the gap closure (WR-02, WR-05, WR-06, WR-09, IN-01..IN-05)"
source: phase 82 gap closure plan 82-19
area: safety
files:
  - src-tauri/crates/gamelib-safety/src/remove.rs
  - src-tauri/crates/gamelib-safety/src/safe_path.rs
  - src/backend/storeManagers/steam/library/acfState.ts
  - src/backend/storeManagers/steam/cancelDelete.ts
  - src/backend/storeManagers/steam/bridgeBottleLifecycle.ts
  - src/common/types/removalRefusal.ts
  - src/frontend/components/UI/RemovalRefusedNotice/index.tsx
  - src/backend/storeManagers/sideload/games.ts
  - src/backend/safety/knownInstalls.ts
  - .github/workflows/rust-test.yml
  - src-tauri/deny.toml
severity: medium
platform: any
ready: code
---

Nine findings from 82-REVIEW.md that the gap closure (82-17, 82-18, 82-19) deliberately left open. Each has a recorded disposition of deferred in 82-REVIEW-DISPOSITION.md.

## WR-02: One unresolvable protected-root or known-install path blocks every removal

Fix direction: Treat an unresolvable reference path (protected root or known install unrelated to the target) as skippable via a lexical comparison instead of an unknown verdict for the target.

Deferred because: fail-closed (over-refuses, never deletes). A lexical fallback for unresolvable reference paths is a design change, and its Windows unplugged-drive branch can only be proven on the CI Windows leg.

## WR-05: Steam copy-removal guard is advisory and fails open to an unguarded delete in the crate

Fix direction: Have remove_copy in gamelib-steampoll consult the gamelib-safety verdict and the cross-store known-install list itself, and make refuseUnsafeCopy fail closed.

Deferred because: bounded by remove_copy own symlink-root, installdir-shape and downloading guards (D-21). The TS pre-check goes away when Phase 90 ports Steam uninstall, and remove_copy should then take the gamelib-safety verdict itself.

## WR-06: Sideload shared-folder heuristic ignores sub-directories

Fix direction: Flag a sideload folder that holds a sibling game directory, once there is a decision on what marks one.

Deferred because: a sub-directory rule would refuse nearly every real game folder (Data or Engine beside the exe). What marks a sibling game directory needs its own decision.

## WR-09: Deletes after the Rust check but outside the Rust delete-time re-check

Fix direction: Re-assert the check after cxbottle and at the cancel-install delete, so the delete call is the safety boundary at both sites.

Deferred because: both are named, accepted exceptions (the Phase 75 critical section; cxbottle deletes by bottle name). Re-asserting the check after cxbottle and at the cancel delete is follow-up work.

## IN-01: Windows is_link_metadata treats every reparse point as a link

Fix direction: Read the reparse tag and treat only symlinks and mount points as links.

Deferred because: needs the Windows reparse tag, which std metadata does not expose; fails safe as delete-failed.

## IN-02: remove-bottle refusal kind is never emitted

Fix direction: Pass the remove-bottle kind from the bottle removal site, or drop the unused kind.

Deferred because: cosmetic toast title for bottle removal.

## IN-03: Sideload reports a refused second-stage guard as failed

Fix direction: Map a refused second-stage outcome to the refused notice instead of failed.

Deferred because: sideload toast wording for a refused second-stage guard.

## IN-04: Known-install list ignores entries that are not yet is_installed

Fix direction: Include in-progress installs in the D-16 known-install list.

Deferred because: in-progress installs are outside the D-16 known-install list today.

## IN-05: CI and supply-chain hygiene in touched files

Fix direction: Add timeout-minutes to the cargo-test job and record reasons for the deny.toml advisory ignores.

Deferred because: the rust-test.yml job timeout and the deny.toml advisory reasons need the network advisory DB and a workflow-pin test change.

## Resolved by quick 261121-o99

Resolved by quick 261121-o99: d8fc1bb25 (gamelib-safety: WR-02, WR-06, IN-01), 099101f9e (Steam removal sites: WR-05, WR-09, IN-02), 81edc90b7 (IN-03, IN-04, IN-05). WR-05 moving the verdict into gamelib-steampoll remove_copy remains for Phase 90.
