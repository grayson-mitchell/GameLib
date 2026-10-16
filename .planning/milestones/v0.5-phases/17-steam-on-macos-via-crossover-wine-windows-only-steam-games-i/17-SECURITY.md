---
phase: 17
slug: steam-on-macos-via-crossover-wine-windows-only-steam-games-i
status: secured
audited: 2026-07-13
auditor: gsd-security-auditor
register_authored_at_plan_time: true
threats_total: 21
threats_closed: 21
threats_open: 0
threats_mitigate_verified: 13
threats_accept_documented: 8
asvs_level: default
---

# SECURITY.md — Phase 17: Steam on macOS via CrossOver/Wine

**Audited:** 2026-07-13
**Auditor:** gsd-security-auditor (verification-only; plan-time register)
**Register:** canonical de-duplicated STRIDE register aggregated from all 17 `<threat_model>` blocks
**Result:** SECURED — 21/21 threats resolved (13 mitigate CLOSED in code, 8 accept documented)
**Threats open:** 0

---

## Mitigate threats — verified in code

| Threat ID | Category | Evidence (file:line) |
|-----------|----------|----------------------|
| T-17-01 | Tampering | `sanitizeBottleName()` chokepoint `bottle.ts:156-169` rejects `/ \ .. NUL`/empty; called first in `provisionBottle` `bottle.ts:545-554`. All spawns use discrete argv arrays (`spawnAsync(CXBOTTLE_BIN, [...])` `bottle.ts:610,661`; `spawnAsync(WINESERVER_BIN, ['-k'], ...)` `bottle.ts:507`) — never shell strings. |
| T-17-CR01 | Tampering/DoS | `provisionBottle` rejects `bottleName === sharedBottle.trim()` BEFORE any store write / `cxbottle --delete` / `rmSync` / `cxbottle --create` `bottle.ts:567-581`. Shared-prefix toggle removed from Steam setup path via `hideSharedPrefixToggle` `WineSelector/index.tsx:159` passed by `SteamBottleSetup.tsx:184`. |
| T-17-DoS / T-17-15-01 | DoS | `killBottleWineServer` sets `env.WINEPREFIX = getBottleDir(bottleName)` (never shared, never unset) `bottle.ts:505-513`; only invoked on the sanitized+scope-guarded win32→win64 recreate path `bottle.ts:608`. |
| T-17-02 / T-17-04 | Tampering | Numeric appId guard `NUMERIC_APP_ID = /^\d+$/` in `dispatchToBottledSteam` `bottle.ts:806,823`; `buildSteamProtocolUrl` `/^\d+$/` guard `games.ts:54`. Verb argv are discrete words (`[steamExePath, '-applaunch', appId]` etc.) `bottle.ts:844-854`. |
| T-17-05 / T-17-14-ACF | Tampering/DoS | Bounded/guarded VDF parse `library.ts:467-486` (per-file try/catch skips corrupt ACF — T-2-01); filename-gated (`appmanifest_*.acf`) `library.ts:465`; bit-4 bitmask read. Source-parameterized pollers via `AcfSource = 'native' \| 'bottle'` `library.ts:43`. |
| T-17-08 | Spoofing/mis-routing (D-11) | `isBottleEligible()` gates on `isMac && meta.platformsCaptured === true && meta.is_mac_native === false` `games.ts:612-624`; called before every install/launch/uninstall dispatch. |
| T-17-09 / T-17-08-03 | Spoofing / consent bypass | Consent gate: `SteamBottleSetup` opens in `phase = 'consent'` `.tsx:38`; `handleConfirm` (the only provisioning trigger) reachable only via the consent-phase confirm button `.tsx:129,189`. |
| T-17-07 | EoP (plan 05) | `runWineCommandOnGame` hard-refuses `runner === 'steam'` before the isNative check `tools/index.ts:884-890` (Steam has no per-game Wine prefix). |
| T-17-08-02 | Tampering (plan 08) | Bottle name already sanitized at provision time; `isBottleReady`/`getBottleSteamExePath` are pure `existsSync` probes on derived paths, no argv `bottle.ts:233-258,113-147`. |
| T-17-09-01 | DoS (plan 09) | `ensurePlatformsCaptured` bounded poll — `Date.now() < deadline` with `METADATA_FETCH_TIMEOUT_MS` `games.ts:664-673` — install/launch/uninstall can never hang. |
| T-17-09-02 | Tampering (plan 09) | `fetchMetadataIfNeeded` builds the appdetails URL with the numeric `this.appId` (Steam-sourced numeric AppID); no new URL construction added — T-06-01 guard precedent `games.ts:239,345`. |
| T-17-11-GUARD | Info Disclosure / Mis-routing (plan 11) | Frontend early-return only; backend `isBottleEligible`/`isBottleReady` + `/^\d+$/` + `sanitizeBottleName` guards are untouched (confirmed present in `games.ts`/`bottle.ts`). Frontend cannot weaken backend validation. |
| T-17-12-PATH | Path traversal (plan 12) | `locateMachOBinary` containment: `resolve()` + `relative()` + reject `rel.startsWith('..') \|\| isAbsolute(rel)` BEFORE filesystem access `library.ts:559-579`. `join()`-alone traversal avoided. |
| T-17-15-02 | Info Disclosure (plan 15) | win32→win64 recreate writes ONLY `provisioned:false` `bottle.ts:641`; `refreshToken`/`isLoggedIn`/`userData` never touched (explicit in-code invariant, `bottle.ts:591-596,640`). |

## Accept threats — verified documented

| Threat ID | Category | Documented disposition |
|-----------|----------|------------------------|
| T-17-SC | Tampering (supply chain) | Zero new dependencies this phase — 17-01/02/03/04/05/06/07/15/16/17 PLAN registers; confirmed `package.json` has no crossover/cxbottle/wineserver/steam-bottle deps. |
| T-17-06 | Info Disclosure | D-04 — bottled-Steam auth opaque by design; GameLib never reads `loginusers.vdf`/sentry (17-04-PLAN:199, 17-06-PLAN:196, 17-16/17-17 PLAN). |
| T-17-11-STATE | Tampering | Pure frontend derivation from existing store; no new IPC/input surface (17-11-PLAN:211). |
| T-17-12-DISP | Elevation / Mis-dispatch | Both-root probe only widens WHERE a valid steam.exe is found; appId guard + provisioned pre-flight untouched (17-12-PLAN:196). |
| T-17-13-COPY | Info Disclosure | Static i18n banner copy; no dynamic data/input/channel (17-13-PLAN:122). |
| T-17-14-STATE | Tampering | Pure frontend live-reconciliation from already-flowing signals; no new IPC surface (17-14-PLAN:220). |
| T-17-09-03 | Info Disclosure | `steamPlatformsCaptured` boolean capture flag only; no PII; `is_mac_native` sibling precedent (17-09-PLAN:189). |
| T-17-08-01 | Tampering | `mkdirSync` redist path is a fixed constant (`steamSupportPath/redist`) under userData; no user input, `recursive:true` only creates the fixed subtree (17-08-PLAN:184). |

## Unregistered flags

None. The only `## Threat Flags` section across all Phase 17 summaries (17-16-SUMMARY.md) reports "None — no new network endpoints, auth paths, or trust-boundary surface introduced." No new attack surface appeared during implementation without a threat mapping.

## Code-review cross-check

17-REVIEW.md CR-01 (BLOCKER, data loss) / WR-01 / WR-02 were all closed by gap plan 17-17 and independently re-verified here in code (CR-01 → `bottle.ts:567-581` backend guard + `hideSharedPrefixToggle`; WR-01 → `games.ts:555-557` poller-on-success-only; WR-02 → dead `loggedIn` field removed).

---

## Security Audit 2026-07-14 (re-verification)

Re-ran `/gsd-secure-phase 17`. No phase artifacts changed since the 2026-07-13 audit — the last commit to the phase directory is the original verification commit (`d940f141`); the 16 plan-time `<threat_model>` blocks still back the canonical register, so `register_authored_at_plan_time` remains `true`. Short-circuit rule applies (`threats_open: 0 AND register_authored_at_plan_time: true`): all plan-time threats stay verified CLOSED; no new attack surface introduced.

| Metric | Count |
|--------|-------|
| Threats found | 21 |
| Closed | 21 |
| Open | 0 |
