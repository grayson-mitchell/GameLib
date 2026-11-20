---
phase: 74-steam-game-updates
plan: 25
subsystem: steam-depot
tags: [rust, depot, delta, gap-closure]
requires: [74-16]
provides:
  - "{ unavailable: <reason> } depotManifestRequestCode reply, shell Err(transient:<reason>)"
  - "request_code_from_node NodeCode { Code, NoCode, Unreachable(kind) }"
affects: [depotHostRegistration.ts, depotRust/install.ts, depot_dispatch.rs, gamelib-depot fetch/delta/manifest]
key-files:
  modified:
    - src/backend/sidecar/depotHostRegistration.ts
    - src/backend/sidecar/__tests__/depotHostChannels.test.ts
    - src/backend/storeManagers/steam/depotRust/install.ts
    - src/backend/storeManagers/steam/depotRust/__tests__/rustInstall.test.ts
    - src-tauri/src/depot_dispatch.rs
    - src-tauri/crates/gamelib-depot/src/fetch.rs
    - src-tauri/crates/gamelib-depot/src/delta.rs
    - src-tauri/crates/gamelib-depot/src/manifest.rs
    - src-tauri/crates/gamelib-depot/tests/support/fake_host.rs
    - src-tauri/crates/gamelib-depot/tests/support/delta_env.rs
    - src-tauri/crates/gamelib-depot/tests/delta_fallback.rs
    - src-tauri/crates/gamelib-depot/tests/job_install.rs
key-decisions:
  - "Reason allow-list is not_signed_in | failed | no_job; never an error message (T-74-85)"
  - "Any non-Blocked, non-transient host error (bad-reply, JoinError) is Network for the up-front fetch"
  - "max_download_bytes field name kept; doc now says expected, not maximum"
requirements-completed: [STEAM-02]
completed: 2026-11-13
---

# Phase 74 Plan 25: Request-code failure no longer triggers delta fallback Summary

A Node-side failure to obtain the old manifest's request code (not signed in, CM down, lease refused, no job) now fails the delta run as transient with the old tree intact; only Steam answering with no code, a 404/410 or an undecodable old manifest takes the D-14 fallback (WR-01).

## Commits
- 22998c8ba: Node handler tags failures `{ unavailable }`; shell maps to `transient:<reason>`; `TRANSIENT_REPLY_PREFIX`
- 114abf691: crate classifies Code / NoCode / Unreachable; delta doc; estimate doc (IN-02 Rust half); tests

## Verification
- jest depotHostChannels, depotChannelParity, depotRust/*: 87 passed; prettier scoped: clean; `check:ipc-contract`: up to date (this channel's result is not schema-validated, contract untouched)
- `pnpm codecheck`: tsc step passes; meta step is the known gen_vtables failure
- cargo test -p gamelib-depot (all suites), -p gamelib-depot-cli, --bin gamelib-shell: pass; clippy ratchet PASS; rustfmt --check clean
- New tests: request_code_refused_fails_without_fallback, request_code_failed_keeps_retired_depot_files, shell request_code_reply_maps_unavailable_to_a_transient_error, Node unavailable/no_job/null cases

## Deviations from Plan

**1. [Rule 3 - Blocking] requestCodeRefresher swallowed every failure to null**
- `depotRust/install.ts` `requestCodeRefresher` caught every non-40 error and returned null, so the handler could never see a failure. It now rethrows; null remains only for a zero/absent code. Its test (rustInstall.test.ts) was updated. All callers pass it solely as `refreshRequestCode`, which only the handler consumes.

**2. [Rule 1 - Test follow-on] job_install.rs non_blocked_node_error_still_fails_the_job**
- Asserted ManifestUnavailable for a `depot:bad-reply` host error; per the plan's behavior it is now Network. Assertion updated.

**3. Incident:** `cargo fmt -p gamelib-shell` reformatted 27 unrelated clean src-tauri files; I restored each with a per-file `git checkout --` (all were clean at start) before committing. Nothing unrelated was committed.

## Caller audit (acceptance)
- `fetch_manifest(.., None)`: only direct caller is the ManifestStore load, manifest.rs:530 (new and old manifests).
- `ErrorKind::ManifestUnavailable` readers: outcome.rs (name/priority), manifest.rs:185-229 (estimate degrade, "cancelled"), download.rs:936 and delta.rs:1047 (only when `eresult == Some(40)`, Blocked skip), delta.rs:881 (definitive classification). No non-delta path treats it specially beyond the Blocked skip, which is unchanged; the estimate path (`Err(Failed(_))` -> D-14 figures) degrades for any failure, unchanged. A Node failure now surfacing as NotSignedIn/Network therefore only changes the delta fallback decision (and the kind reported on a primary-manifest failure).

## Known pre-existing failures (not touched)
`pnpm codecheck` step 2 (meta/gen_vtables.ts); legendary epicOfflineMode "Test 6c".

## Self-Check: PASSED
Commits 22998c8ba and 114abf691 exist; all listed files present.
