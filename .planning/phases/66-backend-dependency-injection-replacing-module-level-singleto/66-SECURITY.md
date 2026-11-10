---
phase: 66
slug: backend-dependency-injection-replacing-module-level-singleto
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-11
---

# Phase 66 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| backend -> child processes | The one process runner (`src/backend/process/runner.ts`) spawns argv-only children | argv, env (pinned profile), stdout/stderr that may contain secrets |
| tests -> operator profile | Tests that spawn or boot the sidecar must not touch the real HOME / Keychain | HOME, env, secret stores |
| sidecar boot -> RPC / secret stores | Boot step ordering decides when the keyring / dev-vault arms install | tokens, secrets |
| CI gate (backendDiCeilings) | Ratchet census that must not silently pass | file counts, shard baselines |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Evidence (file:line) | Status |
|-----------|----------|-----------|-------------|----------------------|--------|
| T-66-01 | Tampering/Elevation | runner run/spawnLongLived/runSync | mitigate | argv arrays everywhere (`runner.ts:60,150,264`); no `shell` key; asserted by `runner.test.ts:505-511` (`not.toMatch(/shell:/)`); passes | closed |
| T-66-02 | DoS | run() | mitigate | `DEFAULT_RUN_TIMEOUT_MS=30_000` `runner.ts:34`; non-positive rejected before spawn `runner.ts:135-137` (runSync `:55`); SIGKILL from clock timer `:200-207`; opt-out needs `{none:true,reason}` `:121-131` | closed |
| T-66-03 | DoS (exit contract) | runner child/pipes/timers | mitigate | `unrefChild` unrefs child + stdin/stdout/stderr `runner.ts:100-105`, called `:163`, `:271`; clock timers via `deps.clock` (unref'd, `clock.ts`); `runner.test.ts:46-50` `resources()` via `getActiveResourcesInfo` | closed |
| T-66-04 | Tampering | killTracked | mitigate | `registry.ts:34-60` kills `entry.pid` only; `runner.ts:94-98` `taskkill /PID <pid> /T /F` / `process.kill(pid,'SIGTERM')`; no name-based kill (grep pkill/killall: none) | closed |
| T-66-05 | Info disclosure | logSink | mitigate | `runner.ts:210,215,320,324`: `logSink(opts.sanitize ? opts.sanitize(chunk) : chunk)`; raw stays in `RunResult`; `runner.test.ts:115-125` | closed |
| T-66-06 | Info disclosure (tests) | runner tests | mitigate | `runner.test.ts:36,41` `createFakeHomeProfile()` / `dispose()`; `baseEnv: profile.childEnv()` `:29` | closed |
| T-66-07 | Elevation | openDetached | ACCEPT | Shape verified: darwin-only guard `runner.ts:355-358`; spawn argv exactly `['-g', url]` `:362`, `detached:true, stdio:'ignore'`, no env (real session by design); exactly one `detached: true` (test `runner.test.ts:510`) | closed (accepted, see log) |
| T-66-08 | Tampering (gate evasion) | census | mitigate | AST census `meta/backendDiCeilings.cjs`; fixture test `backendDiCeilings.test.ts:86` (let Map -> const new Map counts 1), `:93` (call-returned residual pinned); 114 meta tests pass | closed |
| T-66-09 | Tampering (allowlist hole) | sanctioned table | mitigate | exact pair compare, stale entry `backendDiCeilings.cjs:543`, zero entry `:464,584`, stale baseline `:587`; no path exemption; tests pass | closed |
| T-66-10 | Repudiation (silent pass) | CLI | mitigate | file-count floors `backendDiCeilings.cjs:665,669`; shard-count >= 10 `backendDiCeilingsWiring.test.ts:75-80`; mutation probe recorded `66-02-SUMMARY.md:57-59` (grew: ... PASS after revert); 68 shard files present | closed |
| T-66-11 | Info disclosure (tests) | CLI e2e | mitigate | `backendDiCeilings.test.ts:443-457` `spawnSync(... {env: profile.childEnv()})`; `:461` create, `:480` dispose | closed |
| T-66-12 | Elevation via shell strings | backend spawn sites | ACCEPT (here) | Gate counts only; shell-string removal deferred to 66.2. Status of 66.2: NOT complete in the working tree (see log) | closed (accepted, see log) |
| T-66-13 | Info disclosure | createRealRunner default arm | mitigate | `testUtils/realRunner.ts:36-48`: fresh `createFakeHomeProfile`, `baseEnv: profile.childEnv()`, `pinnedEnv: profile.env`, `dispose` shreds `:54` | closed |
| T-66-14 | Info disclosure | real-profile arm | mitigate | `realRunner.ts:34-37` throws on empty justification; `realRunner.test.ts:23-29` | closed |
| T-66-15 | Tampering | realRunner.openDetached | mitigate | `realRunner.ts:49-53` throws; `realRunner.test.ts:36-40` | closed |
| T-66-16 | Repudiation | scripted runner | mitigate | `scriptedRunner.ts:80-81` throws `unscripted process call: cmd argv`; `expectAllConsumed` `:93-96`; tests `scriptedRunner.test.ts:32-40` | closed |
| T-66-17 | Info disclosure | bootFresh boots | mitigate | `src/backend/jest.config.js:23` `setupFiles: [jest.setupContainment.ts]`; file last changed pre-phase (git log: 2dbc96252 quick-261107, d056981fc quick-261107, not phase 66) | closed |
| T-66-18 | Repudiation | once-guard assertions | mitigate | `66-04-SUMMARY.md:56` old->new list; `bootSourceShape.test.ts` source-shape gates pass | closed |
| T-66-19 | Info disclosure | testContainment boots | mitigate | Containment assertions present and passing except one unrelated classification case (see Notes) | closed |
| T-66-20 | Repudiation | guard suites | mitigate | Guard suites present and green (bootSourceShape, devSecretVault, testContainment minus the note); SUMMARY counts recorded | closed |
| T-66-21 | Info disclosure | Humble/SteamGridDB secret store boots | mitigate | Secret stores bind via the keyring arm `bootstrap.ts` (`SidecarKeyringTokenStore`, `installSidecar*SecretStore`) which reach the keyring only over the RPC stream; bootFresh's output is an in-memory `PassThrough` (`sidecarHarness.ts:144-146`) so the real keyring is never reached; devSecretVault test uses per-test pathShim vault dir | closed |
| T-66-22 | Repudiation | migrated flows (06) | mitigate | Per 66-VERIFICATION / SUMMARY counts; shards `sidecar-tests-flows-*.json` present and gate passes | closed |
| T-66-23 | Info disclosure | steamAuth/humbleLogin/runnerAuth flows | mitigate | steamAuth: per-case `freshRegistry()` + boot `steamAuthFlows.test.ts:201,213`; humbleLogin/runnerAuth boot nothing (`66-07-SUMMARY.md:13,49`) and mock the user/token modules (`runnerAuthFlows.test.ts:98-121`) | closed |
| T-66-24 | Repudiation | migrated flows (07) | mitigate | `66-07-SUMMARY.md:51` order-coupled case statement; gate green | closed |
| T-66-25 | DoS (exit contract) | boot steps | mitigate | Runner/clock create handles only on use; step bodies moved; `smoke:sidecar` recorded in 66-VERIFICATION (not re-run here) | closed |
| T-66-26 | Tampering (double boot) | bootSidecar | mitigate | `bootstrap.ts:940-945` `if (booted) throw`; latch pinned by `bootSourceShape.test.ts:19-26` (exactly one top-level `let booted = false`) | closed |
| T-66-27 | Info disclosure | secret-store step ordering | mitigate | `BOOT_STEP_NAMES` `bootstrap.ts:~254-270`: rpc-server precedes secret-stores precedes orphaned-token-cleanup; dev-vault/keyring exclusive arm in secret-stores step. Test pins `rpc-server` anchor but not `secret-stores` itself (see Notes) | closed (note) |
| T-66-28 | Elevation (unhandled errors) | logger step | mitigate | `bootstrap.ts:1003-1030` logger step calls `setUnhandledRejectionLogSink` and `setUncaughtExceptionLogSink` | closed |
| T-66-29 | Info disclosure (tests) | bootFresh | mitigate | `sidecarHarness.ts:138-145` `createTestContext` with `userData` under fake HOME, only appRoot/publicDir from real; `testContext.ts:36-44` mkdir only for non-overridden paths; dispose in afterEach `sidecarHarness.ts:~82-86` | closed |
| T-66-30 | Info disclosure | devSecretVault/rustInvokeChannel boots | mitigate | devSecretVault mocks `../pathShim` to a per-test dir and passes (`devSecretVault.test.ts`, PASS); rustInvokeChannel boots via bootFresh with fake HOME ctx | closed |
| T-66-31 | Repudiation | migrated flows (09) | mitigate | counts / shard gate green (`backendDiCeilings*.test.ts` 114 pass) | closed |

*Status: open . closed*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-66-01 | T-66-07 | `openDetached` deliberately inherits the real session env so LaunchServices works; the only argv is `['-g', url]`, darwin only, the sole detached untracked spawn (single `detached: true` asserted by test); refused under test by `realRunner`. | phase plan 66-01 | 2026-11-11 |
| AR-66-02 | T-66-12 | Phase 66 only adds a counting gate; shell-string spawns remain in backend code. Current state (working tree 2026-11-11): `src/backend/utils/compatibility_layers.ts:35,39` still call `execSync('which wine')` / `execSync('wine --version')` (fixed strings, no interpolated input), and direct `child_process` imports remain in `utils.ts`, `spawnAsync.ts`, `config.ts`, `tools/index.ts`, `utils/macArch.ts`, `utils/helperBinaries/index.ts`, `utils/os/processes/index.ts`, `utils/graphics/vulkan/index.ts`. Phase 66.2 is planned/in progress, not complete. Tracked there. | phase plan 66-xx | 2026-11-11 |

---

## Notes (non-blocking)

- `testContainment.test.ts:1227` currently fails: `outboundHttpRegistry.test.ts` is unclassified. It was added by `371298720` (quick-261110-9w2), after Phase 66, and is not a Phase 66 regression. The per-case containment assertions themselves (T-66-19) are present. Classify the new test in the declared list.
- T-66-27: `bootSourceShape.test.ts` anchors array (`rpc-server`, `online-monitor`, ...) does not include `secret-stores` / `orphaned-token-cleanup`, so their order relative to `rpc-server` is guaranteed by the literal list and code comments but not pinned by a test. Consider adding both anchors.
- `src/backend/sidecar/bootstrap.ts` has uncommitted later-phase edits; checked against the working tree, and the checked mitigations (latch, step order, sink binding) are present there.
- Unregistered flags: none (all nine SUMMARY Threat Flags sections say "None").

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-11 | 31 | 31 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-11
