---
phase: 85-store-host-config-and-versioned-migrations
plan: 05
subsystem: release
tags: [signing, notarization, keychain, baseline, d-16]

requires: []
provides:
  - The signed, notarized v0.10.0 macOS baseline, with its identity (Authority, TeamIdentifier, designated requirement, spctl, stapler) recorded in 85-VALIDATION.md "## Signed baseline (D-16)"
affects: [85-19, 85-20]

actuals:
  tasks: 3
  commits: 1

key-files:
  created: []
  modified:
    - .planning/phases/85-store-host-config-and-versioned-migrations/85-VALIDATION.md

key-decisions:
  - "Baseline version: the operator chose a version bump (0.8.0 -> 0.10.0 on branch release/v0.10 at 10c85ed72) so tauri-action targets a new v0.10.0 draft release rather than the existing v0.8.0 one"
  - "A non-dry release run uploads to the draft release, not as a run artifact, so the baseline was read from `gh release download` assets"
  - "The dmg container is not stapled or notarized; only GameLib.app is. The Keychain ACL binds to the app's designated requirement, so this does not affect SC3"

requirements-completed: []
---

# Plan 85-05: Signed v0.10 baseline (D-16)

The signed v0.10 baseline exists and its identity is on record, read from the artifact itself. SC3 moves from `unproven` to `pending`. It is waiting on 85-19, which records the Phase 85 build's identity the same way so that 85-20 can compare the two.

## What happened

- **Task 1 (inventory):** recorded tags, releases, release-tauri.yml runs and local identities. Two caveats were written into the section: the version was still 0.8.0, and a dry run uploads nothing.
- **Task 2 (operator):** the operator chose a version bump on branch `release/v0.10` and dispatched run `44925761249` with `dry_run=false`. On the first attempt, macOS failed notarization with an HTTP 403 because the Apple Developer Program agreement had expired. The operator accepted the updated agreement and the failed leg was rerun. All three legs then finished `success`.
- **Task 3 (record):** downloaded `GameLib_0.10.0_aarch64.app.tar.gz` and `.dmg` from the draft `v0.10.0` release, then checked them:
  - `codesign`: Developer ID Application: grayson mitchell (S7U223QWXJ), TeamIdentifier `S7U223QWXJ`, hardened runtime, `--verify --deep --strict` passes.
  - Designated requirement: recorded in full in the section.
  - `spctl`: accepted, `Notarized Developer ID`.
  - `stapler`: the app is stapled. The dmg is not stapled, which is noted.
  - The downloads were deleted afterwards.

## Verification

`grep -cE "SC3: (pending|unproven)"` gives 1 and `grep -c TeamIdentifier` gives 3. There is exactly one `SC3:` line.

## Carried forward

- **85-19:** main's version must be above 0.10.0 (for example 0.11.0) for the upgrade gate. The Phase 85 build must come from release-tauri.yml with the same secrets. Its TeamIdentifier and designated requirement must equal the ones recorded here.
- **Not published:** the `v0.10.0` draft release is still a draft. Publishing it is the operator's call.
