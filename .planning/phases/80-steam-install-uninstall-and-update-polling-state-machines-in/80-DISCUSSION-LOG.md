# Phase 80: Steam install, uninstall and update polling state machines in Rust - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log preserves the alternatives considered.

**Date:** 2026-11-16
**Phase:** 80-steam-install-uninstall-and-update-polling-state-machines-in
**Areas discussed:** Where the line falls, Timers and lifecycle, Scope edges, Parity and delete gate

---

## Where the line falls

| Option | Description | Selected |
|--------|-------------|----------|
| Rust loop, TS effects | Rust state machine + typed events; a TS adapter applies all effects (progressBridge-style) | |
| Rust does everything | Rust also writes the library, raises notifications and pushes progress | ✓ |
| TS timer, Rust tick | TS setInterval calls a pure Rust pollOnce | |

**User's choice:** Rust does everything. A follow-up then narrowed what that means, given the state the sidecar owns:

| Option | Description | Selected |
|--------|-------------|----------|
| Rust direct + state events | Rust emits frontend messages and notifications, owns registries, the hold and files; typed state events to a thin TS handler for sidecar-owned state | ✓ |
| Move library state too | Steam libraryState / gameSession / update cache move into Rust in this phase | |
| Split into two phases | Phase 80 = direct + state events; a follow-up moves the library state | |

| Question | Options | Selected |
|----------|---------|----------|
| Notification i18n | Rust reads locale JSON / key+params to TS / key+params to frontend | Rust reads locale JSON |
| Helpers that move | Download monitor / Restart hold / Resume breadcrumbs / Mac arch verify (multi) | All four |
| Frontend messages | Same channels, same payloads / new typed event channel | Same channels, same payloads |
| Ordering on completion | State first, then emit (ack, bounded) / fire both | State first, then emit |

**Notes:** The side-effect inventory (27 frontend messages, 6 notifications, about 25 calls that
touch sidecar-owned state) was shown before the follow-up question.

---

## Timers and lifecycle

| Question | Options | Selected |
|----------|---------|----------|
| Where polls run | In-process tokio tasks / dedicated poller process | In-process tokio tasks |
| Sidecar dies mid-poll | Keep polling, replay state / cancel polls with sidecar | Keep polling, replay state |
| Boot resume | Rust at shell start / TS triggers, Rust runs | Rust at shell start |
| Tick model | Same interval and counts / wall-clock deadlines / file-watch driven | Same interval and counts |

---

## Scope edges

| Question | Options | Selected |
|----------|---------|----------|
| bridgeInstallState.ts | Out, except the uninstall flip / whole file moves | Out, except the flip |
| acfState.ts non-poll functions | Move all of acfState.ts / only what polls use | Move all |
| runningPoll on Windows | Native registry read / port reg.exe verbatim | Native registry read |

---

## Parity and delete gate

| Question | Options | Selected |
|----------|---------|----------|
| Parity method | Scenario replay + Rust tests / port tests only / live runs only | Scenario replay + Rust tests |
| Live smokes (multi) | Mac Steam handoff install / Depot install + update / Uninstall + quit-resume / Windows running poll | All four |
| Fallback flag | One `polls` flag / per-loop flags | One `polls` flag |

---

## Claude's Discretion

- Crate placement, channel names, the state-event schema and the ack mechanism.
- The injection seam from a Tauri-free crate to the webview and notifications.
- How the TS query surface maps onto rustInvoke; the harness location and timeline format; how
  Rust reads the current language.

## Deferred Ideas

- Move the Steam library state (libraryState, gameSession, update cache) into Rust, in a future
  slice.
- Bridge install routing (the rest of bridgeInstallState.ts) in Rust.
