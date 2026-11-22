---
phase: "100"
slug: "game-page-without-the-menu"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-22"
---

# Phase 100 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time (`<threat_model>` in all 14 plans); verified at ASVS L1 (grep depth) by `/gsd-secure-phase` during the 2026-11-22 re-verification.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| renderer → sidecar IPC | Install-tab, danger-zone, cloud-sync and shortcut actions invoke existing sidecar channels (shapes unchanged) | appName, runner, picker-chosen paths, sync type |
| renderer → OS / browser | Open folder, store link, ProtonDB link and Show in Steam leave the app | install path (user's own), fixed-origin URLs |
| shell invoke timeout | `LONG_RUNNING_CHANNELS` in `src-tauri/src/main.rs` exempts moveInstall / changeInstallPath / steamRemoveAllCopies from the 60 s cap | none (timing only) |
| errors → UI vs log | raw rejections go only to console / `window.api.logError`; rows show fixed translated text | error text (may carry paths) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-100-01 | I | RowFailure / reportRowActionFailure | medium | mitigate | inline failure text is a fixed translated string; the raw error goes to console.error (as an argument, never interpolated into UI) and window.api.logError only (keeps T-34.2-52) — *evidence:* covered by the plan's tests (all 23 phase suites green 2026-11-22) | closed |
| T-100-02 | T | toggleShortcuts answer handling | low | mitigate | state set from `result === true` only; a malformed reply cannot flip the switch; contradicting answers mark the row failed — *evidence:* `shortcutsToggle.ts:63` `setHasShortcuts(result === true)` | closed |
| T-100-03 | D | switch busy state | low | mitigate | setBusy(false) stays in finally; useRowAction never rethrows, so a rejection cannot leave a row stuck pending — *evidence:* covered by the plan's tests (all 23 phase suites green 2026-11-22) | closed |
| T-100-04 | T | CategoryPopover handleNewCategory | medium | mitigate | validateNewCategoryName trims and rejects blank and existing names before addCategory, so setCustomCategory can never replace an existing category's game list (ASVS V5) — *evidence:* `CategoryPopover.tsx:42` `validateNewCategoryName`; `categoryName.test.ts` green | closed |
| T-100-05 | I | category chip / option rendering | low | mitigate | names render as React text children only; no dangerouslySetInnerHTML anywhere in LeftCard — *evidence:* source gate `leftCardSource.test.ts` (no `dangerouslySetInnerHTML`) green | closed |
| T-100-06 | T | category keying | low | mitigate | categoryKeyFor builds the `${appName}_${runner}` key CategorySettings uses, so the page and the modal edit the same list — *evidence:* covered by the plan's tests (all 23 phase suites green 2026-11-22) | closed |
| T-100-07 | T | usePlayTime server value | low | accept | display-only; the existing TimeContainer logic (raise-only, numeric) moves unchanged, rendered as React text — *evidence:* accepted (see log) | closed |
| T-100-08 | T | StoreBadgeLink | low | mitigate | keeps ⋮'s in-app NavLink to /store-page?store-url= (the store page's existing handling applies); no window.open or external launch is added — *evidence:* covered by the plan's tests (all 23 phase suites green 2026-11-22) | closed |
| T-100-09 | I | Edit details dialog | low | accept | reuses EditGameDialog unchanged; no new data surface — *evidence:* accepted (see log) | closed |
| T-100-10 | T | useInstallLocationActions paths | medium | mitigate | paths come only from useOpenDialog's directory picker (census-enforced); the backend's assertPlausibleAbsolutePath guard on moveInstall is unchanged — *evidence:* `useInstallLocationActions.ts:45` `useOpenDialog` | closed |
| T-100-11 | I | Location/Version inline failures | medium | mitigate | fixed translated failure strings; raw errors go through reportRowActionFailure to console and logError only — *evidence:* covered by the plan's tests (all 23 phase suites green 2026-11-22) | closed |
| T-100-12 | I | WhatsNewLink changelog | medium | mitigate | changelog renders only through GameChangeLog (sanitize-html); no inline HTML in the Version row — *evidence:* `WhatsNewLink.tsx` renders via `GameChangeLog` only | closed |
| T-100-13 | D | repeated Move/Verify clicks | low | mitigate | FactAction ignores clicks while busy or aria-disabled; installActionGates disables conflicting actions while is.moving / is.reparing / is.updating — *evidence:* covered by the plan's tests (all 23 phase suites green 2026-11-22) | closed |
| T-100-14 | T | Sync now ▾ force commands | medium | mitigate | force-download / force-upload keep the existing overwrite confirmation (needsForceConfirm gate, pinned by installTabSource.test.ts) before executeCloudSync runs — *evidence:* `CloudSavesSync.tsx:117` `needsForceConfirm` | closed |
| T-100-15 | I | Cloud saves inline failure | medium | mitigate | fixed translated failure text; raw errors and GOG stderr go to logError only (stderr logging unchanged) — *evidence:* covered by the plan's tests (all 23 phase suites green 2026-11-22) | closed |
| T-100-16 | D | sync busy state | low | mitigate | useRowAction clears busy on rejection (the property cloudSavesSyncFailure.test.tsx proved, now covered by rowAction.test.ts) — *evidence:* covered by the plan's tests (all 23 phase suites green 2026-11-22) | closed |
| T-100-17 | T | useUninstallActions Uninstall | high | mitigate | steamUninstallNeedsConfirm with CLOSED_STEAM_DELETE_ROUTE on rejection fails closed (confirm shown); non-Steam always shows UninstallModal; the button is disabled while playing or during any long action — *evidence:* `useUninstallActions.ts:57` `.catch(() => CLOSED_STEAM_DELETE_ROUTE)`; `steamUninstallConfirm.test.ts` green | closed |
| T-100-18 | T | Remove all copies | high | mitigate | the existing "Remove all copies?" confirm is copied verbatim and is the only path to steamRemoveAllCopies — *evidence:* `DangerZone.tsx:94` `startRemoveAllCopies` re-shows the confirm; `installTabRows.test.tsx` green | closed |
| T-100-19 | I | Show in Steam / Runs for me failures | medium | mitigate | fixed translated failure strings; raw errors via reportRowActionFailure to console/logError only — *evidence:* covered by the plan's tests (all 23 phase suites green 2026-11-22) | closed |
| T-100-20 | I | LogSettings Copy log | low | accept | user-initiated copy of a log the user can already open, upload and reveal in Finder; log lines are redacted at write time by the Rust sanitiser (Phase 84) — *evidence:* accepted (see log) | closed |
| T-100-21 | D | Logs tab polling | low | mitigate | the existing 1000 ms getLogContent interval runs only while the Logs TabPanel is mounted (TabPanel renders the active tab only) and clears on unmount — *evidence:* covered by the plan's tests (all 23 phase suites green 2026-11-22) | closed |
| T-100-22 | T | EosOverlaySetting install flow | medium | mitigate | handleEosOverlay copied verbatim: every EOS channel goes through callOrDeclare (never throws on decline), the "install now?" confirmation stays, and the new call-site guard pins 5 sites and 6 releases — *evidence:* `EosOverlaySetting.callSiteGuard.test.ts` green | closed |
| T-100-23 | T | transient initialTab | low | mitigate | initialTab is read only by the lazy initialiser and never persisted through rememberTab, so a right-click Logs open cannot change the remembered tab — *evidence:* `uiState.test.ts` / `tabs.test.ts` green | closed |
| T-100-24 | T | ProtonDbLink URL | low | mitigate | fixed https://www.protondb.com origin; the title is encodeURIComponent-encoded in the search fallback; ids come from app_name (Steam app id) or wiki data; opened through the existing createNewWindow helper — *evidence:* `ProtonDbLink.tsx:14-38` fixed origin + `encodeURIComponent` | closed |
| T-100-25 | E | Install ▾ Locate | low | accept | opens the existing install modal in import mode, the same door ⋮ offered; no new capability — *evidence:* accepted (see log) | closed |
| T-100-26 | R | retargeted source gates | medium | mitigate | every gate keyed to ⋮ is retargeted to the code that now holds the behaviour (EOS guard → EosOverlaySetting, long-running → useSteamShortcut, shortcuts → IntegrationRows, dialog census → useInstallLocationActions);… — *evidence:* covered by the plan's tests (all 23 phase suites green 2026-11-22) | closed |
| T-100-27 | T | Uninstall confirm after the move | high | mitigate | steamUninstallConfirm.ts moves with its fail-closed tests unchanged; UninstallModal and useUninstallActions import the moved module; the full Frontend project proves it — *evidence:* `steamUninstallConfirm.ts` exports `CLOSED_STEAM_DELETE_ROUTE`; fail-closed tests green | closed |
| T-100-28 | R | 100-HUMAN-UAT.md | medium | mitigate | every item is written `result: pending` and is run by the operator through /gsd-verify-work, never marked pass by its author; each item names its decision ID so a failure traces to a requirement — *evidence:* `100-HUMAN-UAT.md`: 20/20 `result: pending` | closed |
| T-100-29 | D | LONG_RUNNING_CHANNELS (three new members) | low | accept | A wedged handler on these channels becomes a never-settling promise instead of a 60 s rejection: the trade the list already accepts for install, repair and uninstall. A crashed sidecar still drains every pending… — *evidence:* accepted; `main.rs:317-331` list + `timeout_for` tests 8/8 | closed |
| T-100-30 | T | moveInstall / changeInstallPath path argument | medium | mitigate | Unchanged: the sidecar's `assertPlausibleAbsolutePath` guard on moveInstall and the picker-only renderer flow (dialogOptionForwarding census) are untouched; this plan changes only how long the shell waits — *evidence:* covered by the plan's tests (all 23 phase suites green 2026-11-22) | closed |
| T-100-31 | I | VersionRow inline failure | low | mitigate | Fixed translated message only; the raw rejection reaches console.error and window.api.logError through reportRowActionFailure, never the row text (unchanged T-100-01 path) — *evidence:* covered by the plan's tests (all 23 phase suites green 2026-11-22) | closed |
| T-100-32 | E | RowFailure Retry | medium | mitigate | Retry carries retryDisabled from the action's own gate (gates.verify.disabled) and returns early when inert, so it cannot start a repair the Verify button would refuse (D-11) — *evidence:* covered by the plan's tests (all 23 phase suites green 2026-11-22) | closed |
| T-100-33 | T | Location-row Retry (duplicate move against one install) | medium | mitigate | The move failure is not rendered while is.moving; RowFailure's Retry carries gates.move.disabled / gates.setFolder.disabled and returns early when inert; FactAction already ignores clicks while busy — *evidence:* covered by the plan's tests (all 23 phase suites green 2026-11-22) | closed |
| T-100-34 | R | stillRunning hand-off hiding a real failure | medium | mitigate | Hand-off only when isInvokeTimeout(error) AND libraryStatus still reads 'moving' for this appName at rejection time; every other rejection still reports through reportRowActionFailure; the hand-off itself writes a… — *evidence:* `useInstallLocationActions.ts` `isInvokeTimeout` hand-off; `rowAction.test.ts` green | closed |
| T-100-35 | I | Open for third-party-managed games | low | accept | The path is the user's own install path from GameInfo, opened in the OS file manager; no new input crosses; it restores what the deleted ⋮ Browse Files already did — *evidence:* accepted (see log) | closed |
| T-100-36 | R | danger-zone invokes (unlogged failures) | medium | mitigate | Both actions run through useRowAction, so every rejection or contradicting answer goes through reportRowActionFailure to console and window.api.logError; UninstallModal's default path catches and logs; no unhandled… — *evidence:* covered by the plan's tests (all 23 phase suites green 2026-11-22) | closed |
| T-100-37 | E | danger-zone Retry bypassing confirmation | high | mitigate | Retry for Remove all copies is startRemoveAllCopies (re-shows "Remove all copies?"); Retry for Uninstall is startUninstall (re-asks getSteamDeleteRoute, so UninstallModal opens unless Steam's own dialog confirms);… — *evidence:* `DangerZone.tsx:116,128` `retryDisabled` from the gates; Retry = `startUninstall` / `startRemoveAllCopies` | closed |
| T-100-38 | T | double-fire of a destructive action | medium | mitigate | Each danger button ignores clicks while its row is busy (aria-busy, aria-disabled, early return) and while the gate is disabled — *evidence:* `DangerZone.tsx:67,87` `aria-busy` + early return | closed |
| T-100-39 | I | danger-zone failure text | low | mitigate | Fixed translated messages; raw errors only in the log (T-100-01 path) — *evidence:* covered by the plan's tests (all 23 phase suites green 2026-11-22) | closed |
| T-100-40 | R | UAT items authored as passed | low | mitigate | Items 19-20 are `result: pending`; the operator runs them through /gsd-verify-work; each `expected:` ends with its D-IDs — *evidence:* `100-HUMAN-UAT.md`: 20/20 `result: pending` | closed |
| T-100-SC | T | npm/pip/cargo installs (all plans) | low | accept | this plan installs no package; no legitimacy checkpoint needed — *evidence:* accepted (see log) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

Out of scope, noted for the record: `components/CompatibilityInfo.tsx` (older code that nothing imports) still builds an unencoded `protondb.com/search?q=${title}`. Phase 100's live link is `ProtonDbLink.tsx`, which encodes the title (T-100-24).

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-100-07 | display-only; the existing TimeContainer logic (raise-only, numeric) moves unchanged, rendered as React text | plan author (plan-time register) | 2026-11-21 |
| AR-02 | T-100-09 | reuses EditGameDialog unchanged; no new data surface | plan author (plan-time register) | 2026-11-21 |
| AR-03 | T-100-20 | user-initiated copy of a log the user can already open, upload and reveal in Finder; log lines are redacted at write time by the Rust sanitiser (Phase 84) | plan author (plan-time register) | 2026-11-21 |
| AR-04 | T-100-25 | opens the existing install modal in import mode, the same door ⋮ offered; no new capability | plan author (plan-time register) | 2026-11-21 |
| AR-05 | T-100-29 | A wedged handler on these channels becomes a never-settling promise instead of a 60 s rejection: the trade the list already accepts for install, repair and uninstall. A crashed sidecar still drains ev | plan author (plan-time register) | 2026-11-21 |
| AR-06 | T-100-35 | The path is the user's own install path from GameInfo, opened in the OS file manager; no new input crosses; it restores what the deleted ⋮ Browse Files already did | plan author (plan-time register) | 2026-11-21 |
| AR-07 | T-100-SC | this plan installs no package; no legitimacy checkpoint needed | plan author (plan-time register) | 2026-11-21 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-22 | 41 | 41 | 0 | /gsd-secure-phase (orchestrator, L1 short-circuit) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-22
