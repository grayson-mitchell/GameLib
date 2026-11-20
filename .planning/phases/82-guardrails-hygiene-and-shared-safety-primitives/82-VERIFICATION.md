---
phase: 82-guardrails-hygiene-and-shared-safety-primitives
verified: 2026-11-21T00:00:00Z
status: gaps_found
score: 5/7 must-haves verified
covered_files:
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-01-PLAN.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-01-SUMMARY.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-02-PLAN.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-02-SUMMARY.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-03-PLAN.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-03-SUMMARY.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-04-PLAN.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-04-SUMMARY.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-05-PLAN.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-05-SUMMARY.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-06-PLAN.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-06-SUMMARY.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-07-PLAN.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-07-SUMMARY.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-08-PLAN.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-08-SUMMARY.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-09-PLAN.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-09-SUMMARY.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-10-PLAN.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-10-SUMMARY.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-11-PLAN.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-11-SUMMARY.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-12-PLAN.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-12-SUMMARY.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-13-PLAN.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-13-SUMMARY.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-14-PLAN.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-14-SUMMARY.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-15-PLAN.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-15-SUMMARY.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-16-PLAN.md"
  - ".planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-16-SUMMARY.md"
  - "src-tauri/crates/gamelib-safety/src/lib.rs"
  - "src-tauri/crates/gamelib-safety/src/remove.rs"
  - "src-tauri/crates/gamelib-safety/src/safe_path.rs"
  - "src-tauri/crates/gamelib-safety/src/tri.rs"
  - "src-tauri/crates/gamelib-safety/src/wire.rs"
  - "src-tauri/crates/gamelib-safety/tests/adversarial.rs"
  - "src-tauri/crates/gamelib-testutil/src/lib.rs"
  - "src-tauri/src/safety_dispatch.rs"
  - "src/backend/__tests__/e2eSurfaceGone.test.ts"
  - "src/backend/safety/knownInstalls.ts"
  - "src/backend/safety/protectedRoots.ts"
  - "src/backend/safety/rustSafety.ts"
  - "src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts"
  - "src/backend/sidecar/__tests__/ipcDomainCensus.test.ts"
  - "src/backend/sidecar/sidecarRpc.ts"
  - "src/backend/storeManagers/gog/games.ts"
  - "src/backend/storeManagers/sideload/games.ts"
  - "src/backend/storeManagers/steam/bridgeBottleLifecycle.ts"
  - "src/backend/storeManagers/steam/cancelDelete.ts"
  - "src/backend/storeManagers/steam/gameUninstall.ts"
  - "src/backend/storeManagers/steam/library/acfState.ts"
  - "src/backend/testUtils/censusFloor.ts"
  - "src/backend/testUtils/rawRecursiveDeletes.ts"
  - "src/backend/utils.ts"
  - "src/backend/utils/uninstaller.ts"
covered_digest: "v4:sha256:3573f0daf1ab74d09c6b02bdf52dcc8bc342c192e3c401ee4b19d73ee6287f86"
behavior_unverified: 1
overrides_applied: 1
overrides:
  - must_have: "The zero-risk deletions (type-only files, legendary/commands/*, fileStore.ts only after the live-or-dead check) are gone"
    reason: "Operator ruling D-19 (82-CONTEXT, 2026-11-20) moved legendary/commands/* and the type-only files to Phase 91 (10 live importers, runtime zod brands in base.ts); fileStore.ts failed the live-or-dead check (dead in the runtime bundle, live as the test store of about 27 jest suites), which 82-CONTEXT already routes to Phase 85 scope. Dead exports, proxy-types analysis and the CI=e2e surface were done. Follow-up todo filed."
    accepted_by: "operator via 82-CONTEXT D-19 (verifier recorded; operator should confirm by editing ROADMAP SC5 wording)"
    accepted_at: "2026-11-20T00:00:00Z"
re_verification:
  previous_status: none
gaps:
  - truth: "Guards refuse only when the check genuinely cannot confirm safety: a normal GOG uninstall and a cancelled-Steam-install cleanup still work (CR-01, WR-01)"
    status: failed
    reason: "check_trust_root resolves the trust root with a bare dunce::canonicalize, so a trust root directory that does not exist reads Unknown (canonicalize-failed). GOG removalRequest always sends a game-support target whose trustRoot is <gogdl config>/gog-support, a folder GameLib never creates (setup.ts says it 'doesn't need to exist'; the pre-phase code guarded it with existsSync). Result: any GOG uninstall without that folder is refused with the generic 'couldn't confirm the install location' notice before unins000.exe runs. The adapter, gate tests and fake Rust all ignore trust roots, and the crate's own test unknown_a_missing_trust_root_refuses pins this behaviour, so no test covers the real GOG shape. Same root cause in steam/cancelDelete.ts:228-257 (trustRoot = steamapps/common may be absent when a cancel lands before the first write): refused, manifest and breadcrumb left behind."
    artifacts:
      - path: "src-tauri/crates/gamelib-safety/src/remove.rs"
        issue: "lines 72-75: trust root resolved by dunce::canonicalize(...).map_err(CanonicalizeFailed) so an absent root is Unknown"
      - path: "src/backend/storeManagers/gog/games.ts"
        issue: "lines 1122-1131: support target and trustRoot sent unconditionally"
      - path: "src/backend/storeManagers/steam/cancelDelete.ts"
        issue: "lines 228-257: pre-check with trustRoot commonRoot refuses when common is absent"
    missing:
      - "Resolve the trust root with canonical_location (nearest existing ancestor canonical, lexical tail) in check_trust_root so an absent root is judged by its canonical ancestor, not Unknown; keep Unknown for a root that exists but cannot be read"
      - "Rust adversarial row: trust root absent, target absent -> Yes/absent; update or replace unknown_a_missing_trust_root_refuses (adversarial.rs:978) so it covers a root that exists-but-unreadable instead"
      - "GOG test and cancelDelete test whose gog-support / steamapps/common folder does not exist (a fake that honours trust roots, or a real-crate test), asserting the uninstall proceeds"
  - truth: "A caller-supplied empty trustRoot cannot silently remove the containment guarantee (WR-04)"
    status: partial
    reason: "remove.rs:72 filters Some('') to None, and for game-install, prefix and sideload-folder targets None takes the may_skip arm whenever any protected root is non-empty, so containment is skipped instead of reading Unknown. No current TS caller sends an empty trustRoot for those kinds (verified by grep), so this is latent, but it is exactly the fail-open shape the phase set out to close."
    artifacts:
      - path: "src-tauri/crates/gamelib-safety/src/remove.rs"
        issue: "line 72 .filter(|s| !s.is_empty()) maps empty to no trust root"
    missing:
      - "match Some('') => Err(unknown(Reason::NoTrustRoot)) before the existing arms, plus an adversarial row"
  - truth: "The raw-recursive-delete gates cannot pass while a raw delete exists (WR-07)"
    status: partial
    reason: "rawRecursiveDeletes.ts CALL regex has a (?<![\\w$.]) lookbehind, so deps.rm(x,{recursive:true}), deps.fs.rmSync(...) and any non-fs/fsp/promises/fsPromises qualifier are not seen; a call whose options are a variable (rmSync(x, OPTS)) is dropped by the \\brecursive\\b filter; helpers such as removeFolder and spawn('rm',['-rf']) are not recognised. The DI-converted codebase uses exactly the deps.* shape (legacyZoomDataCleanup.ts:40). Today the four Steam files and the non-Steam files hold no such call, so the gates are green and correct, but nonSteamDeleteGate/steamDeleteGate would stay green if one is added."
    artifacts:
      - path: "src/backend/testUtils/rawRecursiveDeletes.ts"
        issue: "lines 95-96 CALL regex and 117-118 argument filter"
    missing:
      - "Match member calls whatever the receiver (\\.rm(Sync)?\\(), treat an rm*( call with a non-literal options argument as suspect, add the probes as detector tests, and document remaining non-goals in the header"
  - truth: "The adversarial path table cannot pass vacuously if a row name drifts (WR-08)"
    status: partial
    reason: "adversarial.rs:371-403 lexical_rows(filter) loops over rows selected by name prefix and never asserts how many ran; a renamed row or a mistyped filter leaves a zero-iteration loop that passes. All four filters match rows today (dot segment, relative/empty/nul, C:\\x, UNC), so it is not vacuous now. This is the same failure mode D-05 closed for the TS census gates."
    artifacts:
      - path: "src-tauri/crates/gamelib-safety/tests/adversarial.rs"
        issue: "no row-count assertion in lexical_rows"
    missing:
      - "assert that each filter matched at least one row (rows.len() >= filter.len())"
deferred: []
behavior_unverified_items:
  - truth: "A real renderer-triggered uninstall / bottle removal / resetHeroic round-trips sidecar -> shell safety_check_removal / safety_remove_tree and shows the refusal toast"
    test: "In a running dev build (pnpm tauri:dev, restart so the sidecar is rebuilt), uninstall a throwaway sideloaded game whose folder also contains another installed game's folder; also uninstall a throwaway GOG game"
    expected: "The nested case shows the bottom-right 'Couldn't uninstall <game>: ... Nothing was deleted.' notice naming the other game and the tile returns to its prior state; the plain GOG/sideload uninstall completes (this also exercises the CR-01 fix)"
    why_human: "Every guard-site test uses fakeSafetyRustInvoke; the Rust arm is tested in-process in main.rs and the crate is tested directly, but no test crosses the real sidecarRpc -> shell -> gamelib-safety hop, and the toast render is visual"
---

# Phase 82: Guardrails, hygiene and shared safety primitives - Verification Report

**Phase Goal:** The backend test suite is trustworthy and the shared safety rules exist before any code is ported, so no later slice can fail open, delete a sibling game, or pass a drift gate vacuously.
**Verified:** 2026-11-21
**Status:** gaps_found
**Re-verification:** No (initial verification)

The phase largely delivers its goal. The test suite is green on CI at the final proof sha, the census gates carry floors and negative tests, the Rust safety crate exists and is wired end to end with an adapter that fails closed, and the sibling-delete table passes on three OSes. One verified defect, though, makes the new guard over-refuse a normal GOG uninstall, and three smaller verified defects leave the "cannot fail open / cannot pass vacuously" guarantees weaker than stated.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: `pnpm test` runs every backend suite green, or each red suite is retired with a recorded reason; none left on a known-red list | VERIFIED | `gh run list --commit 2345c268686399287ac5d504e7f03999dbfe5b48`: Code check, Supply-chain audit, Lint, Test all success attempt 1; Rust test success on attempt 2 (one steampoll watchdog load flake, passes alone). 82-TEST-LEDGER.md has every red with cause and fix commit; nothing retired, no skip/known-red list. Operator D-03 decisions (a)-(e) recorded. I re-ran the ratchet gates locally: planning-gates 12/12, steam-line-ceiling PASS, backend-di-ceilings PASS (jestMock 1865 unchanged), gameinfo-narrowing-ceiling PASS, find-deadcode PASS (312 baselined). Working-tree dirt (bridge helper files) is another session's and not part of the phase. |
| 2 | SC2: IPC census and flow-registration census fail on empty or truncated input | VERIFIED | `censusFloor.ts` `assertAtOrAboveFloor` (rejects a non-positive floor itself). `ipcDomainCensus.test.ts:343-394` and `flowRegistrationCensus.test.ts:442-500` carry "cannot pass vacuously (D-05)" blocks with empty, truncated and one-short-of-floor cases that call the same guard as the real run. Also guarded: phase70PassthroughCensus, bridgeCensus, moduleStateCensus, diPhaseGates (10 walk floors). I ran these suites: 30 suites / 704 tests pass. |
| 3 | SC3: uninstall, bottle removal and store reset refuse with a visible error when the guard returns unknown; one injected-rejection test per guard | VERIFIED (unit level; live hop = item 7) | `rustSafety.ts` has the only catch around the safety rustInvoke: reject/timeout -> `unknown`/`failed`; a reply that does not answer the request (item count, ids, overall != fold) -> `bad-reply`. Injected-rejection tests exist for: generic uninstall prefix + app-data (`uninstaller.test.ts:170,400,529`), GOG (`gog/uninstallSafety.test.ts:146`), sideload (`:121`), Steam bridge install + per-game bottle (`bridgeRemovalSafety.test.ts:264,440`), Steam bottle-direct + copy removal (`steamDirectRemovalSafety.test.ts:259,461,500`), cancel-delete (`cancelDelete.test.ts:401,465`), resetHeroic (`shellFilesFlows.test.ts:792`). `RemovalRefusedNotice`, FrontendMessage and i18n exist. All pass in my run. |
| 4 | SC4: uninstall never deletes a sibling; adversarial table (nested installdir, `.\x`, `C:\x`, UNC, symlink, case, NFC/NFD) on macOS, Windows, Linux | VERIFIED | `gamelib-safety/tests/adversarial.rs` (1150 lines, 42 tests) has every named row (nested/reverse nesting/equal, lexical rows for `.\x`, `C:\x`, UNC string + verbatim, symlink root/trailing separator/inside tree/to another install, case-insensitive, NFC/NFD, protected roots, trust-root outside/equal, prefix and sideload shape, all-or-nothing, idempotent re-delete). Local `cargo test -p gamelib-safety`: 25 + 42 pass; gamelib-testutil 8 pass. CI step `cargo test -p gamelib-safety -p gamelib-testutil` runs first on the macos/windows/ubuntu matrix (rust-test.yml:117-120); Rust test run 44794278539 all legs success; `require_link` panics on CI so a link row cannot silently skip there. D-09 nested co-install bug is fixed through the crate (steamDirectRemovalSafety.test.ts passes). Weaker spots: WR-06 (sideload heuristic ignores sub-directories) and WR-02 below. |
| 5 | SC5: utils/bootstrap inventory and state-ownership table committed; zero-risk deletions gone | PASSED (override) | `82-UTILS-BOOTSTRAP-INVENTORY.md` (51 utils rows, 64 boot-step rows) and `82-STATE-OWNERSHIP.md` exist. CI=e2e surface: `e2eSurfaceGone.test.ts` zero-hit gate passes; grep finds no `e2eMock`/`CI === 'e2e'` in src. Dead src/backend exports and types removed with knip baseline lowered 340 -> 318 (find-deadcode PASS). Not done: `legendary/commands/*` and type-only files (operator-deferred to Phase 91 by D-19), `proxy-types.ts` kept (only `Window.api` declaration, deleting adds 808 TS errors), `fileStore.ts` kept (dead in the esbuild metafile, live as the test store behind about 27 jest suites; todo `.planning/todos/pending/2026-11-21-migrate-filestore-test-mocks-then-delete-filestore.md` filed with valid severity/platform/ready). ROADMAP SC5 text still reads as if all are gone. See Overrides. |
| 6 | The guards refuse only when safety genuinely cannot be confirmed: a normal GOG uninstall and a cancelled-install cleanup still proceed (CR-01, WR-01) | FAILED | `remove.rs:72-75` canonicalizes the trust root with a bare `dunce::canonicalize`; an absent root is `Unknown`. `gog/games.ts:1122-1131` sends `trustRoot: gogSupportPath` unconditionally, and `gog-support` is created only by gogdl for some games (setup.ts:215 says it "doesn't need to exist"; the pre-phase code was `if (existsSync(supportPath))`). So the uninstall is refused before `unins000.exe` for those users. Crate test `adversarial.rs:978 unknown_a_missing_trust_root_refuses` pins the over-refusal; the fake transport ignores trust roots and `gog/uninstallSafety.test.ts` always `mkdirSync`s the support dir, so nothing catches it. Same cause in `cancelDelete.ts:228-257`. Fail-closed (no data lost), but it breaks an existing core flow and the failure is silent to every test. |
| 7 | The live sidecar -> shell safety round trip works in the real app | PRESENT_BEHAVIOR_UNVERIFIED | Wired: `ipc_contract.rs:314-315,439-440`, `rust_dispatch.rs:77`, `safety_dispatch.rs`, `RUST_SAFETY_*` channels, in-process Rust arm tests in `main.rs:4394-4450`. No test crosses the real hop; all guard-site tests use `fakeSafetyRustInvoke`. Routed to human verification. |

**Score:** 5/7 truths verified (1 present, behavior-unverified; 1 failed). The score counts SC5 as PASSED (override).

### Overrides

SC5 is carried as PASSED (override) on the strength of operator ruling D-19 in `82-CONTEXT.md` and CONTEXT's own pre-ruling that a live `fileStore.ts` is Phase 85 scope. The later-phase scopes that absorb the deferred items are: Phase 91 SC4 (legendary TypeScript deleted, which takes `legendary/commands/*`) and Phase 85 SC5 (TS write-through mirror deletion point, which is where `fileStore`/`store_backend` go). Neither later phase names `fileStore.ts` or `legendary/commands` explicitly, so the operator should either edit ROADMAP SC5 / add the items to the Phase 85 and 91 plans, or confirm the override.

### Deferred Items

None filed as deferred under the strict rule (no later-phase success criterion names these items verbatim). See the override above.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src-tauri/crates/gamelib-safety/` (lib, remove, safe_path, tri, wire, tests/adversarial.rs) | tri-state + safe_path + guarded delete, Tauri-free | VERIFIED | Substantive (2322 lines), wired via `safety_dispatch.rs` and `ipc_contract.rs`, in workspace and `EXPECTED_LOCKFILE_CRATE_NAMES` |
| `src-tauri/crates/gamelib-testutil/` (`FakeHome`) | Rust twin of createFakeHomeProfile | VERIFIED | 8 tests pass, used by safety tests |
| `src-tauri/crates/README.md` rules section | "destructive guards refuse on Unknown", "one shared safe_path; never derive a trust root from validated data" | VERIFIED | lines 45-59 |
| `src/backend/safety/rustSafety.ts` | single fail-closed adapter | VERIFIED | answers-request check, outcome/verdict agreement, one catch |
| `src/backend/safety/knownInstalls.ts`, `protectedRoots.ts` | cross-store known installs, settings-derived roots | VERIFIED (see WR-02, IN-04) | `null` on a throwing manager read -> crate Unknown |
| `src/backend/testUtils/censusFloor.ts` | shared floor guard | VERIFIED | |
| `src/backend/testUtils/rawRecursiveDeletes.ts` | delete detector for the gates | PARTIAL | blind spots, WR-07 |
| `src/common/types/safety.ts`, `safetyWireParity.test.ts` | TS wire mirror + parity | VERIFIED | test passes |
| `RemovalRefusedNotice`, `pushRemovalRefusal` | visible refusal notice via notice stack, i18n | VERIFIED (render is human) | tests pass; `remove-bottle` kind never emitted (IN-02) |
| `82-TEST-LEDGER.md`, `82-UTILS-BOOTSTRAP-INVENTORY.md`, `82-STATE-OWNERSHIP.md` | committed docs | VERIFIED | |
| `src/backend/sidecar/fileStore.ts` | deleted after live-or-dead check | NOT DELETED (override) | live as jest test store |
| `src/common/types/proxy-types.ts` | deleted | KEPT (override) | only `Window.api` declaration |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| uninstaller.ts / utils.ts resetHeroic / gog / sideload / steam uninstall, bridge bottle, cancel, copy removal | `rustSafety.checkRemoval` / `guardedRemoveTree` | direct import | WIRED | every site read; no raw TS recursive delete remains in these paths except the allowlisted cancelDelete critical-section `rmSync` (WR-09) and `removeCreatedBottleDir` (provisioning of a bottle this call just created) |
| `rustSafety` | Rust `safety_check_removal` / `safety_remove_tree` | `requestRustInvoke` -> `rust_dispatch.rs:77` -> `safety_dispatch.rs` -> `gamelib_safety::dispatch` | WIRED (live hop unexercised) | |
| `remove_tree` | delete | re-runs every check, deletes only on overall Yes | VERIFIED | `remove.rs` evaluate -> overall -> allows() |
| CI | gamelib-safety | rust-test.yml first test step, three-OS matrix | WIRED | run 44794278539 |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| GOG removalRequest | `knownInstalls`, `protectedRoots`, `trustRoot` | every library manager `getListOfGames`, settings/paths, `gogPaths` | yes, but `trustRoot` points at a directory that need not exist | HOLLOW for the trust-root input (gap 1) |
| Steam copy / cancel requests | install root, `commonRoot` | ACF read + path math | yes | FLOWING (cancel: see WR-01) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase jest suites (safety, testUtils, censuses, e2e gate, uninstall guard suites, bridgeCensus) | `npx jest <30 paths>` | 30 suites, 704 tests passed | PASS |
| Safety crate incl. adversarial table | `cargo test -p gamelib-safety -p gamelib-testutil --offline` | 25 + 42 + 8 passed | PASS |
| Ratchet gates | `pnpm planning-gates / steam-line-ceiling / backend-di-ceilings / gameinfo-narrowing-ceiling / find-deadcode` | all PASS | PASS |
| CI at final proof sha | `gh run list --commit 2345c2686...` | 5 workflows success (Rust test attempt 2) | PASS |
| Absent trust root | read of `remove.rs:72-75` + `adversarial.rs:978` | returns Unknown | confirms CR-01 (not run against GOG shape) |

### Probe Execution

Not applicable (no phase-declared probe scripts).

### Requirements Coverage

`.planning/REQUIREMENTS.md` does not exist; the live file is `.planning/REQUIREMENTS-v0.11.md`.

| Requirement | Source plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| FND-01 | 82-01, 82-02, 82-04, 82-10, 82-12, 82-13, 82-15, 82-16 (summaries `requirements-completed`) | Every backend suite green or retired with reason; drift gates cannot pass vacuously | SATISFIED (hardening gaps WR-07/WR-08 for the "cannot pass vacuously" half) | Truths 1, 2; CI green at 2345c2686 |
| FND-02 | 82-03, 82-05..82-09 | Destructive ops refuse on unknown; no sibling deletion on macOS/Windows/Linux | PARTIALLY SATISFIED | Truths 3, 4 hold; truth 6 failed (the guard also refuses a legitimate GOG uninstall); live hop unverified |

Both IDs appear in REQUIREMENTS-v0.11.md and in the traceability table (rows 70-71, "Complete", checked by hand by 82-12). No orphaned requirement IDs mapped to Phase 82. The checkboxes for FND-02 should not stay `[x]`/Complete until gap 1 is closed.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `gamelib-safety/src/remove.rs` | 72-75 | absent trust root -> Unknown | BLOCKER | CR-01 |
| `gamelib-safety/src/remove.rs` | 72 | empty trustRoot treated as none, containment skipped | WARNING (latent) | WR-04 |
| `testUtils/rawRecursiveDeletes.ts` | 95-118 | detector blind spots | WARNING | WR-07 |
| `gamelib-safety/tests/adversarial.rs` | 371-403 | no row-count assertion | WARNING | WR-08 |
| `steam/library/acfState.ts` | 310-345 | `refuseUnsafeCopy` returns null (proceed) when the ACF is not `installed`, has no path, or the root cannot be placed | WARNING | WR-05; bounded because `remove_copy` has its own symlink-root, installdir-shape and downloading guards (D-21), but the cross-store sibling check is skipped on that path and the verdict can disagree with the delete if Steam rewrites the ACF in between |
| `sidecar/sidecarRpc.ts` | 131-157, 535-543 | `safety_remove_tree` not in `UNBOUNDED_RUST_CHANNELS` | WARNING | WR-03: 60 s timeout reports `failed` while Rust keeps deleting; retry can start a second concurrent delete |
| `steam/cancelDelete.ts`, `bridgeBottleLifecycle.ts` | 228-272, 206-260 | verify-then-delete by Node `rmSync` / `cxbottle`, outside the Rust delete-time re-check | WARNING | WR-09; both are named, accepted exceptions but the window is unbounded |
| `gamelib-safety/src/remove.rs`, `safe_path.rs` | 38-48,111; 128-157 | one unresolvable protected-root/known-install path (unplugged Windows drive, relative user setting) makes every removal Unknown | WARNING | WR-02; fail-closed, never ran on Windows locally |
| `remove.rs` | 210-242 | sideload "shared" heuristic ignores sub-directories | WARNING | WR-06 |
| TODO/FIXME/XXX debt markers in phase-touched files | n/a | not scanned beyond the files above | n/a | gates (`planning-gates`, `find-deadcode`) pass |

IN-01..IN-05 (reparse-point classification, unused `remove-bottle` kind, sideload `refused` reported as `failed`, in-progress installs not in the known list, CI `timeout-minutes` and deny.toml reason text) are confirmed from the review and are non-blocking.

### Context-Decision Check (D-01..D-22)

Honored: D-01 (gate set green; pre-push gates reproduce), D-03 (nothing retired; operator decisions recorded), D-04 (single ledger), D-05 (floor plus empty-input on all named gates), D-06/D-07 (one Rust crate, adopted by live TS, README rules), D-08 (FakeHome in gamelib-testutil, README rules), D-09 (nested bug fixed), D-11 (uninstall, prefix, bridge bottle, resetHeroic guarded; clearCache not), D-12 (one rejection test per guard), D-13 (notice stack, i18n, tile returns), D-14 (check-all-before-delete is per call in `evaluate`; uninstallGameCallback checks the prefix before uninstalling), D-15/D-21 (links unlinked; steampoll keeps refusing), D-16, D-17, D-18, D-19 (documented in ledger), D-20 (Rust CI reds fixed, observed green), D-22 (sideload stricter; WR-06 is a hole in the heuristic).
Not fully honored: D-10 is bounded by design to GameLib-side deletes; `utils.ts` `removeFolder` (cancelled-download folder for Epic/GOG/Amazon, contained and name-validated by `resolveFolderToRemove`) is an out-of-D-10 recursive delete, recorded by the review as accepted.

### Human Verification Required

#### 1. Live safety round trip and refusal toast

**Test:** `pnpm tauri:dev` (restart so the sidecar rebuilds), then (a) uninstall a throwaway sideloaded game whose folder contains another installed game's folder; (b) uninstall a throwaway GOG game (after the CR-01 fix; before it, expect a refusal when `gog-support` is absent); (c) reset with a populated profile only on a throwaway profile.
**Expected:** (a) bottom-right notice naming the game and the other game, "Nothing was deleted", tile back to its prior state, files intact; (b) uninstall completes; the sidecar log shows the safety calls answered by Rust.
**Why human:** every guard-site test uses `fakeSafetyRustInvoke`; no test crosses the real sidecar -> shell hop and the toast render is visual.

### Gaps Summary

One defect blocks the goal as stated, and three weaken its "cannot fail open / cannot pass vacuously" promise:

1. **CR-01 / WR-01 (blocker).** The crate treats an absent trust root as Unknown. GOG always sends `gog-support`, which usually does not exist, so GOG uninstall is refused for those users; a cancelled Steam install before the first write is refused too. Fix in the crate (`canonical_location` for the trust root), then add a Rust row and a GOG/cancel test that does not pre-create the folder. This is also the one defect the fake transport structurally cannot see, which is why 16 plans of green tests missed it.
2. **WR-04 (partial).** Empty `trustRoot` should be Unknown, not "no trust root".
3. **WR-07 (partial).** Widen the raw-delete detector to member calls on any receiver and non-literal options, with probe tests.
4. **WR-08 (partial).** Assert the lexical-row filters matched.

WR-02, WR-03, WR-05, WR-06, WR-09 and IN-01..IN-05 are real but fail closed or are bounded by other guards; fold them into the same closure plan where cheap (WR-03 is a one-line change to `UNBOUNDED_RUST_CHANNELS`). After gap 1 closes, the live round trip (above) is the only remaining human item. The acknowledged deferrals (`fileStore.ts`, `proxy-types.ts`, `legendary/commands/*`, type-only files) are acceptable and recorded as an override; they do not block the goal, but the ROADMAP SC5 wording and Phases 85/91 should name them so they are not lost.

---

_Verified: 2026-11-21_
_Verifier: Claude (gsd-verifier)_
