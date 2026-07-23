# Phase 33 — Declared Ported-Channel List

**Purpose:** The enumerated set the next Tauri phase (34/35) starts from, mirroring how Phase 33
itself started from `32-PORTED-CHANNELS.md`. This is the artifact SEAM.md §1 cross-references by
filename. It describes what actually shipped in 33-01..33-05 — including three gap fixes
discovered DURING the 33-05 live hardware gate that are NOT in the original 33-01..33-04 plan
text — not this phase's original intent, verified against all five plan SUMMARY.md files.

**Claim-scope note (mirrors Phase 31/32's framing, but this phase is different in kind):** Phase
33 is NOT another IPC-endpoint slice — no `sidecar invoke`/`send` channel count increases here.
This phase closed a parked hang (G-30-02) and ported the `dialog`/`Notification`/`shell`/`app`
lifecycle cluster to real cross-process behavior via the `rustInvoke` transport (Phase 28's
sidecar→Rust request/response mechanism). Every row below is either (a) real Tauri-side behavior,
unit-proven by jest, or (b) — uniquely for this phase — **hardware-proven live** via the 33-05 D-13
gate (`npm run tauri:dev`, a real Steam install, human-approved). Distinguish the two explicitly
per row.

---

## PORTED (real behavior)

| Item | Kind | Real behavior | Proof level | Requirement |
|---|---|---|---|---|
| `dialog_message` → `showMessageBox` (multi-button) | rustInvoke | Rust's `dialog_message` arm now reads an optional 2-element `buttons` array and wires it to `MessageDialogButtons::OkCancelCustom`, returning the real clicked button. Retires the Phase 31 CR-01 `{response:-1}` safe-sentinel stopgap. Per-caller `cancelId` fail-safe: `askForceUninstall` (cancelId:0) and `promptI386Recovery` (cancelId:1) each declare their OWN safe button index — their button orders are opposite, so a shared positional heuristic would be wrong for one of them (D-07). | Unit-proven (`dialogStub.test.ts`, 5 new cases) | REQ-33-05 |
| `Notification` (`notification_show`) | rustInvoke via new `tauri-plugin-notification` plugin | `Notification.isSupported()` returns `true`; `.show()` forwards title/body through `app.notification().builder().title().body().show()`. First real notification behavior this phase (previously fully unported). | Unit-proven (`lifecycleStub.test.ts`, 17 new cases) | REQ-33-06 |
| `shell.showItemInFolder` / `shell.openPath` | rustInvoke via `tauri-plugin-opener` (already installed for `open_external`) | Two new channels (`shell_show_item_in_folder`/`shell_open_path`) backed by the opener plugin's `reveal_item_in_dir()`/`open_path()`. No new Cargo dependency needed. | Unit-proven (`lifecycleStub.test.ts`) | REQ-33-06 |
| `app.quit` / `app.exit` / `app.relaunch` | rustInvoke (new `RUST_APP_EXIT`/`RUST_APP_RELAUNCH` channels) | Forward to Tauri's real `AppHandle::exit()`/`restart()` — fixes the "zombie sidecar" gap where the real Tauri process never actually exited or relaunched. `quit`/`exit` share one channel (both graceful-enough for the two sidecar-reachable callers); `relaunch` is separate (`AppHandle::restart()` never returns). | Unit-proven (`lifecycleStub.test.ts`) | REQ-33-07 |
| **notification permission capability grant** (gate gap-fix #1) | Tauri capability | `notification:allow-is-permission-granted` granted in `src-tauri/capabilities/default.json`. Required because `tauri-plugin-notification`'s injected `init-iife.js` invokes `plugin:notification\|is_permission_granted` at webview load on non-Windows — without this grant the app crashed on startup (denied IPC → unhandled rejection). `notification:default` deliberately NOT granted (WR-03 minimal-exposure; the actual notification path is Rust-side via `notification_show` and needs no renderer grant). Found and fixed DURING the 33-05 live gate, not in the original 33-04 plan. | **Hardware-proven** — fixed the literal startup crash blocking the D-13 live gate (commit `b4e38816`) | REQ-33-10 (via D-13) |
| **sidecar online-monitor wiring** (gate gap-fix #2) | sidecar bootstrap | `initOnlineMonitor()` is now called from `bootstrap.ts`'s `init()` (once-guarded via `onlineMonitorInitialized`), not only from Electron's `main.ts` `app.whenReady()` which the headless sidecar never runs. Paired with a new `net.isOnline: () => true` on the electron stub so the monitor falls through to the real axios `pingSites()` check (the authoritative online/offline signal). Before this fix, every Tauri install failed immediately with "App offline, skipping install" because `online_monitor` status stayed `undefined` forever. This moves the `net`/connectivity surface from "stubbed/unwired" toward "real" in SEAM.md's terms. Found and fixed DURING the 33-05 live gate (commits `665a07fe`..`02bb2604`). | **Hardware-proven** — the D-13 gate's install only reached "online"/queued because of this fix; also unit-proven (`onlineMonitorWiring.test.ts`) | REQ-33-10 (via D-13) |
| **`navigator.windowControlsOverlay` guard** (gate gap-fix #3) | frontend parity | `src/frontend/index.tsx:213` — unguarded read of `navigator.windowControlsOverlay.visible` threw under Tauri's WKWebView (the property is undefined there, Chromium/Electron-only). Added the same optional-chaining guard already used at `App.tsx:42`. Cosmetic startup-error noise, not part of G-30-02, fixed while investigating the live gate (commit `07679ee6`). | **Hardware-proven** — confirmed the console error disappeared on the passing D-13 run | n/a (incidental parity fix) |
| **G-30-02 install-hang fix** (the phase's headline item) | steam-backend + downloadmanager | Three-layer fix: (1) `installQueueElement`'s finally-guard now clears the "installing" badge and shows a failure dialog on Steam `status:'error'`, not just success/abort (33-01); (2) a bounded belt-and-suspenders watchdog (`withTimeout`, ~8-10min) force-terminates a never-settling `.install()` await down the same terminal-error path (33-01); (3) `ensureConnected()` no longer trusts a populated `client.steamID` alone — a bounded canary `getProductInfo` probe (AppID 753, 5s) revalidates the CM connection first, and on canary failure a guarded `client.relog()` + bounded grace window (20s) self-heals a stale-but-rehydrated socket so the install actually proceeds instead of merely failing fast (33-02). | **Hardware-proven live** — D-13 gate PASS 2026-07-24, Baldur's Gate II: Enhanced Edition installed end-to-end under `npm run tauri:dev` with a sidecar rebuilt from the current tree; no hang, reached `Connectivity: online`, entered and completed the download queue (33-05) | REQ-33-01, REQ-33-02, REQ-33-10 |

---

## LOGGED NO-OPS / RE-DEFERRALS (declared, not silent)

| Item | Status | Reason | Target |
|---|---|---|---|
| `shell.trashItem` | LOGGED no-op (upgraded from silent) | No vetted Tauri v2 plugin has trash/recycle-bin capability: direct inspection of the installed `tauri-plugin-fs` 2.5.1 crate source confirmed zero trash-move capability in this version. No new Cargo dependency was added — there was genuinely nothing to wire to. Now emits `console.warn` instead of doing nothing (33-04). | Phase 35 revisit (if `tauri-plugin-fs` ever adds trash support) |
| `session` (D-09) | LOGGED no-op | Previously not exported by `electronStub.ts` AT ALL — an `import { session } from 'electron'` destructure resolved to `undefined` silently, risking an opaque `TypeError` at a future reachable call site. Added a `fromPartition()` stub that logs and fails loudly instead (33-04). Accepted parity gap — no Tauri v2 session-partition equivalent used. | Phase 35 revisit |
| `powerSaveBlocker.start` | LOGGED no-op (upgraded from silent) | Accepted parity gap (D-08) — no full Tauri v2 power-save-blocker parity yet (spike 011's "soft spot" finding, carried forward unchanged). Now logs instead of silently doing nothing (33-04). | Phase 35 revisit |
| `showMessageBoxSync` | LOGGED no-op (unchanged from Phase 31) | Sole call site (`storeManagerCommon/games.ts:89`, sideload browser-game quit confirm) stays out of scope; sync-over-async, no Tauri sync dialog primitive wired. Not touched this phase — declared here for completeness per the plan's must-haves. | Not re-examined this phase |
| `showOpenDialogSync` | LOGGED no-op (unchanged from Phase 31) | No in-scope caller found in Phase 31's trace; not touched this phase. | Not re-examined this phase |
| WR-02 — non-Steam DLC fan-out re-scope (D-11) | Declared re-scope, guarded not silent | The sidecar's `installQueueElement` install path is Steam-focused. A non-Steam runner (Epic/GOG/Amazon) reaching this path with `installDlcs` populated now emits a `logWarning` naming the re-scope explicitly instead of silently dropping the DLC fan-out (33-01). This is a declared boundary, not a discovered gap — the Epic/GOG DLC fan-out logic itself is untouched and unported. | Not scheduled — Steam-focused install path is the phase's stated boundary |
| Boot-time auto-resume (`initQueue(isStartup=true)`) | Deliberately NOT replicated (unchanged from Phase 32 D-05) | The sidecar still never calls the main process's startup-flagged `initQueue(isStartup=true)` auto-resume. This plan did not re-examine or change that boundary — carried forward untouched per Phase 32's own D-05 and this phase's D-04. Pre-`initQueue()` cancelability (the module-scope `currentElement` seed) remains preserved regardless. | Phase 35 (Electron cutover) per Phase 32 precedent |
| Tray | Deferred, re-declared | No tray implementation exists under the Tauri sidecar/shell. Untouched this phase. | Phase 34/35 |
| Custom-protocol registration | Deferred, re-declared | `steam://` protocol registration (the OS-level handler, distinct from `shell.openExternal`'s outbound `steam://rungameid` calls, which already work) is not ported. Untouched this phase. | Phase 34/35 |
| Full multi-window (`BrowserWindow` management) | Deferred, re-declared | Only `getAllWindows()[0].webContents.send` has real behavior (the push path, Phase 27). No real multi-window management exists. Untouched this phase. | Phase 34/35 |
| `nativeImage` | Deferred, re-declared | Tauri `image`/icon APIs not wired — only needed once tray/notifications need custom icons; the notification port shipped this phase uses no custom image. Untouched this phase. | Phase 34/35 |
| Updater hooks | Deferred, re-declared | No auto-update wiring under Tauri. Untouched this phase; unrelated to this phase's lifecycle-cluster scope. | Phase 34/35 |

---

**Note on claim level:** the lifecycle-cluster ports (`dialog`/`Notification`/`shell`/`app`) are
**"wired and unit-proven"**, same claim level as Phase 31/32. The G-30-02 install-hang fix and the
three gate gap-fixes are the exception this phase introduces — they are **hardware-proven live**
via the 33-05 D-13 gate, the first time this document series can make that stronger claim for any
row. Do not conflate the two proof levels when reading this table: unit-proven rows have NOT been
exercised against a real running Tauri build; hardware-proven rows have.
