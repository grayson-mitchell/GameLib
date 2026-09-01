---
created: 2026-08-29
title: "Windows has no single-instance guard, so `gamelib://` is deliberately NOT registered there"
found_during: phase 35 plan 07 decision gate (deep-link registration)
severity: medium
area: src-tauri/shell
platform: windows
blocks: "gamelib:// deep links on Windows"
verifiable_on: "operator has a Windows machine (not primary OS)"
---

# Windows has no single-instance guard, so `gamelib://` is deliberately NOT registered there

## The decision this records

Phase 35 plan 07 registers `gamelib://` with the OS. Its D-05 constraint: **on any platform where a
`gamelib://` open cannot be delivered to the RUNNING instance, the protocol is not registered** —
because a handler that starts a second app instance with a second sidecar is an affordance the app
cannot honour.

GameLib's single-instance guard (`src-tauri/src/main.rs`, "Single-instance guard (Phase 34.5 gap
cycle 6 plan 44, D-44-A)") is **`#[cfg(unix)]`**. On Windows there is none. So plan 07 registers
`gamelib://` on **macOS and Linux only**, by decision, operator-approved 2026-08-29.

This todo is the Windows half. Filed because an unowned platform gap is how a capability quietly
becomes permanent.

## Why the obvious fix is already rejected

Do **not** reach for `tauri-plugin-single-instance`. `35-RESEARCH.md` recommended it; **D-44-A
rejected it with a mechanism**, and the rejection is shipped in a comment at the guard:

> a plugin-based guard cannot run before `tauri::Builder::default()`, so a secondary process would
> still reach `.setup()` and spawn its own sidecar before the plugin could ever tell it "you are
> secondary"

The research recommendation was written without knowledge of D-44-A. If you re-propose the plugin,
you are re-deriving a decision that was already made against evidence — read the guard's comment
block first.

## What a Windows guard has to do

Mirror the Unix one's properties, which are load-bearing rather than incidental:

1. **Run at the very top of `main()`**, before `tauri::Builder::default()` is constructed — so a
   secondary process's `std::process::exit(0)` fires before `spawn_sidecar` can ever be called.
2. **FAIL OPEN, NEVER FAIL CLOSED** (`T-34.5-G6-24`). Every recoverable failure must behave like a
   primary process (spawn sidecar, open window), never abort. The Unix version models this as
   `PrimaryWithoutListener`.
3. **Handle the stale-holder case.** The Unix version is connect-first/bind-second: a failed
   connect (including `ConnectionRefused` from a socket left by a crashed instance) removes the old
   socket and binds fresh. A Windows named mutex (`CreateMutexW` + `ERROR_ALREADY_EXISTS`) has
   different stale semantics — the OS releases it on process death — so the equivalent reasoning
   must be redone, not copied.
4. **Carry the URL to the primary.** The Unix path uses a `UnixListener` accept loop and a
   `__GAMELIB_FOCUS__` sentinel; Windows needs a named pipe or equivalent.
5. **Re-validate through `protocol_url_arg()`.** It is the single input-validation choke point
   (ASVS V5) already used by argv and by the socket. A new transport is a THIRD source, not an
   exception — the socket's own comment establishes that a source is not trusted merely for being
   "internal".

## Then, and only then

Register `gamelib://` on Windows and drop the platform gate plan 07 adds.

## Verification

Needs a real Windows machine — the operator has one, though it is not their primary OS. Minimum
check: with GameLib running, open a `gamelib://launch?appName=...` URL from outside the app and
confirm it reaches the RUNNING instance rather than starting a second one. Then confirm exactly one
sidecar process exists afterwards; a second sidecar is the specific failure D-44-A exists to
prevent, and it is invisible from the UI.

## Not phase 35

Filed **without** `resolves_phase:` so it cannot be auto-closed by association. Plan 07's macOS/Linux
registration is complete work; this is a separate platform.
