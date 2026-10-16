# Phase 33: Tauri lifecycle cluster — app, dialog, window, notifications, tray, protocol - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-24
**Phase:** 33-tauri-lifecycle-cluster-app-dialog-window-notifications-tray
**Areas discussed:** G-30-02 fix approach, Cluster scope shape, session/powerSaveBlocker, WR-01/02/03 disposition, Sign-off

---

## Area selection (multiSelect)

User selected all four offered areas: G-30-02 fix approach, Cluster scope shape,
session/powerSaveBlocker, WR-01/02/03 disposition.

---

## G-30-02 install-hang fix approach

### Fix scope

| Option | Description | Selected |
|--------|-------------|----------|
| Both (defense in depth) | Bound getProductInfo/PICS awaits (surgical) AND add a sidecar-handler watchdog around await install() | ✓ |
| Watchdog only | Just the handler-level watchdog; leaves the real stale-socket bug | |
| Surgical only | Bound getProductInfo + revalidate CM socket; no backstop for other parked awaits | |

**User's choice:** Both (defense in depth)

### CM socket reconnect aggressiveness

| Option | Description | Selected |
|--------|-------------|----------|
| Revalidate + reconnect | Probe/refresh the half-open socket before trusting client.steamID | |
| Bound-and-fail only | Only wrap getProductInfo; stale socket surfaces as clean error, install still fails | |
| You decide during research | Research determines cheap-revalidate vs reconnect; constraint: rehydrated install must succeed | ✓ |

**User's choice:** You decide during research (Claude discretion, with fixed constraint)

### Watchdog UX

| Option | Description | Selected |
|--------|-------------|----------|
| Clear badge + error dialog | Force terminal done+error AND surface a failure dialog/toast | ✓ |
| Clear badge only (silent) | Unstick the badge, no dialog (strict Electron parity) | |
| You decide with WR-01 | Decide together with WR-01 in Area 4 | |

**User's choice:** Clear badge + error dialog (anchors WR-01)

### Boot auto-resume

| Option | Description | Selected |
|--------|-------------|----------|
| Keep deferred to Phase 35 | Fix on-demand install only; leave boot auto-resume suppressed | ✓ |
| Re-enable boot auto-resume | Un-suppress initQueue(isStartup=true); pulls bottle auto-open bug into scope | |

**User's choice:** Keep deferred to Phase 35

---

## Cluster scope shape

### Posture

| Option | Description | Selected |
|--------|-------------|----------|
| Flow-unblocking + cheap wins | dialog multi-button + app lifecycle + Notification + shell remaining; re-defer tray/protocol/multi-window/nativeImage/updater | ✓ |
| Minimal (flow-unblocking only) | dialog + app only; everything else deferred | |
| Comprehensive (port the cluster) | Port the whole 44-file cluster now | |

**User's choice:** Flow-unblocking + cheap wins

### Updater

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 34 (with the feed) | Move updater wiring to Phase 34 where the feed/signing lives; logged no-op here | ✓ |
| Real in Phase 33 | Wire updater hooks now despite no feed until Phase 34 | |

**User's choice:** Phase 34 (with the feed)

### Dialog safety (fail behavior)

| Option | Description | Selected |
|--------|-------------|----------|
| Fail-safe to decline | Real multi-button; error/timeout defaults to SAFE/cancel button, never destructive | ✓ |
| Strict passthrough | Return whatever Rust gives; surface error on failure | |

**User's choice:** Fail-safe to decline (CR-01 guarantee preserved)

### Sync dialogs

| Option | Description | Selected |
|--------|-------------|----------|
| Stay logged no-ops | showMessageBoxSync/showOpenDialogSync stay logged no-ops; re-confirm no in-scope flow needs them | ✓ |
| Make them real | Solve sync-over-async for the two Sync members now | |

**User's choice:** Stay logged no-ops

---

## session / powerSaveBlocker

### powerSaveBlocker

| Option | Description | Selected |
|--------|-------------|----------|
| Accept + document | Logged no-op; document possible sleep during long downloads | ✓ |
| Shim it | macOS caffeinate / Tauri plugin wake-lock during downloads | |
| You decide during research | Shim if a cheap maintained plugin exists, else accept | |

**User's choice:** Accept + document

### session

| Option | Description | Selected |
|--------|-------------|----------|
| Accept + document | Logged no-op; session behavior deferred to Phase 35 cutover | ✓ |
| Shim what Steam needs | Shim only if a Steam-reachable path touches session | |

**User's choice:** Accept + document

---

## WR-01/02/03 disposition

### WR-01 (install-error surfacing)

| Option | Description | Selected |
|--------|-------------|----------|
| Restore richer error surface | Returned/thrown error force-clears badge AND shows failure dialog (consistent with watchdog) | ✓ |
| Strict Electron parity | Just clear the badge, no dialog | |

**User's choice:** Restore richer error surface

### WR-02 (Epic/GOG DLC fan-out)

| Option | Description | Selected |
|--------|-------------|----------|
| Re-scope the parity claim | Steam-focused install path; Epic/GOG DLC fan-out NOT ported, boundary declared (logged/guarded, not silent) | ✓ |
| Port the fan-out | Re-add Electron's Legendary/Epic DLC fan-out loop to the sidecar | |

**User's choice:** Re-scope the parity claim

### WR-03 (error-path test)

Settled by construction — since the install-error path is touched by Area 1 + WR-01,
a test driving error/abort through the real install/updateGame invoke channels is
added as part of that work. Not offered as a separate question.

---

## Sign-off

### G-30-02 verification posture

| Option | Description | Selected |
|--------|-------------|----------|
| Live proof required for G-30-02 | Install-hang fix verified live under `npm run tauri:dev` before phase closes; rest of cluster unit-proven + live-deferred | ✓ |
| Unit-proven, live deferred (usual) | Sign off whole phase as wired + unit-proven | |

**User's choice:** Live proof required for G-30-02

### Ready check

| Option | Description | Selected |
|--------|-------------|----------|
| Ready for context | Write CONTEXT.md and hand off to planning | ✓ |
| Explore more gray areas | Surface 2-4 additional gray areas | |

**User's choice:** Ready for context

---

## Claude's Discretion

- CM socket reconnect approach (probe/revalidate vs full reconnect) — research
  decides, with the fixed constraint that a rehydrated-library install must succeed.
- Exact watchdog bound/interval and dialog error-timeout bound — research.
- Whether `nativeImage` is genuinely re-deferrable — depends on whether the Tauri
  notification plugin needs an icon object; research confirm.
- Whether new lifecycle channels extend an existing `*FlowRegistration.ts` or a new
  curated module — planner call.

## Deferred Ideas

- Updater hooks → Phase 34 (with the feed).
- tray / custom-protocol registration / full multi-window / nativeImage → Phase 35
  cutover.
- Boot-time auto-resume of interrupted installs → Phase 35.
- session/powerSaveBlocker real parity → Phase 35 (or earlier shim if a cheap plugin surfaces).
- showMessageBoxSync/showOpenDialogSync real (sync-over-async) → future, if a flow needs it.
- WR-02 Epic/GOG DLC fan-out port → future non-Steam-runner phase or Phase 35.
- Live cross-build settings/queue/download sync → Phase 35 cutover.
