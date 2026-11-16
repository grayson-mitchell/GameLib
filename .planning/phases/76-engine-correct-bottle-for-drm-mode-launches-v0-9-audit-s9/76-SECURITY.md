---
phase: 76
slug: engine-correct-bottle-for-drm-mode-launches-v0-9-audit-s9
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-17
---

# Phase 76 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Plans 02 and 03 both use T-76-08/09/10 for different threats; they are written `02/T-76-xx` and `03/T-76-xx`.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| bottle name -> filesystem path | bottleName from app state becomes a path under the bottles root | untrusted string |
| on-disk marker/conf -> switch logic | `.gamelib-engine.json`, `cxbottle.conf`, DXVK files steer which wineserver is killed and which DLLs are removed | local file content |
| launch flow -> engine switcher | a DRM launch may stop a wineserver and rewrite DXVK in a bottle | process kill, file writes |
| UAT log -> planning file | operator log excerpts copied into 76-UAT.md | log lines |

---

## Threat Register

Evidence paths are under `src/backend/`.

| Threat ID | Category | Component | Disposition | Mitigation / Evidence | Status |
|-----------|----------|-----------|-------------|-----------------------|--------|
| T-76-01 | DoS/Tampering | prepareDrmBottleForCrossover | mitigate | Helper (storeManagers/steam/gameLaunch.ts:844-880) calls only `switcher.prepareBottleForEngine`; no `ledger` key in the body, comment at :840 states it. Switch's own busy/game-running refusals apply. | closed |
| T-76-02 | Tampering | DRM caller | mitigate | gameLaunch.ts:893-912 returns `{ok:false}` on any `!prep.ok`; gameBridgeLaunch.ts:219-227 returns false before drmLaunchSetup. Test: games.test.ts:16304-16329 (`it.each` over refusal reasons, asserts drmSetup not called and status done). | closed |
| T-76-03 | Tampering | marker-newer refusal | mitigate | gameLaunch.ts:897-904 maps `marker-newer` to the markerNewer dialog and no switch; engineSwitch.ts:809 `isEngineMarkerReadOnly` guard precedes any write. | closed |
| T-76-04 | Tampering (path) | prepareBottleForEngine | mitigate | engineSwitch.ts:755 rejects `sanitizeBottleName(bottleName)!==bottleName` or missing dir as `invalid-bottle`; gameLaunch.ts:905-911 maps it to the `drmSwitchRefused` dialog; locale key at public/locales/en/gamelib.json:710; test row at games.test.ts:16310. | closed |
| T-76-05 | DoS | gameBridgeLaunch refusals | mitigate | sendLaunchDone at gameBridgeLaunch.ts:180, 204, 216, 225, 235; definition gameLaunch.ts:407; tests assert `status: 'done'` (games.test.ts ~16305-16330, 16380-16410). | closed |
| T-76-07 | EoP | DRM offline pre-check | mitigate | `override: 'crossover'` hard-coded at gameLaunch.ts:807; DRM branch (gameBridgeLaunch.ts:183-236) never calls decideLaunchEngine; D-04 test games.test.ts:16364 (pinned override, `decideLaunchEngine` not called). | closed |
| 02/T-76-08 | DoS | UAT item 3 | mitigate | 76-UAT.md item 3 precondition: "restore CrossOver to /Applications/CrossOver.app" before Play; hide/restore procedure in the operator note. | closed |
| 02/T-76-09 | Tampering | UAT scope | mitigate | 76-UAT.md operator note: "Never reroute a failed DRM launch to bottled Steam; record it as an issue"; item 3 failure was recorded as an issue/gap, not rerouted. | closed |
| 03/T-76-08 | Tampering | inferMarker / trustedMarker | mitigate | engineSwitch.ts:442 `hasStagingDxvk` is checked before the conf Timestamp; trustedMarker :460-472 distrusts a crossover marker when DXVK-macOS is present; used at :493 and :827. Regression test engineSwitch.test.ts:1124-1266 (CR-01, real switch at :1185). | closed |
| 03/T-76-09 | Tampering (path) | reconcile / recordPinned / recordCrossover | mitigate | reconcileBottleEngineMarker engineSwitch.ts:486 and markerWritable :510 (used by recordPinned :530 and recordCrossover :559) return null/false when `sanitizeBottleName(bottleName)!==bottleName` before any path is built. Tests with `'../x'`: engineSwitch.test.ts:1294, 1321, 1369. | closed |
| 03/T-76-10 | Tampering | recordPinnedBottleEngine / readMarker | mitigate | pinId regex `/^[A-Za-z0-9._-]{1,64}$/` at engineSwitch.ts:529; readMarker validates id (:340), `dxvk.dir` with `isInside(pinnedEngineRoot(), dir)` and version regex (:357-362). | closed |
| T-76-11 | Tampering | newer-build marker | mitigate | markerWritable :514 and reconcile :490 return without writing under `isEngineMarkerReadOnly`; writeMarker guard :379. Tests assert byte-identical file: engineSwitch.test.ts:1323, 1373 (and 1064-1119). | closed |
| T-76-12 | DoS | killPrevious | mitigate | engineSwitch.ts:580-624 unchanged in shape: kills only the CrossOver binDir wineserver, or a bin inside pinnedEngineRoot, `<tools>/wine` or the CrossOver binDir (`allowed` check :609-613); other paths are ignored with a warning. | closed |
| T-76-13 | DoS | reconcile body | mitigate | reconcileBottleEngineMarker body wrapped in try/catch returning null (engineSwitch.ts:485-503); missing dir / no conf return null at :487-488; tests engineSwitch.test.ts:1279, 1289, 1297, 1300. | closed |
| T-76-14 | Tampering | marker lifecycle | mitigate | Marker recorded at creation: bridgeBottleLifecycle.ts:571-579 (pinned) and :693-700 (crossover). Reconcile at gameBridgeLaunch.ts:194, before drmOfflinePrecheck (:200) and preflightCrossover (:210). Ordering tests games.test.ts:16334-16362; creation tests bridgeBottleLifecycle.test.ts:1306+. | closed |
| T-76-15 | Tampering (path) | provisionBridgeBottle | mitigate | bridgeBottleLifecycle.ts:518-526 sanitizes and rejects an unsafe name (T-24-06) before any use; only the sanitized `bottleName` is passed to the record helpers (:574, :697), which re-check. | closed |
| T-76-17 | DoS | unresolved DRM install root (WR-04) | mitigate | gameBridgeLaunch.ts:173-181 calls `sendLaunchDone` before `return false`; test asserts done (games.test.ts, DRM engine-correct block). | closed |
| T-76-18 | EoP | reconcile scope | mitigate | The reconcile call is inside `if (wantsDrm)` (gameBridgeLaunch.ts:183-194); TCP negative test games.test.ts:15942; gameLaunch.ts last touched by 76-01 commit eea599129 (no 76-04 change). | closed |
| T-76-19 | Repudiation | DEBT-01 closure | mitigate | REQUIREMENTS.md:56 `[x] DEBT-01`, :94 Complete; 76-UAT.md items 7 and 8 `result: pass` with quoted log lines (marker recorded at creation, `engine switch ... pinned:wine-staging-11.20 -> crossover`, lsteamclient trace pid 416). | closed |
| T-76-20 | Info Disclosure | 76-UAT.md content | mitigate | Grep of 76-UAT.md for token/password/account name/steamid finds none; content is engine, bridge and role lines, appId and pid only. | closed |
| T-76-06 | Info Disclosure | refusal detail in local logs | accept | See Accepted Risks Log AR-76-01 | closed |
| 02/T-76-10 | Info Disclosure | log excerpts in UAT | accept | See AR-76-02 | closed |
| T-76-16 | DoS | marker write failing at install | accept | See AR-76-03 | closed |
| T-76-21 | DoS | CrossOver.app hide/restore | accept | See AR-76-04 | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-76-01 | T-76-06 | Refusal detail (reason and detail string) is written to the local GameLib log only; no network egress. | Phase 76 plan | 2026-11-17 |
| AR-76-02 | 02/T-76-10 | Log excerpts quoted in 76-UAT.md live in a local planning file; they carry no secrets (see T-76-20). | Phase 76 plan | 2026-11-17 |
| AR-76-03 | T-76-16 | If the marker write fails at install, recordPinnedBottleEngine never throws (try/catch returns false, engineSwitch.ts:546-548) and reconcileBottleEngineMarker repairs it on the next DRM launch. | Phase 76 plan | 2026-11-17 |
| AR-76-04 | T-76-21 | UAT hides CrossOver by a move-only `mv` into a `.noindex` directory and restores it; nothing is deleted or modified. | Phase 76 plan | 2026-11-17 |

*Accepted risks do not resurface in future audit runs.*

---

## Unregistered Flags

None. No `## Threat Flags` entry in the 76 SUMMARY files lacked a threat mapping.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-17 | 24 | 24 | 0 | gsd-security-auditor (Claude) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-17
