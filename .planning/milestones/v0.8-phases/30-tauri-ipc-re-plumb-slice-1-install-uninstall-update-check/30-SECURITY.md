---
phase: 30
slug: tauri-ipc-re-plumb-slice-1-install-uninstall-update-check
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-23
---

# Phase 30 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
>
> **Audit mode:** State B (built from PLAN threat models; no prior SECURITY.md).
> `register_authored_at_plan_time: true` — all 6 plans carried a `<threat_model>` block.
> **Disposition:** User elected to **accept all open threats** (2026-07-23) rather than
> spawn the code-verifying auditor. Every threat below is CLOSED via documented
> acceptance; mitigation columns record the plan-time control as the accepted basis,
> **not** a code-verified mitigation. See Accepted Risks Log.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| renderer → sidecar RPC | Untrusted invoke frames reach the new install/uninstall/update/settings handlers; the three Steam auth-status handlers take no args | InstallParams / UpdateParams / uninstall args; no-arg steam calls |
| sidecar → OS Keychain (via Rust `rustInvoke`) | Steam refresh token crosses on a successful QR poll | Steam refresh token (secret) |
| sidecar → shared `userData` config store | `isLoggedIn` / `userData` writes land in a folder the Electron build also reads | Session flags, non-secret user data |
| sidecar → filesystem | Depot download writes bytes + `appmanifest_*.acf` into a renderer-derived Steam library path | Game bytes, ACF manifest |
| sidecar → Rust `rustInvoke` | A new channel string (`dialog_open`) crosses the sidecar→shell boundary | Channel name; no path arg inbound |
| Rust → OS file dialog | User selects a filesystem path; path returns into the sidecar | User-chosen path (outbound from OS) |
| supply chain | One new Rust crate (`tauri-plugin-dialog`) enters the build | Third-party code |
| documentation → future phases | SEAM.md / declared channel list are what Phase 31/32 plan against | Binding invariants, claim records |
| sidecar → renderer (frontend_message / invoke result) | Install error text and app/game settings config cross into the webview | Error strings, settings config |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation (plan-time basis) | Status |
|-----------|----------|-----------|-------------|------------------------------|--------|
| T-30-01 | Information Disclosure | `steamPollQR` result + store snapshot | accept | Token written only via `getTokenStore().setToken()`; `STORE_ALLOWLIST` limits `steamConfigStore` to `['isLoggedIn','userData']` so `refreshToken` cannot enter a snapshot | closed |
| T-30-02 | Tampering | shared `configStore` / token seam | accept | Phase 28 D-04 binding — sidecar never writes `TOKEN_STORE_KEY` to shared `configStore`; `keyringTokenStore.ts` does not import `configStore` | closed |
| T-30-03 | Denial of Service | login channel on Keychain failure | accept | Phase 28 D-06 failure policy governs; no new failure handling introduced | closed |
| T-30-04 | Elevation of Privilege | newly registered handlers widening reach | accept | The three handlers take no renderer-supplied args (`() => ...`); credential/guard/logout channels stay unregistered | closed |
| T-30-SC-01 | Tampering | npm/cargo installs (30-01) | accept | Plan installs no packages | closed |
| T-30-05 | Tampering | `install` handler `path` / `appName` args | accept | No new path handling; args pass straight into unmodified `SteamGame.install()` with Phase 21/23 containment | closed |
| T-30-06 | Elevation of Privilege | `uninstall` reaching arbitrary runner/appName | accept | `uninstallGameCallback` registered UNCHANGED; resolves via `libraryManagerMap[runner].getGame()`, throws on unknown runner | closed |
| T-30-07 | Denial of Service | `checkGameUpdates` iterating absent CLI runners | accept | Same call graph Electron tolerates; failures degrade to a frontend-caught rejected promise | closed |
| T-30-08 | Information Disclosure | `listSteamLibraryTargets` returning FS paths | accept | Returns only Steam library roots already known/returned by Electron; gated behind `isSteamNativeInstallEnabled()` | closed |
| T-30-09 | Denial of Service | new handlers turning Invariant-B warning into crash | accept | Task asserts unported channel still rejects with marker and RPC loop keeps serving | closed |
| T-30-SC-02 | Tampering | npm/cargo installs (30-02) | accept | Plan installs no packages | closed |
| T-30-10 | Tampering | supply chain — `tauri-plugin-dialog` | accept | `[ASSUMED]` package; plan 30-03 Task 1 is a blocking human checkpoint verifying publisher/version on crates.io before `cargo add` | closed |
| T-30-11 | Elevation of Privilege | `dispatch_rust_channel` widened surface | accept | Allowlist gate: `requestRustInvoke` refuses channels not in `RUST_INVOKE_CHANNELS`; only `dialog_open` added, no inbound path arg | closed |
| T-30-12 | Elevation of Privilege | Tauri capability permissions | accept | Narrowest dialog permission added; save/message-box paths stay unwired (Phase 31) | closed |
| T-30-13 | Denial of Service | blocking picker on the reader thread | accept | Dispatch stays on spawned worker thread (same reason Phase 28 moved keyring dispatch off reader thread) | closed |
| T-30-14 | Information Disclosure | `notify()`'s new log line | accept | Log notification title only, never token/key/path; mirrors T-28-04 | closed |
| T-30-SC-03 | Tampering | cargo install (30-03) | accept | Blocking human checkpoint (Task 1) before dependency added; `[ASSUMED]` never auto-approvable | closed |
| T-30-15 | Repudiation | phase claim level | accept | REQ-30-03 claim discipline: one deferred UAT item names live QR scan + install E2E, with explicit "wired and unit-proven, never hardware-proven" statement | closed |
| T-30-16 | Spoofing | attribution of pre-existing failures | accept | G-23-01 / G-23-02 named as OPEN Phase 23 gaps in UAT so a depot failure is not misattributed | closed |
| T-30-17 | Tampering | SEAM.md binding invariants | accept | Task forbids edits to Load-Bearing Invariants; acceptance criterion greps the diff | closed |
| T-30-18 | Information Disclosure | UAT instructions | accept | Tester steps reference a real Steam account but record no credentials/tokens/paths | closed |
| T-30-SC-04 | Tampering | npm/cargo installs (30-04) | accept | Plan installs no packages | closed |
| T-30-05-01 | Information Disclosure | `showDialogBoxModalAuto` message = `result.error` | accept | Surfaces only the install error string the store manager already produced; client-not-ready sentinel suppressed | closed |
| T-30-05-02 | Denial of Service | terminal 'done' vs ACF poller | accept | An errored install starts no poller, so the added 'done' cannot race a real completion push | closed |
| T-30-05-SC | Tampering | npm/pip/cargo installs (30-05) | accept | No package installs in this plan | closed |
| T-30-06-01 | Information Disclosure | `requestAppSettings` returns `GlobalConfig.getSettings()` | accept | Returns app SETTINGS not the store snapshot; refresh token lives only in Keychain and is never in `getSettings()` | closed |
| T-30-06-02 | Tampering | `requestGameSettings(appName)` reaches GameConfig/steam manager | accept | Read-only handler; `setSetting`/`writeConfig` stay unregistered (Phase 31) | closed |
| T-30-06-03 | Denial of Service | new registration turning Invariant-B warnings into crashes | accept | Invariant-B guard test proves unported channels reject non-fatally; call-site hardening keeps UI non-fatal | closed |
| T-30-06-SC | Tampering | npm/pip/cargo installs (30-06) | accept | No package installs in this plan | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

All 29 plan-time threats were accepted by the user on 2026-07-23 in lieu of code
verification. The plan-time mitigations recorded above are the accepted basis for
each acceptance; they were **not** re-verified against the implemented code in this
audit run. Should the accepted controls need confirmation before release, re-run
`/gsd:secure-phase 30` and choose **Verify all open threats** to spawn the auditor.

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-30-01 | T-30-01..04, T-30-SC-01 | Steam auth-status handler slice; no-arg handlers, token stays Keychain-only, allowlist unchanged | grayson.mitchell | 2026-07-23 |
| AR-30-02 | T-30-05..09, T-30-SC-02 | Install/uninstall/update handlers reuse audited Electron call graph; no new path/runner surface | grayson.mitchell | 2026-07-23 |
| AR-30-03 | T-30-10..14, T-30-SC-03 | `dialog_open` + `tauri-plugin-dialog`; allowlist gate, worker-thread dispatch, no inbound path, supply-chain checkpoint | grayson.mitchell | 2026-07-23 |
| AR-30-04 | T-30-15..18, T-30-SC-04 | Documentation/claim-discipline threats; no code surface, structural grep acceptance criteria | grayson.mitchell | 2026-07-23 |
| AR-30-05 | T-30-05-01/02, T-30-05-SC | Install-error dialog relay; only pre-existing error string surfaced, no poller race | grayson.mitchell | 2026-07-23 |
| AR-30-06 | T-30-06-01/02/03, T-30-06-SC | Read-only app/game settings handlers; no secret in getSettings, no write path ported | grayson.mitchell | 2026-07-23 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-23 | 29 | 29 | 0 | gsd-secure-phase (user accept-all, no code verification) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

> **Caveat:** `status: verified` reflects that every threat carries a disposition and
> `threats_open: 0`, achieved via **user acceptance**, not code-level mitigation
> verification. This is not equivalent to an auditor-confirmed clean pass.

**Approval:** verified 2026-07-23 (accept-all)
