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

## Deliberate repro: Force Quit, not Ctrl-C (73-18 UAT item 9, 2026-11-09)

- **Setup.** Project Zomboid was downloading on the Rust pipeline under `pnpm tauri:dev`, with a
  bridged game launched earlier in the same overall run. At about 21:58:40 the shell was Force
  Quit (Cmd-Opt-Esc).
- **Sidecar pid 41538.** It was reparented to ppid 1 at once and was still alive 3 min 41 s
  later, when the orchestrator killed it by hand.
- **stdin EOF did arrive.** At 21:58:40 the sidecar logged `[sidecar] stdin closed: releasing
  Steam CM session, paying any owed Mac Steam goonline, stopping nettop monitors and aborting
  in-flight downloads`, followed by `CM session closed mode=authenticated cause=disconnected`.
  The open question above ("does stdin close?") is answered *yes* for this path. The process
  then failed to drain, which is half 2 of the contract: in-flight work and handles keep the
  loop alive.
- **`lsof` on the orphan.** fd 0 (stdin) is still listed as a PIPE, which is only the read end.
  There were 6 ESTABLISHED TCP sockets: 151.101.x (fastly) twice, a github CDN (185.199.111.133),
  akamai, and cloudfront akl. The sockets hold the loop: keep-alive agents or in-flight HTTP from
  before EOF that the shutdown path does not destroy or `unref()`. The CDN auth-token probes had
  hit fastly, akamai and alibaba hosts at 21:56:29.
- **Downloads stopped with the shell.** The tree's newest mtime was 1794214720.6 at the Force
  Quit, with no later writes, so the orphan did no depot work.

A second note, which is not a result: at the end of the session the orchestrator sent SIGINT to
the tauri-dev pids only (not the process group, unlike a terminal Ctrl-C). `gamelib-shell` 42917
was reparented to 1 together with its sidecar child, and a SIGTERM to the shell made both exit
within 4 s.

Sources: `73-UAT.md` item 9 and its Gaps (phase 73).

## Fix landed, Force Quit gate PASSED (quick 261110-9w2, 2026-11-10)

- **Fix.** `371298720` and `85e025d58`. `src/backend/sidecar/outboundHttpRegistry.ts` tracks every
  in-flight `http(s)` ClientRequest through `diagnostics_channel`, whatever agent sent it.
  The stdin-EOF release destroys those requests and refuses new ones. An unref'd diagnostic
  logs `still alive` 15 s after EOF if the process has not drained.
- **Force Quit (operator, about 07:21).** A bridged game (3205720) was launched in the session.
  At 07:21:02 the sidecar logged the stdin-closed line and exited. No sidecar was left with
  ppid 1, and no `still alive` warning was logged. An earlier shutdown at 07:17:20 logged
  `destroyed 4 in-flight outbound HTTP request(s) (github.com, store.epicgames.com, gog.com,
  cloudflare-dns.com)`. That was the boot connectivity probe, cancelled as designed.
- **Still owed: the Ctrl-C gate.** Ctrl-C `pnpm tauri:dev` from a terminal (whole process
  group). `pgrep -fl sidecar.js` should print nothing within 10 s, and gamelib.log should have
  no `still alive` line. When it passes, move this todo to `completed/`.

## Third path: an ordinary app Quit (phase 73 post-deletion smoke, 2026-11-10)

The operator quit GameLib normally about 2 minutes after a `pnpm tauri:dev` launch (07:16). No
game had been launched and no download was running. The shell (pid 18638) exited without logging
anything after startup, and `tauri dev` exited 0. The sidecar (pid 18688) was reparented to ppid 1
and was still alive 5 min later; the orchestrator killed it by hand. The orphan therefore needs
neither Force Quit nor Ctrl-C nor a bridged-game launch, which widens the blast radius above.
