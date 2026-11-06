# Codebase Concerns

**Analysis Date:** 2026-11-07

This document lists concerns only. For how the system fits together, read
`.planning/codebase/ARCHITECTURE.md`. For where files live, read `STRUCTURE.md`. For test gates and
known test gaps, read `TESTING.md`. Conventions referenced below (the sidecar exit contract and the
two-profile fake-HOME rule) are written out in full in `.claude/skills/gamelib-conventions/SKILL.md`.

**How to read this document:**

- Every count states the command shape that produced it. "Non-test" means `grep -v __tests__`.
- **Covered by:** names the roadmap phase (`.planning/ROADMAP.md`) or pending todo
  (`.planning/todos/pending/`) that already owns the concern. Concerns with no owner say
  **Not covered**. Plan new work for those first.
- **Unverified** marks a claim that was not reproduced live.

---

## Corrections to existing codebase docs

- `TESTING.md` says "Clippy is not run anywhere. No workflow mentions it." This is out of date.
  `.github/workflows/rust-test.yml` lines 185-197 run a pinned-toolchain (`1.99.1`) clippy ratchet
  through `meta/clippyRatchet.cjs`, **on the macOS leg only**. The Windows leg is owned by todo
  `2026-11-07-clippy-ratchet-windows-leg.md`. Linux has no Rust CI leg at all (see Fragile Areas).
- `src-tauri/src/relay_commands.rs` line 193 says `security.csp` is `null`. It is not:
  `src-tauri/tauri.conf.json` lines 28-40 set a CSP. The comment is stale. The conclusion it
  supports (the URL is renderer-controlled, so validate it) still holds.
- `patches/steam-user.patch` says `lzma-native` is "confirmed absent from package.json". It is now
  an exact-pinned runtime dependency (`lzma-native 8.0.6`, `package.json`, added in `9b7437874`)
  and is loaded by `src/backend/storeManagers/steam/depot/lzmaLoaderCore.ts`. The patch is still
  correct, because `steam-user`'s CDN path statically requires `lzma`. Only the rationale is stale.

---

## Tech Debt

**Dead Electron-era `ipc_handler.ts` modules, one with a shell-injection path:**
- Issue: 13 `ipc_handler.ts` files remain (684 lines). None is imported by production code.
  Measured with a per-file importer grep across `src/` and `meta/`, excluding tests and comments.
  The sidecar re-registers each channel in a `src/backend/sidecar/*FlowRegistration.ts` file
  instead. Tests still import several of them (e.g.
  `src/backend/tools/__tests__/winetricksInstallPathInvariant.test.ts`,
  `src/backend/shortcuts/__tests__/macShortcutToast.test.ts`), so `find-deadcode` does not flag
  them. `meta/deadcode-baseline-unreachable.txt` line 99 lists only `humble/ipc_handler.ts`.
- `src/backend/tools/ipc_handler.ts` line 13 still contains the Windows branch
  `execAsync(commandParts.join(' '))`. That is a shell over renderer-supplied argv. It was removed
  from the live handler in `src/backend/sidecar/wineToolsFlowRegistration.ts` lines 358-390
  (`assertCommandParts` plus `spawnAsync`). The dead copy is the version a future reader would find
  and re-wire.
- Files: `src/backend/{anticheat,crossover_index,downloadmanager,humble,logger,recent_games,shortcuts,steamgrid,tools,utils,wiki_game_info}/ipc_handler.ts`,
  `src/backend/wine/manager/ipc_handler.ts`, `src/backend/wine/runtimes/ipc_handler.ts`
- Impact: dead code that carries a known-vulnerable pattern, plus tests that pin it alive.
  `src/backend/sidecar/bootstrap.ts` line 1180 still says "Electron keeps using
  `anticheat/ipc_handler.ts`", but `src/backend/main.ts` does not exist.
- Fix approach: move any test that exercises a helper over to the helper's own module, then delete
  the 13 files. Todo `2026-11-06-replace-ts-prune-with-knip.md` may surface them, but it does not
  name them.
- Covered by: **Not covered.** Todo `2026-11-06-remove-electron-naming-leftovers.md` covers the
  `electronStore` modules and `installElectronHook.ts`, not these.

**Heroic FIXME/TODO backlog in shared backend code:**
- Issue: 58 markers in non-test TS/TSX (28 TODO, 26 FIXME, 4 HACK), and 0 in `src-tauri/src`.
  Measured with `grep -rnE "\b(TODO|FIXME|HACK|XXX)\b" src --include='*.ts' --include='*.tsx' | grep -v __tests__`.
  Densest files: `src/backend/tools/index.ts` (7), `src/backend/game_config.ts` (4) and
  `src/backend/utils.ts` (3). Almost all are inherited from Heroic.
- Load-bearing ones:
  - `src/backend/utils.ts` line 320: process killing by name (see Security below).
  - `src/backend/save_sync.ts` line 48: "This isn't really that safe". It rewrites legendary's
    `installed.json` in place with `writeFileSync`. That is not atomic, so a crash mid-write
    corrupts legendary's install database.
  - `src/backend/config.ts` line 339: `@ts-expect-error FIXME` on settings values.
  - `src/common/types/typed_store.ts` line 226: a store key that is not type-checked.
  - `src/backend/storeManagers/nile/games.ts` line 524: `RemoveArgs` is ignored.
- Fix approach: write the legendary file atomically (write a temp file, then `rename`). Treat the
  rest as opportunistic cleanup alongside Phase 66 and Phase 68.
- Covered by: `config.ts` and `typed_store.ts` partly by Phase 68 (versioned stores). The rest is
  **Not covered**.

**Large modules outside the planned decompositions:**
- Measured with `find src -name '*.ts' -o -name '*.tsx' | grep -v __tests__ | xargs wc -l | sort -rn`:
  - `src/backend/launcher.ts`: 2,209 lines
  - `src/backend/utils.ts`: 1,967 lines. It also exports a grab-bag that includes `execAsync`,
    `killPattern` and `openUrlOrFile`.
  - `src/backend/storeManagers/gog/library.ts`: 1,682 lines
  - `src/backend/humble/library.ts`: 1,590 lines
  - `src/backend/tools/index.ts`: 1,542 lines
  - `src/backend/storeManagers/gog/games.ts`: 1,499 lines
  - `src/frontend/screens/Library/index.tsx`: 1,336 lines
  - `src/backend/platform/index.ts`: 1,250 lines
  - `src/backend/humble/user.ts`: 1,192 lines
  - `src/frontend/screens/WebView/useStoreEmbedHost.ts`: 1,016 lines
- Covered by:
  - Phase 65 covers `storeManagers/steam/*`, including `gameInstall.ts` (1,788 lines) and `user.ts`
    (1,562 lines), which its "no file under `storeManagers/steam/` is a multi-thousand-line
    grab-bag" goal implies.
  - Phase 66 narrows `launcher.ts` and wraps `utils.ts`'s spawn helpers.
  - Phase 69 covers `GlobalState.tsx`.
  - Phase 71 covers the Rust files.
  - Todo `2026-11-07-games-ts-further-split-below-1400-lines.md` covers `steam/games.ts`.
  - **Not covered:** `utils.ts` as a module, `gog/`, `humble/`, `tools/index.ts`, and the large
    frontend screens.

**`react-hooks/exhaustive-deps` suppressions:**
- Issue: 91 non-test `eslint-disable` comments, 9 of which give a reason (`grep -c -- "--"`). The
  biggest group is 21 × `react-hooks/exhaustive-deps`. Each one is a candidate stale-closure bug.
  Next come 24 × `no-require-imports` and 11 × `no-unused-vars`.
- Files: `grep -rn "eslint-disable.*exhaustive-deps" src/frontend`
- Covered by: Phase 69 rewrites many of these hooks, but only incidentally. The reason-less
  disables are a known quality finding with no owner.

---

## Known Bugs

These are already filed. They are listed so that new work does not re-file them.

- GOG download resume restarts from 0%: `2026-11-07-gog-download-resume-restarts-from-zero.md`
- Epic offline launch fails silently when the network drops: `2026-11-07-epic-offline-launch-silently-fails-when-network-drops.md`
- Downloads history is lost on tab return: `2026-11-05-downloads-history-lost-on-tab-return.md`
- CrossOver rating API returns 403: `2026-11-07-codeweavers-crossover-rating-api-403.md`
- winebus IOHID wedges on the PowerA pad: `2026-10-29-winebus-iohid-wedges-on-powera-switch2-pad.md`
- Depot selection ignores `config.optionaldlc`: `2026-10-29-depot-selection-installs-config-optionaldlc-opt-in-dlc.md`

**DXVK state cache written to the process working directory (unverified root cause):**
- Symptoms: an untracked, un-ignored `Schedule I Free Sample.dxvk-cache` (117,886 bytes, dated
  Nov 1) sits in the repo root. `git check-ignore` exits 1, so it is not ignored.
- Cause: `grep -rn "DXVK_STATE_CACHE_PATH" src/backend` returns 0 hits. With no cache path set,
  DXVK writes its cache to the game process's working directory. In dev that is the repo root. In a
  packaged build it is whatever cwd the spawn inherits, which may be unwritable. In that case the
  shader cache is silently lost every session, and shader compilation stutter returns on every
  launch.
- Files: the Wine/CrossOver launch env builders in `src/backend/launcher.ts` and
  `src/backend/storeManagers/steam/gameBridgeLaunch.ts`. Which spawn produced the file is
  **unverified**.
- Fix: set `DXVK_STATE_CACHE_PATH` to a per-game directory under the prefix or the GameLib cache,
  and add `*.dxvk-cache` to `.gitignore`.
- Covered by: **Not covered.**

---

## Security Considerations

**Renderer-controlled `shell.openPath` bypasses the URL scheme allow-list:**
- Risk:
  - The `openExternalUrl` and `openFolder` send channels pass `args[0]` straight to `openUrlOrFile`
    (`src/backend/sidecar/shellFilesFlowRegistration.ts` lines 148-158).
  - `openUrlOrFile` (`src/backend/utils.ts` lines 441-448) routes anything that is not `http(s)://`
    to `shell.openPath`, which goes to `requestRustInvoke('shell_open_path')`.
  - That arm (`src-tauri/src/store_embed.rs` lines 2255-2263) calls `app.opener().open_path(path)`
    with no check at all.
  - `open_external_scheme_check` (`src-tauri/src/relay_commands.rs` line 173) guards only the
    `open_external` command and the `openExternal` frame. It does not guard this path.
  - So a renderer-supplied `smb://…`, `file://…`, `.app` bundle or executable path reaches the OS
    "open" verb. The resolution of todo
    `completed/2026-10-05-sidecar-log-output-shares-the-rpc-stdout-pipe.md` records this fallthrough
    ("`httpfoo:` … now falls to `shell.openPath`") and leaves it open.
- Current mitigation: the store-embed webview and other remote origins cannot call
  `sidecar_send`, because `src-tauri/capabilities/default.json` declares no `remote` grant. So
  exploitation needs script execution in the app origin (**unverified** that any path achieves it).
- Recommendations: give `shell_open_path` its own check in Rust. It should accept absolute paths
  only, reject URL schemes, and refuse executables and `.app` bundles unless the caller is a known
  "reveal" or "open folder" flow. Alternatively, split `openExternalUrl` (URL-only, scheme-checked)
  from `openFolder` (an existing directory only, using `assertPlausibleAbsolutePath` from
  `src/backend/sidecar/rendererPathGuard.ts`).
- Covered by: Phase 67 adds argument schemas, but its scope is shape and type. Semantic allow-lists
  for path and URL arguments are not named. **Treat as not covered.**

**`removeFolder` deletes `<renderer path>/<name>` recursively:**
- Risk: `ipcMain.on('removeFolder')` (`src/backend/sidecar/shellFilesFlowRegistration.ts` lines
  245-252) passes a renderer-supplied `folderPath` to `removeFolder` (`src/backend/utils.ts` line
  1490). That function checks `folderName` via `resolveFolderToRemove`, but accepts any parent path,
  and then calls `rmSync(..., { recursive: true })` after a 5 s `setTimeout`.
- Current mitigation: the `folderName` check, plus the same origin-leg denial as above.
  `assertContainedPath` exists in `rendererPathGuard.ts`, but only `wineToolsFlowRegistration.ts`
  and `installFlowRegistration.ts` use it (`grep -rln rendererPathGuard src/backend/sidecar`).
- Recommendations: contain `folderPath` to the configured install roots with
  `assertContainedPath`. `unref()` the 5 s timer, or make the delete awaitable. As written, it is an
  un-`unref`'d handle that holds the sidecar open past stdin EOF, against the sidecar exit contract.
- Covered by: shape validation in Phase 67. Containment is **not covered**.

**Process kill by name pattern (`pkill -f`):**
- Risk: `killPattern` (`src/backend/utils.ts` lines 972-984) runs `pkill -f <pattern>` on Unix and
  `Stop-Process -name` on Windows. `pkill -f` matches the pattern as a regex against every full
  command line on the machine. Call sites:
  - `handleExit` (`src/backend/utils.ts` lines 321-330) kills `legendary`, `gogdl` and `nile`. Any
    unrelated process whose argv contains "nile" matches. Its own FIXME says "this is really
    dangerous cause we can be killing other processes unrelated to what we are doing".
  - `sideload/games.ts` line 91 kills the executable's basename. Regex metacharacters in a file name
    widen the match.
  - `nile/games.ts` line 591 kills the literal `'nile'` on macOS and Windows.
  - `legendary/games.ts` line 1136 kills `'legendary'` on Windows.
- Recommendations: kill by PID or process group from tracked child handles. The planned single
  process runner is the natural owner.
- Covered by: Phase 66 part (3) (one process runner that owns children) enables the fix but does not
  name `killPattern`. Add it to Phase 66's scope.

**Renderer capability grants that the renderer never uses:**
- Risk: `src-tauri/capabilities/default.json` grants `opener:default` (line 8), `updater:default`
  (line 10) and a scoped `shell:allow-execute` for `binaries/gamelib-sidecar` (line 26) to the
  `main` window. A grep for `plugin-shell`, `plugin-updater` and `plugin-opener` imports and
  `plugin:shell`/`plugin:updater` invokes under `src/` finds no renderer use; all three are driven
  from Rust (`src-tauri/src/main.rs` line 49, `relay_commands.rs`). The npm packages
  `@tauri-apps/plugin-shell`, `plugin-updater` and `plugin-opener` are in `package.json` with no
  importers.
  - `opener:default` lets app-origin script call `plugin:opener|open_url` directly. That skips
    `open_external_scheme_check`, although opener's default scope limits it to
    `http(s)`/`mailto`/`tel` (per Tauri docs, **unverified** against the 2.5.4 crate).
  - The `shell:allow-execute` grant lets app-origin script start a second sidecar.
  - `"withGlobalTauri": true` (`tauri.conf.json` line 13) exposes `window.__TAURI__` too. The
    renderer reads only `__TAURI_INTERNALS__` (`src/preload/tauriAttach.ts` line 60).
- Recommendations: drop the three unused grants and `withGlobalTauri`, then remove the unused npm
  packages. Re-run a live boot, because `notification:allow-is-permission-granted` shows that some
  plugins inject init scripts that need grants.
- Covered by: **Not covered.**

**CSP is loose on images and styles:**
- Risk: `src-tauri/tauri.conf.json` lines 28-40 set `img-src 'self' data: https: http:` (cleartext
  `http:` allowed) and `style-src 'unsafe-inline'`, and use `dangerousDisableAssetCspModification`
  for `style-src`. `script-src 'self'`, `frame-src 'none'` and `object-src 'none'` are tight.
- Recommendations: drop `http:` from `img-src` unless a measured store artwork host needs it.
  Document why `unsafe-inline` styles are required (MUI/emotion), so nobody widens `script-src` by
  analogy.
- Covered by: **Not covered.**

**Sidecar→shell frames are trusted without authentication:**
- Risk: the Rust reader (`src-tauri/src/sidecar.rs` start_reader, around lines 440-570) treats any
  JSON line on the sidecar's stdout as a frame. Todo
  `completed/2026-10-05-sidecar-log-output-shares-the-rpc-stdout-pipe.md` redirected `console.*`
  away from stdout (`src/backend/sidecar/processGuards.ts` line 388). Its own "remaining" list
  records that frames carry no per-boot nonce, that the reader enforces no schema, and that any
  third-party module calling `process.stdout.write` directly bypasses the redirect.
- Recommendations: add a per-boot nonce, generated by Rust and passed via env or the first stdin
  line, and require it on every `rustInvoke`/`openExternal` frame. Add a Rust-side frame schema.
- Covered by: Phase 67 part (3) generates the Rust-side contract, but it is scoped to
  renderer→sidecar channels. The sidecar→shell direction is **not covered**.

**Secrets at rest: Steam/Humble/SteamGridDB in Keychain, other stores in plaintext JSON:**
- Steam refresh token:
  - `src/backend/sidecar/bootstrap.ts` lines 1128-1145 install `SidecarKeyringTokenStore`
    (`src/backend/sidecar/keyringTokenStore.ts`) unless the dev vault is installed. The Rust
    keyring arm resolves accounts from a compile-time allow-list, so the sidecar cannot address
    arbitrary Keychain entries (`src-tauri/src/keyring_dispatch.rs` lines 5-12).
  - Residual: the module default is still `new ElectronTokenStore()`
    (`src/backend/storeManagers/steam/tokenStore.ts` line 198). That store writes **plaintext**
    whenever `safeStorage.isEncryptionAvailable()` is false (lines 145-152), and in the sidecar
    that is always false (`src/backend/platform/index.ts` lines 706-707). Any token write before
    line 1131 of `bootstrap.ts` runs, from a new early-boot path or a test harness that skips
    `init()`, lands in `steam_store/config.json` in the clear. `clearOrphanedElectronToken()` is
    cleanup after the fact, not prevention.
- Dev vault: `src/backend/sidecar/devSecretVault.ts` stores all three secret kinds in plaintext.
  It is gated on an env var, refuses packaged (SEA) builds, fails closed
  (`src/backend/sidecar/isPackagedSidecar.ts` lines 77-91), and enforces mode 0600. Acceptable as
  designed.
- Epic, GOG and Amazon tokens are held in plaintext JSON written by the external CLIs:
  - `legendary`: `legendaryUserInfo` (`src/backend/storeManagers/legendary/constants.ts` line 9)
  - `gogdl`: `gogdlAuthConfig` (`src/backend/storeManagers/gog/constants.ts` line 7)
  - `nile`: `nileUserData` (`src/backend/storeManagers/nile/constants.ts` line 7)
  GameLib never sets their file mode.
- Recommendations:
  - Make the default token store fail closed: a store that throws on `setToken` until a real store
    is installed, instead of `ElectronTokenStore`. That deletes the plaintext path.
  - Consider `chmod 0600` on the third-party auth files after each login.
- Covered by: **Not covered.**

**Log upload to a public paste service, with the secret gate never run:**
- Risk: `src/backend/logger/uploader.ts` line 13 POSTs log files verbatim to
  `https://dpaste.com/api/v2/`. `meta/logSecretGate.ts` exists to stop secret-shaped log calls, but
  it is library-only. It has no CLI entry, and running `node meta/runTs.cjs meta/logSecretGate.ts`
  fails with an ESM/CJS `SyntaxError`. It is not referenced from `package.json`, `.husky/` or
  `.github/`; its only caller is `meta/__tests__/logSecretGate.test.ts`.
- Recommendations: add a CLI entry and a `pnpm` script, and wire it into `lint.yml` and
  `.husky/pre-push`.
- Covered by: **Not covered** (known quality finding).

**Dependency vulnerabilities, with no automated audit:**
- `pnpm audit --prod --json` (run 2026-11-07) reports 22 advisories: 6 high, 10 moderate, 6 low,
  0 critical. High:
  - `undici <6.29.1` via `@xhayper/discord-rpc` → `@discordjs/rest`: a TLS certificate validation
    bypass and two DoS issues. The override `"undici@^6": "^6.28.1"` in the `package.json` `pnpm`
    block (line 205) is now **below** the fixed version.
  - `zod <4.6.6`: memory exhaustion. `zod 3.25.6` is used in 15 files, and Phase 67 plans to make
    it the IPC validator.
  - `follow-redirects 1.16.0–1.16.1` via `axios`: credentials can follow redirects. axios carries
    Steam store and API calls.
  - `source-map-js` via `sanitize-html` → `postcss`.
- Moderate, renderer-relevant: `react-router <7.18.0` (an open redirect via backslash in `<Link>`)
  and `i18next-http-backend <3.0.5` (path traversal and URL injection via `lng`/`ns`).
- There is no `pnpm audit`, `cargo audit` or `cargo deny` in `.github/workflows/`, and no
  `.github/dependabot.yml` or Renovate config. Neither `cargo-audit` nor `cargo-deny` is installed
  locally.
- Recommendations: bump the `undici@^6` override to `^6.29.1`. Add a non-blocking `pnpm audit
  --prod` job and `cargo deny check advisories`. Decide zod 3 versus 4 before Phase 67 commits to
  it.
- Covered by: **Not covered.**

---

## Performance Bottlenecks

**Synchronous process and filesystem calls on the single-threaded sidecar:**
- Problem: the sidecar serves every RPC on one Node event loop, so any `*Sync` call stalls every
  channel. Non-test `src/backend` counts:

  | Call | Hits | Files |
  |---|---|---|
  | `existsSync` | 269 | 78 |
  | `readFileSync` | 87 | 46 |
  | `writeFileSync` | 35 | 23 |
  | `readdirSync` | 32 | 17 |
  | `spawnSync` | 13 | 9 |

  Only 3 of the 13 `spawnSync` sites pass a `timeout` (measured with `grep -A5` per site). The
  untimed ones include:
  - `wineserver -k` in `shutdownWine` (`src/backend/utils.ts` line 988), which can hang on a wedged
    prefix
  - `du` (`src/backend/wine/manager/downloader/utilities.ts` line 171), which is slow on large
    prefixes
  - `pkill` (`utils.ts` line 980)
  - gamescope `--help` (`src/backend/launcher.ts` line 690)
  - the Vulkan helper (`src/backend/utils/graphics/vulkan/index.ts` lines 23, 42 and 62)
  - `attrib` (`src/backend/storeManagers/steam/depot/fileAttributes.ts` line 113)
- Cause: inherited Heroic code paths, written for Electron's main process, where they also blocked.
- Improvement path: give every `spawnSync` a timeout now, then convert to async in the Phase 66
  runner.
- Covered by: Phase 66 part (3) for spawns. The `*Sync` fs calls are **not covered**.

**Library grid mounts every card:**
- Problem: there is no list virtualization (`grep -rln "react-window\|react-virtual\|virtualiz"
  src/frontend` finds nothing). `src/frontend/screens/Library/components/GameCard/cardVisibility.ts`
  defers only art loading, via a shared `IntersectionObserver`. With a large multi-store library,
  every card mounts and re-renders on each `GlobalState.tsx` context change.
- Improvement path: measure first, as Phase 69 already requires ("Measure Library re-render cost
  on a large library before and after"). Then add windowing to `GamesList` if mount cost dominates.
- Covered by: Phase 69, for the re-render half. Virtualization is **not covered**.

---

## Fragile Areas

**Sidecar death is permanent and silent:**
- Files: `src-tauri/src/main.rs` line 829 (the only `spawn_sidecar` call site),
  `src-tauri/src/sidecar.rs` lines 565-569, `src/backend/sidecar/processGuards.ts` line 259
- Why fragile:
  - The shell spawns the sidecar once, in `.setup()`. When the sidecar's stdout reaches EOF, the
    reader fails the pending invokes and logs to `shell_diag`.
  - There is no respawn and no renderer notification. `grep -rn "sidecar exited|sidecarExited"`
    over `src/frontend` and `src/preload` finds nothing.
  - The window stays up with a dead backend: every action then fails one by one, at the per-channel
    timeout.
  - Meanwhile, `processGuards.ts` installs a **log-only** `uncaughtException` handler. A synchronous
    throw that would have crashed the process instead leaves it running in an undefined state.
    Node's documentation advises against resuming after `uncaughtException`.
- Safe modification: first add a renderer push or a Rust-side dialog on sidecar exit. Only then
  consider respawn, because store-manager module singletons and in-flight installs make a silent
  respawn unsafe.
- Covered by: **Not covered.**

**Windows exit kills only the sidecar, not its children:**
- Files: `src-tauri/src/shell_state.rs` lines 63-120
- Why fragile: on Unix, `shutdown_child` sends SIGTERM to the sidecar's process group, waits 2 s,
  then sends SIGKILL. On `cfg(not(unix))` it calls `child.kill()` (TerminateProcess) on the sidecar
  PID only. There is no Job Object (`grep -rn "JobObject" src-tauri/src` finds nothing) and no
  `taskkill /T`. So on Windows, `legendary`, `gogdl`, `nile`, `comet` and the Steam helpers outlive
  GameLib, and the sidecar gets no graceful drain.
- Safe modification: assign the sidecar to a Job Object with
  `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` at spawn time. Verify on real Windows hardware; per the
  Phase 34.6 notes, every project gate is macOS-only.
- Test coverage: none on Windows. **Unverified** live.
- Covered by: **Not covered.**

**Linux Rust code is never compiled before a release tag:**
- Files: `.github/workflows/rust-test.yml` lines 55-58 and 83 (`os: [windows-latest,
  macos-latest]`). `.github/workflows/release-tauri.yml` runs on `v*` tag push or manual dispatch
  only (lines 108-111).
- Why fragile: the `rust-test.yml` comment says "the only Linux-specific Rust code is the
  `cfg(unix)` `libc::kill` arm". Today
  `grep -rn 'cfg(target_os = "linux")' src-tauri/src | wc -l` returns **31** sites. A Linux-only
  compile break first surfaces at release time. Phase 71's goal assumes "Windows and Linux compiles
  checked through CI", but only Windows is.
- Safe modification: add a `cargo check --bin gamelib-shell` Ubuntu leg that installs
  `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev` and `librsvg2-dev`, and give it the same
  vite/SEA build prep as the existing legs.
- Covered by: **Not covered.** Fix it before Phase 71, because Phase 71 relies on it.

**Tauri `unstable` feature on all three platforms:**
- Files: `src-tauri/Cargo.toml` lines 128-140, plus the Windows and Linux target tables. The
  lockfile pins `tauri 2.11.5` and `wry 0.55.1`.
- Why fragile: the store-embed child webview (`Window::add_child`) and related multiwebview APIs
  sit behind `unstable`, and those APIs may change on a Tauri minor release. `tauri = "2"` is a
  caret requirement, so `cargo update` will move to 2.12.x (current npm `@tauri-apps/api` is
  2.12.4, per `pnpm outdated`).
- Safe modification: bump Tauri deliberately, as its own task, with the Phase 71 live checks (store
  embed, login windows, Epic embed, title bar on and off).
- Covered by: **Not covered.**

**macOS WebKit and CrossOver internals:**
- Files: `src-tauri/src/login_window.rs` (46 `unsafe {` blocks, 15 `msg_send!`/`sel!`),
  `src-tauri/src/macos_epic_embed.rs` (45 `unsafe {`, including KVC `setValue:` for
  `drawsBackground` at line 772), `src-tauri/src/store_embed.rs` (34 `unsafe {`). Measured with
  `grep -c "unsafe {"`.
- The Steam bridge re-signs and clones a third-party CrossOver bundle:
  `src/backend/storeManagers/steam/bridge/drm/runnerClone.ts`,
  `src/backend/storeManagers/steam/bridge/overlay/overlayRunnerClone.ts` and
  `src/backend/storeManagers/steam/bridge/drm/steamclientLayerInstall.ts` call
  `/usr/bin/codesign`.
- Why fragile: these depend on undocumented WebKit behaviour and on CodeWeavers' private bundle
  layout. A macOS or CrossOver update can break them without any change in this repo.
- Safe modification: read `Skill("spike-findings-gamelib")` before touching them, and live-test
  under both title-bar styles (per memory).
- Covered by: Phase 71 (Rust split only, no behaviour change) and Phase 61 (engine decision). The
  external-dependency risk itself is inherent and has no owner.

**Module-default seams that are correct only after `init()`:**
- Files: `src/backend/storeManagers/steam/tokenStore.ts` line 198, and the comparable
  `setHumbleSecretStore` and `setSteamGridDbSecretStore` registries.
- Why fragile: correctness depends on `bootstrap.ts` ordering (`startRpcServer()` → the
  secret-store install). That ordering is documented only in a 40-line comment
  (`bootstrap.ts` lines 1103-1127).
- Covered by: Phase 66 (a context object built once at boot).

---

## Scaling Limits

**Sidecar RPC pipe:**
- Current capacity: one JSON-lines stdin/stdout pipe and one reader thread
  (`src-tauri/src/sidecar.rs`), with a per-channel timeout (`timeout_for` in
  `src-tauri/src/shell_state.rs` line 147, 60 s default per ARCHITECTURE.md).
- Limit: large payloads, such as full `GameInfo` arrays for big libraries, are serialized as a
  single line with no size cap. `grep -rn "maxBuffer|MAX_FRAME|frameLimit"` over the transport
  files finds none. No size was measured, so the threshold is **unverified**.
- Scaling path: the Phase 63 rule that "only a description of the work crosses the pipe, never bulk
  bytes" should apply to library snapshots too. Add paging, or fetch per store.

---

## Dependencies at Risk

**Major-version lag on renderer and runtime packages (`pnpm outdated`, 2026-11-07):**

| Package | Pinned | Latest |
|---|---|---|
| `react` / `react-dom` | 18.3.1 | 19.3.1 |
| `@mui/material` | 5.17.1 | 9.5.0 |
| `react-router-dom` | 6.30.6 | 7.18.5 (and see the advisories above) |
| `i18next` | 22.5.1 | 26.7.2 |
| `react-i18next` | 12.3.1 | 17.1.13 |
| `zod` | 3.25.6 | 4.6.7 |
| `zustand` | 4.5.6 | 5.1.0 |
| `conf` | 10.2.0 | 16.0.0 |
| `jest` | 29.7.0 | 30.5.2 |
| `typescript` | 5.8.3 | 7.0.2 |
| `eslint` | 9.29.0 | 10.14.0 |

- Impact: security fixes increasingly land only on the newer majors (react-router and zod
  already). `conf` sits under every persisted store.
- Migration plan: sequence them. Zod before Phase 67. `conf` with Phase 68. React, MUI and router
  after Phase 69, which rewrites the state layer they touch. Treat each as its own quick task.
- Covered by: **Not covered.**

**Deprecated dev tooling:**
- `unimported 1.31.1` is reported as **Deprecated** by `pnpm outdated`, and so is
  `i18next-parser 9.3.0` (9.4.0 is marked deprecated). `ts-prune` is unmaintained; todo
  `2026-11-06-replace-ts-prune-with-knip.md` owns it.
- `husky 8.0.3` (latest 9.1.7): the hooks rely on 8's `core.hooksPath` behaviour without sourcing
  `husky.sh`, as noted in `.husky/pre-push`.
- `@testing-library/*` (4 packages) is installed and unused, as noted in TESTING.md.

**Patched third-party packages:**
- `pnpm-workspace.yaml` lines 13-16 apply `patches/steam-user.patch` (26 lines), `patches/lzma.patch`
  (29 lines) and `patches/@types__node@22.19.3.patch` (45 lines).
- Risk: a `steam-user` bump silently drops or conflicts with the static `require('lzma')` rewrite
  the SEA bundle needs, and the sidecar then fails at startup. `pnpm smoke:sidecar` in `test.yml`
  is the backstop.
- Migration plan: re-verify the patch on every `steam-user` bump (current: `^5.3.0`, not outdated).

---

## Missing Critical Features

**No user-visible backend health:**
- Problem: see "Sidecar death is permanent and silent" above.
- Blocks: support diagnosis. A dead backend looks like a frozen UI.

**No dependency or vulnerability automation:**
- Problem: there is no Dependabot, Renovate, `pnpm audit` or `cargo audit`.
- Blocks: timely response to advisories like the 6 high ones above.

---

## Test Coverage Gaps

TESTING.md "Known Gaps" already lists:

- the frontend runs jest in the `node` environment with no DOM
- `@testing-library` is unused
- there is no coverage threshold
- `.husky/pre-push` does not run jest

Not repeated here except where a concern above depends on it.

**Security-relevant channels without behavioural tests:**
- What's not tested: argument containment for `openExternalUrl`, `openFolder` and `removeFolder`
  (`src/backend/sidecar/shellFilesFlowRegistration.ts`), and the Rust `shell_open_path` arm
  (`src-tauri/src/store_embed.rs` line 2255). `cargo test open_external` covers only the
  `open_external` command.
- Risk: a hostile string reaches the OS open verb or `rmSync` with no test failing.
- Priority: High.

**Windows-only and Linux-only code paths:**
- What's not tested: the Windows `shutdown_child` arm, `killPattern`'s `Stop-Process` arm, the
  Windows `runWineCommandForGame` branch (marked "UNVERIFIED on real Windows hardware" in
  `wineToolsFlowRegistration.ts` around line 370), and all 31 `cfg(target_os = "linux")` Rust
  sites.
- Files: `src-tauri/src/shell_state.rs`, `src/backend/utils.ts`,
  `src/backend/sidecar/wineToolsFlowRegistration.ts`
- Risk: orphaned processes and broken builds that surface only on user machines or at release.
- Priority: Medium.

**`killPattern` blast radius:**
- What's not tested: that `handleExit` and `stop()` kill only GameLib's own children.
- Files: `src/backend/utils.ts` lines 972-984
- Risk: unrelated user processes are killed on quit.
- Priority: Medium.

---

*Concerns audit: 2026-11-07*
