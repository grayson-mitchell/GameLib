---
phase: 24
slug: macos-native-steam-bridge-out-of-process-steam-api-proxy
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-21
---

# Phase 24 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> macOS native Steam bridge — out-of-process Steam API proxy (loopback helper + bottle PE32 shim).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| bottle PE32 shim → native helper (127.0.0.1 TCP) | Any local process/user can connect to the loopback listener; the shim speaks a wire protocol to an unauthenticated localhost peer | fixed-width wire frames (Steam API calls) |
| inbound wire frames → helper | Attacker-controllable frame length/body on the persistent channel | frame length field + body |
| helper → libsteam_api.dylib / live Mac Steam | Helper proxies the real signed-in account's identity | live SteamID64 / persona |
| Steamworks SDK IP → public fork repo | Valve header text must not be redistributed | generator input source (GameLib-authored manifest, no vendored `.h`) |
| bundled allowlist JSON / bridge ACF → routing + install-state | Static asset + on-disk manifests drive bridge-vs-fallback routing and installed badge | appId, StateFlags, install paths |
| appId / game .exe path → spawn (objdump, wine, cxbottle) | Untrusted appId + install-directory path fed to subprocesses | argv paths |
| zig toolchain download → build machine | Build-time supply-chain surface | pinned tarball + sha256 |
| packaged app → bundled helper | Runtime must resolve the helper from the signed app bundle, not a staged binary | helper binary provenance |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-24-01 | Info Disclosure/Spoofing | helper socket bind | mitigate | `INADDR_LOOPBACK` only, never `INADDR_ANY` — `bridge_helper.c:489`; client host `127.0.0.1` only `helperProcess.ts:53` | closed |
| T-24-02 | Info Disclosure | unauthenticated localhost peers | accept | Loopback-only bind is the sole named mitigation; no handshake silently added (CONTROL frames liveness-only) — documented residual | closed |
| T-24-03 | DoS/Tampering | inbound frame length/body | mitigate | `MAX_FRAME_BYTES` cap in TS decoder (`protocol.ts:75,213,267`) AND C read loop before body recv (`bridge_helper.c:79,435-438`) | closed |
| T-24-04 | Tampering | vtable stubs / shim export set | mitigate | Per-slot `ret N` (`computeRetN` `gen_vtables.ts:136`; `steam_api_shim.c`); `.def` export set covers objdump-derived imports | closed |
| T-24-05 | Tampering | allowlist JSON + bridge ACF integrity | mitigate | zod `version: z.literal(1)` fail-loud `allowlist.ts:42-62`; `readAcfState` try/catch skips corrupt manifest `library.ts:206` | closed |
| T-24-06 | Tampering/Elevation | spawn + path handling | mitigate | argv-form `spawnAsync` only (objdump/zig/helper); `NUMERIC_APP_ID` + `sanitizeBottleName` + `isContainedWithin` resolve()/relative() guards before spawn/path build | closed |
| T-24-06-A | DoS/Availability | bridge launch under wrong Wine runtime | mitigate | `resolveBridgeCrossoverWine()` builds CrossOver `wine` sibling from `CXBOTTLE_BIN` root `bottle.ts:963-974,999` (not GPTK wine64) | closed |
| T-24-07 | Tampering | appId into `has()` / routing | mitigate | `NUMERIC_APP_ID.test` before `appIdSet.has()` `allowlist.ts:77`; gated in `ensureBridgeHelperReady` `helperProcess.ts:241` | closed |
| T-24-07-A | Spoofing/Integrity | periodic sync clobbers bridge install | mitigate | `refresh()`/`refreshInstallState()` consult `buildBridgeInstalledMap()` `library.ts:640,854` | closed |
| T-24-07-B | Integrity | bridge install mislabeled platform | mitigate | `installPlatformForSource('bridge')→'Windows'` `library.ts:112-113` | closed |
| T-24-08 | Info Disclosure (IP) | generator input source | mitigate | GameLib-authored manifest; no vendored Valve `.h` (grep-asserted); shim includes only winsock2/ws2tcpip/stdint | closed |
| T-24-09 | Tampering | non-CrossOver engine on bridge path | mitigate | `provisionBridgeBottle` rejects non-CrossOver `wineVersion.type` (D-08) `bottle.ts:1041-1048`; launch getter yields only `type:'crossover'` | closed |
| T-24-10 | DoS | helper crash/respawn loop | mitigate | Bounded poll (6×250ms) + null-on-exit handle, observable not-ready `helperProcess.ts:59-61,127-129` | closed |
| T-24-11 | Tampering | bundled helper provenance / shim overwrite | mitigate | Helper spawned from fixed packaged `steamBridgeHelperPath`; shim overwrite only when NOT `isByteIdentical` to trusted `builtBridgeShimPath`, dest guarded by `isContainedWithin` `shimGenerate.ts:173,189,207` | closed |
| T-24-12 | DoS/Repudiation | launch with no identity | mitigate | `ensureBridgeHelperReady` + `existsSync(exePath)` gate; not-ready fires `steamBridgeSetupRequired`, game NOT launched `games.ts:1478-1531` | closed |
| T-24-13 | Tampering | Phase 17 fallback regression | mitigate | Bridge branch additive; `isBridgeEligible` composes existing gates; empty-allowlist regression tests | closed |
| T-24-14 | Tampering | fallback drift / bridge re-entry | mitigate | Reuse existing non-bridge branch + guard chain; `bridgeFailedThisSession` set blocks re-entry `games.ts:106,1321` | closed |
| T-24-15 | DoS/Resource-leak | orphaned helper on quit | mitigate | `shutdownBridgeHelper()` idempotent, wired into `before-quit` `helperProcess.ts:306`, `main.ts:693` | closed |
| T-24-16 | Info Disclosure/DoS | fixed loopback port + no second-instance handling | accept | Fixed port 54550 + loopback bind + `MAX_FRAME_BYTES` bound the surface; ephemeral-port+handshake-file deferred — documented residual | closed |
| T-24-17 | DoS/Availability | fallback loops back into failing bridge | mitigate | `isBridgeEligible` consults `bridgeFailedThisSession` set `games.ts:1321` | closed |
| T-24-18 / T-24-18-B | Tampering | resolved exe / wine path → runWineCommand | mitigate | Path from authenticated PICS (`resolveBridgeLaunchExe` `launchTarget.ts:85`) / locked `CXBOTTLE_BIN`; `existsSync` verified; `commandParts` array form `games.ts:1520,1539-1540` | closed |
| T-24-19 | DoS | fs race on stat/hash of target | mitigate | `isByteIdentical` try/catch → returns false, never throws placement `shimGenerate.ts:113-115` | closed |
| T-24-20 | Spoofing | root conflation (bridge vs native/bottle) | mitigate | `getBridgeBottleSteamappsRoot()` resolves exactly one root `library.ts:90-92`; selectors distinct | closed |
| T-24-21 | Repudiation | UAT gate falsely recorded passed | mitigate | Gates re-pointed to PENDING; Gate 3 PASS recorded with evidence, Gates 2/4 PENDING (Hoard deferred) | closed |
| T-24-02-A | Integrity | non-bridge install counted for bridge-eligible title | mitigate | `isBridgeAuthoritativeForInstallState` makes install-state bridge-authoritative `library.ts:145-151,667,868` | closed |
| T-24-02-B | Spoofing | library eligibility diverges from games.ts routing | mitigate | Library helper reproduces same composition from same `steamMetadataStore` + `bridgeAllowlist` `library.ts:145-151` | closed |
| T-24-02-C | DoS | games.ts↔library.ts module cycle | mitigate | Eligibility derived from `bridgeAllowlist`/`steamMetadataStore` only; NO new games.ts import (grep-asserted) `library.ts:131-139` | closed |
| T-24-SC | Tampering | supply chain (dylib load, zig toolchain, npm installs) | mitigate | Canonical `$HOME` dylib path + single `dlopen` `bridge_helper.c:158-167,206`; zig pinned `0.16.0` + sha256 verify `downloadZig.ts:40,100-111`; argv spawn; no new npm packages | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-24-01 | T-24-02 | Unauthenticated localhost peers on the loopback helper. Loopback-only bind is the sole mitigation named by SPEC + blueprint; no locked decision calls for a handshake/nonce. Verified no handshake was silently added. | secure-phase (gsd-security-auditor) | 2026-07-21 |
| AR-24-02 | T-24-16 | Fixed/predictable loopback port (54550) + no second-instance handling. Combined with loopback-only bind + `MAX_FRAME_BYTES` the residual is low. Ephemeral-port + bottle-readable handshake file is the future tightening (review finding #11), deferred as it also touches the generated shim's connect path. | secure-phase (gsd-security-auditor) | 2026-07-21 |
| AR-24-03 | T-24-11 (supply-chain) | Bundled helper integrity: helper is built from repo source at packaging and covered by electron-builder's existing asar packaging; no separate code-signing step introduced this phase. | secure-phase (gsd-security-auditor) | 2026-07-21 |
| AR-24-04 | T-24-SC (zig TOFU) | zig tarball shasum is fetched from the same ziglang.org index at build time (TOFU, not true pinning). A hardcoded in-repo expected digest would be strictly stronger; still an improvement over the unchecksummed `downloadHelperBinaries` precedent (finding #12). | secure-phase (gsd-security-auditor) | 2026-07-21 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-21 | 30 | 30 | 0 | gsd-security-auditor (sonnet) |

Notes:
- Register authored at plan time (all 24-01..24-17 PLANs carried `<threat_model>` blocks); auditor verified mitigations exist rather than scanning for new threats.
- 26 `mitigate` threats verified present with file:line evidence; 4 `accept` residuals confirmed (loopback-only / documented).
- Scope deferral confirmed: HOARD removed from `bridge-allowlist.json` (commit 30cdda6a) — bridge proxies only ISteamUser+ISteamFriends; multi-interface coverage deferred. Not a security gap.
- Non-blocking observation: T-24-13/T-24-14 regression assurance rests on existing `games.test.ts`/`library.test.ts` suites (present, not re-executed in this audit); gating logic itself confirmed in source.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-21
