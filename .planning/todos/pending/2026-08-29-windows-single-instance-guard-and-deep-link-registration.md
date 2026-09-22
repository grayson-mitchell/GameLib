---
created: 2026-08-29
title: "Windows has no single-instance guard, so `gamelib://` is deliberately NOT registered there (install-time and runtime)"
found_during: phase 35 plan 07 decision gate (deep-link registration)
severity: medium
area: src-tauri/shell
platform: windows
ready: blocked
blocked_by: "Windows single-instance guard (this todo) -- until it ships, both the install-time tauri.windows.conf.json override and the runtime register_all() Linux-only gate stay in place"
blocks: "gamelib:// deep links on Windows"
verifiable_on: "the operator's Windows 11 machine is in active use as of 2026-09-22 (available now, not a hypothetical -- quick 260922-nx4 ran its jest suite and an installer-build attempt on it)"
---

# Windows has no single-instance guard, so `gamelib://` is deliberately NOT registered there (install-time and runtime)

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

## 2026-09-22 finding (quick 260922-nx4): the installer WOULD have registered it

Runtime omission (`register_all()` being `#[cfg(target_os = "linux")]`) was **not sufficient** to
keep `gamelib://` off Windows. Reading `tauri-plugin-deep-link` 2.4.9 and `tauri-utils` 2.9.3
showed that Tauri CLI 2.11.4 independently feeds `plugins.deep-link.desktop` (merged across
`tauri.conf.json` + the active platform overlay) into its **bundler** settings — and its NSIS
template loops `deep_link_protocols`, emitting `WriteRegStr SHCTX "Software\Classes\gamelib"` plus
a `shell\open\command` pointing at the main exe (its WiX template does the equivalent for `.msi`).
Confirmed against the compiled Windows CLI binary itself
(`node_modules/@tauri-apps/cli-win32-x64-msvc/cli.win32-x64-msvc.node`):
`deep_link_protocols` (4 matches), `failed to parse desktop deep links` (1), `WriteRegStr` (34),
`Software\\Classes` (33), `URL Protocol` (2).

This was never actually shipped to a user only because the Windows release leg is separately
broken (see
`.planning/todos/pending/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md`)
— an unrelated build failure was accidentally load-bearing for D-05. That is not a fix, it is luck.

Fixed by an explicit empty `"schemes": []` override in `src-tauri/tauri.windows.conf.json` (never a
deleted key — `tauri_utils::config::DeepLinkProtocol.schemes` is `#[serde(default)]`, so only an
explicit `[]`'s meaning is independent of that default holding). Pinned by
`src/backend/__tests__/windowsDeepLinkSuppression.test.ts` (5 tests, mutation-proven: reverting the
override to `["gamelib"]` or deleting the `schemes` key both fail Test A).

**Installer-level evidence outcome: NOT ACHIEVED.** `pnpm exec vite build` (the first step of the
`tauri:dev:packaged` prep chain, required before `tauri build --debug --bundles nsis` can run)
failed before reaching the Tauri CLI at all: the `gamelib-preserve-runner-symlinks` vite plugin
(`meta/preserveRunnerSymlinks.ts`) tried to recreate `Python.framework` symlinks under
`build/bin/arm64/darwin` (restoring what vite's own dereferencing `publicDir` copy had just
flattened) and hit `EPERM: operation not permitted, symlink 'Python.framework\Versions\3.12\Python'
-> ...`. This machine has neither `SeCreateSymbolicLinkPrivilege` (confirmed via `whoami /priv`,
empty result) nor an elevated/Developer-Mode session (confirmed via `net session` -> "Access is
denied") — creating a symlink on Windows without one of those is refused by the OS, independent of
this quick task's config change. Enabling Developer Mode requires a registry write
(`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock\AllowDevelopmentWithoutDevLicense`),
which this quick task's environment constraints explicitly forbid touching. This is unrelated to
the `gamelib://` override and was not fixed here — it blocks reaching `installer.nsi` generation on
this machine today, for control and override runs alike.

Weaker evidence substituted instead (see `260922-nx4-SUMMARY.md` for full detail): the jest
merge-patch simulation above (mutation-proven), the `tauri-utils::config::DeepLinkProtocol` serde
shape (`schemes: Vec<String>` with `#[serde(default)]`, no http/https fallback — that fallback
belongs to a different struct, `AssociatedDomain.scheme`, for mobile app-links), and the compiled
CLI binary string evidence above. None of these is installer-level proof; the SUMMARY states that
explicitly and does not claim otherwise.

The leftover HKCU `Software\Classes\gamelib` key on the operator's machine (from a 2026-07-20
Electron-era install under `C:\Program Files\GameLib`) is known and deliberately untouched by this
finding and by quick 260922-nx4 — it is a pre-existing artifact of a different, retired build, not
something the current Tauri build wrote, and touching the registry is out of scope here regardless.

## Then, and only then

After the Windows guard ships and passes Verification below:

1. Remove the `plugins.deep-link` override from `src-tauri/tauri.windows.conf.json`.
2. Update `src/backend/__tests__/windowsDeepLinkSuppression.test.ts` in the **same commit** — Test A
   and Test E as written today assert `schemes` stays `[]`; they must invert to assert Windows
   matches macOS/Linux (`["gamelib"]`) once the override is gone, or they will fail (correctly) the
   moment the config changes.
3. Decide whether Windows also needs a runtime `register_all()` call (widen the
   `#[cfg(target_os = "linux")]` gate in `src/main.rs`) or can rely on the installer's own
   registration alone, and update that comment block accordingly.

Register `gamelib://` on Windows and drop the platform gate plan 07 adds.

## Verification

Needs a real Windows machine — the operator has one, though it is not their primary OS. Minimum
check: with GameLib running, open a `gamelib://launch?appName=...` URL from outside the app and
confirm it reaches the RUNNING instance rather than starting a second one. Then confirm exactly one
sidecar process exists afterwards; a second sidecar is the specific failure D-44-A exists to
prevent, and it is invisible from the UI. Before either check, also confirm the generated
`installer.nsi` for that build contains the gamelib `WriteRegStr SHCTX "Software\Classes\gamelib"`
lines — the install-time override from quick 260922-nx4 must be removed (step 1 above) or this
precondition will silently fail (no registration at all, rather than a working one).

## Not phase 35

Filed **without** `resolves_phase:` so it cannot be auto-closed by association. Plan 07's macOS/Linux
registration is complete work; this is a separate platform.

## Addendum 2026-09-22 (later the same day): installer-level check ACHIEVED

**This supersedes every "installer-level check NOT ACHIEVED" statement above.** The operator enabled
Windows Developer Mode, which lifts the `SeCreateSymbolicLinkPrivilege` EPERM. Three further local
Windows build blockers then had to be cleared first. None of them relates to this change; they are
filed in `.planning/todos/pending/2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md`.
After that, `pnpm tauri build --debug --bundles nsis` reached `makensis` and produced
`GameLib_0.7.0_x64-setup.exe`. It then exited 1 only at the updater-artifact signing step
(`TAURI_SIGNING_PRIVATE_KEY` is not on this machine), which runs after `installer.nsi` and the setup
.exe are written. The installer was NOT run and the registry was not touched.

Generated `src-tauri/target/debug/nsis/x64/installer.nsi`, grepped for `Classes\gamelib`:

| Run | Config | `Classes\gamelib` lines | `URL Protocol` lines |
|---|---|---|---|
| Override (committed state) | `tauri.windows.conf.json` `schemes: []` | **0** | **0** |
| Control | same, plus `-c '{"plugins":{"deep-link":{"desktop":{"schemes":["gamelib"]}}}}'` (no file edited) | **6** | 1 |

The control lines, verbatim:

```
922:  WriteRegStr SHCTX "Software\Classes\gamelib" "URL Protocol" ""
923:  WriteRegStr SHCTX "Software\Classes\gamelib" "" "URL:${BUNDLEID} protocol"
924:  WriteRegStr SHCTX "Software\Classes\gamelib\DefaultIcon" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
925:  WriteRegStr SHCTX "Software\Classes\gamelib\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
1272: ReadRegStr $R7 SHCTX "Software\Classes\gamelib\shell\open\command" ""
1274: DeleteRegKey SHCTX "Software\Classes\gamelib"
```

So the control is valid: the template DOES register `gamelib://` when the scheme is present, and the
committed override removes all six lines. The only other difference between the two scripts is the
ordering of `CreateDirectory` lines (hash-set iteration). This confirms the original finding (the
installer would have registered it) and the fix, at installer-script level.
