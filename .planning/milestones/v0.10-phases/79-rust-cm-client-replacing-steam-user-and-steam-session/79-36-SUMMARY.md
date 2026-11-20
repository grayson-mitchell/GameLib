---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 36
subsystem: steam-cm
tags: [rust, macos, refresh, parity]
requires: [79-35, 79-31, 79-33]
provides:
  - "steamcm_refresh source macSteam: Mac Steam owned apps -> anonymous capture -> carry-forward assembly -> enrichment, no lease, no signed-in logon"
  - "refresh() tries the Mac source first on darwin with cm=rust and a grant, falls back to the CM path"
affects: [79-37, 79-38]
key-files:
  modified:
    - src-tauri/crates/gamelib-steamcm/src/refresh/mod.rs
    - src-tauri/crates/gamelib-steamcm/src/lib.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/ipc/rustInvoke.ts
    - src/backend/storeManagers/steam/cm/steamCmTypes.ts
    - src/backend/storeManagers/steam/library/rustRefresh.ts
    - src/backend/storeManagers/steam/library/refresh.ts
    - .planning/phases/79-rust-cm-client-replacing-steam-user-and-steam-session/79-PARITY.md
  created:
    - src/backend/storeManagers/steam/__tests__/library.macSteamRefresh.test.ts
metrics:
  tasks: 3
  completed: 2026-11-15
---

# Phase 79 Plan 36: Mac Steam path primary for Refresh Summary

All tasks done. Task 3: the operator accepted DV-79-10, 11 and 13 and rejected DV-79-12; the fix (42117891b) widened the Mac filter to game, beta and application with test `beta_and_application_types_survive_but_other_types_still_drop`. Re-measure: 399 Mac games, 390 of 390 owned covered, no unexplained difference. PARITY Mac section is `APPROVED (Mac path)`.

## Done

- Task 1 (c53b5839c): `RefreshSource::MacSteam { helper_path, steam_id }`. Its arm calls `mac_owned_apps`, then the same capture, assemble and enrich pipeline as the Cm arm, with `PlaytimeMode::CarryForward` and no lease. Result `source` is `macSteam`. Guard failures return `{ok:false, kind:'macFallback', reason}` before any capture, assembly or enrichment, including an unparseable SteamID (`parse`). On the TS side `tryMacSteamRefresh` runs before any `acquireAuthenticated`, only on darwin with cm=rust, a grant and a stored SteamID; any failure (macFallback, other `ok:false`, transport throw) logs `Mac Steam path unavailable (<reason>), using CM` and the 79-31 CM path continues. Success logs `Mac Steam path ok games=<n> demos=<d> (no CM logon)`.
- Task 2 (5ca9ee719): live comparison and DV rows in 79-PARITY.md (see the checkpoint report for the numbers).

## Verification

`cargo test -p gamelib-steamcm --lib -- refresh::` 123 passed; clippy `-D warnings` and `cargo fmt -p gamelib-steamcm --check` clean; `pnpm check:ipc-contract` up to date; `pnpm tsc --noEmit` clean; jest `steam/__tests__/library*` 20 suites, 477 tests passed; the new test covers ok, macFallback then CM, transport rejection, and the never-sent cases (off macOS, cm=ts, no stored id, no grant). rustInvokeChannel.test.ts failed once under the combined run and passed alone (known flake).

## Deviations from Plan

1. **[Rule 3 - Blocking] Contract generator has no `anyOf`.** The `source` schema could not be a tagged union. It is one strict object: `kind: enum['cm','macSteam']`, optional `leaseId` and `helperPath`, required `steamId`. The Rust `RefreshSource` (deny_unknown_fields) enforces which fields belong to which kind (tested). `ipc_contract.rs` regenerated.
2. **[Rule 1 - Bug] `lib.rs` irrefutable `let` on `RefreshSource::Cm`** no longer compiles with two variants; the SteamID pre-check now applies only to the Cm source (the Mac source answers with a typed `parse` fallback).
3. **Real-profile arm for Task 2 was a scratchpad script, not `runSteamcmNdjson`.** That harness always uses a fake HOME and takes no env override, and the helper needs the real HOME. The script spawned `gamelib-steamcm-cli steamcm_mac_owned_apps` single-shot, anonymous logon only; it is not committed.
4. **Mac path skips the bridge launch-target backfill** (it needs a held lease). It runs on the next CM-path Refresh.

## Findings for the operator

- `build/bin/arm64/darwin/steam-bridge-helper` is stale (predates `--steam-owned-apps`, exits 6); `public/bin/...` is current and is what `appPaths.steamBridgeHelperPath` resolves to. A runtime still pointing at `build/bin` would take `helper-failed` and fall back to CM.
- DV-79-12 (3 owned beta/application apps dropped) was found, rejected and fixed; see above.
- The CM-path demo count could not be re-measured without a signed-in logon.

## Known Stubs

None.

## Open

None.
