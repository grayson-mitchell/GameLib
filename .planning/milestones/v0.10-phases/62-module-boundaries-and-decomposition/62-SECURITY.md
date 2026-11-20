---
phase: 62
slug: module-boundaries-and-decomposition
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-10
---

# Phase 62 - Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| gate tests -> child process | boundaryGates.test.ts spawns depcruise | env/HOME (isolated via fake-HOME) |
| sidecar <-> Rust shell | channel-name parity | IPC channel names |
| backend module moves | install/launch/uninstall/depot code relocated | filesystem paths, env/argv, logs |
| common/ types -> backend | type-only umbrella IPC types | none at runtime |
| live smoke -> UAT docs | operator pastes log excerpts | tokens/account ids (must be absent) |

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation / Evidence | Status |
|-----------|----------|-----------|-------------|------------------------|--------|
| T-62-SC | Tampering | dependency-cruiser add | mitigate | exact pin `"dependency-cruiser": "18.7.2"` package.json:174; pnpm-lock.yaml:260,3081 | closed |
| T-62-01 | Info disclosure | boundaryGates spawn | mitigate | meta/__tests__/boundaryGates.test.ts:102,111,136,427-435 (createFakeHomeProfile, childEnv, dispose in finally); fakeHomeIsolation.test.ts PASS | closed |
| T-62-02 | Repudiation | gate silently passing | mitigate | boundaryGates seeded-violation cases (lines 145-330) pass; boundaryWiring near-miss arms | closed |
| T-62-03 | Repudiation | boundaryRatchet.cjs | mitigate | Ratchet deleted in 62-20 (c7e945e75). Replaced by ESLint `no-restricted-syntax` at `'error'` (eslint.config.mjs, selectors in meta/runnerLiteralSelectors.cjs) and depcruise rules all at error/zero with no baseline. boundaryWiring.test.ts:75-88 pins error severity and near-miss rejects warn/missing import. Threat (silent weakening) is covered by T-62-38 pins; ratchet-specific controls (minFiles/ceiling) no longer applicable. | closed |
| T-62-04 | Info disclosure | boundaryRatchet CLI arm | mitigate | Test deleted with ratchet; no spawn remains. Only spawn is boundaryGates (fake-HOME, see T-62-01) | closed |
| T-62-05 | Repudiation | lint.yml / pre-push wiring | mitigate | meta/__tests__/boundaryWiring.test.ts:55,59,65,90 (lint.yml step, pre-push chain, near-miss); .github/workflows/lint.yml:34-35; .husky/pre-push line 2 contains `pnpm boundaries`; PASS | closed |
| T-62-06 | DoS | pre-push reflow | mitigate | boundaryWiring.test.ts:59 + tsconfigMeta.test.ts PASS; pre-push line 2 intact | closed |
| T-62-07 | DoS | sidecar<->Rust channel drift | mitigate | Arm-set parity now in src/backend/__tests__/tauriShellSource.test.ts and sidecarTransport RUST_INVOKE_CHANNELS (later phases 67/71 moved to generated enum). Parity tests pass; the 1 failing test in that file is an unrelated WR-07 `.title(` literal check | closed |
| T-62-08 | Tampering | Rust comment-only edit | accept | See Accepted Risks Log AR-62-01 | closed |
| T-62-09 | Tampering | parseSteamStorageRequirement move | mitigate | storeManagers/steam tests PASS (134 suites incl. games tests) | closed |
| T-62-10 | Info disclosure | DRM trace/log helpers moved | mitigate | meta/logSecretGate.ts + logSecretGate.test.ts exist and pass (W-1 fixed in quick 261110-uog) | closed |
| T-62-11 | DoS | duplicated session state | mitigate | steam suites PASS; split modules enforced by depcruise `games-split-modules-are-leaves` (.dependency-cruiser.cjs) | closed |
| T-62-12 | Tampering | containment/bottle moved | mitigate | steam __tests__ PASS (games.test.ts unchanged per 62 summaries) | closed |
| T-62-13 | EoP | TS `private` removal | accept | AR-62-02; todo filed and later completed: .planning/todos/completed/2026-11-06-renarrow-steamgame-member-visibility-after-62-lift.md | closed |
| T-62-14 | Tampering | launch env/argv moved | mitigate | steam launch tests PASS; live smoke 62-UAT.md item with DRM trace (line 24) = pass | closed |
| T-62-15 | Info disclosure | launch logging moved | mitigate | logSecretGate meta test passes (W-1 fixed in quick 261110-uog) | closed |
| T-62-16 | Tampering | uninstall path handling | mitigate | games + removeCopies tests PASS (steam suite) | closed |
| T-62-17 | Repudiation | cleanups mixed into moves | mitigate | cleanups tracked as todos (planning-gates enforced); re-narrow todo exists | closed |
| T-62-18 | Tampering | resolveContainedPath/PathTraversalError | mitigate | depot tests (depot/*.test.ts) PASS incl. traversal cases | closed |
| T-62-19 | Tampering | sha1File | mitigate | reconcile/depot tests PASS | closed |
| T-62-20 | Tampering | downloadDepotFiles/finalizeToSteam | mitigate | depot.*.test.ts PASS | closed |
| T-62-21 | DoS | sidecar bundle resolution | mitigate | 62-20-SUMMARY: build:sidecar-sea + smoke:sidecar PASS; meta/__tests__/buildSidecarSea.test.ts present | closed |
| T-62-22 | Tampering | IPC channel dropped from umbrella | mitigate | src/backend/sidecar/__tests__/ipcDomainCensus.test.ts (a)-(d) + near-misses :171-291; PASS | closed |
| T-62-23 | EoP | common/ imports backend/sidecar | mitigate | grep of src/common/types/ipc: no import from backend/sidecar (`./sidecarInternal` is a local file). Type-only imports of backend/platform, backend/utils/systeminfo, backend/logger/paths, backend/store/storeEmbedSeam exist (erased at compile, none touch sidecar) | closed |
| T-62-24 | Info disclosure | smoke logs | mitigate | 62-UAT.md:12,53 state "no tokens or account ids"; grep for token/secret/cookie/steamid shows only that statement | closed |
| T-62-25 | Repudiation | stale sidecar | mitigate | 62-UAT.md:15-16 (mtime check, pass) | closed |
| T-62-26 | Tampering | store flag values | mitigate | src/common/__tests__/storeCapabilities.test.ts PASS | closed |
| T-62-27 | DoS | storeCapabilities[undefined] | mitigate | hasCapability src/common/storeCapabilities.ts:140; tests lines 66 (`undefined, null, 'humble', 'nonsense', '', 'toString'`) and 88-102 PASS | closed |
| T-62-28 | Spoofing | Epic offline-mode hook | mitigate | src/backend/__tests__/storeLaunchHooks.test.ts PASS | closed |
| T-62-29 | DoS | import cycle at boot | mitigate | 62-20-SUMMARY smoke:sidecar PASS; depcruise no-circular rules; boundaryGates real-repo clean | closed |
| T-62-30 | Tampering | gating flips | mitigate | storeCapabilities.test.ts pins PASS | closed |
| T-62-31 | DoS | hasCapability non-Runner | mitigate | same as T-62-27 | closed |
| T-62-32 | Spoofing | protocol.ts routing | mitigate | isStore swap; backend protocol tests in suite (62-VERIFICATION 10/10 passed) | closed |
| T-62-33 | Spoofing | signInProbe humble | mitigate | storeCapabilities isStore tests (humble) PASS; 62-VERIFICATION | closed |
| T-62-34 | Spoofing | WebView login identity | mitigate | 62-VERIFICATION passed; isStore tests | closed |
| T-62-35 | Tampering | install-flow predicate | mitigate | src/backend/sidecar/installFlowRegistration.ts and installFlows.test.ts PASS | closed |
| T-62-36 | Tampering | store control on game page | mitigate | storeCapabilities.test.ts PASS | closed |
| T-62-37 | Tampering | install modal flow | mitigate | shared predicate truth table (storeCapabilities.test.ts 100-102) PASS | closed |
| T-62-38 | Repudiation | ratchet deletion weakens gate | mitigate | boundaryWiring.test.ts:65-88 (script depcruise only, eslint error severity, near-miss); boundaryGates.test.ts:439-444 (real repo clean, no baseline file); `pnpm boundaries` script package.json:50 | closed |
| T-62-39 | Info disclosure | logs in UAT | mitigate | 62-UAT.md:12,53; 62-HUMAN-UAT.md no secrets | closed |
| T-62-40 | Repudiation | stale sidecar | mitigate | 62-UAT.md:56-57 (62-20 mtime item, pass) | closed |

*Status: open · closed*

## Warnings (non-blocking)

- W-1 (FIXED 2026-11-10, quick 261110-uog: e51427cfe, 70989e3c3, 043f8962b; uninstaller.ts now logs `stderrLength=`, gate files unchanged, logSecretGate + uninstaller jest 69/69 pass): `meta/__tests__/logSecretGate.test.ts` was red on HEAD (2 tests: "finds zero violations", non-vacuity). Cause: src/backend/utils/uninstaller.ts:139,150 log `result.stderr` (kind process-output), added by quick tasks 261107-td5 / 261108-anw and edited in 66.1-12, after phase 62. Not a phase 62 regression, but the T-62-10/15 gate mechanism is currently failing and should be fixed (redact or allowlist) outside this phase.
- W-2: Unrelated failing steam/tauriShell tests on HEAD (macArchKnownFixRouting, steamStartupKeyringDeferral, installFormIpc, tauriShellSource WR-07); none cover a phase 62 threat.
- Unregistered flags: none (summaries 05-08 report "None").

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-62-01 | T-62-08 | Rust source edit is comment-only; no behavior change | plan 62-04 (plan-time) | 2026-11-10 |
| AR-62-02 | T-62-13 | TS `private` removal is compile-time only; re-narrow todo filed in 62-08 and completed | plan 62-08 (plan-time) | 2026-11-10 |

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-10 | 41 | 41 | 0 | gsd-security-auditor |
| 2026-11-10 | 41 | 41 | 0 | W-1 fix re-check (quick 261110-uog): T-62-10/15 warnings cleared |

## Sign-Off

- [x] All threats have a disposition
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-10
