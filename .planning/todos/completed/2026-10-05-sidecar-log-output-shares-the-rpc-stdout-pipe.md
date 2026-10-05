---
created: 2026-10-05T00:00:00.000Z
title: "Sidecar log output shares stdout with RPC frames — a logged line shaped like a frame is executed by the shell (security)"
area: tauri-shell
severity: major
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 27"
files:
  - src/backend/logger/index.ts:179-184
  - src/backend/logger/log_writer.ts:12-16
  - src/backend/logger/log_writer.ts:239
  - src/backend/sidecar/bootstrap.ts:863-865
  - src-tauri/src/main.rs:11244-11412
  - src/backend/utils.ts:421
---

## Problem

The main `LogWriter` is constructed with `outputToOsStreams = true` (`logger/index.ts:180-184`), so
INFO/DEBUG lines go to `console.log` (`log_writer.ts:13-14`), i.e. to stdout — and the sidecar's
stdout IS the RPC pipe (`bootstrap.ts:864` says so). The Rust reader JSON-parses every stdout line
and acts on any of:

- `kind:"rustInvoke"` → `dispatch_rust_channel` (`shell_open_path`, `keyring_delete`, `app_exit`,
  `store_embed_navigate`, …). The sidecar's `RUST_INVOKE_CHANNELS` allow-list does not apply on this
  path, because the line never went through the sidecar's outbound framing.
- `kind:"openExternal"` — opened with no scheme check (reader arm near `:11400`).
- `ok` + `id` — can resolve a pending invoke whose counter id is guessable.

Subprocess output is logged raw and may span lines, e.g. `logInfo(stdout)` in
`legendary/library.ts:819` and `gog/games.ts:731`, and bridge helper output in
`steam/bridge/helperProcess.ts:124`.

## Failure scenario

Output from a tool the launcher runs (legendary, gogdl, the Steam bridge helper) contains a newline
followed by `{"kind":"rustInvoke","id":"x","channel":"shell_open_path","args":["/path/evil.app"]}`;
the shell executes it. An attacker needs to control that tool's output.

Related: the renderer can reach the reader's unchecked `openExternal` arm via
`send('openExternalUrl',['httpfoo:…'])`, because `openUrlOrFile` (`backend/utils.ts:421`) only tests
`startsWith('http')`.

## Suggested fix

- Keep the RPC pipe frames-only: build the sidecar's main `LogWriter` with
  `outputToOsStreams = false`, or redirect `console.log` / `console.info` to stderr in the sidecar.
- Defence in depth: give frames a per-boot nonce or a schema the reader enforces.
- Apply `open_external_scheme_check` to the reader's `openExternal` arm.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). The orchestrating session re-checked the cited lines itself and the mechanism holds. Line numbers are as of `5927806` on `main`.

## Resolution (2026-10-05)

**Reproduced.** The main `LogWriter` printed INFO/DEBUG through `console.log`, which in the
sidecar is the RPC pipe; a multi-line log message with a frame-shaped line put that line on stdout
verbatim.

**What changed.**

- `processGuards.ts`: new `installConsoleStdoutRedirect()` (still zero imports) points
  `console.log`/`info`/`debug` at `console.error` and re-routes `console.dir` through it. Node's
  `table`/`count`/`timeEnd`/`dirxml`/`group` labels go through the instance's `log`, so they follow.
  `process.stdout` itself is untouched.
- `src/sidecar/installRejectionGuard.ts` (the entry's first import) calls it at module scope,
  except under `GAMELIB_SIDECAR_SELFTEST`, whose SELFTEST lines `lzmaNativeSeaRealBuild.test.ts`
  reads from stdout and which never starts the RPC loop.
- `log_writer.ts`: `LOG_LEVEL_LOGGING_FUNC` looks `console.*` up per call instead of capturing it
  at module load, so the redirect holds whatever the import order.
- Dev experience is kept: the shell's `start_stderr_forwarder` sends sidecar stderr, line-prefixed,
  to the `pnpm tauri:dev` terminal.
- RPC writer checked: `startRpcServer(input = process.stdin, output = process.stdout)` binds the
  `process.stdout` object and writes with `output.write`, so frames still reach the real pipe. A grep
  of `src/backend` and `src/sidecar` found no direct `process.stdout.write` outside that default
  parameter (and `bootstrap.init`'s matching default).
- Secondary: the Rust reader's `openExternal` arm (`main.rs`) now calls
  `open_external_scheme_check(url)` before `open_url`, so it uses the same allow-list as the
  `open_external` command. `openUrlOrFile` (`backend/utils.ts`) tests `/^https?:\/\//i` instead of
  `startsWith('http')`.

**RED.** New `src/backend/sidecar/__tests__/sidecarStdoutFramesOnly.test.ts` evaluates the real
`installRejectionGuard.ts` (only the three pre-existing process guards stubbed) against a
Node-default `Console` whose stdout stands in for the pipe, then logs through
`new LogWriter(path, true, false)`. On `5927806` the pipe received both log lines with the
`{"kind":"rustInvoke",...}` frame line, plus `console.log`/`info`/`debug`/`dir`/`table` output. A
mutation proof on the product code (replacing the `installConsoleStdoutRedirect()` call with
`void 0`) brings the same failure back. New `shellFilesFlows.test.ts` case: `openExternalUrl` with
`httpfoo:synthetic` produced an `openExternal` frame on the old code (failed).

**GREEN.** Both new tests pass. `testContainment.test.ts` classifies the new suite (directory
recount 67). Jest over `src/backend/sidecar` + `src/backend/logger`: every failure was a timeout
under machine load average ~20, from the same families that also failed on the untouched product
code in this worktree (`appShellFlows` frontendReady/CR-02, `sidecarRejectionGuard` Group 1).
`appShellFlows`, `sidecarRejectionGuard` and `bootstrapWirings` pass in full under
`--runInBand --testTimeout=60000`. `pnpm codecheck` exits 0. eslint reports 0 errors on the touched
files. `prettier --check` passes on the touched non-ignored files. `cargo fmt --check` and
`cargo check` are clean, and `cargo test open_external` reports 10 passed.

**Not verified / remaining.**

- No live `pnpm tauri:dev` run and no `pnpm smoke:sidecar`: the compiled sidecar was not run.
  Because of that, nothing confirms the redirect from inside the real esbuild bundle.
- The Rust arm change has no test of its own. The existing source-text test covers only the
  `open_external` command.
- Anything that writes to `process.stdout` directly (a third-party module, or future code) bypasses
  the console redirect.
- Defence in depth is still open. Frames carry no per-boot nonce, and the reader enforces no
  schema, so any byte that does reach stdout is still trusted. That remains worth doing separately.
- Under `httpfoo:` the renderer's `openExternalUrl` now falls to `shell.openPath`, as any other
  non-http string already did.
