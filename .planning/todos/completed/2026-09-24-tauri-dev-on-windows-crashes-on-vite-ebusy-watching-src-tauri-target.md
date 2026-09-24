---
created: 2026-09-24T00:00:00.000Z
title: '`pnpm tauri:dev` on Windows can crash on a cold build: Vite''s watcher hits `EBUSY` on `src-tauri/target/debug/deps/gamelib_shell.exe` while cargo is linking it'
area: build
severity: minor
platform: windows
ready: code
status: RESOLVED
found_by: 'Live on the operator''s Windows 11 machine, 2026-09-24, launching the dev build to instrument the Steam caret dropdown (debug session steam-caret-dropdown-dead)'
files:
  - vite.config.ts
  - meta/__tests__/viteRendererConfig.test.ts
---

# `pnpm tauri:dev` died at cargo step 465/466 with a Vite watcher `EBUSY`

**Observed.** The first `pnpm tauri:dev` of the session got cargo to `Building [465/466]
gamelib…` and then the `beforeDevCommand` (Vite) crashed:

```
Error: EBUSY: resource busy or locked, watch 'C:\Users\grays\Projects\GameLib\src-tauri\target\debug\deps\gamelib_shell.exe'
    at FSWatcher.<computed> (node:internal/fs/watchers:323:19)
    ...
Emitted 'error' event on FSWatcher instance at: ... NodeFsHandler._addToNodeFs (vite/dist/node/chunks/dep-DBxKXgDP.js)
       Error The "beforeDevCommand" terminated with a non-zero status code.
```

An immediate identical re-run succeeded (cargo was cached, so no link overlapped the watcher's
startup).

**Mechanism (inferred, not measured).** Vite's chokidar watcher is walking into `src-tauri/target`.
On Windows, `fs.watch` on an executable that the linker holds open throws `EBUSY`, and Vite does
not handle that watcher error, so the whole dev server exits. On macOS/Linux the same watch does
not throw, which fits why this has not been seen there.

**Fix direction.** Add `src-tauri/target/**` (and probably `src-tauri/**` except anything Vite
really serves) to `server.watch.ignored` in `vite.config.ts`. First confirm whether any existing
ignore list is meant to cover it: `vite.config.ts:148` already discusses `src-tauri/tauri.conf.json`.
Verify by running a cold `pnpm tauri:dev` after `cargo clean -p gamelib_shell` on Windows.

**Why minor.** It is dev-only, the workaround is to re-run, and nothing ships broken. It does cost
a full cold compile on the first attempt, and it reads as a real build failure.

## Resolution (quick-260924-vat)

**Fix.** Added `server.watch.ignored: ['**/src-tauri/target/**']` inside the existing `server`
block in `vite.config.ts`, next to `port`/`strictPort`, with an inline comment tagged
"Quick task 260924-vat" naming the mechanism (root is `.`, so without this chokidar walks cargo's
`src-tauri/target`; on Windows `fs.watch` on an exe the linker holds open throws `EBUSY`, which
Vite's FSWatcher does not handle -- `ignorePermissionErrors` does not cover `EBUSY` -- and
`beforeDevCommand` dies mid cold build).

**Vite 6.3.5 append-not-replace fact.** `resolveChokidarOptions` in
`node_modules/vite/dist/node/chunks/dep-DBxKXgDP.js` (~line 27441) builds
`ignored = ["**/.git/**", "**/node_modules/**", "**/test-results/**", escapePath(cacheDir) + "/**",
...arraify(ignoredList || [])]` -- user entries in `server.watch.ignored` are APPENDED to Vite's
own defaults, not a replacement of them, so the added list does not restate `.git`/`node_modules`/
`test-results`/`cacheDir`. That same chunk file is the one named in this todo's stack trace.

**`vite.config.ts:148` was a red herring**, as this todo's own fix-direction note flagged for
confirmation. That comment is inside the 260922-hjb `pruneUnofferedLocalesPlugin` rationale and
concerns `tauri.conf.json`'s `../build/locales/` bundle-resource mapping -- it has nothing to do
with the dev-server watcher. No existing ignore list covered `src-tauri/target` before this fix.

**`src-tauri/**` was deliberately NOT ignored.** This todo's own fix-direction speculated
"probably `src-tauri/**`" -- declined. `src-tauri/` contains
`binaries capabilities Cargo.* build.rs entitlements.plist gen icons src target tauri*.conf.json`;
`target/` is the only cargo output under it, so ignoring only `target/` fixes the EBUSY path with
the narrowest blast radius, and a jest guard (`does not widen the watcher ignore to the whole
src-tauri tree`) makes any future broadening a deliberate test edit rather than a drive-by.

**Regression pin.** `meta/__tests__/viteRendererConfig.test.ts`, inside the existing
`describe.each(['production', 'development'])` block: `ignores src-tauri/target in the dev-server
watcher` (the ignore itself), `does not widen the watcher ignore to the whole src-tauri tree`, and
`does not restate vite defaults in the watcher ignore list`, plus a `source-text guards` case
(`keeps the 260924-vat EBUSY rationale next to the watcher ignore`) asserting the config source
contains both `260924-vat` and `EBUSY` so the rationale comment cannot be silently deleted.

**Noted, not actioned.** Because `build.emptyOutDir` is `false`, Vite does not auto-ignore its own
`outDir` (`build/`). `build/` also holds sidecar output written by other build steps, which makes
whether it needs a watcher ignore a separate, unobserved question -- out of scope for this fix, and
left as an observation only.

**What is NOT proven.** The live gate -- on the operator's Windows machine, `cargo clean -p
gamelib_shell` (in `src-tauri`) followed by a cold `pnpm tauri:dev` reaching the app window without
an `EBUSY` on `gamelib_shell.exe` -- was not run by the executor. This is an operator follow-up;
no new pending todo was filed for it.
