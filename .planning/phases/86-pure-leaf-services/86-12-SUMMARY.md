---
phase: 86-pure-leaf-services
plan: 12
subsystem: info-anticheat
tags: [anticheat, rust, native-channel, rustinvoke, md-5, golden-replay, drift, d-03, d-07, d-10, d-12, d-17, d-28]

requires:
  - phase: 86-pure-leaf-services
    provides: "86-04 anticheat goldens, recordings and before-states; 86-03 Http/Replay/InfoCtx; 86-08..11 info_dispatch, native `info` slice and the rustInvoke op pattern"
provides:
  - "gamelib-info anticheat module: info (lookup), status (MD5 skip rule), download (platform feed, temp-then-rename write); ops info_anticheat_info / _status / _download"
  - "getAnticheatInfo as a native `info` channel with one owner (sidecar handle, enrichment zod key and import deleted in the same commit)"
  - "RUST_INFO_ANTICHEAT_INFO / _STATUS / _DOWNLOAD constants, strict schemas and rust_dispatch arms for the 86-13 shims"
  - "md-5 0.10 (the phase's only new crate), pinned in EXPECTED_LOCKFILE_CRATE_NAMES"
  - "gamelib-info-cli drift [--slice] [--list]: the D-12 live check, with three anticheat cases"
affects: [86-13]

actuals:
  tokens: 31400
  tasks: 3
  commits: 3

key-files:
  created:
    - src-tauri/crates/gamelib-info/src/anticheat.rs
    - src-tauri/crates/gamelib-info/tests/golden_anticheat.rs
    - src-tauri/crates/gamelib-info-cli/src/drift.rs
    - .planning/todos/pending/2026-11-22-anticheat-lookup-returned-undefined-on-no-match.md
  modified:
    - src-tauri/crates/gamelib-info/Cargo.toml
    - src-tauri/Cargo.lock
    - src-tauri/crates/gamelib-info/src/lib.rs
    - src-tauri/crates/gamelib-info-cli/src/main.rs
    - src-tauri/crates/gamelib-info-cli/tests/cli.rs
    - src-tauri/src/info_dispatch.rs
    - src-tauri/src/native_router.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/common/types/ipc/nativeChannels.json
    - src/common/types/ipc/native.ts
    - src/common/types/ipc/enrichment.ts
    - src/common/types/ipc/ipcSchemaSnapshot.json
    - src/backend/sidecar/enrichmentFlowRegistration.ts
    - src/backend/__tests__/cargoFeatures.test.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/info/__tests__/recentGames.test.ts
    - src/backend/sidecar/__tests__/enrichmentFlows.test.ts
    - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/enrichment.test.ts
    - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
    - src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts

key-decisions:
  - "The lookup reproduces the TS throw-to-null quirks, not just the happy path: a data file that is not an array, or a malformed entry in front of the match (a non-object entry, no `storeIds`, `storeIds: null`, a truthy non-string namespace), answers null for the whole lookup because the TS `find` callback threw into the catch. Entries TS skipped without throwing (empty or falsy namespace, `epic` null, a primitive `storeIds`) are skipped here too. Pinned by a parity test."
  - "`info_anticheat_status` rejects (`info_anticheat_status:unreadable`) when the data file exists but cannot be read, as the TS `createMD5` rejected and the caller logged it; nothing is downloaded in that case. An empty `latestFileHash` counts as absent (TS truthiness test)."
  - "`info_anticheat_download` answers `{ written: true }` or `{ written: false, warning }`. The crate has no logger and TS logged `Failed download of AreWeAntiCheatYet data: ...`, so the failure category (`status 403`, `timeout`, `network: ...`, `write failed: <kind>`; never the URL) rides in `warning` for the 86-13 caller to log. The plan said `{ written: false }`; the extra field is additive. Windows answers `{ written: false }` with no warning."
  - "The write is temp-then-rename (a counter and the pid in the temp name, so two downloads never share one) rather than TS's in-place writeFile; the body is decoded as lossy UTF-8 text first, as axios `responseType: 'text'` did, so valid UTF-8 round-trips byte for byte."
  - "The request equals the recorded TS request: GET, `User-Agent: GameLib/<app_version> (+https://github.com/grayson-mitchell/GameLib)`, the axios default Accept, a 10 s timeout, redirects followed. The version comes from `ctx.app_version` (the shell passes its package version); the replay pins the User-Agent, and a negative test proves a different version makes the replay fail."
  - "drift compares SHAPE, in two modes: a whole document must keep every key path the golden carries (a dropped or retyped field is the drift; extra live keys are noted, not failed), and one list entry (the lookup answer) must stay inside the golden's merged entries. The lookup case uses the empty namespace, which matches the first entry with an Epic namespace, so it needs no hard-coded game; it is held against the downloaded list's golden entries because the lookup golden is one synthetic entry and the real data is heterogeneous."
  - "The drift code lives in its own module file `crates/gamelib-info-cli/src/drift.rs` (the plan listed only main.rs and cli.rs); main.rs carries `mod drift`, the `drift` dispatch arm and the usage text."

patterns-established:
  - "A scratch-file slice (D-18 exception) is read and written with std::fs on its one path, replayed against the golden `after/` file bytes, and its network side is split into a status op and a download op so TS keeps the online wait between them (D-07, D-28)."
  - "Opt-in live checks are a subcommand with a const case table and an offline `--list`; their tests replay the recorded service through `Replay` for PASS and a canned 403 and a reshaped body for FAIL, so the comparison logic is proven without the network."

requirements-completed: []

plan_head_before: 6ef39296db663736024bce3decfcf57f0c996c8d
plan_head_after: b6da3cff7ca22d564ac3b06b8e478fe0eb7ebc4b
commits: 3
status: complete
---

# Phase 86 Plan 12: Anticheat in Rust Summary

**The game page's anti-cheat badge is served natively by Rust from `areweanticheatyet.json` with the TS result for every 86-04 case, the data refresh is split into a status op (MD5 skip rule) and a download op ready for TS's online hook, and `gamelib-info-cli drift` can check the live services against the goldens on demand.**

## Accomplishments

- `anticheat::info`: first entry whose Epic namespace, lower-cased, contains the argument (the argument is not lower-cased, as TS); null for no argument, Windows, a missing or unreadable file, and the shapes the TS threw on. All 8 lookup goldens pass; the `{"undefined": true}` marker is asserted as null.
- `getAnticheatInfo` is a native `info` channel (`nativeChannels.json` args `appNamespace` string, max 1024 UTF-16, valid `["abc"]` and `[""]`, invalid `[]`, `[1]`, `[null]`, `["a","b"]`; `NativeAsync` typing; `info_dispatch::get_anticheat_info` on the blocking pool). Its sidecar `ipc.handle`, the `gameAnticheatInfo` import in enrichmentFlowRegistration.ts and the zod key and return type in enrichment.ts went in the same commit (D-17). The D-07 rider (null for Steam titles and for everything on Windows) is now a docstring note pointing at Rust.
- `anticheat::status` and `anticheat::download`: the TS decision exactly (Windows never; missing file needed; present file skipped only when a hash was given and matches), md-5 hex, the platform feed, the TS request, the temp-then-rename write. All 8 download goldens replay through `Replay` with `finish()` clean; their callback counts (`onlineCallbacksRegistered`), request lists and the bytes left in the app folder equal the TS oracle's. Unit tests cover the status table, both feed URLs and the User-Agent, a failed request or write keeping the old file, Windows, and cancellation by the Shutdown token (`info_anticheat_download:shutdown`, nothing written, registrant released).
- md-5 0.10.6 is the only new crate (Cargo.lock gained `md-5` alone; `digest` and `cfg-if` were already locked); `EXPECTED_LOCKFILE_CRATE_NAMES` pins it with a Phase 86-12 note.
- `drift`: three anticheat cases (`anticheat-download-mac`, `-linux`, `anticheat-lookup`), `--list` offline, `--slice`, exit 0 only if all pass. One live run at the end of the plan passed all three against the real GitHub feeds.

## Task Commits

1. Task 1 (tracer): `fb050d9b1` feat(86-12): getAnticheatInfo native end to end over the plain data file
2. Task 2: `cb22d8cf0` feat(86-12): anticheat status and download ops with md-5, replayed against the recorded TS downloads
3. Task 3: `b6da3cff7` feat(86-12): gamelib-info-cli drift, the D-12 live check, with anticheat's three cases

Tracer gate: the Task 1 verify (golden replay, native vectors and ownership suites, ipc contract, codecheck, planning-gates, prettier) was green before the Task 2 expansion; run inline as part of the Task 1 verify, as in 86-11.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The deleted sidecar registration moved four more pin tests and one count**
- **Found during:** Task 1
- **Issue:** `enrichmentFlows.test.ts` drove `getAnticheatInfo` through the sidecar (four riders and an UNPORTED-marker sweep entry); `runnerSliceRegistration.test.ts` (list, 70 handle-kind, 17-channel enrichment module, total 69), `ipcSchemas/enrichment.test.ts` (fixture and "17 total") and `flowRegistrationCensus.test.ts` (18 to 17) pinned it. The plan only named the census and schema suites; 86-13 was to remove the enrichmentFlows cases, but the registration is deleted here, so they would fail one plan early.
- **Fix:** the four riders became one "no longer registered" test (their behavior is pinned by `golden_anticheat.rs`, the parity tests and the native vectors); counts updated with dated notes. The stale test name that said "72" for a count of 71 now says 70.
- **Files modified:** enrichmentFlows.test.ts, runnerSliceRegistration.test.ts, ipcSchemas/enrichment.test.ts, flowRegistrationCensus.test.ts
- **Commit:** fb050d9b1

**2. [Rule 3 - Blocking] Shell and TS pins that move with three new rustInvoke ops (files outside the plan list)**
- **Found during:** Task 2
- **Fix:** `tauriShellSource.test.ts` (129 to 132 arms, pre-existing-arm allow-list), `rustInvokeSchemas.test.ts` (129 to 132), `recentGames.test.ts` (the `RUST_INFO_CHANNELS` set it consumes, which keeps `pnpm find-deadcode` at 312). No floor lowered and no allow-list widened beyond the three new op names.
- **Commit:** cb22d8cf0

**3. [Rule 2 - Missing critical] `download` reports why it wrote nothing**
- **Issue:** the crate has no logger, so TS's warning line would be lost. The result carries a fixed-category `warning` (never the URL) for the caller to log. See key-decisions.
- **Commit:** cb22d8cf0

**4. [Rule 1 - Bug, found by tests] drift's first lookup comparison failed on real data**
- **Issue:** comparing the lookup answer to the single synthetic lookup golden failed against the recorded real feed (`notes[]` is arrays in some entries, `steam` is absent in others).
- **Fix:** the `EntryOfList` mode described in key-decisions; the case is held against the downloaded list's golden entries.
- **Commit:** b6da3cff7

**5. Plan listed only main.rs and cli.rs for Task 3.** The drift code is `src/drift.rs`, a new module file; main.rs holds `mod drift`, the dispatch arm and the usage text, so the `drift` grep floor (at least 2) is met there.

### Not done (as written in the plan)

- `cargo fmt -p gamelib-info --check` and `-p gamelib-info-cli --check` pass, but the formatting of my files was applied with `rustfmt --edition 2021 <file>` per path, because the auto-mode classifier refused `cargo fmt -p gamelib-info` (no write over a whole crate, per the carry-forward rule). The result is identical: nothing outside my files changed.

## Verification

- `cargo test -p gamelib-info --features testing` (all targets, golden_anticheat 11, unit `anticheat::` 9), `cargo test -p gamelib-info-cli` (7 unit, 11 integration), `cargo test --bin gamelib-shell` (720 passed, 2 ignored), `cargo clippy -p gamelib-info -p gamelib-info-cli --all-targets -- -D warnings`, `cargo fmt -p <crate> -- --check` for both, `rustfmt --check` on info_dispatch.rs, rust_dispatch.rs and native_router.rs: green.
- `pnpm check:ipc-contract`, `pnpm codecheck`, `pnpm planning-gates` (12/12), `pnpm find-deadcode` (312 baselined), prettier on every written path: green.
- Full `pnpm exec jest`: 1147 suites pass; `nativeSeamPortComplete.test.ts` failed once under whole-repo load ("slice store: no rollback flag text survives") and passes alone, a foreign flake of the kind already recorded for 86-09 and 86-11. Nothing in that suite names anticheat.
- Live `gamelib-info-cli drift`: PASS for all three anticheat cases; no temp profile left behind.
- `pnpm backend-di-ceilings` was not re-run (it fails on the two known foreign files, as recorded).

## Known Stubs

None.

## Threat Flags

None. The new surface is the one the plan's threat model names: the fixed HTTPS feed URLs (T-86-23: body cap from `ReqwestHttp`, temp-then-rename write, a parse failure on read answers null), the download's Shutdown registrant and 10 s timeout with TS triggering it only after its online wait (T-86-24), and the bounded string argument with `deny_unknown_fields` decode and manifest vectors (T-86-25). md-5 is a change check, not a security control (T-86-SC).

## Self-Check: PASSED

- FOUND: src-tauri/crates/gamelib-info/src/anticheat.rs, src-tauri/crates/gamelib-info/tests/golden_anticheat.rs, src-tauri/crates/gamelib-info-cli/src/drift.rs, .planning/todos/pending/2026-11-22-anticheat-lookup-returned-undefined-on-no-match.md
- FOUND commits: fb050d9b1, cb22d8cf0, b6da3cff7
- `grep -v '^\s*\(//\|\*\)' src/backend/sidecar/enrichmentFlowRegistration.ts | grep -c "'getAnticheatInfo'"` = 0; `grep -c '"md-5"' src/backend/__tests__/cargoFeatures.test.ts` = 1; `drift --list` prints 3 anticheat ids; `grep -c drift main.rs` is at least 2.
