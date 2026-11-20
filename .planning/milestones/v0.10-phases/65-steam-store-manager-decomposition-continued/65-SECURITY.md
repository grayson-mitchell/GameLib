---
phase: 65
slug: steam-store-manager-decomposition-continued
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-08
---

# Phase 65 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Phase 65 is a pure-move decomposition of the Steam store manager plus a new 1,000-line ceiling
gate (`meta/steamLineCeiling.cjs`). The register below was authored at plan time across 65-01 to
65-20 (54 unique threats; T-65-23 appears in both 65-08 and 65-09). Audit mode: verify that the
mitigations exist, with no scan for new threats.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| CI config -> merge decision | lint.yml and pre-push decide whether code lands | gate verdicts (integrity) |
| user credentials / Steam Guard codes / refresh tokens -> sidecar | sign-in flows handle secrets | credentials, tokens (high) |
| product keys -> Steam CM | redeem flow handles a secret key | product keys (high) |
| Steam CM authenticated session -> depot install | install paths acquire authenticated sessions (`acquireAuthenticated`, `allowLogon`) | authenticated session (high) |
| Steam CM (owned apps) -> library sync | `syncOwnedLibrary` writes remote data into the local library store | owned-app list (medium) |
| Steam store metadata (network) -> GameInfo | `fetchMetadataIfNeeded` writes remote data; validates numeric appId (T-06-01) | public metadata (low) |
| install form IPC (renderer) -> installFormIpc | renderer-supplied appName reaches eligibility checks | app identifiers (medium) |
| filesystem paths from ACF/VDF -> install-root resolution | untrusted on-disk manifests feed path joins | paths (medium) |
| on-disk ACF manifests -> install-copy removal | `removeSteamInstallCopy` deletes directories derived from manifest data | delete targets (high) |
| per-game bottle names -> filesystem deletes | `removePerGameBridgeBottle` deletes a directory derived from a name | delete targets (high) |
| bottle settings -> Wine runner selection | `getBridgeBottleSettings` and the DRM runner registry decide which runner a launch uses | runner choice (medium) |
| launch dispatch -> Wine / bridge / DRM routes | which route a title takes decides what runs and with which runner | executable choice (medium) |
| game exe path + bottle settings -> Wine child process | `fireBridgeWineLaunch` spawns the game under Wine | argv / env (medium) |
| game install directory -> shim placement | the sidecar overwrites game DLLs and keeps backups of originals | game binaries (high) |
| CrossOver bundle on disk -> cloned, re-signed runner | the sidecar copies and re-signs a third-party binary tree | signed binaries, entitlements (high) |
| sidecar -> Wine `reg add` and bottle file restore | registry writes and DLL restores inside a user bottle | registry / DLLs (medium) |
| sidecar -> per-app bridge helper child process (local TCP port) | helper processes speak to games over localhost | local IPC (medium) |
| Wine/CrossOver child processes -> sidecar logs | provisioning output can carry secrets into logs | log text (medium) |
| sidecar process lifetime -> poll timers | a referenced timer keeps the sidecar alive past stdin EOF | process lifetime (availability) |
| live Steam account session -> sidecar | the smoke uses the operator's real profile | real profile data (high) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-65-01 | Tampering | meta/steamLineCeilingBaseline.json | mitigate | shrink-only evaluate (growth and new over-ceiling files fail); no `--update` flag; wiring test pins the CI step | closed |
| T-65-02 | Repudiation | gate silently scanning zero files | mitigate | scanned-file floor in `main()`, CLI arm proves a below-floor root exits non-zero | closed |
| T-65-03 | Information disclosure | CLI test arm spawning node | mitigate | `createFakeHomeProfile()` env, enforced by `fakeHomeIsolation.test.ts` | closed |
| T-65-04 | Tampering | .dependency-cruiser.cjs | mitigate | regex only extended (tightened); seeded arms prove the new names fire | closed |
| T-65-05 | Tampering | `isPathContainedIn` (path containment) moving to installRoot.ts | mitigate | byte-identical move; reviewer checks `git diff --color-moved=zebra HEAD~1` shows the function as moved, not edited | closed |
| T-65-06 | Denial of service | sidecar exit contract (poll timers) | mitigate | pollState.ts holds no handle (acceptance grep); timers stay with their unref (D-10/D-16) | closed |
| T-65-07 | Tampering | ratchet gates | mitigate | allowlist only lowered; depcruise untouched in this plan | closed |
| T-65-08 | Tampering | `removeSteamInstallCopy` / containment checks moving to acfState.ts | mitigate | byte-identical move verified with `git diff --color-moved=zebra`; removeCopies.test.ts stays green | closed |
| T-65-09 | Tampering | test spies silently changing coverage (spy flip) | mitigate | per-site readAcfState verdict recorded; regression check against baseline names and count | closed |
| T-65-10 | Denial of service | restart-hold state duplicated across modules | mitigate | single owner (acceptance grep) per D-10 | closed |
| T-65-11 | Denial of service | install-poll `setInterval` losing its `unref` in the move | mitigate | timer + unref move verbatim together; `npx jest -t "unref"` and acceptance greps | closed |
| T-65-12 | Tampering | spy flips masking or changing coverage of poll behaviour | mitigate | per-site audit recorded; regression check on names and count | closed |
| T-65-13 | Denial of service | uninstall/running timers losing unref | mitigate | verbatim move with state; unref tests and greps | closed |
| T-65-14 | Tampering | missed dynamic importer (macSteamAdoption require) | mitigate | explicit acceptance grep on the require specifier | closed |
| T-65-15 | Tampering | refresh lift altering sync semantics | mitigate | only `this.` call rewrites allowed (acceptance `grep -c "this\."` = 0 in refresh.ts; any other `this` use stops the task) | closed |
| T-65-16 | Spoofing | authenticated vs anonymous client path in refresh | mitigate | refresh/anon-capture/ungranted describes move intact and must pass; `steamAuthSessionPolicy.test.ts` runs in the adjacent suite at 65-10 | closed |
| T-65-17 | Denial of service | sidecar SEA bundle failing to resolve the new directory | mitigate | build:sidecar-sea + smoke:sidecar in verify | closed |
| T-65-18 | Information disclosure | `// log-secret-gate-exempt` in provisionBottle | mitigate | comment moves verbatim; logSecretGate pinned list updated in the same commit; failures compared to adjacent baseline | closed |
| T-65-19 | Denial of service | raise timers losing unref | mitigate | state, seam and unref move together (D-10); unref tests | closed |
| T-65-20 | Tampering | partial jest.mock factories hitting real modules | mitigate | per-owner `jest.mock` added for each moved name (Pitfall 2) | closed |
| T-65-21 | Tampering | bridge bottle readiness / settings resolution | mitigate | byte-identical move reviewed with `--color-moved`; bridgeBottle tests carry the readiness cases | closed |
| T-65-23 | Tampering | DRM runner registry duplicated | mitigate | single owner (D-10) with acceptance grep | closed |
| T-65-21a | Tampering | `guardPerGameBridgeBottleName` path guard | mitigate | byte-identical move reviewed with `--color-moved`; bridgeBottleLifecycle tests carry the guard cases | closed |
| T-65-22 | Information disclosure | `provisionBridgeBottle` exemption | mitigate | comment verbatim; pinned list updated in same commit; compared to adjacent baseline | closed |
| T-65-24 | Information disclosure | smoke:sidecar real-profile arm | accept | named exemption of the two-profile rule (`meta/sidecarStartupSmoke.cjs`); no captures written by this plan | closed |
| T-65-25 | Denial of service | sidecar not exiting after moved timers | mitigate | smoke:sidecar + unref tests before the live run | closed |
| T-65-26 | Elevation of privilege | authenticated-session policy scan (steamAuthSessionPolicy Rules E/F) going vacuous | mitigate | allow-lists updated with the new files plus non-vacuity assertions; suite in verify | closed |
| T-65-27 | Tampering | install-root resolution moving | mitigate | byte-identical move; installLocation scan retargeted | closed |
| T-65-28 | Information disclosure | token/credential handling moving to userSignIn.ts | mitigate | keyringTokenStore text scan retargeted to all new files with non-vacuity; password-storage tests move intact | closed |
| T-65-29 | Information disclosure | redeem key logged after move | mitigate | body moves verbatim; steamAuthFlows redeem-logging assertions in verify | closed |
| T-65-30 | Elevation of privilege | `acquireAuthenticatedWithToken` losing `private` | accept | D-15 accepted it; only userSignIn.ts calls it (acceptance can grep callers) and steamAuthSessionPolicy Rules E/F still pin authenticated acquisition sites | closed |
| T-65-31 | Spoofing | stale sign-in state after logout | mitigate | `resetSignInState()` replaces the same reset statements in the same position; logout tests stay green | closed |
| T-65-32 | Tampering | appId validation inside fetchMetadataIfNeeded | mitigate | body lifted verbatim (only `this.` -> `steamGame.`); acceptance grep `this\.` = 0; metadata tests unchanged in substance | closed |
| T-65-33 | Tampering | eligibility routing via installFormIpc | mitigate | same free function called with same instance; installFormIpc.test.ts in suite | closed |
| T-65-34 | Tampering | removed spies silently dropping coverage | mitigate | restructured tests recorded; regression check requires test count >= baseline | closed |
| T-65-35 | Tampering | Wine launch argv/env construction | mitigate | byte-identical move; `git diff --color-moved=zebra` review | closed |
| T-65-36 | Denial of service | process-monitor `onStopped` -> `stopBridgeHelper` wiring | mitigate | moves intact with the function; games.test.ts launch suites in regression check | closed |
| T-65-37 | Denial of service | exit teardown / unref of helper children | mitigate | registry owns `installExitTeardownOnce` + `unrefHandle`; smoke:sidecar + unref tests in verify (D-10) | closed |
| T-65-38 | Tampering | duplicated registry state leading to orphaned helpers | mitigate | single-owner acceptance grep; ChildProcess `let` source assertion over all three files | closed |
| T-65-39 | Information disclosure | helper spawn env override | accept | test-only seam, unchanged semantics; spawn env built byte-identically | closed |
| T-65-40 | Tampering | original-DLL fingerprint/backup/restore | mitigate | the mutually dependent group moves as one module byte-identically; originalRestore tests in suite | closed |
| T-65-41 | Tampering | source scan going vacuous after the move | mitigate | non-vacuity assertion on the retargeted scan | closed |
| T-65-42 | Tampering | `isContained` / `safeRemove` / `removeInside` (path containment for deletes) | mitigate | byte-identical move reviewed with `--color-moved`; runnerCrossover tests carry the containment cases | closed |
| T-65-43 | Elevation of privilege | entitlement plist / re-sign logic | mitigate | moved verbatim with `resignCounter`; runnerEntitlements tests in suite | closed |
| T-65-44 | Tampering | verify marker/mtime pins | mitigate | `MTIME_PINNED_PATHS` moves with its user; runnerVerify tests and the retargeted source scan | closed |
| T-65-45 | Tampering | `regEscape` / registry command construction | mitigate | byte-identical move; drmRegistry tests in suite | closed |
| T-65-46 | Denial of service | `runRegArgv` timer losing unref | mitigate | moved verbatim; acceptance grep + unref tests | closed |
| T-65-47 | Tampering | DLL restore of DRM originals | mitigate | byte-identical move; drmRestore tests in suite | closed |
| T-65-48 | Tampering | launch/install routing changed by a conversion | mitigate | lifts rewrite only the call form (`x.fn()` -> `fn(x)`); route tests in games.test.ts must pass with count >= baseline | closed |
| T-65-49 | Denial of service | new module cycles causing CJS init-order bugs in the SEA | mitigate | cycle census <= baseline after every commit; build:sidecar-sea + smoke in 65-20 | closed |
| T-65-50 | Repudiation | spies deleted rather than restructured | mitigate | test count gate + per-test restructure log in SUMMARY | closed |
| T-65-51 | Tampering | quietly loosened gates over the phase | mitigate | depcruise diff shows additions only; allowlist `{}`; knip ratchet green | closed |
| T-65-52 | Information disclosure | standing log-secret / credential scans | mitigate | adjacent suite (logSecretGate, keyringTokenStore, steamAuthSessionPolicy) compared to baseline | closed |
| T-65-53 | Denial of service | sidecar exit contract after all moves | mitigate | smoke:sidecar + unref tests + live run | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

### Verification notes (2026-11-08 audit)

- **T-65-01 / T-65-02:** code review found and fixed real holes in the gate during this phase.
  CR-01 (`2099d4065`): an at/under-ceiling baseline entry let a file grow without limit. WR-01
  (`770a9d2b0`): any `*.generated.*` name was exempt. WR-02 (`919e0c1b1`): a non-numeric
  `--min-files` disabled the floor. All three are fixed; the gate prints PASS (170 files, 0
  allowlisted) and the baseline is `{}`.
- **T-65-49 deviation:** the register text says "cycle census <= baseline". That literal condition
  is **not** met: the raw count is 482 against a 321 baseline. It is closed against the
  user-revised D-19 rule (65-10): every new cycle origin is a phase-65 split product of a
  baseline-listed file (30 modules; 5 spot-checked with `git log --diff-filter=A`), no foreign
  module originates a cycle, the named `CYCLE_EDGES` test in `gamesModuleSurface.test.ts` passes,
  and the depcruise leaf rules are at 0 violations. 24 non-steam modules appear as new transit
  nodes on the pre-existing backend-wide strongly connected component; the baseline file does not
  record transit nodes, so this cannot be compared either way.
- **T-65-52:** `logSecretGate.test.ts` fails 2 tests, both in the pre-phase
  `65-baseline-adjacent.txt`; the only reported violations are `src/backend/utils/uninstaller.ts`
  `:131` and `:142` (not steam).
- **T-65-17, T-65-25, T-65-53:** closed on recorded evidence (65-10 / 65-20 SUMMARYs:
  `build:sidecar-sea` 0, `smoke:sidecar` PASS, live smoke runs 1 and 2). Not re-run by this audit.
- **T-65-35:** closed on the 65-14 SUMMARY and the green `games.test.ts` suite; the auditor did not
  diff the Wine argv/env construction itself.
- **T-65-21:** `listReadyBridgeBottleNames` is not byte-identical: one line changed from
  `PER_GAME_BRIDGE_BOTTLE_PATTERN.exec(entry)` to `perGameBridgeBottlePattern().exec(entry)` (lazy
  accessor). Same semantics; `bridgeBottle` tests pass.
- **T-65-44 (low coverage gap):** the `runnerClone.test.ts` import-discipline source scan reads
  `runnerClone.ts`, `runnerCrossover.ts` and `runnerEntitlements.ts` but not `runnerVerify.ts`. A
  manual grep of `runnerVerify.ts` found none of the forbidden patterns, but a later regression
  there would not be caught. Not blocking.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-65-01 | T-65-24 | `smoke:sidecar` runs on the operator's real profile by design: it is the named real-profile arm of the two-profile rule (`meta/sidecarStartupSmoke.cjs`, still declared in `fakeHomeIsolation.test.ts:108`). This phase writes no captures from it. | plan 65-10 (two-profile rule) | 2026-11-08 |
| AR-65-02 | T-65-30 | `acquireAuthenticatedWithToken` loses `private` as part of the user.ts split. Condition re-verified: the only non-test caller is `userSignIn.ts:61` (definition `user.ts:256`), and `steamAuthSessionPolicy` Rule L pins the acquisition sites; the suite passes. | user decision D-15 (65-CONTEXT) | 2026-11-08 |
| AR-65-03 | T-65-39 | The helper spawn env override is a test-only seam with unchanged semantics; the env is built as `getBridgeHelperSpawnEnvOverride() ?? process.env` (`helperSpawn.ts:165`). | plan 65-15 | 2026-11-08 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-08 | 54 | 54 (incl. 3 accepted) | 0 | gsd-security-auditor (sonnet), via /gsd-secure-phase 65 |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-08
