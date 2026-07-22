# Phase 30 — Declared Ported-Channel List

**Purpose:** The enumerated set Phase 31 starts from (D-11). This is the artifact SEAM.md §1
cross-references by filename. It describes what actually shipped in 30-01..30-03, not this
phase's original intent — verified against the three plan SUMMARY.md files.

---

## Ported this phase

| Channel | Kind | Registration module | Real backend code reached | Requirement |
|---|---|---|---|---|
| `checkSteamInstalled` | invoke | `steamAuthFlowRegistration.ts` | `SteamUser.isSteamClientInstalled()` | REQ-30-01 |
| `steamStartQR` | invoke | `steamAuthFlowRegistration.ts` | `SteamUser.startQRLogin()` | REQ-30-01 |
| `steamPollQR` | invoke | `steamAuthFlowRegistration.ts` | `SteamUser.pollQRLogin()` | REQ-30-01 |
| `install` | invoke | `installFlowRegistration.ts` | `SteamGame.install()` (direct bypass, D-05a) — native depot-download branch only (D-07) | REQ-30-04 |
| `uninstall` | invoke | `installFlowRegistration.ts` | `uninstallGameCallback()` (`src/backend/utils/uninstaller.ts`, unchanged, all runners — D-05b) | REQ-30-04 |
| `updateGame` | invoke | `installFlowRegistration.ts` | `SteamGame.update()` (direct bypass, D-05a — pre-existing Phase-2 stub, always `{status:'error'}` on both builds today) | REQ-30-04 |
| `checkGameUpdates` | invoke | `installFlowRegistration.ts` | `checkGameUpdates()` (`src/backend/utils/checkGameUpdates.ts`, shared with Electron's `main.ts`, unchanged, all runners — D-05b/D-12) | REQ-30-04 |
| `listSteamLibraryTargets` | invoke | `installFlowRegistration.ts` | `isSteamNativeInstallEnabled()` gate (mirrors Electron's own gate exactly) | REQ-30-04 |
| `gameStatusUpdate` | push | rides the existing generic `frontendMessage` → `frontend_message` relay; source is `sendGameStatusUpdate()` (`src/backend/utils.ts:1351`) called directly from `installFlowRegistration.ts` | Zero Rust changes — the third rider after `pushGameToLibrary` (Phase 27) and `storeChanged` (Phase 29) | REQ-30-05 |

Additionally, `dialog_open` (a `rustInvoke` channel, not a sidecar `invoke` channel) went real this
phase via `installFlowRegistration.ts`'s sibling plan 30-03 — see SEAM.md §1 and the note at the
bottom of this document.

---

## Deliberately NOT ported this phase

Each entry below still rejects non-fatally with `UNPORTED_CHANNEL_MARKER` per Invariant B.

**Login — credential/guard/logout branches (D-02, QR only):**
- `steamStartCredentials`
- `steamSubmitGuard`
- `steamPollCredential`
- `getSteamUserInfo`
- `logoutSteam`

**The six `DownloadDialog` channels — `DownloadDialog` never mounts for `runner === 'steam'`
(`InstallGameModal.ts:66-74` is a commented chokepoint), so none of its reads are on the Steam
depot path this phase covers:**
- `requestAppSettings`
- `requestGameSettings`
- `checkDiskSpace`
- `getGameOverride`
- `getGameSdl`
- `getPrivateBranchPassword`

**Cosmetic, ignored by `SteamGame`:**
- `getAlternativeWine` — `SteamGame` never reads `wineVersion`; `InstallModal/index.tsx:113`'s
  call is a no-op on the Steam depot path.

**Queue channels (Phase 32's cluster, per D-05a):**
- `getDMQueueInformation`
- `removeFromDMQueue`
- `pauseCurrentDownload`
- `resumeCurrentDownload`
- `cancelDownload`

**Throughput (Phase 32, per D-06):**
- Byte-level `progressUpdate` (high-frequency percent/byte push) — only the coarse
  queued/installing/done/uninstalling status transitions are wired this phase.

**Install-mechanism branches (D-07):**
- The CrossOver bottle install branch (`SteamGame.installBottleNative`)
- The macOS bridge install branch (`SteamGame.installBridgeGame`)

**Note on `dialog`:** `dialog.showOpenDialog` (the open-directory path) is ported this phase via
the `dialog_open` `rustInvoke` channel (plan 30-03). The other five `dialog.*` members
(`showErrorBox`, `showMessageBox`, `showMessageBoxSync`, `showOpenDialogSync`, `showSaveDialog`)
remain stubbed/unported — Phase 31 owns the rest of the cluster.
