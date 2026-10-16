# Phase 32: Tauri IPC re-plumb slice 3 — downloads and queue - Pattern Map

**Mapped:** 2026-07-23
**Files analyzed:** 5 (3 new, 2 modified) + 2 doc artifacts
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/backend/sidecar/downloadQueueFlowRegistration.ts` (NEW) | controller (curated IPC flow module) | request-response + event-driven (push) | `src/backend/sidecar/settingsFlowRegistration.ts` (send+invoke mix, D-02 shape) and `src/backend/downloadmanager/ipc_handler.ts` (the exact transport-kind split to mirror) | exact (registration shape) |
| `src/backend/sidecar/installFlowRegistration.ts` (MODIFIED) | controller (curated IPC flow module) | request-response (re-route: direct-call → enqueue) | itself, pre-image (this phase edits it in place); parity source `src/backend/downloadmanager/ipc_handler.ts` `install`/`updateGame` handlers | exact |
| `src/backend/sidecar/handlers.ts` (MODIFIED) | controller (registration root) | — (composition root) | itself, pre-image — same file, one more call site alongside the existing four | exact |
| `src/backend/sidecar/__tests__/downloadQueueFlows.test.ts` (NEW) | test | request-response + event-driven (send-kind + relay-reach assertions) | `src/backend/sidecar/__tests__/settingsFlows.test.ts` (real-RPC-loop harness, send-kind test pattern) | exact |
| `src/backend/sidecar/electronStub.ts` (POSSIBLY MODIFIED) | utility (Electron shim) | request-response / logged no-op | itself, pre-image — `dialog.showMessageBox`'s safe-sentinel-logged-no-op precedent (Phase 31 CR-01) is the shape to reuse IF a new Electron API surfaces on the queue path (none expected — queue ops are pure Node, no new Electron API touched) | role-match (contingent) |
| `32-PORTED-CHANNELS.md` (NEW doc) | config/doc | — | `.planning/phases/31-.../31-PORTED-CHANNELS.md` (table shape, claim-scope note, "Deliberately NOT ported" section) | exact |
| `32-HUMAN-UAT.md` (NEW doc) | config/doc | — | Phase 30/31's deferred-UAT framing (D-06's "doubly-gated" instruction — no direct file analog found, compose from D-06's own text + G-30-01/G-30-02 references) | role-match |

**Files NOT modified** (confirmed no analog needed — ported unchanged / runner-generic per D-02):
- `src/backend/downloadmanager/downloadqueue.ts` — imported as-is, zero changes.
- `src/backend/downloadmanager/utils.ts` — imported as-is (`installQueueElement`/`updateQueueElement`), zero changes.
- `src/backend/storeManagers/steam/depot.ts` — the progress throttle lives here, unchanged (D-03 explicitly rejects a new sidecar throttle).
- `src-tauri/src/main.rs` — zero Rust changes expected (D-03); if touched, stop and ask why.

## Pattern Assignments

### `src/backend/sidecar/downloadQueueFlowRegistration.ts` (NEW — controller, request-response + push)

**Primary analog:** `src/backend/sidecar/settingsFlowRegistration.ts` (module shape, docstring convention, first-import ordering)
**Transport-kind analog:** `src/backend/downloadmanager/ipc_handler.ts` (which channels are `.on` vs `.handle` — copy this exactly, do not re-derive)

**Module docstring convention** (`settingsFlowRegistration.ts:1-44`) — every curated flow module opens with: what it registers, why each channel is here (not elsewhere), and what it deliberately does NOT register (with the Invariant B non-fatal-rejection cross-reference). Mirror this shape; name D-02's own rationale (queue stays runner-generic, `downloadqueue.ts` imported unchanged) instead of re-explaining it.

**Load-bearing first-import pattern** (`installFlowRegistration.ts:88-104`, identically documented in `settingsFlowRegistration.ts:50-64`):
```typescript
import { ipcMain } from './electronStub'
// Load-bearing FIRST import — force `storeManagers/index.ts` to be the
// INITIALIZATION ENTRY before any direct steam/* import below resolves.
// Entering through steam/* directly risks the re-entrant index.ts
// mid-evaluation crash ("SteamLibraryManager is not a constructor",
// esbuild-bundle-only, ts-jest's init order differs).
import '../storeManagers'
```
`downloadqueue.ts` itself already imports `backend/storeManagers` safely (see its own comment at `downloadqueue.ts:19-32` about the sync-`require` alias-resolution crash — that fix is a DIFFERENT, already-solved problem: dereference `libraryManagerMap` only inside function bodies, never at module top level). The new module's own first-import-order requirement is independent of that and must still be applied.

**Transport-kind split — the exact registration shape to mirror** (`ipc_handler.ts` full file, quoted in RESEARCH.md "Code Examples"):
```typescript
// Real Electron (src/backend/downloadmanager/ipc_handler.ts:64-70)
addListener('removeFromDMQueue', (e, appName) => removeFromQueue(appName))
addListener('resumeCurrentDownload', () => resumeCurrentDownload())
addListener('pauseCurrentDownload', () => pauseCurrentDownload())
addListener('cancelDownload', (e, removeDownloaded) =>
  cancelCurrentDownload({ removeDownloaded })
)
addHandler('getDMQueueInformation', getQueueInformation)  // the ONE invoke-kind channel
```
Sidecar equivalent (mirrors `settingsFlowRegistration.ts:144-173`'s `ipcMain.on('setSetting', ...)` shape exactly — a `send`-kind channel with a type-guard, never `ipcMain.handle`):
```typescript
import { ipcMain } from './electronStub'
import {
  cancelCurrentDownload,
  getQueueInformation,
  pauseCurrentDownload,
  removeFromQueue,
  resumeCurrentDownload
} from '../downloadmanager/downloadqueue'

export function registerDownloadQueueFlows(): void {
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
}
```

**Anti-pattern flagged by RESEARCH.md (Pitfall 1):** registering any of the four listener-kind channels with `ipcMain.handle` compiles cleanly and produces zero runtime signal (`dispatchSend()` in `sidecarRpc.ts` loops zero times over an empty `listenerRegistry` entry — no error, no log, no test failure from "it didn't throw"). Copy the `.on`/`.handle` split character-for-character from `ipc_handler.ts`, do not re-derive it from the frontend call sites.

**No new push-side code needed** — `progressUpdate` and `changedDMQueueInformation` are emitted from inside `downloadqueue.ts`/`depot.ts` (unchanged, imported as-is) via `sendFrontendMessage`, which already resolves through the same `electronStub.ts` `fakeWebContents.send` → `pushFrontendMessage` → Rust relay path proven by `pushGameToLibrary`/`storeChanged`/`gameStatusUpdate`. This module registers the pull-side (five channels) only; it owns no push logic.

---

### `src/backend/sidecar/installFlowRegistration.ts` (MODIFIED — re-route D-01)

**Analog:** itself pre-image (in-place edit) + `src/backend/downloadmanager/ipc_handler.ts`'s `install`/`updateGame` handlers as the parity target.

**What is deleted** — the entire Phase 30 direct-bypass body (`installFlowRegistration.ts:120-237` for `install`, `266-309` for `updateGame`), including:
- The manual `sendGameStatusUpdate({status:'queued'})` / `'installing'` pushes (lines 144-159) — `addToQueue()` (`downloadqueue.ts:190-195`) and `installQueueElement` (`downloadmanager/utils.ts`, imported unchanged) already send the identical transitions.
- The `deferredToSetup`/`wasAborted`/`hadError` try/catch/finally status-suppression logic (lines 161-235) — `initQueue`'s own call into `installQueueElement`/`processNotification` (`downloadqueue.ts:159-165, 385-440`) already reproduces this exactly, including the Steam ACF-poller suppression.
- The `runner !== 'steam'` CR-01 guard (lines 135-139) — real Electron's `install`/`updateGame` are runner-generic (`ipc_handler.ts` has no runner check); `addToQueue()` dispatches via `libraryManagerMap[element.params.runner]` (`downloadqueue.ts:208-223`) for ANY runner. Whether the re-route stays Steam-only or goes runner-generic is a planner call within D-01's framing — RESEARCH.md does not mandate widening beyond Steam, only mandates not hand-rolling a second status-transition implementation.

**What replaces it** — the real Electron shape (`ipc_handler.ts:13-22`), adapted to `ipcMain.handle` (invoke, not `addHandler`):
```typescript
// Source: src/backend/downloadmanager/ipc_handler.ts:13-22 (the exact
// re-route shape D-01 requires under the sidecar)
addHandler('install', async (_e, args) => {
  const dmQueueElement /* : DMQueueElement */ = {
    params: args,
    type: 'install',
    addToQueueTime: Date.now(),
    endTime: 0,
    startTime: 0
  }
  await addToQueue(dmQueueElement)
  // DLC fan-out loop omitted — legendary-only, not steam-relevant
})
```
```typescript
// Source: src/backend/downloadmanager/ipc_handler.ts:46-62 (updateGame parity)
addHandler('updateGame', async (_e, args) => {
  const { gameInfo: { install: { platform, install_path } } } = args
  const dmQueueElement = {
    params: { ...args, path: install_path!, platformToInstall: platform! },
    type: 'update',
    addToQueueTime: Date.now(),
    endTime: 0,
    startTime: 0
  }
  await addToQueue(dmQueueElement)
})
```

**Return-shape correction (RESEARCH.md Pitfall 3 — the single highest-risk edit in this file):** the real typed contract is `install: (args: InstallParams) => Promise<void>` (`src/common/types/ipc.ts:394`, `updateGame` at line 404, identical shape). `addToQueue()` has no return value — resolve `undefined`/`void` once queued, never reconstruct a `{status}` shape. No frontend call site inspects the resolved value (verified: `frontend/helpers/library.ts:88` returns it unused, `InstallGameModal.ts:33` voids it, `DownloadManagerItem/index.tsx:148` unused). Re-grep `window.api.install(` / `window.api.updateGame(` immediately before implementing (RESEARCH Assumption A2) — do not trust this list as exhaustive without a fresh check.

**What is kept unchanged in this file:** `uninstall` (lines 248-264), `checkGameUpdates` (line 311), `listSteamLibraryTargets` (lines 313-315) — none of these are part of D-01's scope; do not touch them.

**Import changes:** drop the now-unused `sendGameStatusUpdate` import (line 110) if nothing else in the file uses it after the re-route (check `uninstall`/`checkGameUpdates`/`listSteamLibraryTargets` don't need it — they don't). Add `addToQueue` from `../downloadmanager/downloadqueue`. The existing load-bearing `import '../storeManagers'` (line 104) stays — no new import-order risk, `downloadqueue.ts` is reached transitively the same way `settingsFlowRegistration.ts` reaches `steam/state`.

---

### `src/backend/sidecar/handlers.ts` (MODIFIED — one new call site)

**Analog:** itself pre-image — the exact same file already shows the pattern four times.

**Excerpt of the pattern to extend** (`handlers.ts:37-70`):
```typescript
import { registerSteamFlows } from './steamFlowRegistration'
import { registerSteamAuthFlows } from './steamAuthFlowRegistration'
import { registerInstallFlows } from './installFlowRegistration'
import { registerSettingsFlows } from './settingsFlowRegistration'
import { registerDialogFlows } from './dialogFlowRegistration'
// ...
ipcMain.handle('health', async () => 'ok')

registerSteamFlows()
registerSteamAuthFlows()
registerInstallFlows()
registerSettingsFlows()
registerDialogFlows()
ensureStoresRegistered()
registerStoreWriteHandlers()
```
Add `import { registerDownloadQueueFlows } from './downloadQueueFlowRegistration'` and a `registerDownloadQueueFlows()` call. **Ordering note:** `installFlowRegistration.ts`'s re-route now depends on `addToQueue`/`downloadqueue.ts` being importable, but registration ORDER among these five calls has never been load-bearing for correctness (each module owns its own channel names, no cross-module runtime dependency at registration time) — `ensureStoresRegistered()` at line 71 IS order-sensitive relative to `registerStoreWriteHandlers()` (comment at lines 72-76), but the queue flows call has no equivalent constraint; placing it alongside the other four (before `ensureStoresRegistered()`) mirrors the existing block's shape and is safe because `downloadManager` store construction (Phase 29 D-15) happens at `downloadqueue.ts`'s own import time, not at `ensureStoresRegistered()`'s.

---

### `src/backend/sidecar/__tests__/downloadQueueFlows.test.ts` (NEW — test)

**Analog:** `src/backend/sidecar/__tests__/settingsFlows.test.ts` (full file, 630 lines) — the real-RPC-loop harness and the send-kind test pattern.

**Harness scaffolding to copy verbatim** (`settingsFlows.test.ts:46-70, 174-237`):
```typescript
// os/electron/electron-store mocks — redirect to disposable tmp home +
// route Jest's module resolution at the REAL sidecar shims
jest.mock('os', () => { /* homedir() -> disposable tmp dir, per settingsFlows.test.ts:51-62 */ })
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('electron-store', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ... after mocks:
import { init } from '../bootstrap'

function collectFrames(stream: PassThrough): Frame[] { /* ...settingsFlows.test.ts:175-195 */ }
async function flush(): Promise<void> { /* three setImmediate turns, settingsFlows.test.ts:198-202 */ }
function startSidecar() { /* init(input, output), settingsFlows.test.ts:205-211 */ }
function writeInvoke(input, id, channel, args) { /* settingsFlows.test.ts:214-221 */ }
function writeSend(input, id, channel, args) { /* settingsFlows.test.ts:230-237 */ }
```

**The mandatory send-kind test pattern (RESEARCH.md Pattern 2, mirrors `settingsFlows.test.ts:360-374, 461-469`):** never assert "no error thrown" for a `send`-kind channel — assert the underlying real function was called.
```typescript
// Source: settingsFlows.test.ts:360-374 (setSetting pattern to mirror for
// the four queue send-kind channels)
it('pauseCurrentDownload (send) reaches the real pauseCurrentDownload()', async () => {
  const { input } = startSidecar()
  writeSend(input, 'pause-1', 'pauseCurrentDownload', [])
  await flush()
  // Assert against the REAL side effect (queueState flips to 'paused', or
  // the mocked depot AbortSignal fired) — never a response-frame assertion.
})
```

**Mock boundaries to declare** (mirror `settingsFlows.test.ts:100-139`'s boundary-mock discipline — mock only what has real subprocess/filesystem/network dependencies, run everything else for real):
- `backend/storeManagers` (`libraryManagerMap`) — same shape as `settingsFlows.test.ts:100-106`, a `jest.fn()`-backed stub per runner method `downloadqueue.ts` calls (`getGameInfo`, `getGame(...).stop`, `getInstallInfo`).
- The `downloadManager` electron-store (Phase 29 D-15 extraction, `downloadmanager/electronStores.ts`) — likely needs the SAME `jest.mock('electron-store', ...)` → real `fileStore.ts` substitution `settingsFlows.test.ts` already uses (no new mock class needed if `electron-store`/`os` are already mocked at the top of the file — verify `downloadManager`'s store construction reaches `fileStore.ts` through the same path).
- `getSteamInstallSize` (`storeManagers/steam/games.ts`) — `addToQueue()`'s Steam-size-fetch branch (`downloadqueue.ts:215-219`) hits the Steam store appdetails API; mock this boundary to avoid a real network call in the unit suite, same rationale as `settingsFlows.test.ts:126-129`'s `getSystemInfo` mock (proves wiring, not the network internals underneath).

**REQ-32-01 test (`install` → `addToQueue`, replacing the direct-bypass assertion style):**
```typescript
it('install (invoke) reaches addToQueue(), not a direct SteamGame.install() bypass', async () => {
  const { input, frames } = startSidecar()
  writeInvoke(input, 'install-1', 'install', [{ appName: '999001', runner: 'steam', path: '/x' }])
  await flush()
  const response = frames.find((f) => f.id === 'install-1')
  expect(response?.ok).toBe(true)
  expect(response?.result).toBeUndefined() // Promise<void> — Pitfall 3
  // Assert queue side effect: downloadManager 'queue' store now contains the element,
  // OR assert a spied addToQueue was called with a matching DMQueueElement.
})
```

**Existing contract test to NOT break** (D-05/D-06): `src/backend/downloadmanager/__tests__/downloadqueue.test.ts` — the "cancelable before initQueue() has ever run" and 5s auto-resume timer tests. Do not modify this file's assertions; the sidecar port must satisfy them unchanged (`downloadqueue.ts` itself is unmodified, D-02).

---

### `src/backend/sidecar/electronStub.ts` (contingent — only if a new Electron API surfaces)

**Analog if needed:** the `dialog.showMessageBox` safe-sentinel-logged-no-op precedent (`electronStub.ts:189-227`, documented at length in the block comment `electronStub.ts:154-187`) — the shape for "real behavior where safely forwardable, a `console.warn`-logged safe default where not, never a silent no-op, never a throw for a fire-and-forget caller."

RESEARCH.md's own architecture trace found **no new Electron API** on the queue path — `downloadqueue.ts`'s only Electron-adjacent touch is `sendFrontendMessage`/`sendGameStatusUpdate` (already-proven `ipc.ts`/`utils.ts` functions reaching the existing `fakeWebContents.send` path) and the `downloadManager` electron-store (already registered per Phase 29 D-15, confirmed at `storeRegistration.ts` L108/L190 + `storePolicy.ts` L131/L378). Treat this file as **not modified** unless implementation surfaces something RESEARCH.md missed — if so, follow the `showItemInFolder`/`clipboard.writeText` D-04 "logged no-op, never silent" convention (`electronStub.ts:317-324, 388-395`), not a new bespoke shape.

---

### `32-PORTED-CHANNELS.md` (NEW doc)

**Analog:** `.planning/phases/31-.../31-PORTED-CHANNELS.md` (full file, 115 lines) — table shape, claim-scope note, "Deliberately NOT ported" section structure.

**Table shape to copy** (`31-PORTED-CHANNELS.md:35-46`):
```markdown
| Channel | Kind | Registration module or real code reached | Requirement |
|---|---|---|---|
| `getDMQueueInformation` | invoke | `downloadQueueFlowRegistration.ts` → `downloadqueue.ts`'s `getQueueInformation()` | REQ-32-04 |
| `removeFromDMQueue` | send (listener) | `downloadQueueFlowRegistration.ts` (`ipcMain.on`, never `.handle`) → `removeFromQueue(appName)` | REQ-32-04 |
| `pauseCurrentDownload` | send (listener) | `downloadQueueFlowRegistration.ts` → `pauseCurrentDownload()` — **abort-then-mark-paused, not true in-flight suspend** (Pitfall 5) | REQ-32-04 |
| `resumeCurrentDownload` | send (listener) | `downloadQueueFlowRegistration.ts` → `resumeCurrentDownload()` → `initQueue()` restart, Phase 23 `reconcilePartialState`-cheap | REQ-32-04 |
| `cancelDownload` | send (listener) | `downloadQueueFlowRegistration.ts` → `cancelCurrentDownload({removeDownloaded})` | REQ-32-04 |
| `install` | invoke | `installFlowRegistration.ts` (re-routed) → `addToQueue()`, replacing the Phase 30 D-05a direct bypass | REQ-32-01 |
| `updateGame` | invoke | `installFlowRegistration.ts` (re-routed) → `addToQueue()` | REQ-32-01 |
| `progressUpdate` | push (frontend_message) | `depot.ts`'s already-throttled `emitProgress()` → `sendFrontendMessage`, zero sidecar changes | REQ-32-03 |
| `changedDMQueueInformation` | push (frontend_message) | `downloadqueue.ts` — 5 call sites (`initQueue` x2, `addToQueue`, `removeFromQueue`, `pauseCurrentDownload`), **undeclared by CONTEXT.md, discovered in RESEARCH.md** — do not omit (Pitfall 4) | REQ-32-07 |
```

**Claim-scope note to adapt** (`31-PORTED-CHANNELS.md:8-15`): state explicitly that "unit-proven" ≠ "hardware-proven" and name **both** G-30-01 and G-30-02 as the live-E2E blockers (D-06's doubly-gated framing — do not reuse Phase 30/31's single-blocker wording verbatim).

**"Deliberately NOT ported" section to include:**
- Boot-time `initQueue(isStartup=true)` auto-resume — D-05, cite `main.ts:579`'s call as the one NOT replicated, and that pre-`initQueue` cancelability (module-scope `currentElement` seed, `downloadqueue.ts:49`) is preserved regardless.
- CrossOver bottle / macOS bridge install branches — unchanged, Phase 30 D-07.

---

### `32-HUMAN-UAT.md` (NEW doc)

No direct file analog (Phase 30/31 folded their deferred-UAT items inline into `*-PORTED-CHANNELS.md` or a `*-HUMAN-UAT.md` companion — check whichever phase used a standalone file most recently, e.g. Phase 26's `26-HUMAN-UAT.md`, for the doc's section shape). Content is fixed by D-06: one deferred-UAT item naming **G-30-01** (Tauri QR login unresponsive) and **G-30-02** (install-hang, parked to Phase 33) as the blockers gating any live queue E2E — do not word this as "same as slice 1/2," it is doubly-gated.

## Shared Patterns

### Curated-module first-import ordering (D-02, D-08)
**Source:** `src/backend/sidecar/installFlowRegistration.ts:88-104`, `src/backend/sidecar/settingsFlowRegistration.ts:50-64`
**Apply to:** `downloadQueueFlowRegistration.ts` (new file) — `import '../storeManagers'` must be the first non-type import, before any direct `steam/*`/`downloadmanager/*` import, to avoid the `SteamLibraryManager is not a constructor` re-entrant bundle crash.

### `send`-kind vs `invoke`-kind channel registration (the D-02/D-04 wiring risk)
**Source:** `src/backend/downloadmanager/ipc_handler.ts` (full file — `addListener` vs `addHandler` calls), `src/backend/sidecar/settingsFlowRegistration.ts:144-173` (`ipcMain.on('setSetting', ...)`)
**Apply to:** all five queue channels in `downloadQueueFlowRegistration.ts` — four `ipcMain.on`, one `ipcMain.handle`. Getting this wrong produces a completely silent failure (no error, no test failure from "it didn't throw") — the single highest-risk detail in this phase per RESEARCH.md.

### Send-kind test assertion discipline (D-06)
**Source:** `src/backend/sidecar/__tests__/settingsFlows.test.ts:360-374, 436-454, 461-469`
**Apply to:** `downloadQueueFlows.test.ts` — every test of a `send`-kind channel must assert the underlying real function/side-effect was invoked with the right arguments; a response-frame assertion is meaningless because there is no response frame for `send`-kind.

### Logged-no-op-never-silent (D-04, D-05)
**Source:** `src/backend/sidecar/electronStub.ts:317-324` (`shell.showItemInFolder`), `:388-395` (`clipboard.writeText`), `:204-227` (`dialog.showMessageBox`'s safe-sentinel variant)
**Apply to:** any queue op D-04 determines is unsupported (none currently expected — pause/resume/cancel all map to real functions, just with the abort-then-reconcile caveat) and D-05's boot-time auto-resume suppression — both must emit a `console.warn` naming the decision, never silently no-op.

### Curated-module docstring convention
**Source:** `src/backend/sidecar/settingsFlowRegistration.ts:1-44`, `src/backend/sidecar/installFlowRegistration.ts:1-82`
**Apply to:** `downloadQueueFlowRegistration.ts`'s module header — state what is registered, why (cite D-01/D-02/D-04), and what is deliberately NOT registered (with the Invariant B cross-reference), matching the established house style.

## No Analog Found

None — all files in scope have a strong (exact or role-match) analog in the existing sidecar/downloadmanager codebase. `electronStub.ts` is listed as contingent (no modification currently expected; use the `showMessageBox`/`showItemInFolder` shape if one turns out to be needed).

## Metadata

**Analog search scope:** `src/backend/sidecar/`, `src/backend/sidecar/__tests__/`, `src/backend/downloadmanager/`, `src/backend/downloadmanager/__tests__/`, `.planning/phases/30-.../30-PORTED-CHANNELS.md`, `.planning/phases/31-.../31-PORTED-CHANNELS.md`
**Files scanned (full read this session):** `installFlowRegistration.ts`, `handlers.ts`, `settingsFlowRegistration.ts`, `downloadqueue.ts`, `ipc_handler.ts`, `settingsFlows.test.ts`, `electronStub.ts`, `31-PORTED-CHANNELS.md` — plus targeted greps confirming `depot.ts` throttle constants (L811-818), `common/types/ipc.ts` `install`/`updateGame` `Promise<void>` contract (L394, L404), `main.ts:579`'s `initQueue(true)` boot call, and `utils.ts:1351-1358`'s `sendGameStatusUpdate`/`sendProgressUpdate` push functions.
**Pattern extraction date:** 2026-07-23

## PATTERN MAPPING COMPLETE

**Phase:** 32 - Tauri IPC re-plumb slice 3 — downloads and queue
**Files classified:** 7 (5 code/test files + 2 doc artifacts)
**Analogs found:** 7 / 7

### Coverage
- Files with exact analog: 5 (`downloadQueueFlowRegistration.ts`, `installFlowRegistration.ts` re-route, `handlers.ts` call site, `downloadQueueFlows.test.ts`, `32-PORTED-CHANNELS.md`)
- Files with role-match analog: 2 (`electronStub.ts` contingent, `32-HUMAN-UAT.md`)
- Files with no analog: 0

### Key Patterns Identified
- Transport-kind split is the load-bearing detail: 4 of 5 queue channels are `ipcMain.on` (send/listener), only `getDMQueueInformation` is `ipcMain.handle` (invoke) — copy `ipc_handler.ts`'s `addListener`/`addHandler` split character-for-character, do not re-derive from frontend call sites.
- `install`/`updateGame`'s re-route must resolve `Promise<void>` (queued, not installed) and must DELETE the Phase 30 bypass's hand-rolled status-transition logic, not wrap it — `installQueueElement`/`updateQueueElement` (reached automatically via `addToQueue`→`initQueue`) already reproduce it exactly.
- `progressUpdate` needs zero new sidecar throttle — `depot.ts:811-818`'s `emitProgress()` already throttles at the source (500ms/1%/1000ms heartbeat) before `sendFrontendMessage` is ever called.
- `changedDMQueueInformation` is a second, undeclared-by-CONTEXT push channel (5 call sites inside `downloadqueue.ts`) that must be declared in `32-PORTED-CHANNELS.md` alongside `progressUpdate` or the Download Manager screen/Sidebar badge silently stop updating after their initial mount.
- Every `send`-kind channel test must assert the underlying real function was called (mirror `settingsFlows.test.ts`'s `writeSend`/mock-assertion pattern) — "no error thrown" passes even for a completely unregistered channel.

### File Created
`.planning/phases/32-tauri-ipc-re-plumb-slice-3-downloads-and-queue/32-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns in PLAN.md files.
