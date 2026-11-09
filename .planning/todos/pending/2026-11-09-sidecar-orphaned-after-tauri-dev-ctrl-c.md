---
created: 2026-11-09T00:00:00.000Z
title: 'sidecar.js survives Ctrl-C of pnpm tauri:dev (orphaned, parent pid 1)'
area: sidecar
severity: medium
platform: macos
ready: live-gate
---

During the Phase 73 plan 73-16 live parity runs (2026-11-09), Ctrl-C of `pnpm tauri:dev` left
`sidecar.js` running with parent pid 1 on three occasions. It had to be killed by hand
(`pgrep -fl sidecar.js`). On the final Rust-pipeline run it exited cleanly. The orphan state is
intermittent. Known only from operator runs; not yet reproduced deliberately.

This violates the sidecar exit contract (gamelib-conventions: exit is by event-loop drain at stdin
EOF; `shutdown_child()` is the backstop). An orphan may hold an authenticated steam-user session.

To investigate:
- Does Ctrl-C reach the Rust shell's `RunEvent::Exit` arm under `tauri dev`, or does the dev
  runner kill the shell first, so `shutdown_child()` never runs and stdin EOF never happens?
- If stdin does close, what keeps the loop alive? Take a `--report-on-signal` report from an
  orphan. Look for in-flight work (half 2 of the contract) as well as handles.
- Is it correlated with a game having been launched (bridge/redist jobs) during the session?
  All three orphans followed sessions that launched a bridged game.

Evidence: `.planning/phases/73-steam-depot-download-pipeline-in-rust/73-PARITY.md` (follow-ups).
