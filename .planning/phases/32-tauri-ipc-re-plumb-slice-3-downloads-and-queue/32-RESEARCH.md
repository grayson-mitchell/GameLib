# Phase 32: Tauri IPC re-plumb slice 3 — downloads and queue - Research

**Researched:** 2026-07-23
**Domain:** Electron→Tauri sidecar IPC re-plumb (mechanical port), DownloadManager/queue cluster
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Queue integration boundary**

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

**Module layout & import scope**

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

**progressUpdate throughput (the headline)**

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

**Queue-channel semantics**

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

**Startup download-resume**

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

**Sign-off**

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

### Deferred Ideas (OUT OF SCOPE)

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

Also explicitly out of scope per the Phase Boundary in 32-CONTEXT.md: any
`src-tauri` change on the push side (zero Rust changes expected — D-03); any
change to Electron build behavior (`npm start`/`npm run tauri:dev` both must
work); Windows/Linux Tauri packaging, signing, notarization.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-32-01 | `downloadqueue.ts` ported onto the sidecar; `install`/`updateGame` enqueue via `addToQueue()`, retiring the Phase 30 D-05a direct bypass | Full `downloadqueue.ts`/`ipc_handler.ts`/`installFlowRegistration.ts` read; confirmed `install`'s real contract is `Promise<void>` (resolves once queued, not once installed) — see Summary + Pitfall 3 + Code Examples |
| REQ-32-02 | New curated `downloadQueueFlowRegistration.ts` (fourth module) registered from `handlers.ts`; `downloadqueue.ts` imported unchanged/runner-generic; no `electron` import under `sidecar/` | Confirmed `handlers.ts`'s registration order and the first-import-order pattern (`installFlowRegistration.ts` docstring); see Architecture Patterns Pattern 3 |
| REQ-32-03 | Byte/percent `progressUpdate` pushed as the fourth rider on the generic `frontend_message` relay; zero `src-tauri` changes; reuse Electron's existing cadence; sidecar coalescer only if measurement shows a gap | Read `depot.ts`'s `emitProgress`/heartbeat (already throttles 500ms/1%/1000ms at the source) and `src-tauri/src/main.rs`'s channel-name-generic relay — headline finding in Summary, no coalescer needed |
| REQ-32-04 | Five queue-management channels map to real `downloadqueue.ts` functions; pause/cancel confirmed against depot abort support; unsupported ops become logged no-ops | Traced `pauseCurrentDownload`→`stopCurrentDownload`→`callAbortController`→depot `AbortSignal`; confirmed no dedicated pause primitive exists, only cancel/abort + Phase 23 reconciliation on resume — see Summary + Pitfall 5 |
| REQ-32-05 | No boot-time `initQueue(isStartup=true)` auto-resume under the sidecar; pre-initQueue cancelability preserved; disablement logged | Read `main.ts:568-581`'s boot call and `downloadqueue.test.ts`'s pre-initQueue cancelability contract — see Pitfall 6 |
| REQ-32-06 | Sign-off is unit tests only; one deferred-UAT item names G-30-01 + G-30-02 | Validation Architecture section maps each REQ to a concrete Jest command; doc-only items flagged accordingly |
| REQ-32-07 | `32-PORTED-CHANNELS.md` declares all ported channels (five queue channels + `progressUpdate` + the `install`/`updateGame` re-route) and any D-04/D-05 logged-no-op boundaries; SEAM §3→§1 move | Discovered `changedDMQueueInformation` as an additional, undeclared-by-CONTEXT push channel the same port makes real — see Summary + Pitfall 4; read 30-/31-PORTED-CHANNELS.md for the exact table shape to mirror |
| REQ-32-08 | Additive/reversible invariant: `npm start` + `npm run tauri:dev` both work; zero `window.api.*` call-site changes; SEAM Invariants A/B preserved; bottle/bridge branches stay unported and non-fatal | Read SEAM.md's Invariants A/B and Accepted Constraints D-07; no code changes to `electronStub.ts`'s existing non-fatal-rejection behavior are needed for `invoke`-kind channels — the `send`-kind risk (Pitfall 1) is the one place this invariant needs active protection this phase |

</phase_requirements>

## Summary

This phase ports `src/backend/downloadmanager/downloadqueue.ts` onto the Tauri sidecar,
re-routes `install`/`updateGame` through `addToQueue()` (retiring the Phase 30 direct-bypass),
and wires the five queue-management channels plus byte-level `progressUpdate`. All six of
CONTEXT.md's D-01..D-06 decisions are directly answerable from the existing codebase — no
speculation was required. The headline finding: **D-03's cadence question is already answered
at the source.** `src/backend/storeManagers/steam/depot.ts` (the real Steam depot downloader,
Phase 21/23) already throttles its `progressUpdate` emit to `PROGRESS_THROTTLE_MS = 500` /
`PROGRESS_THROTTLE_PERCENT = 1`, with a `PROGRESS_HEARTBEAT_MS = 1000` floor so the graph
never freezes. This throttle runs **before** `sendFrontendMessage` is ever called — the sidecar
port inherits it for free. **No sidecar-side coalescer is needed or justified.**

The second major finding, not explicit in CONTEXT.md: porting `downloadqueue.ts` makes the
sidecar push a **second** frontend message besides `progressUpdate` — `changedDMQueueInformation`
— which the Download Manager screen AND the Sidebar queue-count badge both subscribe to via the
already-generic `frontendListenerSlot('changedDMQueueInformation')`. Both channels ride the
identical zero-Rust-changes relay, so this doesn't change D-03's "zero Rust" conclusion, but
`32-PORTED-CHANNELS.md` must declare `changedDMQueueInformation` explicitly or the Download
Manager screen will render its initial `getDMQueueInformation()` snapshot once and then never
update again.

The third finding sharpens D-01: the real Electron `install`/`updateGame` IPC contract
(`AsyncIPCFunctions.install: (args) => Promise<void>`) resolves as soon as the element is
**queued**, not when the install finishes — `addToQueue()` returns after pushing onto the
persisted queue and kicking off `void initQueue()` unawaited. Phase 30's direct-bypass
(`installFlowRegistration.ts`) currently does the opposite: it `await`s the full install and
resolves `{status: result.status}}`, a shape the typed `AsyncIPCFunctions` contract doesn't even
declare. No frontend call site inspects the resolved value (all either `void` it or
`return` it unused — `frontend/helpers/library.ts:88`, `InstallGameModal.ts:33`,
`DownloadManagerItem/index.tsx:148`) — the UI is driven entirely by the status/progress/queue
**pushes**, not the invoke's resolution. The re-route must replace, not wrap, the bypass's
manual `sendGameStatusUpdate` + try/catch/finally logic — `downloadmanager/utils.ts`'s
`installQueueElement`/`updateQueueElement` already reproduce that exact logic (queued→installing
pushes, deferredToSetup/wasAborted/hadError 'done' suppression) — duplicating it after the
re-route is dead code, not a bug, but it is waste the planner should remove.

D-04 resolves cleanly: **the Steam depot downloader has no dedicated pause primitive — only
cancel/abort exists** (`AbortSignal`, `callAbortController`). `pauseCurrentDownload()` in
`downloadqueue.ts` calls the same `stopCurrentDownload()` → `callAbortController(appName)` path
as cancel; the only difference is `queueState` is set to `'paused'` instead of the element being
removed from the queue. "Resume" (`resumeCurrentDownload()` → `initQueue()`) re-invokes
`SteamGame.install()` from scratch — but Phase 23's `reconcilePartialState`
(REQ-23-04, sha1-gated) makes that restart cheap: already-good files are skipped, not
re-downloaded. Net effect: pause/resume for Steam is real (not a no-op) but is implemented as
**abort-then-reconciled-restart**, not a true in-flight suspend. This is worth declaring
precisely in `32-PORTED-CHANNELS.md` rather than leaving it implied.

**Primary recommendation:** Port `downloadqueue.ts` unchanged/runner-generic. Register the five
queue channels split by transport kind — `getDMQueueInformation` is `ipcMain.handle` (invoke);
`removeFromDMQueue`/`pauseCurrentDownload`/`resumeCurrentDownload`/`cancelDownload` are
`ipcMain.on` (send/listener) — mirroring Electron's real `addListener` shape exactly. This
transport-kind split is the single highest-risk implementation detail: a `send`-kind channel
registered incorrectly (or left unregistered) produces **zero error signal anywhere** — no
`UNPORTED_CHANNEL_MARKER`, no console warning, no test failure from "no throw" — the exact
"invisible failure" class Phase 31's Pitfall 2 (`setSetting`) already hit and documented. Do not
rely on "the test doesn't throw" as proof of wiring; assert the underlying mock was called
(Phase 31's `settingsFlows.test.ts` pattern, quoted below).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Queue persistence (`queue`/`finished` arrays) | API/Backend (Node sidecar) | Database/Storage (electron-store JSON on disk) | `downloadqueue.ts` owns queue state; persisted via the already-declared `downloadManager` store (Phase 29 D-15) — Rust is not the database (SEAM D-01, LOCKED) |
| `install`/`updateGame` enqueue | API/Backend | — | `addToQueue()` is pure Node logic; no Rust or renderer involvement beyond the IPC call itself |
| Depot chunk download + progress throttle | API/Backend | — | `depot.ts`'s `emitProgress`/heartbeat runs entirely in the Node sidecar; already coarse-grained before any IPC boundary |
| `progressUpdate`/`changedDMQueueInformation` push | API/Backend → Browser/Client | Frontend Server (Rust relay, pass-through only) | Rust's `frontend_message` relay is a dumb pipe (channel-name-generic); zero business logic in Rust for this phase |
| Queue-op semantics (pause/resume/cancel) | API/Backend | — | All five ops resolve inside `downloadqueue.ts`/`depot.ts`'s `AbortSignal`; no client-side state machine needed beyond rendering what the queue pushes |
| Frontend queue rendering | Browser/Client | — | `DownloadManager/index.tsx`, `Sidebar/index.tsx`, `DownloadManagerItem/index.tsx` are pure consumers of the two push channels + the one invoke read |

## Standard Stack

No new packages this phase — pure re-plumb of existing Electron backend code onto the existing
sidecar transport (`electronStub.ts`/`sidecarRpc.ts`/`src-tauri/src/main.rs`). Package
Legitimacy Audit is not applicable (no `npm install` required).

## Architecture Patterns

### System Architecture Diagram

```
Frontend (renderer)                Sidecar (Node, headless)              Rust shell (Tauri)
────────────────────                ─────────────────────────             ───────────────────

window.api.install(params) ──invoke──▶ ipcMain.handle('install')
                                          │
                                          ▼
                                     addToQueue(element)            (NEW this phase — replaces
                                          │                          the Phase 30 direct bypass)
                                          │  sendGameStatusUpdate('queued')
                                          │  (idle?) void initQueue()
                                          ▼
                                     initQueue() while-loop
                                          │
                                          ▼
                                     installQueueElement(params)
                                          │  sendGameStatusUpdate('installing')
                                          ▼
                                     SteamGame.install()
                                          │
                                          ▼
                                     downloadSteamDepots() (depot.ts)
                                          │
                                          │  emitProgress(force) ── THROTTLED at source
                                          │  (500ms / 1% delta, 1000ms heartbeat floor)
                                          ▼
                                     sendFrontendMessage('progressUpdate', payload)
                                          │
                                          ▼
                              electronStub fakeWebContents.send(channel, ...)
                                          │
                                          ▼
                              pushFrontendMessage(channel, ...args)  ──stdout──▶ Rust reads
                                                                                 SidecarNotification
                                                                                 line, re-emits as
                                                                                 the generic
                                                                                 `frontend_message`
                                                                                 Tauri event
                                                                                        │
window.api.onProgressUpdate(cb) ◀────────────────────────────────────────────────────┘
window.api.handleDMQueueInformation(cb) ◀── same relay, channel='changedDMQueueInformation'

window.api.pauseCurrentDownload() ──send──▶ ipcMain.on('pauseCurrentDownload')
                                                │
                                                ▼
                                          pauseCurrentDownload() → stopCurrentDownload()
                                                │  callAbortController(appName)
                                                ▼
                                          depot.ts's AbortSignal → chunk loop throws
                                          AbortSignal-derived error → outcome.status='cancelled'
                                          (there is no lower-level "suspend" — abort IS the
                                          pause mechanism; resume re-enters install() and Phase
                                          23's reconcilePartialState skips already-good files)
```

### Recommended Project Structure

```
src/backend/sidecar/
├── downloadQueueFlowRegistration.ts   # NEW — the fourth curated flow module (D-02)
│   ├── registerDownloadQueueFlows()   #   called once from handlers.ts
│   ├── ipcMain.handle('getDMQueueInformation', getQueueInformation)
│   ├── ipcMain.on('removeFromDMQueue', ...)      # send-kind — NOT .handle
│   ├── ipcMain.on('pauseCurrentDownload', ...)   # send-kind — NOT .handle
│   ├── ipcMain.on('resumeCurrentDownload', ...)  # send-kind — NOT .handle
│   └── ipcMain.on('cancelDownload', ...)         # send-kind — NOT .handle
├── installFlowRegistration.ts         # MODIFIED — install/updateGame re-routed to addToQueue()
│   └── (D-01 discretion: re-route logic can live here OR in the new module — both
│        already `import '../storeManagers'` first, so there is no new import-order risk
│        either way; keeping it here minimizes the diff since the handler already exists)
└── handlers.ts                        # MODIFIED — adds registerDownloadQueueFlows() call
```

### Pattern 1: `send`-kind channel registration (the D-02/D-04 wiring risk)

**What:** Four of the five queue channels are fire-and-forget in real Electron
(`addListener`/`ipcMain.on`), not request/response (`addHandler`/`ipcMain.handle`). Only
`getDMQueueInformation` is request/response.
**When to use:** Any port of a channel whose Electron-side registration is `addListener`
(check `src/backend/downloadmanager/ipc_handler.ts` or the equivalent cluster file — the
`AsyncIPCFunctions`/`SyncIPCFunctions` split in `src/common/types/ipc.ts` tells you which:
a `void`-returning method in `SyncIPCFunctions` is `send`-kind).
**Example:**
```typescript
// Source: src/backend/downloadmanager/ipc_handler.ts:64-70 (real Electron registration
// this port must match in transport KIND, not just channel name)
addListener('removeFromDMQueue', (e, appName) => removeFromQueue(appName))
addListener('resumeCurrentDownload', () => resumeCurrentDownload())
addListener('pauseCurrentDownload', () => pauseCurrentDownload())
addListener('cancelDownload', (e, removeDownloaded) =>
  cancelCurrentDownload({ removeDownloaded })
)
addHandler('getDMQueueInformation', getQueueInformation)  // the ONE invoke-kind channel
```
```typescript
// Sidecar equivalent — mirrors settingsFlowRegistration.ts's setSetting pattern
// (Phase 31, Pitfall 2's fix) exactly:
import { ipcMain } from './electronStub'
ipcMain.on('removeFromDMQueue', (_event: unknown, ...args: unknown[]) => {
  removeFromQueue(args[0] as string)
})
ipcMain.on('pauseCurrentDownload', () => {
  pauseCurrentDownload()
})
ipcMain.on('resumeCurrentDownload', () => {
  resumeCurrentDownload()
})
ipcMain.on('cancelDownload', (_event: unknown, ...args: unknown[]) => {
  cancelCurrentDownload({ removeDownloaded: args[0] as boolean })
})
ipcMain.handle('getDMQueueInformation', async () => getQueueInformation())
```

### Pattern 2: Test shape for a `send`-kind channel (mandatory — mirrors 31-RESEARCH Pitfall 2)

**What:** A `send`-kind channel has no response frame (`dispatchSend` in `sidecarRpc.ts` just
calls registered listeners and returns — nothing is written back to the RPC stream). A test
that only checks "no error thrown" passes even for a channel that was never registered at all.
**When to use:** Every one of the four `send`-kind queue channels needs its own test that
asserts the **underlying real function was called with the right arguments** — not a response
assertion, because there is no response.
**Example:**
```typescript
// Source: src/backend/sidecar/__tests__/settingsFlows.test.ts:227-236,360-372
// (Phase 31's proven pattern for testing a send-kind channel through the real
// stdio JSON-RPC loop)
function writeSend(
  input: PassThrough,
  id: string,
  channel: string,
  args: unknown[]
): void {
  input.write(`${JSON.stringify({ id, kind: 'send', channel, args })}\n`)
}

it('pauseCurrentDownload (send) reaches the real pauseCurrentDownload()', async () => {
  writeSend(input, 'pause-1', 'pauseCurrentDownload', [])
  await flush()
  // Assert against the REAL side effect (queueState flips to 'paused', or the
  // mocked depot AbortSignal fired) — never a response-frame assertion, there is
  // no response frame for a send-kind channel.
})
```

### Pattern 3: Curated-import, first-import-order (D-02, D-08 — unchanged from prior slices)

**What:** Every new sidecar flow module must `import '../storeManagers'` as its first
non-type import, before any direct `steam/games`/`downloadmanager` import, to avoid the
`SteamLibraryManager is not a constructor` re-entrant bundle crash `installFlowRegistration.ts`
and `steamFlowRegistration.ts` both already document.
**When to use:** Any new `<domain>FlowRegistration.ts` file.
**Example:**
```typescript
// Source: src/backend/sidecar/installFlowRegistration.ts:88-104 (the load-bearing
// first-import pattern every curated module repeats)
import '../storeManagers'
import SteamGame from '../storeManagers/steam/games'
```

### Anti-Patterns to Avoid

- **Registering a `send`-kind channel with `ipcMain.handle`:** compiles fine, produces zero
  runtime error, and the real write/action never happens — exactly Phase 31's Pitfall 2 for
  `setSetting`. The four listener-kind queue channels are equally exposed to this mistake.
- **Awaiting `addToQueue()`'s return value for a `{status}` the frontend then branches on:**
  the real contract is `Promise<void>` — `addToQueue()` resolves once the element is queued,
  not once the install finishes. Reproducing Phase 30's bypass shape (`Promise<{status}>`)
  after the re-route is not merely redundant, it's a behavioral divergence from real Electron.
- **Declaring only `progressUpdate` in `32-PORTED-CHANNELS.md`:** porting `downloadqueue.ts`
  makes `changedDMQueueInformation` real too (`addToQueue`/`removeFromQueue`/
  `pauseCurrentDownload`/`initQueue` all call `sendFrontendMessage('changedDMQueueInformation',
  ...)`). Missing this from the declared list leaves an undocumented channel wired but
  unaccounted-for — the exact "declared, not discovered" boundary REQ-32-07 exists to prevent.
- **Assuming `pauseCurrentDownload`/`resumeCurrentDownload` are true low-level suspend/resume:**
  they are abort-then-reconciled-restart. Documenting them as "real" without this nuance invites
  a future reader to assume in-flight TCP/CM session suspension exists — it does not.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Progress throttling/coalescing | A sidecar-side trailing coalescer | Nothing — `depot.ts`'s existing `emitProgress`/heartbeat (500ms/1%/1000ms) already throttles at the source, before `sendFrontendMessage` is ever called | Measured: the emit already caps at ~2/sec. A second coalescer on top would double-throttle and make Tauri lag Electron (the exact outcome D-03 explicitly rejects) |
| Queue completion/status transitions on re-route | Manual `sendGameStatusUpdate` calls duplicating `installQueueElement`'s logic | `downloadmanager/utils.ts`'s `installQueueElement`/`updateQueueElement`, reached automatically once `addToQueue()` → `initQueue()` runs | These functions already implement the exact queued→installing→done transitions (with the Steam ACF-poller-suppression and deferredToSetup/wasAborted/hadError exceptions) that Phase 30's bypass had to hand-reproduce because it bypassed the queue entirely |
| Pause/resume state machine | A new in-sidecar pause/resume tracker | The existing `queueState`/`currentElement`/`AbortSignal` trio in `downloadqueue.ts`, imported unchanged | Runner-generic, already tested (`downloadqueue.test.ts`), and the only implementation that correctly interacts with Phase 23's `reconcilePartialState` on resume |

**Key insight:** this phase's entire job is subtractive, not additive — remove the Phase 30
bypass's hand-rolled status-transition logic and let the real, already-correct
`downloadqueue.ts`/`downloadmanager/utils.ts` do the work it was always designed to do. Writing
new coalescing/state-tracking code here is a signal something was measured wrong.

## Common Pitfalls

### Pitfall 1: Believing a `send`-kind channel's silence means "not ported" (same class as G-30-01)

**What goes wrong:** An unregistered `invoke` channel is loud — it rejects with
`UNPORTED_CHANNEL_MARKER`, visible in `bootErrorSurface.ts` and in any test checking for
marker-absence. An unregistered/miswired `send` channel is **completely silent**:
`dispatchSend()` in `sidecarRpc.ts` does `listenerRegistry.get(request.channel) ?? []` and loops
zero times if nothing is registered — no error, no log line, no test failure from "it didn't
throw."
**Why it happens:** `removeFromDMQueue`/`pauseCurrentDownload`/`resumeCurrentDownload`/
`cancelDownload` all look, at the call site, identical to any invoke channel — the frontend
calls `window.api.pauseCurrentDownload()` the same way it calls `window.api.install()`.
**How to avoid:** Register with `ipcMain.on`, not `.handle`. Write a test per channel that
asserts the underlying real function (`pauseCurrentDownload`, `removeFromQueue`, etc.) was
actually invoked — never a response-frame assertion (there is no response frame).
**Warning signs:** A test that sends the channel and asserts "no error was thrown" — this passes
even with zero registration. Exactly Phase 31's documented Pitfall 2 for `setSetting`.

### Pitfall 2: Assuming `progressUpdate` needs a new coalescer without checking `depot.ts` first

**What goes wrong:** Building a sidecar-side trailing coalescer "to be safe" before confirming
whether one is needed, adding latency/complexity and making Tauri's progress bar noticeably
laggier than Electron's for no measured reason.
**Why it happens:** The natural instinct on hearing "progress-notification-heavy slice" is to
assume the IPC layer needs new throttling.
**How to avoid:** `depot.ts:811-818` already declares `PROGRESS_THROTTLE_MS = 500`,
`PROGRESS_THROTTLE_PERCENT = 1`, `PROGRESS_HEARTBEAT_MS = 1000`, and `emitProgress()` (L1656)
enforces them BEFORE calling `sendFrontendMessage`. This throttle is identical on both Electron
and Tauri builds — it lives in shared backend code, not in `ipc.ts`/`electronStub.ts`. No new
gate is needed.
**Warning signs:** A plan task titled "add progress coalescer" without first citing a measured
gap (e.g., an IPC frame count/sec that exceeds Electron's own webContents.send rate).

### Pitfall 3: Re-routing `install` and keeping the Phase 30 bypass's `Promise<{status}>` return shape

**What goes wrong:** The re-routed handler awaits `addToQueue()` and then constructs a
synthetic `{status}` to return, either by guessing or by adding a new completion-tracking
mechanism — over-engineering a contract the real channel (`Promise<void>`) never had.
**Why it happens:** The Phase 30 bypass trained the assumption that `install` resolves with a
useful status. It only did so because the bypass skipped the queue and called
`SteamGame.install()` directly.
**How to avoid:** Match `common/types/ipc.ts`'s `AsyncIPCFunctions.install: (args) =>
Promise<void>` exactly — resolve once `addToQueue()` returns (i.e. once queued), same as real
Electron's `ipc_handler.ts`. Nothing in the frontend inspects the resolved value.
**Warning signs:** A handler body with a `try { const result = await addToQueue(...); return
{status: ...} }` shape — `addToQueue` has no return value to build `{status}` from in the first
place.

### Pitfall 4: Missing `changedDMQueueInformation` from the declared-channel list

**What goes wrong:** `progressUpdate` is documented and tested; `changedDMQueueInformation` (a
second push channel the same ported module emits) is not, so it's real but undeclared —
violating REQ-32-07's "declared, not discovered" requirement, and risking an untested code path
(the Download Manager screen and Sidebar badge both depend on it to reflect queue-add/-remove/
-pause events after their initial mount).
**Why it happens:** CONTEXT.md's own framing calls `progressUpdate` "the fourth rider" — reading
that literally suggests only one new push channel this phase.
**How to avoid:** Grep `sendFrontendMessage` call sites inside `downloadqueue.ts` before writing
`32-PORTED-CHANNELS.md` — there are two distinct channel names, not one.
**Warning signs:** A VALIDATION.md or PORTED-CHANNELS.md that only mentions `progressUpdate`.

### Pitfall 5: Treating `pauseCurrentDownload`/`resumeCurrentDownload` as true in-flight suspend

**What goes wrong:** Documenting/testing pause as if it keeps the depot connection alive and
resume as if it continues the exact in-flight chunk — neither is true. Pause aborts
(`callAbortController`); resume restarts `SteamGame.install()` from the top, relying on Phase
23's `reconcilePartialState` to skip already-good files.
**Why it happens:** The word "pause" implies suspend-in-place; the depot layer's actual
mechanism is cancel-and-reconcile.
**How to avoid:** State the real mechanism explicitly in `32-PORTED-CHANNELS.md` (D-04's
"log-don't-silently-degrade" instruction) — this is not a no-op, but it is not textbook pause
either. Do not claim it "pauses the download" without the reconciliation caveat.
**Warning signs:** A test asserting the download resumes from the exact byte offset without
re-verifying any already-downloaded file — that's not what happens; files are re-verified via
sha1, not blindly trusted.

### Pitfall 6: Breaking the pre-`initQueue()` cancelability contract while suppressing D-05's auto-resume

**What goes wrong:** "Guarding off the isStartup path" gets implemented by never calling
`initQueue()` at all under the sidecar (not even with `isStartup=false`/no boot call at all,
which is correct) but ALSO by delaying or gating the module-level `currentElement =
getFirstQueueElement()` seed — which would silently reintroduce the exact D-UAT-05 bug
`downloadqueue.test.ts` exists to prevent (cancel/pause/stop no-ops for a persisted queue head
until some later call populates `currentElement`).
**Why it happens:** The module-scope seed and the `initQueue(true)` boot call look related but
are independent code paths — the seed happens automatically at import time (module top-level
`let currentElement: DMQueueElement | null = getFirstQueueElement()`, `downloadqueue.ts:49`),
regardless of whether `initQueue` is ever called.
**How to avoid:** D-05's fix is purely "the sidecar's boot sequence never calls
`initQueue(true)`" (i.e., simply omit the `main.ts:573-580`-equivalent `setTimeout(() =>
initQueue(true), 5000)` from the sidecar's bootstrap). Importing `downloadqueue.ts` at all
already gives pre-initQueue cancelability for free — do not add any code to suppress or delay it.
**Warning signs:** Any sidecar bootstrap change that wraps or defers the `downloadqueue.ts`
import itself, rather than simply never calling `initQueue(true)`.

## Code Examples

### The exact five-channel Electron registration this port must mirror by transport kind

```typescript
// Source: src/backend/downloadmanager/ipc_handler.ts (verified 2026-07-23, full file)
import { addHandler, addListener } from '../ipc'
import {
  addToQueue,
  cancelCurrentDownload,
  getQueueInformation,
  pauseCurrentDownload,
  removeFromQueue,
  resumeCurrentDownload
} from './downloadqueue'

addHandler('install', async (_e, args) => {
  const dmQueueElement /* : DMQueueElement */ = {
    params: args,
    type: 'install',
    addToQueueTime: Date.now(),
    endTime: 0,
    startTime: 0
  }
  await addToQueue(dmQueueElement)
  // ... DLC fan-out loop for legendary, omitted (not steam-relevant)
})

addHandler('updateGame', async (_e, args) => {
  const dmQueueElement = {
    params: { ...args, path: args.gameInfo.install.install_path, platformToInstall: args.gameInfo.install.platform },
    type: 'update',
    addToQueueTime: Date.now(),
    endTime: 0,
    startTime: 0
  }
  await addToQueue(dmQueueElement)
})

addListener('removeFromDMQueue', (e, appName) => removeFromQueue(appName))
addListener('resumeCurrentDownload', () => resumeCurrentDownload())
addListener('pauseCurrentDownload', () => pauseCurrentDownload())
addListener('cancelDownload', (e, removeDownloaded) =>
  cancelCurrentDownload({ removeDownloaded })
)
addHandler('getDMQueueInformation', getQueueInformation)
```

### The already-throttled progress emit (D-03 — no new throttle needed)

```typescript
// Source: src/backend/storeManagers/steam/depot.ts:811-818, 1656-1667, 1698-1719
const PROGRESS_THROTTLE_MS = 500
const PROGRESS_THROTTLE_PERCENT = 1
const PROGRESS_HEARTBEAT_MS = 1000 // forces an emit at least once/sec

const emitProgress = (force: boolean) => {
  const percentDelta = totalBytes > 0 ? ((doneBytes - lastEmitBytes) / totalBytes) * 100 : 0
  const timeDelta = Date.now() - lastEmitTime
  // THROTTLE (~1%/500ms), never per-chunk — an IPC flood on a fast LAN (T-21-12).
  if (!force && percentDelta < PROGRESS_THROTTLE_PERCENT && timeDelta < PROGRESS_THROTTLE_MS) {
    return
  }
  // ... rolling rate calc ...
  sendFrontendMessage('progressUpdate', {
    appName: plan.appId,
    runner: 'steam',
    status: 'installing',
    progress: { percent, bytes, downSpeed, diskSpeed, eta }
  })
}
// A setInterval heartbeat calls emitProgress(true) every PROGRESS_HEARTBEAT_MS regardless
// of chunk completion, so the graph advances even when chunk completions bunch up.
```

### The queue's own push (the undeclared "fifth" channel — D-03/REQ-32-07)

```typescript
// Source: src/backend/downloadmanager/downloadqueue.ts:141-145, 157, 264, 318, 366-370
// Fired from initQueue (deferred-Steam-item surface), initQueue (running), addToQueue,
// removeFromQueue, and pauseCurrentDownload — five call sites, ALL inside the module
// this phase ports. Must be declared in 32-PORTED-CHANNELS.md alongside progressUpdate.
sendFrontendMessage('changedDMQueueInformation', queuedElements, queueState)
```

### The completion-semantics divergence to fix, not preserve (D-01)

```typescript
// Real Electron contract (src/common/types/ipc.ts:394):
install: (args: InstallParams) => Promise<void>

// Real Electron behavior (ipc_handler.ts): resolves once addToQueue() returns —
// i.e. once QUEUED, not once installed.

// Phase 30's bypass (installFlowRegistration.ts, TO BE REPLACED by the re-route):
ipcMain.handle('install', async (...): Promise<{ status: InstallResult['status'] }> => {
  // awaits the FULL install, returns a status shape the typed contract never declares
})

// No frontend call site inspects the resolved value:
// src/frontend/helpers/library.ts:88 —  return window.api.install({...})
// src/frontend/state/InstallGameModal.ts:33 — void window.api.install({...})
```

## State of the Art

| Old Approach (Phase 30, this phase's inheritance) | New Approach (this phase) | When Changed | Impact |
|---|---|---|---|
| `install`/`updateGame` direct `SteamGame` bypass, `downloadqueue.ts` unported | `install`/`updateGame` route through `addToQueue()`, real queue | This phase (D-01) | Pause/resume/cancel/`getDMQueueInformation` gain a real target; `install`'s resolve semantics correct themselves to match `Promise<void>` |
| Only coarse status (`gameStatusUpdate`) pushed | Byte/percent `progressUpdate` + `changedDMQueueInformation` both pushed | This phase (D-03) | Download Manager progress bar and queue list render live under Tauri, matching Electron |
| Queue channels reject with `UNPORTED_CHANNEL_MARKER` | Queue channels registered, real (4 of 5 as `ipcMain.on`, 1 as `.handle`) | This phase (D-02/D-04) | First phase where a `send`-kind channel cluster (not just one, like `setSetting`) is ported in bulk — the invisible-failure risk is proportionally higher |

**Deprecated/outdated:** The Phase 30 D-05a "direct bypass" boundary is retired this phase —
`SEAM.md`'s own §"Accepted Constraints" entry for D-05a should be marked closed/superseded once
this phase ships (mirrors how D-05a itself documents "Phase 32 inherits this boundary").

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Claude's-discretion placement: the `addToQueue` re-route logic can live in either `installFlowRegistration.ts` or the new `downloadQueueFlowRegistration.ts` with equal safety | Recommended Project Structure | Low — CONTEXT.md explicitly leaves this as planner discretion; both files already satisfy the first-import-order rule |
| A2 | No frontend call site relies on `install`/`updateGame`'s resolved value beyond `Promise<void>` (verified across the 6 call sites found via grep; a 7th unexamined call site could theoretically exist) | Summary, Pitfall 3, Code Examples | Low-Medium — if an unfound call site does branch on a resolved status, removing the bypass's status return would silently break it. Planner should re-grep `window.api.install(` and `window.api.updateGame(` immediately before implementing, not trust this count as exhaustive |

**If this table is empty:** N/A — two low-risk assumptions logged above; both are cheap to
re-verify (a single grep) immediately before implementation.

## Open Questions

1. **Should the manual `sendGameStatusUpdate` calls in `installFlowRegistration.ts`'s current
   `install`/`updateGame` handlers be deleted entirely, or kept as a defensive duplicate?**
   - What we know: `installQueueElement`/`updateQueueElement` (reached once re-routed through
     `addToQueue`/`initQueue`) already send the identical 'queued'→'installing'→'done'
     transitions, including the Steam-specific ACF-poller suppression and the
     deferredToSetup/wasAborted/hadError exceptions.
   - What's unclear: whether leaving the bypass's manual pushes in place (now redundant, since
     both paths converge on the same string values) causes any observable double-push artifact
     in the UI (a flicker, or a harmless duplicate state assignment).
   - Recommendation: delete the duplicated pushes as part of the re-route (matches D-01's "truest
     to running the real backend code" framing) and add a regression test asserting each status
     string is pushed exactly once per install, not twice.

2. **Does `resumeCurrentDownload()`'s `initQueue()` call correctly target a Steam item that was
   `pauseCurrentDownload()`'d (not cancelled) — i.e. does `currentElement` still point at the
   right queue head after a pause?**
   - What we know: `pauseCurrentDownload()` calls `stopCurrentDownload()` (which aborts) but does
     NOT call `removeFromQueue` or null out `currentElement` — the element stays queued and
     `currentElement` stays set.
   - What's unclear: whether `initQueue()`'s `while (element)` loop, re-entered via
     `resumeCurrentDownload`, correctly re-processes the SAME element (not a stale reference) —
     `downloadqueue.test.ts`'s existing suite covers the `isStartup=true` deferred-Steam-item
     case for this exact concern but the plain user-pause/resume path (isStartup=false, the
     Resume button) may not have equivalent direct coverage.
   - Recommendation: planner should check whether `downloadqueue.test.ts` already covers "pause
     then resume via the button" as a same-session test; if not, this phase's D-06 unit-proof
     obligation should add one, since it's the most-clicked queue interaction in the UI.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (already configured project-wide) |
| Config file | `jest.config.js` / `package.json` `"test": "jest"` |
| Quick run command | `npx jest src/backend/sidecar/__tests__/downloadQueueFlows.test.ts` (new file, mirrors `settingsFlows.test.ts`) |
| Full suite command | `npm run test:ci` (`jest --runInBand --silent`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-32-01 | `install`/`updateGame` enqueue via `addToQueue()`, no direct `SteamGame` bypass | unit (real RPC loop, mocked `libraryManagerMap`) | `npx jest downloadQueueFlows.test.ts -t "install.*addToQueue"` | ❌ Wave 0 |
| REQ-32-02 | `downloadQueueFlowRegistration.ts` registers all 5 channels; no `electron` import anywhere under `sidecar/` | unit + source-gate (mirrors `electronUntouched.test.ts`'s by-construction gate) | `npx jest downloadQueueFlows.test.ts -t "registration"` | ❌ Wave 0 |
| REQ-32-03 | `progressUpdate` rides the generic relay at Electron's existing cadence; no new sidecar throttle added | unit (assert `emitProgress`'s existing throttle constants are unchanged; assert the push reaches `pushFrontendMessage` with the exact `depot.ts` payload shape) | `npx jest depot.test.ts -t "progress"` (existing) + new relay-reach assertion | ⚠️ Partial — `depot.test.ts` covers the throttle; the sidecar-relay-reach assertion is Wave 0 |
| REQ-32-04 | All 5 queue channels map to real `downloadqueue.ts` functions; pause/resume proven abort-then-reconcile, not silent | unit (per-channel, `send`-kind assertions per Pattern 2 above) | `npx jest downloadQueueFlows.test.ts -t "queue-op"` | ❌ Wave 0 |
| REQ-32-05 | Sidecar never calls `initQueue(true)`; pre-initQueue cancelability preserved | unit — reuse `downloadqueue.test.ts`'s existing "cancelable before initQueue() has ever run" test unmodified; add a sidecar-bootstrap-level assertion that no `isStartup=true` call exists | `npx jest downloadqueue.test.ts` (existing, must stay green) + new bootstrap assertion | ⚠️ Partial — core contract test exists; sidecar-boot-omission assertion is Wave 0 |
| REQ-32-06 | Full slice unit-proven; deferred-UAT item names G-30-01 + G-30-02 | manual-doc | N/A (documentation artifact: `32-HUMAN-UAT.md` or equivalent) | ❌ Wave 0 (doc, not test) |
| REQ-32-07 | `32-PORTED-CHANNELS.md` declares all channels including `changedDMQueueInformation`; SEAM §3→§1 move | manual-doc | N/A | ❌ Wave 0 (doc, not test) |
| REQ-32-08 | `npm start` and `npm run tauri:dev` both still work; unported channels stay non-fatal | smoke (manual per SEAM precedent — no automated dual-build test exists in this repo) | manual: run both, confirm boot | N/A — matches Phase 30/31's own precedent, not a new gap |

### Sampling Rate
- **Per task commit:** `npx jest src/backend/sidecar/__tests__/downloadQueueFlows.test.ts src/backend/downloadmanager/__tests__/downloadqueue.test.ts`
- **Per wave merge:** `npm run test:ci`
- **Phase gate:** Full suite green before `/gsd:verify-work 32`

### Wave 0 Gaps
- [ ] `src/backend/sidecar/__tests__/downloadQueueFlows.test.ts` — new file, mirrors
  `settingsFlows.test.ts`'s real-RPC-loop pattern; covers REQ-32-01/02/04/05
- [ ] A relay-reach assertion for `progressUpdate` inside the sidecar test harness (assert
  `pushFrontendMessage`/`writeLine` receives the `progressUpdate` frame with the depot's exact
  payload shape) — covers REQ-32-03
- [ ] `32-PORTED-CHANNELS.md` + `32-HUMAN-UAT.md` (or equivalent) — doc artifacts, not tests,
  covering REQ-32-06/07
- [ ] No new test-framework install needed — Jest is already fully configured

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | This phase touches no auth surface (Steam session is Phase 26/28's concern, unchanged here) |
| V3 Session Management | No | N/A |
| V4 Access Control | No | N/A |
| V5 Input Validation | Yes | `removeFromDMQueue(appName)`/`cancelDownload(removeDownloaded)` args arrive from the RPC frame as `unknown[]` — cast to `string`/`boolean` at the registration boundary; no new validation logic is needed beyond what `downloadqueue.ts`'s own `removeFromQueue`/`cancelCurrentDownload` already do (appName is looked up via `libraryManagerMap`, not interpolated into a shell/path operation directly at this layer — path-traversal containment is `depot.ts`'s `resolveContainedPath`'s job, already shipped in Phase 21, unmodified here) |
| V6 Cryptography | No | N/A — no secrets/tokens touched by this cluster |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A malformed/oversized `send` frame for a queue channel (e.g. a giant `removeDownloaded` payload) | Denial of Service | Already covered project-wide by `sidecarRpc.ts`'s `MAX_LINE_LENGTH` (10 MiB) frame cap and the `dispatchSend` try/catch-per-listener fail-soft wrapper (T-27-04) — no new mitigation needed, this phase inherits it |
| A crafted `appName` string reaching `removeFromQueue`/`cancelCurrentDownload` | Tampering | `libraryManagerMap[runner].getGame(appName)` throws/returns undefined for an unknown appName inside the existing (unmodified) `downloadqueue.ts` functions — no new surface introduced by this port |
| A queue op silently no-op'ing without signal (the `send`-kind invisibility risk, Pitfall 1) | Repudiation (user believes an action succeeded when the backend never received it) | Not a traditional security threat, but treated with equivalent rigor per D-04's "log-don't-silently-degrade" requirement — every unsupported/logged-no-op path must emit a `console.warn`, matching the `electronStub.ts` convention already established for `shell.showItemInFolder`/`clipboard.writeText` |

## Sources

### Primary (HIGH confidence — read directly this session)
- `src/backend/downloadmanager/downloadqueue.ts` (full file) — the module being ported
- `src/backend/downloadmanager/utils.ts` (full file) — `installQueueElement`/`updateQueueElement`
- `src/backend/downloadmanager/ipc_handler.ts` (full file) — the exact Electron registration shape
- `src/backend/storeManagers/steam/depot.ts` L760-880, L1620-1745 — the progress throttle/heartbeat
- `src/backend/storeManagers/steam/games.ts` L1121-1290 — `installDepotDownload`/`runNativeDepotDownload`, confirms cancel-then-reconcile resume mechanics
- `src/backend/sidecar/electronStub.ts` (full file) — `ipcMain.handle`/`.on` recorder shapes
- `src/backend/sidecar/sidecarRpc.ts` (full file) — `dispatchInvoke` vs `dispatchSend`, confirms the silent-failure asymmetry
- `src/backend/sidecar/handlers.ts` (full file) — registration order, confirms `downloadManager` store already registered
- `src/backend/sidecar/installFlowRegistration.ts` (full file) — the Phase 30 bypass to be replaced
- `src/backend/sidecar/storeRegistration.ts` L108, L190 + `src/common/types/storePolicy.ts` L131, L378 — confirms `downloadManager` store declaration already present (checklist step 4 satisfied)
- `src/backend/downloadmanager/electronStores.ts` — the D-15 store extraction
- `src/backend/main.ts` L568-581 — the `initQueue(true)` boot call D-05 must not replicate
- `src/backend/downloadmanager/__tests__/downloadqueue.test.ts` header + L154-330 — the pre-initQueue cancelability + auto-resume contract
- `src/backend/sidecar/__tests__/settingsFlows.test.ts` (full file) — the `send`-kind test pattern to mirror
- `src/backend/sidecar/__tests__/electronUntouched.test.ts` L1-60 — real-store safety convention
- `src/common/types/ipc.ts` L394-395, L549-570 — `install`'s real `Promise<void>` contract, `FrontendMessages` shape
- `src/preload/api/downloadmanager.ts`, `src/preload/api/library.ts` — confirms `changedDMQueueInformation`/`progressUpdate` are both generic `frontendListenerSlot`s already wired frontend-side
- `src/frontend/screens/DownloadManager/index.tsx`, `src/frontend/components/UI/Sidebar/index.tsx`, `src/frontend/state/InstallProgress.ts`, `src/frontend/helpers/library.ts` L60-99 — frontend consumers of the two push channels + the `install` invoke
- `src-tauri/src/main.rs` L13-14, L43-45, L490, L579 — confirms the `frontend_message` relay is channel-name-generic (zero Rust changes needed)
- `.planning/phases/27-tauri-shell-walking-skeleton/SEAM.md` §"Deferred", §"Accepted Constraints" (D-05a), §"Incremental-Port Checklist", §"Load-Bearing Invariants" — governing document, read in full
- `.planning/phases/30-.../30-PORTED-CHANNELS.md`, `.planning/phases/31-.../31-PORTED-CHANNELS.md`, `.planning/phases/31-.../31-RESEARCH.md` §Pitfall 2 — prior-slice precedent, directly quoted

### Secondary (MEDIUM confidence)
- None — every claim above was verified by direct file read this session (no WebSearch was needed; this is a pure in-repo mechanical-port research task with no external library surface)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: N/A — no new packages
- Architecture: HIGH — every code path (queue, depot throttle, transport-kind split, store
  registration, frontend consumers) was read directly, not inferred
- Pitfalls: HIGH — five of six pitfalls are drawn from an already-shipped precedent bug (Phase 31
  Pitfall 2 / setSetting) or a directly-read source contract mismatch (install's Promise<void>),
  not speculation

**Research date:** 2026-07-23
**Valid until:** Stable — this research describes an internal, already-written codebase, not an
external API; re-verify only if `downloadqueue.ts`, `depot.ts`, or the sidecar transport files
change before this phase is planned/executed.
