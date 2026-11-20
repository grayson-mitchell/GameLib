---
phase: 67
slug: schema-validation-at-the-sidecar-ipc-boundary
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-15
register_authored_at_plan_time: true
---

# Phase 67 - Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Verified 2026-11-15 against the code at HEAD (34d54dd49). Later phases have since changed some call sites; see notes.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| renderer -> Rust relay (`sidecar_invoke` / `sidecar_send`) | Renderer may name only generated allow-list channels | channel name (untrusted string), JSON args |
| Rust relay -> sidecar stdin | Frames are validated by the sidecar, not by Rust | JSON args incl. credentials, paths, URLs |
| sidecar `dispatchInvoke` / `dispatchSend` -> handlers | zod `validateInbound` runs before any handler or listener; unknown channel fails closed | all renderer args |
| sidecar -> Rust `rustInvoke` arms | Generated serde structs parse args (`from_args`) | typed args, URLs, cookie domains |
| rejection log / wire error -> gamelib.log, stderr, renderer | Channel, sanitised paths and issue codes only | must carry no credential or argument values |
| renderer bundle | zod must not be value-imported into the renderer | supply-chain size and attack surface |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation (evidence) | Status |
|-----------|----------|-----------|-------------|-----------------------|--------|
| T-67-01 | DoS | zod parser version | mitigate | `package.json:148` `"zod": "^4.6.7"`; `pnpm-lock.yaml:5958,12336` `zod@4.6.7` (>= 4.6.6) | closed |
| T-67-02 | Tampering | zod 4 `.url()`/`.datetime()` behaviour | mitigate | Port was API-only (67-01-SUMMARY); `urlArg` uses `URL.canParse` `schemaTypes.ts:~97`; ipcSchemas suites (27 suites, 1476 tests) pass in this audit | closed |
| T-67-SC | Tampering | pnpm install of zod 4.x | accept | See Accepted Risks Log | closed |
| T-67-03 | Tampering | `dispatchInvoke`/`dispatchSend` | mitigate | `sidecarRpc.ts:291-312` (invoke) and `:329-337` (send) call `validateInbound` before `handler(...)` / listener loop; `ipcValidation.test.ts` case (2) asserts handler not run | closed |
| T-67-04 | Info disclosure | rejection log and wire error | mitigate | `ipcValidation.ts:73-79` reads only `issue.path` and `issue.code`; `formatRejectionLog` `:82-87`; `ipcValidation.test.ts:194-211` seeds secret value and key name and asserts absence | closed |
| T-67-05 | DoS | rejection log of huge issue lists | mitigate | `MAX_ENTRIES=20`, `MAX_SEGMENT=64` `ipcValidation.ts:22-23,75,44`; also a per-channel throttle `:94-168` | closed |
| T-67-06 | Tampering | JSON null for positional optionals | mitigate | `optionalArg = schema.nullish()` `schemaTypes.ts:~29`; `ipcValidation.test.ts:155` case (3) | closed |
| T-67-07 | EoP | channels without schema | accept | See Accepted Risks Log. Fail-closed confirmed: `ipcValidation.ts:62-69` returns `no_schema` for a missing entry or a push entry | closed |
| T-67-08 | DoS | sidecar exit contract | mitigate | `ipcValidation.ts` is synchronous; the throttle is a counter against an injected clock, no timer (`:89-92`); module-level schema construction only | closed |
| T-67-09 | Tampering | `ipc_contract.rs` stale or hand-edited | mitigate | `.github/workflows/codecheck.yml:30` runs `pnpm check:ipc-contract`; `.husky/pre-commit:38-55` path-filtered gate; `pnpm -s check:ipc-contract` run here: "up to date" | closed |
| T-67-10 | Tampering | generator degrading to `serde_json::Value` | mitigate | `meta/genIpcContract.ts:69,200` throws on unknown or any schema; only `x-rust-value` (`:191`) maps to Value; unit tests `genIpcContract.test.ts:46,130,231` pass | closed |
| T-67-11 | Repudiation | parity tests deleted | mitigate | Replaced by generated enum plus compile-time exhaustiveness (see T-67-35) and check:ipc-contract | closed |
| T-67-12 | DoS | bootErrorSurface painting over app | mitigate | `bootErrorSurface.ts:57-95` `classifyBootError` routes invalid-args and invalid-channel to `console.warn` and return; `bootErrorSurface.test.ts:21,28` pass | closed |
| T-67-13 | Spoofing | marker in non-sidecar string | accept | See Accepted Risks Log | closed |
| T-67-14 | Tampering | zod in renderer bundle | mitigate | `meta/__tests__/rendererZodGuard.test.ts` rules a-d plus built-in mutation cases and non-vacuity test (`:157-238`); passes. Known limit (node_modules / src/backend not traced) was accepted at plan time | closed |
| T-67-15 | Tampering | removeFolder recursive delete | mitigate | **Superseded.** The channel was deleted end to end in Phase 72 (`de5c77958`); no `removeFolder` entry remains in `src/common/types/ipc/*.ts`, so the attack surface is gone. Phase 67 shape check existed (41783890d) before removal | closed |
| T-67-16 | Tampering | openExternalUrl non-URL strings | mitigate | `shellFiles.ts:15` `z.tuple([urlArg()])` (`URL.canParse`, max 8192). Scheme allow-list deferred to Phase 72, which has since landed in the handler (`assertOpenableExternalUrl`, `shellFilesFlowRegistration.ts:10`) plus Rust `open_external_scheme_check` `relay_commands.rs:204`. Changed mitigation (any-scheme `urlArg`) still meets Phase 67's claimed intent | closed |
| T-67-17 | Tampering | openDialog option smuggling | mitigate | `dialog.ts:19-20` `z.strictObject` envelope; nested filters also strict | closed |
| T-67-18 | DoS | clipboardWriteText huge payload | mitigate | `clipboard.ts:7` `z.string().max(1_000_000)` | closed |
| T-67-19 | DoS | too-strict schema dropping legit send | mitigate | Real-call-site fixtures after JSON round-trip in `ipcSchemas/*.test.ts` (all pass); operator live check approved (67-20) | closed |
| T-67-20 | Tampering | schema/arm drift (Rust reads absent field) | mitigate | Rust args are generated from the schemas (`ipc_contract.rs` `from_args`); wire fixtures parse in Rust tests; check:ipc-contract fresh | closed |
| T-67-21 | EoP | casting around types at call sites | mitigate | Grep of `src/backend` for `as unknown as ... requestRustInvoke`: matches only in `__tests__` (mock casts), none in production code | closed |
| T-67-22 | Tampering | opaque JSON escape hatch growth | mitigate | `x-rust-value` appears only in `rustInvoke.ts:126,130,148` (three uses); generator rejects other unknowns (`genIpcContract.ts:200`) | closed |
| T-67-23 | Tampering | runWineCommand parts | mitigate | `wineTools.ts:24` `commandParts = z.array(z.string().max(4096)).min(1).max(256)`; handler still calls `assertCommandParts` `wineToolsFlowRegistration.ts:461`. Note: elements may be empty strings, handler guard retained | closed |
| T-67-24 | Tampering | install/move path args | mitigate | **Changed mitigation.** `install.ts:55-58,62-65` use bounded `z.string().max(4096)` rather than `absolutePathArg()` (67-07-SUMMARY: boundary reject skipped the localised dialog and terminal `done` status). Shape check stays authoritative in the handler: `assertPlausibleAbsolutePath` at `installFlowRegistration.ts:495` (moveInstall). `changeInstallPath` uses `absolutePathArg()` (`gameDetails.ts:61`). Intent satisfied at the handler; containment is Phase 72 | closed |
| T-67-25 | Tampering | GameInfo passthrough | accept | See Accepted Risks Log | closed |
| T-67-26 | DoS | over-strict schema dropping a call | mitigate | Real-call-site fixtures (`ipcSchemas/install.test.ts`, `wineTools.test.ts`); pass | closed |
| T-67-27 | Tampering | arm accepting differently shaped arg | mitigate | Generated serde structs (`ipc_contract.rs`, `from_args`); 67-08-SUMMARY records stricter-or-equal tightening; Rust wire fixtures | closed |
| T-67-28 | Repudiation | error-string contract | mitigate | Pinned strings preserved (`<arm>:bad-args`, e.g. `main.rs:2867`); keyring and shell source tests in 67-08-SUMMARY | closed |
| T-67-29 | DoS | app_exit/app_relaunch bad args | accept | See Accepted Risks Log | closed |
| T-67-30 | Info disclosure | rejection of credential args | mitigate | Sentinel-absence cases: `ipcSchemas/steamAuth.test.ts:13,149`, `runnerAuth.test.ts:13-82`, `oauthHumbleLogin.test.ts:14-85`; pass | closed |
| T-67-31 | Tampering | storeEmbed navigate/open | mitigate | `storeEmbed.ts:36-49` `urlArg()` plus strict bounds object; Rust `tauri::Url::parse` `store_embed/state.rs:497-509`. Scheme/host allow-list is the Phase 72 residual | closed |
| T-67-32 | Spoofing | login payload extra keys | mitigate | `runnerAuth.ts:14` strictObject, `oauthLogin.ts:18` strictObject, `steamAuth.ts:62` strictObject. Key is `username` (not `user`); same intent | closed |
| T-67-33 | DoS | oversized tokens/cookies | mitigate | `nonEmptyString(4096)` on login, authGOG and nile data `runnerAuth.ts:14-34`; steam `username` 64, `password` 1024, guard 16 `steamAuth.ts:62-68` | closed |
| T-67-67 | Tampering | store_embed_open/navigate args | mitigate | `StoreEmbedOpenArgs::from_args` and `StoreEmbedNavigateArgs::from_args` (`store_embed/state.rs:497`, `controls.rs:121`); semantic URL parse retained in arm | closed |
| T-67-68 | Tampering | generator looser than hand ladder | mitigate | `genIpcContract.test.ts:101,203-231` behaviour tests (optional handling, order, misuse); pass | closed |
| T-67-69 | Repudiation | error-string drift | mitigate | Per-suffix pinned-string Rust tests (e.g. `clipboard.rs:66-109`, `main.rs:2865-2871`) | closed |
| T-67-34 | Tampering | humble cookies domain / reveal origin | mitigate | `HumbleLoginCookiesForDomainArgs::from_args` (`ipc_contract.rs:942-943`); retained https-only re-validation in `login_window/humble_reveal.rs:34-41`; pinned-string tests `main.rs:2865` | closed |
| T-67-35 | EoP | TS channel with no Rust arm | mitigate | `rust_dispatch.rs:10-20` exhaustive `match` over generated `RustInvokeChannel` (no wildcard arm; unknown name rejected before match) | closed |
| T-67-36 | Repudiation | parity test removal | mitigate | Compile-time exhaustiveness plus `check:ipc-contract` gate | closed |
| T-67-37 | Info disclosure | rejected credential args | mitigate | Sentinel cases `steamAuth.test.ts`, `runnerAuth.test.ts`, `humble.test.ts:18-131`; log carries paths/codes only | closed |
| T-67-38 | Tampering | bottle/bridge malformed route/ids | mitigate | `steamAuth.ts:26-28` `steamAppIdArg` digits-only `^\d{1,10}$`; `:93-100` enum routes with strictObject | closed |
| T-67-39 | DoS | oversized credential strings | mitigate | `.max()` bounds on credential strings (`steamAuth.ts:62-68`, `runnerAuth.ts`) | closed |
| T-67-40 | Tampering | writeConfig/setSetting nested config | accept | See Accepted Risks Log | closed |
| T-67-41 | Tampering | kill/repair forged appName/runner | mitigate | `gameDetails.ts:44,56` `nonEmptyString()` + `runnerArg()` (enum derived from `Runner` union with two-way tsc drift guard, `schemaTypes.ts:~53-70`) | closed |
| T-67-42 | Info disclosure | private branch password | mitigate | `ipcSchemas/settings.test.ts:10,147-161` sentinel absence | closed |
| T-67-43 | Tampering | callTool tool selection | mitigate | `runnerMisc.ts:22` `toolName = z.enum(['winecfg','runExe'])`; strict envelope `:42-50` | closed |
| T-67-44 | Tampering | save-sync paths | mitigate | `runnerMisc.ts:16-19` `pathString` (max 4096, NUL-free) on egsSync, syncSaves, callTool exe; containment stays handler/Phase 72 | closed |
| T-67-45 | EoP | downloadRuntime arbitrary name | mitigate | `runnerMisc.ts:25-26,74` `runtimeName = z.enum(RUNTIMES)` with drift guard | closed |
| T-67-46 | DoS | logError/logInfo flooding | mitigate | **Changed mitigation.** The planned `.max()` on the schema was removed in review fix WR-03 (`logger.ts:16-22`, `logText = z.string()`). Bounded instead by `sanitizeRendererLogMessage` (`LOG_TEXT_MAX=65536`, `LOG_ARRAY_MAX=256`), called at `loggerFlowRegistration.ts:234,291`, plus the sidecar frame cap `MAX_LINE_LENGTH` 10 MiB (`sidecarRpc.ts:77,458`). Rejection logging is throttled. DoS intent still satisfied | closed |
| T-67-47 | Repudiation | over-strict log schema dropping reports | mitigate | `ipcSchemas/logger.test.ts` real-call-site fixtures (string, array, Error-like); union accepts all three shapes (`logger.ts:23-31`) | closed |
| T-67-48 | Info disclosure | Humble key values in rejection logs | mitigate | `humble.test.ts:18,117-131` sentinel absence | closed |
| T-67-49 | Tampering | deleteUploadedLogFile arbitrary URL | mitigate | `logger.ts:58` `httpUrlArg()` (`z.url` http/https only, max 8192) - stricter than the planned any-scheme format check. Host allow-list is the Phase 72 residual | closed |
| T-67-50 | Info disclosure | steamgriddb key in rejection logs | mitigate | `enrichment.test.ts:14,108-121` sentinel absence; key bounded `enrichment.ts:74` | closed |
| T-67-51 | DoS | unbounded search terms | mitigate | `enrichment.ts:27-28` `searchTerm max(256)`, `styleList` arrays `.max(64)`; `:70,75` | closed |
| T-67-52 | Tampering | steam launch forged GameInfo | accept | See Accepted Risks Log | closed |
| T-67-53 | Tampering | openWebviewPage arbitrary URL | mitigate | `appShell.ts:43` `urlArg()`; scheme allow-list deferred to Phase 72 (documented residual) | closed |
| T-67-54 | DoS | notify/changeLanguage oversized | mitigate | `appShell.ts:30-35` `nonEmptyString(35)`, title max 512, body max 8192 | closed |
| T-67-55 | Tampering | push payload drift | accept | See Accepted Risks Log | closed |
| T-67-56 | Tampering | storeSet key path / store name | mitigate | `sidecarInternal.ts:99-100,120-123` `storeName` max 128, `keyPath` max 512, strict arity; field policy `isSafeKeyPath`/`isWritableStoreField` at `storeWriteHandlers.ts:169`. The schema checks bounds only, shape policy is the handler (as the file comment states) | closed |
| T-67-57 | EoP | future channel without schema | mitigate | `ipcSchemaCoverage.test.ts` (5 tests incl. non-vacuity, passes) plus fail-closed `validateInbound` `ipcValidation.ts:62-69`; WR-01 fix also fails closed on push-only names (test at `ipcValidation.test.ts:302`) | closed |
| T-67-58 | EoP | shell-only channels callable by renderer | mitigate | `sidecarInternal.ts:129-138` `caller: 'shell'` tags; `genIpcContract.ts:479` filters `caller === 'renderer'`; none of handleProtocolUrl, health, trayResolveRunner is in `RENDERER_CHANNELS` | closed |
| T-67-59 | Tampering | devSweepEpicCookieDomain | mitigate | `sidecarInternal.ts:105` `nonEmptyString(253)`; existing bound retained: registration skipped when `appInfo.isPackaged` `devEpicCookieSweepRegistration.ts:78` | closed |
| T-67-60 | EoP | renderer naming shell/dev channels | mitigate | `relay_commands.rs:20-30` `relay_channel_verdict` gates both `sidecar_invoke` (`:39`) and `sidecar_send` (`:128`); Rust test `ipc_contract_relay_rejects_shell_only_channel` `:257-262` | closed |
| T-67-61 | DoS / log injection | hostile channel names | mitigate | `echo_channel` 64-char cap and non-printable to `?` `relay_commands.rs:10-16`; TS mirror `ipcValidation.ts:32-36`; tests `relay_commands.rs:271-276`, `ipcValidation.test.ts:251` | closed |
| T-67-62 | DoS | allow-list blocking legit preload call | mitigate | `rendererAllowList.test.ts:89-100` derives preload surface and requires membership; passes (review also cross-checked 232 channels) | closed |
| T-67-63 | Tampering | generator filter bug | mitigate | `rendererAllowList.test.ts:106-117` TS recomputation equals parsed generated list; byte-sorted precondition for `binary_search` tested | closed |
| T-67-64 | DoS | over-strict schema dropping live send | mitigate | Operator live check recorded "approved" in 67-20-SUMMARY; fixture coverage above. Evidence is the operator record, not reproduced in this audit | closed |
| T-67-65 | DoS | sidecar not exiting at stdin EOF | mitigate | 67-20-SUMMARY: `smoke:sidecar` PASS (READY, exit 0 at stdin EOF); code adds no timer or boot work (`ipcValidation.ts`). Manual pgrep recorded under operator approval, not reproduced here | closed |
| T-67-66 | Info disclosure | operator pasting log lines | accept | See Accepted Risks Log | closed |

*Status: open / closed*
*Disposition: mitigate (implementation required) / accept (documented risk) / transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-67-01 | T-67-SC | zod is an existing dependency, same upstream, no postinstall script; legitimacy audit approved | plan 67-01 | 2026-11-15 |
| AR-67-02 | T-67-07 | Pass-through for unschemad channels was temporary and counted by the ratchet; 67-18 made it fail closed (verified `ipcValidation.ts:62-69`) | plan 67-02 | 2026-11-15 |
| AR-67-03 | T-67-13 | A non-sidecar string containing the marker only yields a differently typed rejection; parse returns null on mismatch | plan 67-04 | 2026-11-15 |
| AR-67-04 | T-67-25 | D-07: strict envelope, nested GameInfo explicitly `phase70Passthrough` for Phase 70 | plan 67-07 | 2026-11-15 |
| AR-67-05 | T-67-29 | Sidecar is trusted (D-13); arms already reject bad shapes | plan 67-08 | 2026-11-15 |
| AR-67-06 | T-67-40 | D-07: strict envelope plus `phase70Passthrough`; Phase 70 tightens | plan 67-13 | 2026-11-15 |
| AR-67-07 | T-67-52 | D-07 passthrough with appName/runner checked; Phase 70 tightens | plan 67-16 | 2026-11-15 |
| AR-67-08 | T-67-55 | D-12: push schemas are type/codegen only; sender is trusted | plan 67-17 | 2026-11-15 |
| AR-67-09 | T-67-66 | Rejection lines carry channel, paths and codes only by construction (D-10) | plan 67-20 | 2026-11-15 |

Documented residuals (deferred by plan, not open gaps): scheme/host allow-lists and path containment for T-67-16, -24, -31, -44, -49, -53 belong to Phase 72 (Phase 72 handler guards now exist for openExternalUrl and folder opens). Known limit on T-67-14: renderer zod scan does not trace node_modules or src/backend.

---

## Unregistered Flags

None. All 20 SUMMARY `## Threat Flags` sections state "None".

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-15 | 69 | 69 | 0 | gsd-security-auditor (Claude) |

Verification run in this audit: jest on ipcValidation, ipcSchemaCoverage, rendererAllowList, ipcSchemas/*, genIpcContract, rendererZodGuard, bootErrorSurface (27 suites, 1476 tests, all pass); `pnpm check:ipc-contract` up to date. Rust tests were not executed; Rust mitigations verified by source inspection.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-15
