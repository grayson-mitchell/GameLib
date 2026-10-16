# Phase 32 — Declared Ported-Channel List

**Purpose:** The enumerated set Phase 33 starts from, mirroring how Phase 32 itself started from
`31-PORTED-CHANNELS.md`. This is the artifact SEAM.md §1 cross-references by filename. It
describes what actually shipped in 32-01..32-02, not this phase's original intent — verified
against both plan SUMMARY.md files.

**Claim-scope note (D-06, doubly-gated — do not reuse Phase 30/31's single-blocker wording):**
every row in the "Ported this phase" table below means the channel is **registered on the sidecar
and no longer marker-rejects** (the five queue channels), OR **re-routed onto the real
`addToQueue()`, replacing the Phase 30 D-05a direct bypass** (`install`/`updateGame`), OR **rides
the existing generic `frontend_message` relay with zero new sidecar/Rust code** (`progressUpdate`,
`changedDMQueueInformation`). This is proven by jest coverage
(`downloadQueueFlows.test.ts`, the unmodified `downloadqueue.test.ts` contract, and the existing
`depot.test.ts` throttle suite) — **never by a live queue screen click-through.** Neither
"registered" nor "re-routed" is the same claim as "the Download Manager screen works end-to-end
under `tauri:dev`." Unlike Phase 30/31, this slice's own live-E2E verification is **doubly gated**:
reaching it requires BOTH **G-30-01** (Tauri QR login unresponsive — blocks reaching a signed-in
library to enqueue anything) AND **G-30-02** (install-hang, parked to Phase 33 — blocks a running
install for the queue channels to act on) to be fixed first. Do not read any row below as proof
that pause/resume/cancel/progress were exercised against a real running download.

---

## Ported this phase

| Channel | Kind | Registration module or real code reached | Requirement |
|---|---|---|---|
| `getDMQueueInformation` | invoke | `downloadQueueFlowRegistration.ts` (`ipcMain.handle`) → `downloadqueue.ts`'s `getQueueInformation()` | REQ-32-04 |
| `removeFromDMQueue` | send (listener) | `downloadQueueFlowRegistration.ts` (`ipcMain.on`, never `.handle`) → `removeFromQueue(appName)` | REQ-32-04 |
| `pauseCurrentDownload` | send (listener) | `downloadQueueFlowRegistration.ts` → `pauseCurrentDownload()` — **abort-then-reconciled-restart, NOT true in-flight suspend** (see D-04 note below) | REQ-32-04 |
| `resumeCurrentDownload` | send (listener) | `downloadQueueFlowRegistration.ts` → `resumeCurrentDownload()` → `initQueue()` restart, reconciled cheaply via Phase 23's `reconcilePartialState` | REQ-32-04 |
| `cancelDownload` | send (listener) | `downloadQueueFlowRegistration.ts` → `cancelCurrentDownload({removeDownloaded})` | REQ-32-04 |
| `install` | invoke | `installFlowRegistration.ts` (re-routed) → `addToQueue()`, replacing the Phase 30 D-05a direct `SteamGame.install()` bypass. Resolves `Promise<void>` once QUEUED (not once installed), matching the real typed contract (`common/types/ipc.ts:394`) | REQ-32-01 |
| `updateGame` | invoke | `installFlowRegistration.ts` (re-routed) → `addToQueue()`, replacing the Phase 30 D-05a direct `SteamGame.update()` bypass. Resolves `Promise<void>` once QUEUED (`common/types/ipc.ts:404`) | REQ-32-01 |
| `progressUpdate` | push (`frontend_message`) | `depot.ts`'s already-throttled `emitProgress()` (500ms/1%/1000ms heartbeat cadence, unchanged) → `sendFrontendMessage` → the existing generic relay. **No new sidecar throttle or coalescer added** — a second, unconditional coalescer would double-throttle and make Tauri lag Electron | REQ-32-03 |
| `changedDMQueueInformation` | push (`frontend_message`) | `downloadqueue.ts` — 5 call sites (`initQueue` ×2, `addToQueue`, `removeFromQueue`, `pauseCurrentDownload`). **This is the research-surfaced "fifth" push channel, undeclared by 32-CONTEXT.md — do NOT omit it (Pitfall 4).** Without this row, the Download Manager screen / Sidebar queue badge renders once at mount and never updates again | REQ-32-07 |

**Deviation note (32-02, planner-discretion widening — see `32-02-SUMMARY.md`):** the `install`/
`updateGame` re-route dropped the Phase 30 CR-01 non-steam-runner guard **entirely**, going beyond
the plan text's literal "Steam-only or runner-generic, planner's call" framing to full Electron
`ipc_handler.ts` parity — ALL runners now enqueue through `addToQueue()` under the sidecar, not
just Steam. Justification: RESEARCH.md's own D-01/D-02 wording favors the runner-generic Electron
shape, and `storeManagers/index.ts` already force-constructs all six library managers in the
sidecar regardless (Phase 30 D-05b finding), so a Steam-only guard buys zero import-graph savings
and would only diverge Tauri's behavior from Electron's for no reason.

---

## Deliberately NOT ported this phase

**Boot-time auto-resume — D-05, disabled and logged (NOT replicated):**
- The sidecar never calls the main process's startup-flagged `initQueue` call
  (`main.ts:579`'s `initQueue(isStartup=true)`) — this is the boot-time
  `resumeInterruptedSteamInstall` auto-fire Electron runs on every launch. Deliberately disabled
  under the sidecar because install itself is parked (**G-30-02** hang) and the CrossOver-bottle
  resume path is a known, out-of-scope bug (Phase 30 D-07: "startup-resume auto-opens Steam-in-
  CrossOver for bottle games"). Auto-resuming a hang-prone install at sidecar boot would make the
  process crash-prone for no proven gain. The disablement is logged (deferred via `setImmediate`
  with a `console.info` fallback, per 32-01's own Deviation 1), never silent.
- **Preserved regardless:** pre-`initQueue()` cancelability. `downloadqueue.ts`'s module-scope
  `currentElement` seed (`downloadqueue.ts:49`, `let currentElement: DMQueueElement | null =
  getFirstQueueElement()`) means the queue head is cancelable even before `initQueue()` has ever
  run — this contract is unmodified and still holds under the sidecar. Only the 5-second
  auto-resume *timer* that `initQueue()` schedules on boot is suppressed.

**Install-mechanism branches — Phase 30 D-07, unchanged, out of scope this phase:**
- The CrossOver bottle install branch (`SteamGame.installBottleNative`)
- The macOS bridge install branch (`SteamGame.installBridgeGame`)

**D-04 nuance — pause/resume is real but is NOT true in-flight suspend:**
The Steam depot downloader has no dedicated mid-download pause primitive. `pauseCurrentDownload`
is implemented as **abort-then-reconciled-restart**: the in-flight download is aborted, and a
subsequent `resumeCurrentDownload` re-enters via `initQueue()`, which cheaply reconciles already-
downloaded state through Phase 23's `reconcilePartialState` rather than restarting from zero. This
is a REAL, functioning operation — not a no-op — but it must never be described as "true pause"
(the download does not sit suspended mid-stream; it is torn down and rebuilt on resume). Both
`pauseCurrentDownload` and `resumeCurrentDownload` above are marked with this caveat in their table
rows.

---

**Note on claim level:** this document, `32-HUMAN-UAT.md`, and `32-01-SUMMARY.md`/
`32-02-SUMMARY.md` all independently state the same boundary: **"wired and unit-proven," never
"hardware-proven,"** and specifically not "the live queue was exercised." The two live-E2E
blockers — **G-30-01** and **G-30-02** — are named together everywhere this claim appears, per
D-06's doubly-gated framing.
