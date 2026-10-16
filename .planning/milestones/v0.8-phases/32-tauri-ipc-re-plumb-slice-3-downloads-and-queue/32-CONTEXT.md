# Phase 32: Tauri IPC re-plumb slice 3 — downloads and queue - Context

**Gathered:** 2026-07-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Port the **DownloadManager / queue** endpoint cluster onto the Node sidecar —
the third and final mechanical re-plumb slice, following SEAM.md's
Incremental-Port Checklist (steps 1–6). This is the **progress-notification-heavy**
slice: it is the first to drive the `frontendMessage` → `frontend_message` push
path at **real volume** (byte/percent `progressUpdate`), where slices 1 & 2 only
exercised low-frequency single-shot pushes (`pushGameToLibrary`, `storeChanged`,
coarse `gameStatusUpdate` status transitions).

**The pivotal inherited fact.** Phase 30 resolved its D-05a boundary as a
**direct `SteamGame.install()` bypass** — under Tauri today, `install` does NOT
flow through `downloadqueue.ts` (`30-PORTED-CHANNELS.md`). The queue was
deliberately left unported so Phase 30 would not "write code Phase 32 deletes."
Consequently the five queue-management channels and byte-level `progressUpdate`
were all explicitly deferred to this phase. Phase 32 ports the queue **and**
re-routes install through it, because queue-management channels are structurally
hollow if installs never enqueue.

**In scope:**
- Port `downloadqueue.ts` onto the sidecar (`initQueue`/`addToQueue`/
  `getQueueInformation` + the queue-op functions), runner-generic (**D-02**).
- **Re-route `install`/`updateGame`** through `addToQueue()` — retire the Phase 30
  direct-bypass, restoring Electron parity (`ipc_handler.ts` shape) (**D-01**).
- The five queue-management channels, all with **real** behavior backed by the
  ported queue: `getDMQueueInformation`, `removeFromDMQueue`,
  `pauseCurrentDownload`, `resumeCurrentDownload`, `cancelDownload` (**D-04**).
- Byte/percent **`progressUpdate`** push wired over the existing generic
  `frontend_message` relay, with sidecar-side **throttle/coalesce only if the
  sidecar adds volume** beyond Electron's existing emit cadence (**D-03**).
- A new curated `downloadQueueFlowRegistration.ts` module registered from
  `handlers.ts`, alongside the existing four (**D-02**).
- `32-PORTED-CHANNELS.md` declared list + SEAM.md §3→§1 move (checklist step 5).

**Explicitly OUT of scope:**
- **Boot-time auto-resume** of interrupted installs (`resumeInterruptedSteamInstall`
  / `initQueue(isStartup=true)`) — ported queue must NOT auto-fire resume under
  the sidecar this slice (**D-05**).
- The CrossOver **bottle** and macOS **bridge** install branches — stay unported
  and non-fatal per SEAM Invariant B (Phase 30 D-07, unchanged).
- Fixing the parked **G-30-02** install-hang or the broken **G-30-01** Tauri QR
  login — pre-existing blockers named, not fixed here (**D-06**).
- Any **Rust (`src-tauri`) change on the push side** — the `frontend_message`
  relay is already generic over channel name (proven 3× through slice 1). The
  progress push is the fourth rider; expect zero Rust changes (**D-03**).
- Any change to the Electron build's behavior. `npm start` and
  `npm run tauri:dev` must both work (additive/reversible invariant).
- Windows/Linux Tauri packaging, signing, notarization.

</domain>

<decisions>
## Implementation Decisions

### Queue integration boundary

- **D-01 — Re-route `install`/`updateGame` through `addToQueue`; retire the Phase
  30 bypass.** Port `downloadqueue.ts` and change the sidecar install path so
  `install`/`updateGame` enqueue via `addToQueue()` exactly like Electron's
  `src/backend/downloadmanager/ipc_handler.ts` (`install` L13 → `addToQueue` L22).
  This is truest to "the real backend code runs behind the new transport" and is
  the only wiring under which pause/resume/cancel/`getDMQueueInformation` act on a
  real running install. It resolves the debt Phase 30 D-05a intentionally left.
  Rejected: keeping the bypass and wiring queue channels standalone — the channels
  would have nothing to act on (installs never enter the queue), shipping a queue
  UI that does nothing. Cost accepted: absorbs `downloadqueue.ts`'s import-time
  side effects (`initQueue`, the `downloadManager` store), which Phase 29 D-15
  already prepared for by extracting `downloadManager`'s store declaration.

### Module layout & import scope

- **D-02 — New curated `downloadQueueFlowRegistration.ts`; queue stays
  runner-generic.** A fourth curated module (alongside `steamAuthFlowRegistration`,
  `installFlowRegistration`, `settingsFlowRegistration`, `dialogFlowRegistration`)
  owns the five queue channels + progress, registered from `handlers.ts`. Import
  `downloadqueue.ts` **unchanged / runner-generic** — do not narrow to Steam.
  Rationale (Phase 30 D-05b finding): `storeManagers/index.ts` already
  force-constructs all six managers in the sidecar today, so "Steam-only" buys no
  import-graph savings and reshaping a runner-generic queue would diverge from
  Electron for nothing. Extend `installFlowRegistration.ts` only for the
  `addToQueue` re-route itself (D-01). Rejected: putting the queue channels inside
  `installFlowRegistration.ts` — mixes queue-management with install-lifecycle and
  erodes the auditable-import-graph property D-08 exists to protect.

### progressUpdate throughput (the headline)

- **D-03 — Sidecar-side throttle/coalesce, but reuse Electron's existing emit
  cadence; add coalescing only if the sidecar adds volume.** First confirm during
  research where the backend already rate-limits progress (Electron's
  DownloadManager emits on an interval, not per-byte; the push funnels through
  `sendProgressUpdate` / `sendFrontendMessage('progressUpdate', …)` at
  `src/backend/utils.ts:1356`, with the high-frequency emit sites at
  `utils.ts:1094` and `utils.ts:1200`). If the backend is already coarse, the port
  inherits that cadence for free and the sidecar must simply not re-emit
  per-byte — identical Tauri/Electron behavior, no divergence, **zero Rust
  changes** (the fourth rider on the generic `frontend_message` relay). Add an
  explicit sidecar-side trailing coalescer (emit-latest every ~250–500ms or on
  meaningful percent delta) ONLY if a measured gap exists. Rejected:
  pass-through-then-measure (the exact late-discovery risk Phase 30 front-loaded
  here), an unconditional sidecar coalescer (double-throttles, makes Tauri lag
  Electron), and throttling in Rust (breaks the zero-Rust-changes streak, puts
  logic in the least-testable layer).

### Queue-channel semantics

- **D-04 — All five channels real, backed by the ported `downloadqueue.ts`.**
  Because D-01 populates the queue, `getDMQueueInformation`, `removeFromDMQueue`,
  `pauseCurrentDownload`, `resumeCurrentDownload`, `cancelDownload` all map to real
  `downloadqueue.ts` functions runner-generically. `cancelDownload`/`pause` reach
  the depot downloader's abort/pause support (Phase 25 built cancel/abort).
  **Planner note (log-don't-silently-degrade):** confirm the depot path genuinely
  supports mid-download **pause** (vs only cancel). If an operation is not truly
  supported, it becomes a **logged** no-op with the reason recorded in
  `32-PORTED-CHANNELS.md` — never a silent one (checklist step 3). Do not claim a
  queue op works if it cannot.

### Startup download-resume

- **D-05 — Defer/disable boot-time auto-resume this slice.** Port `downloadqueue.ts`
  but ensure the sidecar does NOT auto-fire `resumeInterruptedSteamInstall` on
  boot — i.e. do not replicate `main.ts:579`'s `initQueue(true)` startup call under
  the sidecar; guard the `isStartup` auto-resume off and **log** that it is
  disabled. Rationale: install itself is parked (**G-30-02** hang) and the
  bottle-resume path is a known bug ("startup-resume auto-opens Steam-in-CrossOver
  for bottle games") on a branch that is out of scope (Phase 30 D-07).
  Auto-resuming a hang-prone install at boot would make the sidecar crash-prone
  for no proven gain. Declared explicitly deferred in `32-PORTED-CHANNELS.md`.
  Rejected: wiring full startup-resume matching Electron (drags the parked hang +
  the bottle auto-open bug straight into the sidecar boot path; unprovable while
  install is parked). **Planner note:** `downloadqueue.ts`'s module header + its
  test file document that `initQueue()` schedules a 5s auto-resume timer and that
  the queue head is cancelable *before* `initQueue()` ever runs — the port must
  preserve that pre-`initQueue` cancelability while suppressing the timer.

### Sign-off

- **D-06 — Unit-proven only; the deferred-UAT item names G-30-01 and G-30-02 as
  blockers.** Assert channel wiring, the `addToQueue` re-route, the five queue-op
  behaviors, and the throttle/coalesce shape in jest (mirror
  `skeletonFlows.test.ts` / `settingsFlows.test.ts` + a progress-volume test; do
  not break `downloadqueue.test.ts`). Log **one** deferred UAT item that
  explicitly names the two current blockers gating any live queue E2E:
  **G-30-01** (Tauri QR login unresponsive) and **G-30-02** (install-hang, parked
  to Phase 33). This slice's honest claim is "wired and unit-proven," NEVER
  "hardware-proven," and specifically NOT "the live queue was exercised." Same
  discipline as Phase 30's D-04 tension note. Rejected: reusing the slice-1/2
  wording verbatim (hides that this slice's UAT is doubly-gated).

### Claude's Discretion

- The exact throttle mechanism/interval under D-03 follows from the measured
  backend emit cadence — grep-and-measure during research; the "reuse Electron
  cadence, coalesce only if the sidecar adds volume" boundary is fixed.
- Per-channel real-vs-logged-no-op under D-04 follows from what the depot
  downloader genuinely supports (esp. pause); wire real where supported, log where
  not, declare the boundary.
- Whether the `addToQueue` re-route lives in `installFlowRegistration.ts` or the
  new queue module is a planner call, as long as curated-import discipline holds
  and no `src/backend/sidecar/` file imports the real `electron` module.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The seam this phase extends (read first)
- `.planning/phases/27-tauri-shell-walking-skeleton/SEAM.md` — **the governing
  document.** §"Incremental-Port Checklist" steps 1–6 (this phase executes all
  six); §3 the deferred backlog table (the queue channels + throughput rows this
  phase retires); §"Load-Bearing Invariants" **A** (`window.api` attach order) and
  **B** (unported channels stay non-fatal) — both binding; §"Accepted Constraints".
- `.planning/phases/30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check/30-CONTEXT.md`
  — **D-05a (direct-bypass, the debt this phase resolves)**, D-05b (all six
  managers already constructed → queue stays runner-generic, D-02), D-06 (status
  push wired, byte-progress deferred HERE), D-07 (only native depot branch;
  bottle/bridge out), D-08 (curated-module discipline), D-04 (deferred-UAT tension
  precedent for D-06).
- `.planning/phases/30-.../30-PORTED-CHANNELS.md` — the enumerated remainder this
  phase starts from: the five queue channels (`getDMQueueInformation`,
  `removeFromDMQueue`, `pauseCurrentDownload`, `resumeCurrentDownload`,
  `cancelDownload`) and byte-level `progressUpdate` are listed there as "Phase 32's
  cluster." Records that `install` reaches `SteamGame.install()` via **direct
  bypass (D-05a)**.
- `.planning/phases/31-tauri-ipc-re-plumb-slice-2-settings-and-config/31-CONTEXT.md`
  and `31-PORTED-CHANNELS.md` — the immediately-prior slice's declared-list shape
  to mirror; the CR-01 safe-sentinel dialog lesson (don't wire behavior that can
  auto-confirm a destructive branch) informs how careful the queue-op wiring is.
- `.planning/phases/29-.../29-CONTEXT.md` — D-01 (persistence stays in the Node
  sidecar; Rust is the platform seam) LOCKED; **D-15 extracted `downloadManager`'s
  store declaration specifically for this phase's queue port** — the groundwork
  favoring D-01.

### Spike blueprint
- `.planning/spikes/009-node-backend-headless-sidecar/README.md` — the 16-API /
  44-file / 220-endpoint coupling map; the `downloadmanager` cluster's import-time
  side-effect class (the cost D-01 accepts).

### Existing code — the endpoints being ported (Electron parity source)
- `src/backend/downloadmanager/ipc_handler.ts` — **the re-route parity source.**
  `addHandler('install', …)` L13 → `addToQueue()` L22; `updateGame` similar;
  `addHandler('getDMQueueInformation', getQueueInformation)` L70. The other four
  queue channels' handlers are registered from the downloadmanager cluster —
  locate and mirror them in the new module (D-04).
- `src/backend/downloadmanager/downloadqueue.ts` — **the module being ported.**
  `initQueue(isStartup=false)` L121 (the auto-resume gate for **D-05**); exports at
  L442+ (`initQueue`, queue-op functions). Its module header documents the
  pre-`initQueue` cancelability and the 5s auto-resume timer D-05 must suppress.
- `src/backend/downloadmanager/__tests__/downloadqueue.test.ts` — documents the
  "cancelable before `initQueue()` ever runs" contract and the 5s auto-resume
  timer; the port must not break it (D-05, D-06).
- `src/backend/main.ts:579` — `initQueue(true)` — Electron's boot-time
  auto-resume call. The sidecar must NOT replicate the `isStartup=true` path (D-05).
- `src/backend/utils.ts:1356` — `sendProgressUpdate()` →
  `sendFrontendMessage('progressUpdate', …)` L1357; high-frequency emit sites at
  `utils.ts:1094` and `utils.ts:1200`. **The D-03 throttle/cadence target.**
- `src/common/types/ipc.ts` — the typed signatures for the five queue channels and
  `progressUpdate` in the frontend-message section every ported channel must match.

### Existing code — the sidecar pattern to mirror
- `src/backend/sidecar/installFlowRegistration.ts` — Phase 30's install module;
  the `addToQueue` re-route (D-01) touches its install path. Read its module
  docstring for the curated-import discipline + the load-bearing
  `import '../storeManagers'` first-import ordering fix any new module inherits.
- `src/backend/sidecar/handlers.ts` — the registration site
  (`registerSteamFlows`/`registerSteamAuthFlows`/`registerInstallFlows`/
  `registerSettingsFlows`/`registerDialogFlows`); the new `registerDownloadQueueFlows`
  from `downloadQueueFlowRegistration.ts` slots in here (D-02). Uses `electronStub`'s
  `ipcMain`, never `backend/ipc`.
- `src/backend/sidecar/electronStub.ts` — any newly-required Electron API for the
  queue path gets real behavior or a **logged** no-op here (checklist step 3).
- `src-tauri/src/main.rs` — the `frontend_message` relay (already generic — D-03
  expects **zero** changes here; if the progress push needs Rust work, stop and ask
  why, per the Phase 29 `storeChanged` precedent).
- `src/common/types/storePolicy.ts` + `src/backend/sidecar/storeRegistration.ts` —
  checklist step 4: the `downloadManager` store (Phase 29 D-15) is declared here;
  a store missing from `storeRegistration.ts` silently reads as `{}`.

### Existing code — the frontend surface the flow crosses
- The DownloadManager queue view / progress bar components that consume
  `progressUpdate` and call the five queue channels — confirm during research which
  reads must round-trip so the queue UI renders and its buttons act.

### Tests to mirror / not break
- `src/backend/sidecar/__tests__/skeletonFlows.test.ts` /
  `settingsFlows.test.ts` — the new-channel test shape.
- `src/backend/downloadmanager/__tests__/downloadqueue.test.ts` — the queue
  contract (cancelability, auto-resume timer) the port must preserve.
- `src/backend/sidecar/__tests__/electronUntouched.test.ts` — the
  additive/reversible guard; both builds must still work.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`downloadqueue.ts`** — ported wholesale, runner-generic (D-02). `initQueue`,
  `addToQueue`, `getQueueInformation`, and the queue-op functions are the real
  backend the channels forward to.
- **`installFlowRegistration.ts`** — already routes `install`; D-01 changes its
  target from a direct `SteamGame.install()` bypass to `addToQueue()`.
- **The `frontendMessage` → `frontend_message` push path** — generic over channel
  name, proven 3× (`pushGameToLibrary`, `storeChanged`, `gameStatusUpdate`). The
  `progressUpdate` push is the **fourth rider**; expect zero Rust work (D-03).
- **`downloadManager` store (Phase 29 D-15)** — extracted into a thin declaration
  *for this phase*; already constructible in the sidecar.
- **Depot cancel/abort (Phase 25)** — the real mechanism `cancelDownload`/`pause`
  reach (D-04).

### Established Patterns
- Checklist step 2 curated import: the queue module imports only what the queue
  flow needs; no `src/backend/sidecar/` file imports real `electron`.
- Checklist step 3: a newly-required Electron API gets real behavior OR a **logged**
  no-op (D-04's unsupported-op boundary, D-05's disabled auto-resume — both logged).
- Invariant B: any queue-adjacent channel NOT ported keeps rejecting non-fatally;
  adding handlers must not turn a warning into a crash.

### Integration Points
- `downloadQueueFlowRegistration.ts` ↔ `handlers.ts` (registration site, D-02).
- `install`/`updateGame` ↔ `addToQueue()` ↔ `downloadqueue.ts` (D-01).
- `sendProgressUpdate` (`utils.ts:1356`) ↔ (optional sidecar coalescer) ↔
  `frontend_message` relay ↔ renderer progress bar (D-03).
- The five queue channels ↔ `downloadqueue.ts` queue-op functions ↔ depot
  cancel/abort (D-04).
- `initQueue`'s `isStartup` auto-resume ↔ **suppressed** under the sidecar (D-05).

</code_context>

<specifics>
## Specific Ideas

- **The queue-management channels are hollow without D-01.** The whole reason to
  re-route install through `addToQueue` is that pause/resume/cancel/
  `getDMQueueInformation` need a populated queue to act on. Do not ship the
  channels against the Phase 30 bypass.
- **Reuse Electron's progress cadence — do not invent one.** The "real volume"
  question is likely already answered by the backend's interval-based emit; the
  sidecar's job is to *not re-flood*, not to re-throttle. Measure before adding a
  coalescer (D-03).
- **Suppress boot auto-resume, preserve pre-`initQueue` cancelability.** D-05's
  gate is `initQueue`'s `isStartup` path and `main.ts:579`'s `initQueue(true)` — do
  not replicate that call under the sidecar, but keep the queue head cancelable as
  `downloadqueue.test.ts` documents.
- **Zero Rust changes on the push side is the expectation, not a hope.** If
  `progressUpdate` needs `src-tauri` work, something diverged from the three prior
  push riders — stop and ask why (Phase 29 `storeChanged` precedent).
- **The sign-off claim is doubly-gated.** G-30-01 (QR login) and G-30-02
  (install-hang) both block any live queue run. The deferred-UAT item must name
  both so no later reader reads "wired" as "live-exercised" (D-06).
- **Log-don't-silently-degrade for any unsupported queue op** (D-04) — a logged
  no-op is a decision; a silent one is a bug (checklist step 3).

</specifics>

<deferred>
## Deferred Ideas

- **Boot-time auto-resume of interrupted installs** (`resumeInterruptedSteamInstall`
  / `initQueue(isStartup=true)`) — D-05. Natural home: whichever phase fixes
  G-30-02 (install-hang, parked to Phase 33) so a resumed install can actually
  complete without hanging.
- **Fixing G-30-02 (install-hang) and G-30-01 (Tauri QR login unresponsive)** —
  D-06; pre-existing blockers, not this slice's to fix. G-30-02 is parked to
  Phase 33.
- **CrossOver bottle & macOS bridge install branches under Tauri** — Phase 30
  D-07, unchanged; no phase owns these before the Phase 35 cutover.
- **Live cross-build queue/download sync** — the Electron↔Tauri divergence family
  (Phase 30 D-03, Phase 31 D-02); Phase 35 cutover.

### Reviewed Todos (not folded)
`todo.match-phase 32` surfaced 4 hits; none are folded — the top one is an
Electron-side bug this phase deliberately routes *around* (D-05), the rest are
keyword false-positives:
- *Startup download-resume silently auto-opens Steam-in-CrossOver for bottle games*
  (score 0.6) — the exact landmine motivating **D-05**. It is an Electron-side
  startup-resume + bottle-branch bug; this phase avoids it by suppressing
  auto-resume, and the bottle branch is out of scope (D-07). Not a fix target here.
- *Steam bottle setup offers GPTK/Wine engines that produce a broken bottle*
  (0.2) — matched on "frontend"; bottle-branch bug, out of scope (D-07).
- *Runtime `getProductInfo` appinfo dump to lock the osarch parser* (0.2) —
  matched on "phase"; unrelated Steam PICS parser concern.

</deferred>

---

*Phase: 32-tauri-ipc-re-plumb-slice-3-downloads-and-queue*
*Context gathered: 2026-07-23*
