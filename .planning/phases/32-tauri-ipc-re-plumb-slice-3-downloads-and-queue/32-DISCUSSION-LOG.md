# Phase 32: Tauri IPC re-plumb slice 3 — downloads and queue - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-23
**Phase:** 32-tauri-ipc-re-plumb-slice-3-downloads-and-queue
**Areas discussed:** Queue integration boundary, Module layout, progressUpdate throughput, Queue-channel semantics, Startup download-resume, Sign-off

---

## Queue integration boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Re-route install through addToQueue | Port downloadqueue.ts; install/updateGame enqueue via addToQueue() like Electron's ipc_handler.ts. Full parity; pause/resume/cancel/getDMQueueInformation act on a real running install. Absorbs queue import-time side effects. | ✓ |
| Keep bypass, wire queue channels standalone | Leave install as direct bypass; channels have nothing to act on — structurally hollow. | |
| You decide during research | Measure downloadqueue.ts import cost, default toward re-route. | |

**User's choice:** Re-route install through addToQueue (Recommended)
**Notes:** Resolves the debt Phase 30 D-05a intentionally left. Phase 29 D-15 already extracted `downloadManager`'s store declaration for exactly this. → D-01.

---

## Module layout

| Option | Description | Selected |
|--------|-------------|----------|
| New downloadQueueFlowRegistration.ts, keep queue runner-generic | Fourth curated module owns the five channels + progress; import downloadqueue.ts unchanged/runner-generic (all six managers already constructed per Phase 30 D-05b). Extend installFlowRegistration.ts only for the addToQueue re-route. | ✓ |
| Extend installFlowRegistration.ts with everything | Fewer files but mixes queue-management with install-lifecycle; erodes auditable-import-graph discipline (D-08). | |
| You decide | Planner picks boundaries. | |

**User's choice:** New downloadQueueFlowRegistration.ts, keep queue runner-generic (Recommended)
**Notes:** "Steam-only" buys no import savings since managers already all constructed; reshaping a runner-generic queue would diverge from Electron. → D-02.

---

## progressUpdate throughput

| Option | Description | Selected |
|--------|-------------|----------|
| Sidecar-side throttle/coalesce | Cap push rate before frontend_message (emit ~250–500ms or on percent delta). | ✓ (refined below) |
| Pass-through as-is, then measure | Forward every event; add throttling only if a problem appears — late-discovery risk. | |
| Throttle in Rust | Coalesce in src-tauri relay; breaks zero-Rust-changes streak, least-testable layer. | |

**Follow-up — Throttle site:**

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse Electron's existing emit cadence; throttle only if the sidecar adds volume | Confirm where backend already rate-limits; inherit it; add sidecar coalescer only if a measured gap exists. Identical Tauri/Electron behavior, no double-throttle. | ✓ |
| Add an unconditional sidecar-side coalescer | Fixed throttle regardless of backend; may double-throttle and lag Electron. | |
| You decide during research | Measure real emit frequency and pick minimal mechanism. | |

**User's choice:** Sidecar-side throttle/coalesce → refined to "reuse Electron's cadence, coalesce only if the sidecar adds volume"
**Notes:** Electron's DownloadManager likely already emits on an interval; the port inherits it for free. Zero Rust changes expected (fourth rider on the generic relay). → D-03.

---

## Queue-channel semantics

| Option | Description | Selected |
|--------|-------------|----------|
| All five real, backed by ported downloadqueue.ts | Since install re-routes through addToQueue, queue is populated; all five map to real functions runner-generically. cancel/pause reach depot abort/pause (Phase 25). | ✓ |
| Real queue mgmt, pause/resume as logged no-ops | Wire get/remove/cancel real; pause/resume logged no-op if depot lacks true pause. | |
| You decide per-channel during research | Confirm depot support; real where supported, logged no-op where not. | |

**User's choice:** All five real, backed by ported downloadqueue.ts (Recommended)
**Notes:** Carries the log-don't-silently-degrade caveat as a planner note — confirm depot mid-download pause support; if unsupported, logged no-op with reason declared, never silent. → D-04.

---

## Startup download-resume

| Option | Description | Selected |
|--------|-------------|----------|
| Defer/disable auto-resume this slice | Port the queue but suppress initQueue's isStartup auto-resume (don't replicate main.ts:579 initQueue(true)); log it disabled. Preserve pre-initQueue cancelability. | ✓ |
| Wire full startup-resume matching Electron | Drags the parked install-hang + bottle auto-open bug into the sidecar boot path; unprovable while install parked. | |
| You decide during research | Default toward deferring given the two landmines. | |

**User's choice:** Defer/disable auto-resume this slice (Recommended)
**Notes:** Motivated by the reviewed todo "startup-resume auto-opens Steam-in-CrossOver for bottle games" and the parked G-30-02 hang; bottle branch out of scope (D-07). → D-05.

---

## Sign-off

| Option | Description | Selected |
|--------|-------------|----------|
| Unit-proven only; deferred-UAT names G-30-01/G-30-02 | Jest asserts wiring/re-route/queue-ops/throttle; one deferred UAT item names QR-login + install-hang blockers gating any live queue E2E. | ✓ |
| Standard deferred-UAT, same wording as slices 1 & 2 | Reuse verbatim; hides that this slice's UAT is doubly-gated. | |
| You decide | Planner frames; keep "wired and unit-proven, not hardware-proven". | |

**User's choice:** Unit-proven only; deferred-UAT item names G-30-01/G-30-02 as blockers (Recommended)
**Notes:** Live E2E is effectively blocked NOW (install parked, QR login broken). Same discipline as Phase 30's D-04 tension note. → D-06.

---

## Claude's Discretion

- Exact throttle mechanism/interval under D-03 (measure backend cadence first).
- Per-channel real-vs-logged-no-op under D-04 (depot pause support).
- Whether the addToQueue re-route lives in installFlowRegistration.ts or the new queue module.

## Deferred Ideas

- Boot-time auto-resume (D-05) — home is whichever phase fixes G-30-02 (parked to Phase 33).
- Fixing G-30-02 (install-hang) and G-30-01 (Tauri QR login) — D-06; pre-existing blockers.
- CrossOver bottle & macOS bridge install branches under Tauri — Phase 30 D-07; Phase 35 cutover.
- Live cross-build queue/download sync — Phase 35 cutover.
