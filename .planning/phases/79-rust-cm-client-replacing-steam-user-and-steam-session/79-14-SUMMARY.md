---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 14
subsystem: steam-cm
tags: [rust, tokio, dispatch, facade, cli]
requires: [79-07, 79-08, 79-09, 79-10, 79-13]
provides:
  - "crate-global tokio runtime with nested-runtime guard"
  - "facade.rs: Core<B> + global sync surface + shutdown_all + set_wrap_host"
  - "25-op OPS table served by dispatch; CLI with its own WrapHost"
affects: [79-16, 79-21]
key-files:
  created: []
  modified:
    - src-tauri/crates/gamelib-steamcm/src/runtime.rs
    - src-tauri/crates/gamelib-steamcm/src/facade.rs
    - src-tauri/crates/gamelib-steamcm/src/lib.rs
    - src-tauri/crates/gamelib-steamcm-cli/src/main.rs
    - src-tauri/crates/gamelib-steamcm-cli/tests/cli.rs
decisions:
  - "macOS configure requires a wrap host (Err steamcm:wrap-host-missing); D-09 PASS => RestoreOnlyWrap on macOS, NoWrap elsewhere. No MacWrap exists."
  - "Core<B> is generic and tested with FakeBackend; the global is Core<SteamVentBackend>"
  - "Sign-in results are ok-merged: {ok:true, ...QrStarted/CredStarted fields}; signin_status returns FlowStatus as-is"
metrics:
  tasks: 2
  completed: 2026-11-15
---

# Phase 79 Plan 14: Rust CM facade, op table and CLI Summary

The whole Rust CM layer is reachable through `gamelib_steamcm::dispatch`: one OnceLock multi-thread runtime, a generic `Core<B>` owning the session/anon actors, sign-in flows and wrap host, 25 registered ops with `deny_unknown_fields` arg structs, and a CLI that keeps state across `--ndjson` lines.

## Commits

- ddc372012 feat(79-14): runtime + facade (task 1)
- 7310b2c40 feat(79-14): register steamcm ops, arg structs and CLI wrap host (task 2)

## Op shapes (for 79-16)

- Session: acquire `{ok:true,leaseId,steamId:"<dec>"}` or `{ok:false,refusal,logonFailure?}`; unconfigured acquire is `client-not-ready`. Status `{connected,leaseCount,logonFailure}`. Shutdown `{restore}`.
- Signed-in ops: `{ok:true,result}` or `{ok:false,kind,eresult?}`; kinds: leaseUnknown, timeout, eresult, network, replaced, protocol, unsupported, ambiguous, shuttingDown. `redeem_key` keeps 79-09's Ok-with-`eresult` result shape; non-idempotent, so `ambiguous` after a rebuild.
- Sign-in: `steamId` args are decimal strings (owned_apps, personas); flow status is the camelCase tagged `FlowStatus`; guard submit `{ok:true}` / `{ok:false,kind:"unknownFlow"|"eresult",eresult}`.
- `steamcm_wrap_restore_if_owed {trigger:"boot"|"shutdown"}` -> `{restore}`; `facade::shutdown_all(bound)` cancels flows, closes anon, shuts the session, bounded (TimedOut).
- The sync facade fns return `Result<Value,String>`; the only `Err` is `steamcm:nested-runtime`.

## Deviations from Plan

1. **[Rule 3] Facade signature.** Pub fns return `Result<Value,String>` (nested-runtime Err), not bare `Value`. Logic lives in async `Core<B>` methods so the unconfigured/failure/shutdown behaviours are unit-tested against FakeBackend (no global state).
2. **[Rule 3] Wrap choice.** `MacWrap` does not exist (D-09 verdict PASS), so macOS uses `RestoreOnlyWrap`, other platforms `NoWrap`. macOS `configure` without a host fails with `steamcm:wrap-host-missing`, so a logon can't skip the wrap host.
3. **`(WebAuth, Flows)` singleton:** `WebAuth` already owns its `Flows`; one lazy `OnceLock<WebAuth>`.
4. **`GoOfflineRequired`:** it is a session `Refusal` (acquire), not an `OpFailure` variant, so it has no op-level kind.
5. **CLI `--ndjson` EOF** calls `shutdown_all(10s)` (not in plan) so an owed go-online is paid on exit. `CliWrapHost` also implements `pid_alive` (`kill -0`), `system_boot_unix_ms` (sysctl) and `local_utc_offset_secs` (`date +%z`).
6. The `anon_close` reason is mapped to a known `&'static str` (unknown -> "requested").
7. Plan verify line `cargo test -p X facade:: runtime::` is invalid; used `--lib -- facade:: runtime::`.

## Verification

`cargo test -p gamelib-steamcm -p gamelib-steamcm-cli` green (248 lib + 7 CLI); `cargo clippy --all-targets -- -D warnings` and `cargo fmt --check` clean. Acceptance greps: 59 `"steamcm_` hits, 20 `deny_unknown_fields`, 0 Debug near secret fields, `env_clear` kept in cli tests. No live sign-in or redeem run.

## Known Stubs

None. Production `WrapHost` with a real tz offset is the shell's job (79-16).

## Self-Check: PASSED
