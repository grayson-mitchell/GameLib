# Phase 72: Renderer trust boundary and process hardening - Research

**Researched:** 2026-11-08
**Domain:** Tauri v2 shell hardening (Rust + Node sidecar), supply-chain CI, Windows process reaping
**Confidence:** HIGH on codebase facts (all file:line verified this session), MEDIUM on Linux-leg test viability and Windows Job Object behavior (cannot be run here)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Surface the death, then offer Restart or Quit; never respawn in place. When the shell sees the sidecar's stdout reach EOF outside an intentional shutdown, it tells the user. Restart means a full app relaunch (the existing `app_relaunch` path), not a new sidecar under the live window.
- **D-02:** The notice is a Rust-side native dialog, shown from the shell with the dialog plugin's Rust API (no new capability grant). It has no frontend dependency.
- **D-03:** Suppress the dialog on intentional exit. The shell records "shutdown in progress" before it closes the sidecar, and the EOF handler checks that flag. Plans must include a test that a normal quit raises no dialog.
- **D-04:** `uncaughtException` becomes fatal: log, flush the log sinks, exit non-zero. The shell then sees EOF and runs D-01. `unhandledRejection` is Claude's discretion (say what was chosen and why).
- **D-05:** One generic message. No special wording for interrupted downloads or launches.
- **D-06:** Enforce the open-path allow-list in both layers; Rust is authoritative. The sidecar rejects early with a clear error and a log line. A parity test asserts both layers reject the same inputs: `file://`, `smb://`, other URL schemes, relative paths, executables, `.app` bundles, non-existent paths.
- **D-07:** Strict split. `openExternalUrl` accepts URLs only (through `open_external_scheme_check` or its sidecar mirror), never falls through to `shell.openPath`. `openFolder` accepts only an absolute path that exists. `openUrlOrFile`'s fallthrough design is removed. Verify every caller, including non-renderer callers (`steam://`).
- **D-08:** Directories open; files are revealed, never opened. A file path given to `openFolder` routes to `show_item_in_folder`. No path through this channel may execute or open an executable or a `.app` bundle.
- **D-09:** Contain `removeFolder` and make it awaitable. The parent `folderPath` must pass `assertContainedPath` against the configured install roots and the default install path. Replace the 5 s `setTimeout` with an awaited delete; if a delay is genuinely needed, the timer must be `unref()`-ed.
- **D-10:** Trim `capabilities/default.json`: drop `opener:default` and the scoped `shell:allow-execute`; drop `updater:default` only if research confirms the renderer never calls the updater JS API. Set `withGlobalTauri: false`. Remove npm packages left with no importers. Update the capability `description`. A live `pnpm tauri:dev` boot is required after the trim.
- **D-11:** Delete the dead `*/ipc_handler.ts` modules (14 found), including the `execAsync(commandParts.join(' '))` path in `tools/ipc_handler.ts`. Prove each unreferenced first.
- **D-12:** The Steam token store fails closed. The module default in `tokenStore.ts` becomes a store that throws on `setToken` (and returns no plaintext on read) until `bootstrap.ts` installs the real store. Remove the `ElectronTokenStore` plaintext write path. `clearOrphanedElectronToken()` may stay.
- **D-13:** Fix the `pkill -f` kills now with a minimal tracked-children registry: record PID / process group at spawn in the existing spawn helpers; `handleExit`, sideload `stop()`, `nile/games.ts`, `legendary/games.ts` kill by tracked PID/group; `killPattern` is deleted. Keep the registry small. Test spawns use `createFakeHomeProfile()`.
- **D-14:** 72 lands the Linux compile leg in `rust-test.yml` as its first plan (`cargo check`, plus `cargo test --bin gamelib-shell` if it works on ubuntu) with `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, and the same vite/SEA prep. Update 71's CONTEXT note and the ROADMAP text when it lands. Expect a small merge in `rust-test.yml` from the parallel clippy-Windows todo.
- **D-15:** No gate on Phase 71 for the Rust allow-list. If 71 has not moved `shell_open_path` into `shell_open.rs`, 72 creates `shell_open.rs` itself (holding `shell_open_path`, `shell_show_item_in_folder` and the check).
- **D-16:** The three groups are independent, separately mergeable plans/waves. Supply chain and the Linux leg go first.
- **D-17:** CI audit job (`pnpm audit --prod`) plus `cargo deny check advisories`; Dependabot security updates only (npm and cargo).
- **D-18:** The audit job blocks on high/critical and warns on the rest. `cargo deny` uses the same bar. The baseline must be clean of highs before the gate turns on.
- **D-19:** Bump scope: clear every high plus the renderer moderates (`undici@^6` override to `>=6.29.1`, `follow-redirects`, `source-map-js`, `react-router >=7.18.0`, `i18next-http-backend >=3.0.5`). No unrelated major upgrades. Re-run `pnpm audit --prod` at plan time.
- **D-20:** Windows Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` at sidecar spawn. CI only compile-checks it. Verification is a manual UAT item on the operator's Windows PC (Task Manager), following the UAT item-shape convention.

### Claude's Discretion
- Final module and file names (`shell_open.rs` is the working name).
- Wording and buttons of the dead-sidecar dialog, within D-01/D-05.
- Whether `unhandledRejection` also becomes fatal (D-04).
- Exact shape of the fail-closed token store (D-12) and the PID registry (D-13).
- Order of plans within a group.

### Deferred Ideas (OUT OF SCOPE)
- Loose CSP `img-src http:`, per-boot nonce plus Rust frame schema on sidecar→shell frames, `chmod 0600` on legendary/gogdl/nile auth files, the `logSecretGate` CLI and CI wiring, an RPC frame size cap. Also out: the clippy-Windows-leg todo (operator runs it in parallel), the Tauri `unstable` bump, and the zod bump (Phase 67, landed: `zod ^4.6.7`).
</user_constraints>

## Summary

All 20 decisions are implementable on the current tree, but four findings change how the plans must be written, and one conflicts with a locked decision.

1. **D-09 conflicts with prior art and with the evidence.** `window.api.removeFolder` has **zero renderer callers** (preload export is unused; it is in `meta/knip-baseline.txt`; the only live caller is `downloadqueue.ts:410`, which is trusted backend code). Containing against `defaultInstallPath` was already tried and **removed** for `moveInstall`/`importGame` because `defaultInstallPath` is renderer-writable via `setSetting` (circular) and breaks custom install locations (`installFlowRegistration.ts:70-79, 381-386`). Recommended: delete the renderer-reachable `removeFolder` channel (closes the hole completely), keep the internal helper, make it awaitable. This needs the operator's confirmation (Assumption A1) because it departs from D-09's literal text.
2. **D-10 has a hidden dependency.** `tauri-plugin-opener` auto-injects a click handler (`init-iife.js`) that sends every `<a target="_blank">` / ctrl-click on http(s)/mailto/tel to `plugin:opener|open_url`. That is what `opener:default` is used for today: nothing in the renderer imports the JS API, but `ChangelogModal` (`linkTarget="_blank"`) and sanitized-HTML game changelogs rely on the injected handler. Dropping the grant without replacing the handler silently kills those links. Same class as the `notification:allow-is-permission-granted` precedent. The `updater:default` and `shell:allow-execute` grants and all four `@tauri-apps/plugin-*` npm packages are genuinely dead.
3. **D-11 is not "14 unreferenced files".** 13 are unreferenced; `shortcuts/ipc_handler.ts` is imported by two jest suites (`macShortcutToast.test.ts:54`, `shortcutsExistsFallback.test.ts:76`), which must be repointed at `registerShortcutsFlows` or deleted with it.
4. **D-18's "same bar" does not exist for cargo-deny.** cargo-deny 0.20.2 has no severity threshold (`severity-threshold`/`vulnerability` keys are removed) and fails on every RustSec vulnerability. Measured today: **10 vulnerability errors** (rustls ×4, rustls-webpki, webpki-root-certs, zip ×4) so the Rust baseline is NOT clean. Three are fixed by `cargo update -p`; the `zip` four need `zip >= 9` which only arrives with a newer `tauri-plugin-updater` and are reachable only through the updater (which nothing calls), so they need a reasoned `ignore`.

Also: the npm side is 21 advisories (5 high) today, and the `react-router` fix is a **major bump 6 → 7** (no 6.x patch exists), which D-19 already scopes in.

**Primary recommendation:** Execute in the order Linux leg → supply chain (bumps then gates) → trust boundary (open policy, capability trim, deletions/token store) → process lifecycle (dead sidecar, tracked PIDs, Job Object), each as separately mergeable plans, with the four findings above resolved in the plans as specified in the sections below.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Open-path / URL allow-list (authoritative) | Rust shell (`shell_open.rs`, `open_external`) | Node sidecar (early reject) | Rust is the last hop before the OS opener (D-06). |
| `removeFolder` containment | Node sidecar | — | Only the sidecar touches the filesystem for installs. |
| Capability / `withGlobalTauri` trim | Rust shell config (`capabilities/`, `tauri.conf.json`) | Renderer (replacement link handler) | ACL gates webview→Rust IPC only. |
| Dead-sidecar surfacing | Rust shell (reader thread + dialog) | — | Must work with a wedged renderer (D-02). |
| `uncaughtException` fatal | Node sidecar (`processGuards.ts`) | Rust shell (EOF → D-01) | Sidecar exits; shell notices. |
| Tracked-PID kills | Node sidecar (`launcher.ts` spawn helper) | — | The sidecar spawns the store CLIs. |
| Windows Job Object | Rust shell (`sidecar.rs`/`shell_state.rs`) | — | Shell owns the sidecar lifetime. |
| Token store fail-closed | Node sidecar (`tokenStore.ts`, `bootstrap.ts`) | — | Store is installed at sidecar boot. |
| Audit / deny / Dependabot / Linux leg | CI (`.github/`) | — | Supply chain. |

## Standard Stack

No new runtime dependencies. This phase bumps existing ones and adds CI tooling.

### Core (bumps)
| Library | Current | Target | Purpose | Source |
|---------|---------|--------|---------|--------|
| undici (override) | `^6.28.1` (resolves 6.29.0) | `^6.29.1` | 3 high + 1 moderate | [VERIFIED: pnpm audit 2026-11-08; npm view undici@6 = 6.29.1] |
| follow-redirects (via axios) | 1.16.1 | `>=1.16.2` | 1 high | [VERIFIED: pnpm audit; npm view = 1.16.2] |
| source-map-js (via sanitize-html→postcss) | 1.2.1 | `>=1.2.2` | 1 high | [VERIFIED: pnpm audit; npm view = 1.2.2] |
| react-router-dom | `^6.30.6` | `^7.18.5` | 2 moderates; **no 6.x patch** (patched `>=7.18.0`) | [VERIFIED: pnpm audit; npm view = 7.18.5, peers react>=18, node>=20] |
| i18next-http-backend | `^2.7.3` | `^3.0.6` (see Pitfall 9) | 1 moderate (+3 lows fixed only in 4.0.4+) | [VERIFIED: npm view @3 = 3.0.6; CITED: github.com/i18next/i18next-http-backend CHANGELOG] |
| rustls / rustls-webpki / webpki-root-certs | 0.23.42 / 0.103.13 / 1.0.9 | 0.23.46 / 0.103.16 / 1.0.11 | 6 RustSec vulns | [VERIFIED: `cargo update -p rustls -p rustls-webpki -p webpki-root-certs --dry-run` and cargo-deny run, 2026-11-08] |

### Supporting (CI tooling)
| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| `EmbarkStudios/cargo-deny-action` | `@v2` | `cargo deny check advisories` | [CITED: github.com/EmbarkStudios/cargo-deny-action] inputs `manifest-path`, `command`, `arguments`, `rust-version` (default 1.85.0; repo `rust-version` is 1.77.2, fine for the tool). Pass `manifest-path: src-tauri/Cargo.toml`, `arguments: ''` (default `--all-features` is harmless but unneeded). |
| cargo-deny | 0.20.2 (installed locally in scratchpad for measurement) | local reproduction | `cargo install cargo-deny --locked`; global flags (`--manifest-path`, `--config`) go BEFORE `check`. |
| Dependabot | n/a | security updates | See Code Examples. Also needs the repo setting enabled (admin, manual). |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| i18next-http-backend 3.0.6 | 4.0.10 | Clears the 3 lows too; v4 drops cross-fetch (webview has fetch). D-19 says `>=3.0.5` and "no unrelated majors", so use 3.x; 4.x is a one-line change if the operator wants lows cleared. Either needs a live locale-load check. |
| Delete `removeFolder` channel | Contain against roots | See Open Question 1. |

**Installation:**
```bash
pnpm remove @tauri-apps/plugin-notification @tauri-apps/plugin-opener @tauri-apps/plugin-shell @tauri-apps/plugin-updater @types/react-router-dom
pnpm add react-router-dom@^7.18.5 i18next-http-backend@^3.0.6
# package.json pnpm.overrides: "undici@^6": "^6.29.1"; add "follow-redirects@^1": "^1.16.2", "source-map-js@^1": "^1.2.2"
pnpm install && pnpm audit --prod --audit-level high
cd src-tauri && cargo update -p rustls -p rustls-webpki -p webpki-root-certs
```

## Package Legitimacy Audit

No new package names are introduced: every npm entry above is an existing direct or transitive dependency changing version, and the only new CI component is a GitHub Action from the `EmbarkStudios` org plus the `cargo-deny` crate (both already well established; versions confirmed by running the tool). slopcheck was not run because nothing new is installed from a registry by name. Registry existence of the bumped versions was confirmed with `npm view`.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| react-router-dom 7.18.5 | npm | existing dep | very high | github.com/remix-run/react-router | not run (existing dep) | Approved |
| i18next-http-backend 3.0.6 | npm | existing dep | high | github.com/i18next/i18next-http-backend | not run (existing dep) | Approved |
| cargo-deny 0.20.2 | crates.io | existing tool | high | github.com/EmbarkStudios/cargo-deny | not run | Approved (built locally OK) |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none. Removals: `@tauri-apps/plugin-{notification,opener,shell,updater}` (importer-less) and `@types/react-router-dom` (v5 types; v7 ships its own).

## Architecture Patterns

### System Architecture Diagram

```
 Renderer (React)                Node sidecar                       Rust shell                      OS
 ───────────────                 ────────────                       ──────────                      ──
 openExternalUrl(url) ─sidecar_send─▶ validate(http/https/mailto/    open_external ──scheme check──▶ plugin opener open_url
 openFolder(path)     ─────────────▶   tel/steam)   ──rustInvoke──▶  (relay_commands.rs:173)
                                     openFolder: abs+exists?
                                       dir  ──▶ shell_open_path ──▶ shell_open.rs policy ──▶ opener.open_path (dirs only)
                                       file ──▶ shell_show_item_in_folder ─▶ policy ─▶ reveal_item_in_dir
                                       .app/bundle/UNC/scheme ──▶ REJECT (both layers, same fixtures)
 <a target=_blank> ─ delegated click handler ─▶ openExternalUrl (replaces opener's injected script)

 callRunner/launchers ─spawn─▶ trackedChildren{pid,runner,appName}   shutdown_child: SIGTERM pgid, 2s, SIGKILL
 stop()/handleExit ──kill by tracked pid (taskkill /T on Windows)    Windows: Job Object KILL_ON_JOB_CLOSE

 uncaughtException ─▶ stderr+sink ─▶ bounded flush ─▶ exit(1) ─stdout EOF─▶ reader thread EOF branch
                                                                     │ shutting_down flag set? ── yes ─▶ silent
                                                                     └── no ─▶ dialog "Restart / Quit" ─▶ app.restart() | app.exit(0)
 quit paths (Cmd+Q, tray, red X, app_exit, app_relaunch) ─▶ set flag ─▶ RunEvent::Exit ─▶ shutdown_child (also sets flag)
```

### Recommended Project Structure
```
src-tauri/src/shell_open.rs        # NEW (D-15): open_path_policy_check, reveal check, shell_open_path/show_item arms' bodies
src-tauri/src/shell_state.rs       # + shutting_down: AtomicBool, (windows) job handle
src-tauri/src/sidecar.rs           # EOF branch -> on_sidecar_eof(); Job Object assignment helper (cfg(windows))
src-tauri/deny.toml                # NEW, advisories only
.github/dependabot.yml             # NEW, security only
src/backend/trackedChildren.ts     # NEW, ~60 lines (sibling of longLivedChildren.ts)
src/backend/sidecar/openPolicy.ts  # NEW: URL + folder policy used by shellFilesFlowRegistration/appShell
src/common/__fixtures__/openPolicyCases.json  # shared parity fixtures (shape-only cases)
```

### Pattern 1: Pure decision function + closure seam (testable "no dialog on quit")
**What:** Reader-thread EOF branch calls `on_sidecar_eof(&state, || show_dialog())`; the function is pure over `&AtomicBool` and a notifier closure.
**Why:** The repo's established idiom is "pure fn proven by `#[cfg(test)] mod tests` because a live event loop cannot be driven" (`sidecar.rs:129,155`, `relay_commands.rs:199`).
```rust
// shell_state.rs
pub(crate) shutting_down: AtomicBool,           // init false at main.rs:859
pub(crate) fn begin_shutdown(&self) { self.shutting_down.store(true, Ordering::SeqCst); }

// sidecar.rs (after the for-loop, replacing the bare drain-and-return at ~565)
pub(crate) fn on_sidecar_eof<F: FnOnce()>(shutting_down: &AtomicBool, surface: F) {
    if shutting_down.load(Ordering::SeqCst) { return; }
    surface();
}
```
Tests: (a) flag set → closure not called; (b) flag unset → called once; (c) `shutdown_child()` sets the flag before it signals (assert on a `SidecarState` built over a real `cat`/`sleep` child, or extract `begin_shutdown` ordering into a tested helper); (d) a source-pin test asserting the three quit arms (`AppExit`, `AppRelaunch`, `RunEvent::ExitRequested`) call `begin_shutdown` (this repo already uses source-pin tests: `tauriShellSource.test.ts`).

### Pattern 2: Shared fixtures for Rust/TS parity (D-06)
Shape-only cases (`file:///x`, `smb://h/s`, `javascript:1`, `\\\\srv\\share`, `relative/path`, `""`, NUL byte) live in one JSON file read by jest and by Rust (`include_str!` + `serde_json`). Filesystem cases (existing dir, regular file, `X.app` dir, symlink to `.app`, missing path) are constructed in tmpdirs by each test. This is the same single-source approach Phase 67 uses (`genIpcContract` → `RENDERER_CHANNELS`).

### Anti-Patterns to Avoid
- **Respawning the sidecar in place** (locked out by D-01).
- **`detached: true` for tracked children** to get process groups: `shutdown_child` signals the *sidecar's* process group (`shell_state.rs:77`); a detached child is its own group and would **survive app quit**. Track PIDs; do not detach.
- **Checking the EOF flag only at the dialog**: set it at every exit entry (see Pitfall 3).
- **Making `unhandledRejection` fatal**: see D-04 below.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recursive delete with retry | `setTimeout` + `rmSync` | `fs.promises.rm(p, {recursive:true, force:true, maxRetries:5, retryDelay:200})` | Built-in retry on EBUSY/EPERM/ENOTEMPTY covers "aborted child still holds files" without a timer. [CITED: nodejs.org/api/fs.html#fspromisesrmpath-options] |
| Windows process-tree kill | `Stop-Process -name` | `taskkill /PID <pid> /T /F` (tracked pid) plus the Job Object | Name kills hit unrelated processes. |
| Child-process job reaping on Windows | Walking the process tree | `CreateJobObjectW` + `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` | Kernel kills every member when the last handle closes, including on shell crash. |
| Dependency advisories | Custom scripts | `pnpm audit --audit-level`, `cargo deny check advisories` | Maintained databases. |
| Click-to-open-in-browser | Re-enabling `opener:default` | Delegated click listener → `window.api.openExternalUrl` | Keeps all URL opens on the one validated path. |
| Dialog dismissal semantics | Custom rfd plumbing | `app.dialog().message(..).buttons(OkCancelCustom("Restart","Quit")).blocking_show()` | Dismiss → `false` → treated as Quit, which is the safe default for a dead app. The rfd detour in `dialog_message` (`store_embed.rs:2050-2080`) exists to tell dismissal from button 2; not needed here. |

## Evidence Answers (the 11 questions)

### 1. D-10 capability trim
- **Updater JS API:** no renderer or sidecar code imports `@tauri-apps/plugin-updater` or calls the updater at all. `grep -E "from '@tauri-apps/plugin|import\('@tauri-apps/plugin" src meta scripts` returns **no matches**; the only Rust reference is the registration `main.rs:800`; no `UpdaterExt`/`check()` anywhere. `updater:default` is droppable. [VERIFIED: grep this session] The capability description's "required for the JS auto-update API surface" is stale. Keep the Rust plugin and `tauri.conf.json` `plugins.updater` (the release workflow's updater signing/`promote-updater-feed.yml` depend on the config; removing the plugin is out of scope).
- **Importer-less npm packages:** `@tauri-apps/plugin-notification`, `-opener`, `-shell`, `-updater` (all four: zero importers; `package.json:109-112`). `@tauri-apps/api` stays (`preload/tauriTransport.ts`, `tauriWindowChrome.ts`, etc.). `@types/react-router-dom` (`package.json:170`) is dead too.
- **`withGlobalTauri: false` is safe.** Nothing reads `window.__TAURI__`; the only hits outside `__TAURI_INTERNALS__` are comments/tests (`login_window.rs:1253`, `isTauriRemoved.test.ts:66`, `relay_commands.rs:224` doc comment). Renderer code uses `__TAURI_INTERNALS__` (`src/preload/tauriAttach.ts`, `tauriTransport.ts`, `api/tauriWindowChrome.ts`, `devEpicCookieSweepRegistration.ts`). `__TAURI_INTERNALS__` is injected regardless. Update stale comments in `relay_commands.rs:224` and the `tauriConf.test.ts:165-172` prose; check that test file for any `withGlobalTauri` assertion before flipping (grep shows only comments).
- **Plugin init scripts (the live-boot risk):** verified in `~/.cargo/registry` sources:
  - `tauri-plugin-notification` 2.3.3: already handled (`notification:allow-is-permission-granted` stays).
  - **`tauri-plugin-opener` 2.5.4:** `Builder::open_js_links_on_click` defaults `true` and injects `init-iife.js`: a window click listener that, for `<a target=_blank>` or ctrl/shift-click on http/https/mailto/tel, calls `plugin:opener|open_url`. Today `opener:default` makes this work. **Dropping it breaks `ChangelogModal` (`linkTarget="_blank"`, `ChangelogModal/index.tsx:47`) and `dangerouslySetInnerHTML` sanitized changelogs (`GameChangeLog/index.tsx:38`).** Fix: `tauri_plugin_opener::Builder::new().open_js_links_on_click(false).build()` in `main.rs:783` (replacing `init()`), plus one delegated click handler in the renderer (e.g. in `src/frontend/index.tsx` next to `initShortcuts`) that maps those same clicks to `window.api.openExternalUrl(href)`. [VERIFIED: plugin source lib.rs:182-236, init-iife.js]
  - `tauri-plugin-shell` 2.3.5 and `tauri-plugin-dialog` 2.7.2 also inject scripts (`<a target=_blank>` → `plugin:shell|open`; `window.alert/confirm` → `plugin:dialog|message/confirm`). Both are **already denied today** (no `shell:allow-open`, no dialog grant), so dropping `shell:allow-execute` changes nothing for them. The shell script's click handler is dead code that calls `preventDefault()` and fails; no builder switch exists. Leave it; note it for the UAT (links must still open after the opener handler replacement).
  - clipboard-manager, deep-link, updater: no `js_init_script`.
- **Tests to update:** `src/backend/__tests__/capabilitiesDefault.test.ts:132-138` pins `opener:default`, `updater:default`, `shell:allow-execute`; `tauriShellSource.test.ts:999` (clipboard) unaffected; `cargoFeatures.test.ts` pins the Rust crates (unchanged, plugins stay registered).
- **Live gate:** `pnpm tauri:dev` (never `tauri:dev:run`; memory note) then: app boots without an unhandled-rejection console error, click a `target=_blank` link in the changelog modal and in a game changelog, window chrome buttons, and the notification probe. The sidecar must be rebuilt (`tauri dev` does not rebuild it) only if sidecar code changed in the same run.

### 2. D-04 `unhandledRejection` and log flushing
- **Today:** `installUnhandledRejectionGuard` (`processGuards.ts:104-135`) logs through `logSink` (or stderr pre-init) and returns. It never exits. Its header (`:1-45`) records the incident `sidecar-dialog-reject-crashes`: sidecar code routinely fire-and-forgets (`void ...`) with no `catch`, and without a listener Node ≥15's default would kill the whole backend. `installUncaughtExceptionGuard` (`:251-308`) is log-only, never re-throws, with a synchronous re-entrancy depth counter (`:238`).
- **Recommendation: keep `unhandledRejection` log-only; make only `uncaughtException` fatal.** Reasons: (1) a rejection is an async failure of one promise chain, not a state where the call stack unwound through arbitrary code, which is the case Node's guidance against resuming addresses; (2) the codebase has many intentional `void`-ed calls, so fatal would turn every missed `.catch` into a full sidecar death plus a dialog (the exact incident the header cites); (3) D-05 wants one generic message, and rejections are far more frequent than true uncaught throws. Revisit only if the log shows rejections that leave corrupt state. The header doctrine "NEITHER guard may EVER terminate the process" (`:21-24`, `:249`) must be rewritten for the uncaught half, and `sidecarRejectionGuard.test.ts` (which drives a fake `EventEmitter`, `:412-760`) needs new cases.
- **Flush reality:** sinks are not flushed; they are fire-and-forget. `bootstrap.ts:815` sets the sink to `(m) => logError(m, LogPrefix.Backend)`, which calls `LogWriter.writeString` → `await fsPromises.appendFile` (`log_writer.ts:213`), async with an internal promise chain. Exiting immediately loses the line. stderr is a second durable path: the shell's `start_stderr_forwarder` (`sidecar.rs:317`) forwards it to the shell log.
- **Recommended shape:** inject the exit and the flush for testability:
  ```ts
  function installUncaughtExceptionGuard(target = process, exit: (code: number) => void = process.exit) {
    target.on('uncaughtException', (error) => {
      if (depth > 0) { exit(1); return }              // second fault while handling the first: stop now
      depth += 1
      const message = buildMessage(error)
      const writes: Promise<unknown>[] = [new Promise((r) => process.stderr.write(`${message}\n`, () => r(undefined)))]
      try { const p = sink?.(message); if (p) writes.push(p) } catch {}
      // bounded: never let a wedged log disk block the exit
      const cap = new Promise((r) => setTimeout(r, 1500).unref())
      void Promise.race([Promise.allSettled(writes), cap]).finally(() => exit(1))
    })
  }
  ```
  The sink type must change from `(m) => void` to `(m) => void | Promise<void>` and `bootstrap.ts:815` must `return logError(...)`. `unref()` the cap timer per the exit contract (the process is exiting anyway; the `.finally` is what ends it). Keep `installStdioErrorGuards` (it prevents the EPIPE self-feeding loop at `:313-405`); the fatal path makes that loop impossible anyway (second fault → `exit(1)`), but the stdio guard must stay because stderr `'error'` events fire after the handler returns. Whether pipe writes to stderr are synchronous varies by platform; use the write callback rather than assuming [ASSUMED]. Unit tests: fake target + fake exit; assert exit code 1, assert the sink was awaited, assert a never-resolving sink still exits within the cap (jest fake timers), assert re-entry exits immediately. `pnpm smoke:sidecar` does not cover this (exits only on stdin EOF).

### 3. D-07 callers of `openUrlOrFile`, `openExternalUrl`, `openFolder`
`openUrlOrFile` (`utils.ts:441-448`: http(s) → `shell.openExternal`, everything else → `shell.openPath`). Complete caller list [VERIFIED: grep]:
- `shellFilesFlowRegistration.ts`: `openExternalUrl` (:148, renderer arg), `openFolder` (:154, renderer arg), 10 constant-URL openers (`openSupportPage`, `openWeblate`, `openLoginPage`, `openDiscordLink`, `openKofiPage`, `openGithubSponsorsPage`, `openWinePrefixFAQ`, `openWikiLink`, `openSidInfoPage`, :160-210), and **`showConfigFileInFolder`** (:218-227) which today calls `openUrlOrFile(configPath | join(gamesConfigPath, `${appName}.json`))`, i.e. it *opens a file with the default app*; per D-08 it must call the reveal path (`showItemInFolder`) instead. Its `appName` is renderer-supplied and `join` does not contain `..`; add `assertContainedPath(gamesConfigPath, `${appName}.json`)`.
- `appShellFlowRegistration.ts`: `openReleases` (:356, constant), **`openWebviewPage`** (:361-364, renderer arg; sole renderer caller `WineItem/index.tsx:108` with a release-notes URL → URL channel).
- No other `openUrlOrFile` caller. The `steam://` launches do **not** use it: `steam/gameInstall.ts:443`, `gameUninstall.ts:151`, `gameLaunch.ts:224,261`, `macSteamOffline.ts:170`, `bridge/helperProcess.ts:383` and `appShellFlowRegistration.ts:337` (x-apple.systempreferences exact URL) call `shell.openExternal` directly → `platformApi.openExternal` → Rust `open_external` (scheme check). Untouched by the split.
- **Renderer callers:** `openExternalUrl` (28 call sites in `src/frontend`, all literal or API-derived https URLs: `deal.buyUrl`, `redeemTarget.url`, `embedHost.currentUrl`/`deepLinkUrl`, `newStable.html_url`, GitHub/CodeWeavers/Humble/Steam/aka.ms literals). `deal.buyUrl`, `redeemTarget.url`, `deepLinkUrl` are remote-derived: the scheme allow-list is exactly the protection they need. `openFolder` (6 call sites): `GameSubMenu:433` uses `install_path || folder_name`, **`folder_name` can be a relative name** → will now be rejected (behavior change; today it resolves against the sidecar cwd); `InstalledInfo:138,162`, `CloudSavesSync:147,150` (`savesPath` may not exist yet → rejected, log it; GOG `save.location` are directories).
- **Confirmed safe:** the strict split holds for every renderer caller. Required behavior changes to call out in the plan: relative `folder_name`, non-existent `savesPath`, `showConfigFileInFolder` reveal, `.app` install paths (reveal, not launch).
- **Rust side:** `open_external_scheme_check` is at `relay_commands.rs:~197` (the CONTEXT's ~173 is the doc comment). Allowed schemes `["https","http","mailto","tel","steam"]` plus one exact x-apple.systempreferences URL (`OPEN_EXTERNAL_ALLOWED_SCHEMES`). The sidecar mirror must use the same list (`parity test` reads the Rust const out of the source file, an existing repo idiom). `ShellOpenPath` arm: `store_embed.rs:2170-2177` (`app.opener().open_path(path, None)`, no check). `ShellShowItemInFolder` arm: `store_embed.rs:2157-2168` (+ `macos_finder_reselect_workaround` in `keyring_dispatch.rs:40`). Args structs `ipc_contract.rs:609-630`. **Phase 71 has NOT landed** (only `71-CONTEXT.md` exists; no `shell_open.rs`), so per D-15 72 creates `shell_open.rs`. Files in `src-tauri/src/` already follow the `use super::*;` module convention (`shell_state.rs:1`).
- `shell_open_path` is reachable only as a sidecar `rustInvoke` frame (not directly from the webview; webview-reachable commands are the four relay commands), so "Rust is authoritative" defends against a compromised or buggy sidecar, and `opener:default` (D-10) was the only direct webview path.
- **Rust policy (recommended):**
  ```rust
  pub(crate) fn open_path_policy_check(raw: &str) -> Result<std::path::PathBuf, String> {
      if raw.is_empty() || raw.contains('\0') || raw.contains("://") { return Err("open_path: rejected".into()) }
      if raw.starts_with("\\\\") || raw.starts_with("//") { return Err("open_path: rejected".into()) } // UNC / smb-style
      let p = std::path::Path::new(raw);
      if !p.is_absolute() { return Err("open_path: not absolute".into()) }
      let canon = std::fs::canonicalize(p).map_err(|_| "open_path: not found".to_string())?;
      if !canon.is_dir() { return Err("open_path: not a directory".into()) }   // files are revealed, never opened
      if is_launchable_bundle(&canon) { return Err("open_path: bundle".into()) }
      Ok(p.to_path_buf())        // pass the ORIGINAL path on; canonicalize() on Windows yields \\?\ verbatim paths
  }
  ```
  `is_launchable_bundle`: extension (ASCII case-insensitive) in `app, prefpane, saver, workflow, action, plugin, bundle, framework, component, kext, mdimporter, qlgenerator, xpc, appex, wdgt, pkg, mpkg`. [ASSUMED: the macOS list is from training knowledge, not verified; `.app` is the required one.] A macOS `.app` is a *directory*, so an "is it a dir" check alone would open/launch it; the extension rule is load-bearing, and `canonicalize` first closes symlink-to-`.app`. The reveal arm gets a lighter check (absolute + exists + no scheme + not UNC). The sidecar mirror routes: `isDirectory && !bundle` → `shell_open_path`; file or bundle dir → `shell_show_item_in_folder` (graceful, D-08); everything else → reject + `logWarning` (never log the path itself, per `T-34.6-32`/`T-28-04` convention).

### 4. D-09 `removeFolder`
- **Delay:** the 5 s (default-path branch, `utils.ts:1497-1507`) and 2 s (explicit-path branch, `:1523-1526`) timers exist to let the aborted runner release file handles before `rmSync` (the call follows `stopCurrentDownload()` in `cancelCurrentDownload`, `downloadqueue.ts:386-411`; `callAbortController` returns before the child exits). A delay is a heuristic; the retrying async `rm` (Don't Hand-Roll) replaces it without a timer. No `unref()` problem remains. The comment `utils.ts:1485` already contains the folder *name* (`resolveFolderToRemove` → `assertContainedPath(root, folderName)`); only the **parent** is unchecked.
- **Callers:** (1) `downloadqueue.ts:410` `removeFolder(currentElement.params.path, folder_name)`: trusted backend, `path` is the user's chosen install dir (any location); (2) the renderer-reachable `removeFolder` send channel (`shellFilesFlowRegistration.ts:245-252`, schema `common/types/ipc/shellFiles.ts:29`, preload `src/preload/api/library.ts:3`). **(2) has no renderer caller** (`grep` of `src/frontend` finds only a comment at `DownloadManagerItem/index.tsx:116`; the preload export is in `meta/knip-baseline.txt:160`).
- **Roots problem:** the "configured install roots" do not exist as a closed set: installs go to any user-chosen path, and `defaultInstallPath` is renderer-writable via `setSetting` (`settingsFlowRegistration.ts:160`), so containing against it is circular. This was already litigated and reversed in 34.6-18 (`installFlowRegistration.ts:70-79, 381-386, 500-510`).
- **Recommendation:** remove the renderer channel (preload export, `shellFilesSyncArgs.removeFolder`, the `ipcMain.on('removeFolder')` registration, regenerate with `pnpm gen:ipc-contract`, drop the knip baseline line); keep `removeFolder` as an internal async helper; add `assertPlausibleAbsolutePath` on its `path` argument as defence in depth; callers `void removeFolder(...).catch(log)` (`cancelCurrentDownload` is synchronous). Tests to update: `shellFilesFlows.test.ts`, `ipcSchemas/shellFiles.test.ts`, `rendererPathGuard.test.ts`, `downloadqueue.test.ts` (mocks `removeFolder: jest.fn()`; it asserts `toHaveBeenCalledWith('/mock/install/path', 'GogFolder')`, still valid). If the operator rejects the deletion, the fallback is `assertContainedPath` against the union of {install paths of installed games, queued items' `params.path`} (non-circular), not `defaultInstallPath`.

### 5. D-11 dead `ipc_handler.ts` modules
14 files [VERIFIED: `find src -name ipc_handler.ts`]: `anticheat`, `crossover_index`, `downloadmanager`, `humble`, `logger`, `recent_games`, `shortcuts`, `steamgrid`, `storeManagers/legendary/eos_overlay`, `tools`, `utils`, `wiki_game_info`, `wine/manager`, `wine/runtimes` (708 lines). Evidence: a repo-wide grep for any string ending `ipc_handler'`/`"` in `src meta scripts` and root configs finds **no non-test importer** (all other hits are comments, e.g. `utils.ts:110`, `crossoverRatingMap.ts:2`, `humble/user.ts:26`, or negative-assertion tests). No `require`, dynamic `import()`, jest path mock, knip entry or `package.json` reference. Tests that matter:
- **Reference it as code:** `shortcuts/__tests__/macShortcutToast.test.ts:54` and `shortcutsExistsFallback.test.ts:76` (`import '../ipc_handler'`). Both test behavior that now lives in `sidecar/shortcutsFlowRegistration.ts` (`macDesktopShortcutWanted`, :88-89, :231). Repoint them at `registerShortcutsFlows()` (via the existing `sidecar/__tests__/shortcutsFlows.test.ts` harness) or delete if that suite already covers the behavior; verify before deleting.
- **Negative gates that stay green after deletion** (they assert absence): `eosOverlayFlows`, `gameDetailsImportGate`, `appShellImportGate`, `runnerSliceRegistration`, `humbleFlows`, `humbleLoginFlows`, `enrichmentFlows`, `wineToolsFlows`, `runnerMiscFlows`, `clipboardFlows` (:293 comment). Their "gate self-test" synthetic strings are inline and don't need the file.
- `winetricksInstallPathInvariant.test.ts` only mentions the file in prose. The `execAsync(commandParts.join(' '))` path is `tools/ipc_handler.ts:13`; the live `callTool` is the registration in `runnerMiscFlowRegistration.ts`.
- Run `pnpm find-deadcode` (knip ratchet fails on a *vanished* finding too: lower `meta/knip-baseline.txt` in the same commit), `pnpm boundaries`, `pnpm codecheck`. Knip may then flag newly-orphaned exports in files these handlers imported; fix in the same plan.

### 6. D-12 token store
- `tokenStore.ts` (comments stripped): `TokenStore` interface (`isAvailable/getToken/setToken/clearToken/readToken?`), `readTokenOutcome`, `ElectronTokenStore` (safeStorage encrypt; plaintext fallback `encryptToken` when `!encryptionAvailable()`, and legacy no-prefix plaintext read in `decryptToken`), `let activeTokenStore: TokenStore = new ElectronTokenStore()` (~line 198), `setTokenStore`, `getTokenStore`, `clearOrphanedElectronToken()`. In the sidecar `safeStorage` is a stub that throws (`platform/index.ts:704-716`), so the default store is already non-functional there; the risk is only that a handler runs before the swap.
- Install site: `bootstrap.ts:1133` `installTokenStore(new SidecarKeyringTokenStore())` (or `devSecretVault.ts:335` `setTokenStore(new DevVaultTokenStore(path))`), inside the exclusive branch at ~`:1128-1146`, after `startRpcServer()`. `clearOrphanedElectronToken()` is called at ~`:1153`.
- **Recommended shape:** replace the default with `UnconfiguredTokenStore` (`isAvailable()` → false; `getToken()` → `''`; `readToken()` → `{status:'unreadable', reason:'unavailable'}`; `setToken()` → throws `Error('Steam token store not installed')`; `clearToken()` → no-op + `logWarning`). Delete `ElectronTokenStore`, `encryptToken/decryptToken/encryptionAvailable`, the `safeStorage` import and, if unused elsewhere, `TOKEN_PREFIX`. Keep `clearOrphanedElectronToken`. Update the bootstrap comment (:1108, :1150) that names `ElectronTokenStore`.
- **Tests:** `storeManagers/steam/__tests__/tokenStore.test.ts` asserts the plaintext fallback as "DELIBERATE, do not remove" (header :6-9): rewrite it to assert fail-closed. `electronUntouched.test.ts`, `user.test.ts`, `credentialsMissing.test.ts`, `steamStartupKeyringDeferral.test.ts` reference `ElectronTokenStore`; suites that reach `getTokenStore()` without calling `setTokenStore(fake)` will now see the unconfigured store, so add a shared `beforeEach(() => setTokenStore(fakeStore))`. `devSecretVault.test.ts` and `keyringTokenStore.test.ts` spy on `setTokenStore` and are unaffected. Add a bootstrap-order test: `getTokenStore()` is not the unconfigured store after `init()`.

### 7. D-13 name-based kills and spawn helpers
Sites [VERIFIED: grep]: `utils.ts:972-985` `killPattern` (`pkill -f <pattern>`; Windows `Stop-Process -name`); callers: `handleExit` `utils.ts:326` (loops `['legendary','gogdl','nile']`, then `callAllAbortControllers()` at ~:333), `sideload/games.ts:93` (`killPattern(basename(executable))`, then `shutdownWine` if non-native), `nile/games.ts:596` (`isLinux ? this.id : 'nile'`), `legendary/games.ts:1142` (`isWindows ? 'legendary' : this.appName`). Tests mocking it: `downloadmanager/__tests__/utils.test.ts`, `__tests__/launcher_callRunner.test.ts`.
- **Spawn helpers:** `callRunner` (`launcher.ts:1784`, spawn at **:1868**) is the single helper for legendary/gogdl/nile commands and native sideload launches (`storeManagerCommon/games.ts:264`). It already spawns with `signal: abortController.signal` (so `callAbortController(abortId)` SIGTERMs exactly that child) and `abortId = options.abortId || appName || random`. `runWineCommand` (`launcher.ts:1556`, spawn :1646, has an `onSpawn(child)` hook) launches Wine games. Neither uses `detached`, so children stay in the sidecar's process group, which `shutdown_child` kills on quit.
- **Minimal registry (recommended):** new `backend/trackedChildren.ts` (sibling of `longLivedChildren.ts`, same style): `trackChild(child, {runner, key}) → untrack`, auto-untrack on `'close'`/`'error'`; `killTracked({runner?, key?})` sends SIGTERM to `child.pid` (Windows: `spawnSync('taskkill', ['/PID', pid, '/T', '/F'])`); `killAllTracked()`. Call `trackChild` in `callRunner` right after the spawn (key = `abortId`/`appName`; sideload native launch must pass an explicit key because `appNameFromCommandParts` yields `''` for sideload) and in `runWineCommand`'s spawn. Then: `handleExit` → `killAllTracked()` (then the existing `callAllAbortControllers()`), `stop()`s → `killTracked({runner, key: appName})`; delete `killPattern`, its `utils.ts:1944` export and the powershell path. On Windows `callRunner` wraps the runner in `powershell Start-Process -Wait` (:1815-1830), so the tracked PID is powershell's: that is why `/T` (tree) is required.
- **Phase 66 has not landed** (`.planning/phases/66-*` contains no plans). The registry should be a plain module with a tiny interface so 66's runner can absorb it.
- Sideload `stop()` for Wine games: `shutdownWine` (`wineserver -k`) already stops the prefix; the registry kill covers the spawned wrapper. Test spawns use `createFakeHomeProfile()` (`src/backend/testUtils/fakeHomeProfile.ts:192`); prefer pure-registry tests with a fake `ChildProcess` EventEmitter and one real-spawn arm (`sleep 30`) with the fake HOME to prove tree/PID kill; assert no `pkill` string remains in `src` (a source-pin test).

### 8. D-01/D-03 shell side
- **Reader/EOF:** `sidecar.rs:336` `start_reader` is a plain `thread::spawn`; the loop ends at EOF *or* on `Err(_) => break` (a non-UTF-8 line), then `drain_pending_invokes` (:545-549). The new branch goes right after that loop. Because the `Err` break can happen while the sidecar is alive, the handler should confirm death before claiming it (`child.try_wait()` after a short bounded wait; if still alive, kill the group first so the dialog is truthful).
- **Shutdown entry points (all must set the flag before the sidecar closes):** (1) `RunEvent::ExitRequested` (`main.rs:1773`) and `RunEvent::Exit` (:1788 → `state.shutdown_child()`); (2) `app_exit` arm `store_embed.rs:~2193` (`app.exit(0)`); (3) `app_relaunch` arm :2238 (`app.restart()`; the existing comment proves `restart()` takes the background-thread path and fires `RunEvent::Exit`); (4) `quit_via_sidecar` (`terminate_veto.rs:54`, used by Cmd+Q, Dock Quit, tray Quit `main.rs:1477`, window close :1346) only *asks* the sidecar; it ends via `app_exit`. (5) **There is no updater restart in this codebase** (no `UpdaterExt`, no JS call): D-03's "updater restarts" is vacuous today, so add nothing for it but make the flag setter reusable. Simplest correct placement: `begin_shutdown()` as the first statement of `shutdown_child` (covers every exit via `RunEvent::Exit`) **and** in the `AppExit`/`AppRelaunch` arms and `ExitRequested` (covers the window where the sidecar exits before `Exit` fires). `SidecarState` is constructed in exactly one place (`main.rs:859`).
- **Dialog API already in use:** `main.rs:46` `use tauri_plugin_dialog::{DialogExt, MessageDialogKind}` and `main.rs:834-841` (`app.dialog().message(..).kind(MessageDialogKind::Error).blocking_show()`); the plugin supports `.buttons(MessageDialogButtons::OkCancelCustom("Restart","Quit"))` (`tauri-plugin-dialog-2.7.2/src/lib.rs:125,166`). `blocking_show()` must not run on the main thread; the reader thread is a std thread, which is correct. Choice: `true` (first button) → relaunch via `app.restart()` (same as `app_relaunch`, which re-enters `RunEvent::Exit` → `shutdown_child` on the dead child: `kill(-pgid)` yields ESRCH and is logged/swallowed); `false` or dismissal → `app.exit(0)` (Quit is the safe default for an app with no backend). Set the flag before either action so the dialog cannot re-fire. Show the dialog at most once (guard with an `AtomicBool`/`Once`).
- **How to test "normal quit raises no dialog":** the `on_sidecar_eof` seam in Pattern 1 plus a source-pin test (repo precedent `tauriShellSource.test.ts`) that the exit arms call `begin_shutdown`. A live event loop cannot be driven from `cargo test` (documented at `store_embed.rs:2236`), so add a UAT item (macOS): quit via Cmd+Q, tray Quit and red X, observe no dialog; then `kill -9` the sidecar PID and observe the dialog. Follow the UAT shape convention.

### 9. D-20 Windows Job Object
- **Current state:** `shutdown_child` `#[cfg(not(unix))]` arm is only `child.kill()` + `child.wait()` (`shell_state.rs:110-121`); `configure_sidecar_process_group` is a no-op on non-unix (`sidecar.rs:210`). Spawn site `main.rs:829` (`spawn_sidecar(app.handle())`), then `child.stdin/stdout/stderr.take()` (:845-856), then `SidecarState` construction (:859).
- **Crates:** Cargo.toml already has `[target.'cfg(windows)'.dependencies] windows-sys = "0.60"` with 9 features (`Win32_Foundation`, `Win32_System_Threading`, ...). Add **one feature: `Win32_System_JobObjects`** (it exists in windows-sys-0.60.2: `Cargo.toml:217`; `CreateJobObjectW`, `SetInformationJobObject`, `AssignProcessToJobObject`, `JOBOBJECT_EXTENDED_LIMIT_INFORMATION`, `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 8192`, `JobObjectExtendedLimitInformation = 9` all verified in the vendored source). No new crate name, so `cargoFeatures.test.ts`'s crate-name pin is unaffected (re-run to prove). The `windows` 0.61 crate is also present but the file's own stated preference is `windows-sys` for narrow Win32 FFI.
- **Design:** after `spawn_sidecar` returns, `create_kill_on_close_job()` → `CreateJobObjectW(null, null)`, `SetInformationJobObject(job, 9, &info, size_of)` with `LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, `AssignProcessToJobObject(job, child.as_raw_handle())` (`std::os::windows::io::AsRawHandle`). Store the job handle (`OwnedHandle`) in `SidecarState` (`#[cfg(windows)] job: Option<OwnedHandle>`) for the process lifetime. **On any failure log and continue** (fall back to today's `child.kill()`), never panic or `?` on this path (mirrors the `blocking_show` + `exit(1)` discipline at `main.rs:815-843`). In `shutdown_child`'s Windows arm: `child.kill()`, then drop/close the job handle so any survivors die.
- **Inheritance / breakaway:** a child created by a process in a job is in the same job (and nested descendants too) unless the job sets `JOB_OBJECT_LIMIT_BREAKAWAY_OK`/`SILENT_BREAKAWAY_OK` *and* the creator passes `CREATE_BREAKAWAY_FROM_JOB`. Do **not** set either flag, so legendary/gogdl/nile and the `powershell Start-Process` wrappers cannot escape. libuv's `detached: true` does not set `CREATE_BREAKAWAY_FROM_JOB` (from memory of libuv `process.c`; [ASSUMED]), so Node `detached` children also stay in the job. Because `KILL_ON_JOB_CLOSE` fires when the *last handle closes*, it also kills everything if the shell itself crashes or is killed.
- **Race:** assignment is after process creation, so a grandchild spawned in the first milliseconds would be missed. The Node sidecar spawns no children during its boot, so this is theoretical; document it. (`CREATE_SUSPENDED` is unavailable through `std::process::Command`.)
- **Nested jobs:** supported since Windows 8; on Windows 10/11 `AssignProcessToJobObject` works even if the shell was itself launched inside a job (Explorer, some installers). If it fails with ACCESS_DENIED, the log line is the diagnostic.
- **Behavior change to disclose:** games launched by the sidecar on Windows become job members and die when GameLib quits (today they survive; Unix already kills the group via SIGTERM to `-pgid`, so this is parity). The existing "pending operations, are you sure?" confirm (`utils.ts:~300`) covers running games on quit. Flag to the operator (Open Question 3).
- **Verification:** compile-check only in CI (the Windows leg already runs `cargo test --bin gamelib-shell`, which compiles `cfg(windows)` code). Manual UAT on the operator's PC: launch, start a legendary/gogdl operation (or a game), quit, Task Manager shows no `legendary.exe`/`gogdl.exe`/`powershell.exe`/game child; second arm: end the GameLib shell process from Task Manager and confirm the same. Write it in `### N.` / inline `expected:` / `result: pending` shape.

### 10. D-17/18/19 audit, overrides, deny, Dependabot
- **`pnpm audit --prod` today (pnpm 10.28.0, 2026-11-08):** 21 advisories: **5 high, 10 moderate, 6 low** (CONTEXT said 22/6 on 11-07; one fewer high). Highs: `undici` ×3 (TLS validation bypass `GHSA` >=4.0.0 <6.29.1; two DoS) via `@xhayper/discord-rpc>@discordjs/rest`; `source-map-js` <1.2.2 via `sanitize-html>postcss`; `follow-redirects` <=1.16.1 via `axios`. Moderates in D-19 scope: `react-router` ×2 (patched >=7.18.0), `i18next-http-backend` (<3.0.5), `undici` WebSocket. Out of D-19 scope but trivially fixable and will show as warnings: `uuid` <11.1.1 (via `short-uuid`), `ip-address` <=10.7.3 (via `steam-session>socks-proxy-agent>socks`), `fast-uri` ×4 (override `^3.1.8` is below the 3.1.9 fix → bump the override), `sanitize-html` 2.18.0 (→2.18.1, it is a direct `^2.18.0` dep so `pnpm update`), lows (`deepmerge` unpatched, `i18next-http-backend` 4.0.2-4.0.4 fixes).
- **Existing overrides** (`package.json` `pnpm.overrides`): `protobufjs@^7`, `steam-appticket`, `adm-zip`, `@xmldom/xmldom@^0.8`, `undici@^6: ^6.28.1`, `ws@^8`, `ajv@^8`, `fast-uri@^3: ^3.1.8`, `socks@^2`, `lodash@^4`, `nanoid@^3`, `diff@^5`, `yaml@^1`. Edit `undici@^6` → `^6.29.1`; add `follow-redirects@^1: ^1.16.2` and `source-map-js@^1: ^1.2.2`; optionally `fast-uri@^3: ^3.1.9`.
- **react-router is the risky bump:** 31 files import `react-router-dom` (v6 API; `createHashRouter` at `App.tsx:6`). v7's `react-router-dom` is a re-export of `react-router`; peers react>=18 (repo is React 18.3.1) and node>=20. v6.30 already shipped the `v7_*` future flags, so a clean 6.30 app usually migrates by bumping; verify with typecheck + the router tests + a live boot, and watch `startTransition`-wrapped navigation changes. [ASSUMED for the exact v6→v7 behavior list; verify against the upgrade guide at plan time.] Remove `@types/react-router-dom` (v5 types).
- **i18next-http-backend:** the renderer passes `loadPath` as a *function* taking arrays (`frontend/index.tsx:202-210`); 3.0.5 added strict validation of `lng`/`ns` (rejects `?`, `#`, `%`, `@`, whitespace, separators; 3.0.6 re-allows `/` in `ns`). Shipped locale codes include `pt_BR`-style names (underscore, allowed). Live-check that locales load on boot.
- **cargo-deny measured baseline** (`cargo-deny 0.20.2`, `--manifest-path src-tauri/Cargo.toml`, default targets): with `unmaintained="workspace"`/`unsound="workspace"` → **10 `error[vulnerability]`, 1 yanked warning (`clipboard-win`), 0 unmaintained/unsound**. With `"all"` the Tauri/gtk3-era transitive tree adds ~9 unmaintained (`unic-*`, `zvariant*`, `proc-macro-error`...) and 3 unsound errors, which is why `workspace` is the right bar. The 10 vulns: rustls (RUSTSEC-2026-0285/0346/0348/0349), rustls-webpki (0382), webpki-root-certs (0383), zip 4.6.1 (0367/0368/0369/0429; only dependent: `tauri-plugin-updater`). Fix: `cargo update -p rustls -p rustls-webpki -p webpki-root-certs` resolves 6. **The 4 zip advisories need `zip >= 9`, only obtainable through a newer `tauri-plugin-updater`**: add `ignore = [{ id = "RUSTSEC-2026-0367", reason = "..." }, ...]` with the reason "zip is reachable only via tauri-plugin-updater's extract path; no code in this app calls the updater (no JS importer, no UpdaterExt use); revisit when tauri-plugin-updater adopts zip 9", plus `unused-ignored-advisory = "warn"`. This is an assumption the operator should confirm (A2). Check `cargo update -p tauri-plugin-updater --dry-run` at plan time in case a release already adopts zip 9.
- **`src-tauri/deny.toml`:**
  ```toml
  [advisories]
  yanked = "warn"
  unmaintained = "workspace"
  unsound = "workspace"
  ignore = [
    { id = "RUSTSEC-2026-0367", reason = "zip only via tauri-plugin-updater; updater never invoked" },
    # ... 0368, 0369, 0429
  ]
  ```
  (`version`, `vulnerability`, `notice`, `severity-threshold` are removed/no-ops in 0.20; do not write them.) cargo-deny has **no severity gating**, so "blocks on high" is realized as "blocks on any vulnerability, reasoned ignores for the rest". [CITED: embarkstudios.github.io/cargo-deny/checks/advisories/cfg.html] The advisory DB is fetched from GitHub at run time, so the job can go red with no repo change when a new RUSTSEC lands: say so in the workflow comment (this repo's standing "state what the gate does not catch" rule); consider `continue-on-error` only if the operator prefers warn-first.
- **CI audit job:** new job in `lint.yml` or a new `audit.yml` (ubuntu-latest, `./.github/actions/install-deps` is overkill: `pnpm/action-setup` + `pnpm audit --prod --audit-level high` needs only the lockfile). A second non-blocking step `pnpm audit --prod || true` (or `continue-on-error: true`) prints the warns. `pnpm audit` exits non-zero at the chosen level. Note `pnpm audit` depends on the registry's audit endpoint (worked today).
- **Dependabot:** write `.github/dependabot.yml` with `open-pull-requests-limit: 0` for `npm` (`/`) and `cargo` (`/src-tauri`); the `directory` must point at the manifest. Security updates additionally require the repo setting (Settings → Advanced Security → Dependabot security updates → Enable), an admin action the plan must list as a human step. [CITED: docs.github.com/en/code-security/dependabot/dependabot-security-updates/configuring-dependabot-security-updates] Whether the `cargo` ecosystem resolves `src-tauri/Cargo.lock` inside a non-root manifest: it does via `directory`. There is no existing `.github/dependabot.yml` (ls confirmed).

### 11. D-14 Linux leg
- **Current `rust-test.yml`:** one job `cargo-test`, matrix `os: [windows-latest, macos-latest]`; steps: checkout → `./.github/actions/install-deps` (pnpm/node/`pnpm install`/`download-helper-binaries`) → `pnpm exec vite build` → `pnpm build:sidecar-sea` → rust-toolchain stable → rust-cache (`./src-tauri -> target`) → `cargo test -p gamelib-scan -p gamelib-scan-cli` → placeholder externalBin (node script, derives triple from `rustc -vV`; works on Linux) → `cargo test --bin gamelib-shell` → macOS-only pinned clippy ratchet (`if: runner.os == 'macOS'`). The header comment's caveat (a) names the missing Linux leg and must be updated, as must caveat (f)/(g) wording if touched.
- **Recommendation (minimizes the merge with the parallel clippy-Windows branch):** add `ubuntu-latest` to the matrix (one-line edit; the clippy steps are already `runner.os == 'macOS'`-gated so Linux skips them) and insert ONE new step directly after checkout: `if: runner.os == 'Linux'` → `sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf xdg-utils` (the exact list `release-tauri.yml:236` ships with, proven to build the crate; release builds on `ubuntu-22.04` for a glibc 2.35 floor, but a compile-check leg has no such floor, so `ubuntu-latest` is acceptable; if `libwebkit2gtk-4.1-dev` is absent on a future image, pin `ubuntu-22.04` like release). Add `cargo check --all-targets` in `src-tauri` before `cargo test --bin gamelib-shell` so a compile break is reported separately from a test failure. Rebase risk: the matrix line and the area near the end of the file; keep the new steps contiguous and commented so a textual merge is trivial.
- **Does `cargo test --bin gamelib-shell` plausibly work on Linux?** Unknown. 70 `cfg(target_os = "linux")` sites in `main.rs`, 67 in `store_embed.rs`, 5 in `wake_lock.rs` are never compiled in CI today. Unit tests are pure-function, but anything touching GTK needs a display and the `gtk = "0.18.2"` Linux dependency links against system libs the apt list provides. Cannot be measured on this macOS host. **Plan for it empirically:** step 1 lands the leg with `cargo check --all-targets` as a hard failure and `cargo test --bin gamelib-shell` as `continue-on-error: true`; the plan's verification is a pushed run (workflow_dispatch) read via `gh run view`; a follow-up task in the same plan either removes `continue-on-error` (green) or records the failing tests as a todo (with the three-key frontmatter) and keeps the check hard. Compile errors expected on first run (never compiled): the plan must budget for fixing `cfg(target_os="linux")` compile breaks in the same plan (D-14 says this leg unblocks 71).
- **Docs follow-ups required by D-14:** update `.planning/phases/71-rust-shell-module-decomposition/71-CONTEXT.md` D-02 note and the ROADMAP Phase 71/72 text when the leg lands.

## Runtime State Inventory

Not a rename/refactor phase. The only persisted-state touch is the Steam token: a legacy plaintext `refreshToken` key in `steam_store/config.json` is still deleted by `clearOrphanedElectronToken()` (kept per D-12). Stored data / live service config / OS-registered state / env vars / build artifacts: none affected beyond `src-tauri/Cargo.lock` and `pnpm-lock.yaml` regeneration (verified by inspection).

## Common Pitfalls

### Pitfall 1: Dropping `opener:default` silently kills `target=_blank` links
**What goes wrong:** Changelog and sanitized-HTML links stop opening; no error surfaces except a denied-invoke console message.
**Why:** `tauri-plugin-opener` injects a click handler that needs the grant (see Evidence 1).
**How to avoid:** `Builder::new().open_js_links_on_click(false)` plus a renderer delegated handler to `openExternalUrl`; UAT clicks one of each link kind.
**Warning signs:** `plugin:opener|open_url` "not allowed" in the webview console on boot or click.

### Pitfall 2: A "clean" cargo-deny baseline that isn't
**What goes wrong:** Turning the gate on with 10 existing errors makes main red on day one.
**How to avoid:** `cargo update` the rustls trio, ignore the four zip IDs with reasons, then run `cargo deny check advisories` locally (installed OK: `cargo install cargo-deny --locked`) before enabling the job.

### Pitfall 3: The EOF race on quit
**What goes wrong:** Setting the flag only in `RunEvent::Exit` still lets a sidecar that exits *first* (or `kill -9` during quit) raise the dialog while the app is leaving.
**How to avoid:** set it at `ExitRequested`, `app_exit`, `app_relaunch` and the top of `shutdown_child`. Also confirm death on `Err(_)` break (non-UTF-8 line) before claiming it.

### Pitfall 4: `detached` children escape the quit reap
Covered under Anti-Patterns.

### Pitfall 5: Fatal handler that can hang
**What goes wrong:** Awaiting a wedged disk log before exiting leaves a broken sidecar alive, the exact failure D-04 targets.
**How to avoid:** bounded `Promise.race`, `unref()`ed cap timer, re-entry exits immediately, exit injected for tests.

### Pitfall 6: `canonicalize()` on Windows returns `\\?\` paths
Validate on the canonical form, hand the original path to the opener. Also reject UNC/`//` prefixes explicitly (the `smb://` analogue).

### Pitfall 7: `.app` is a directory
A "directory only" rule opens/launches `.app` bundles on macOS. The extension rule and symlink resolution are the actual control (parity test must include a symlink to a `.app`).

### Pitfall 8: Test suites relying on the default token store
After D-12 any suite that reaches `getTokenStore()` without installing a fake gets the throwing/closed store. Add the shared `beforeEach`.

### Pitfall 9: react-router 7 and i18next-http-backend need a live boot
Typecheck/jest cannot prove locale loading or router behavior. Add them to the same `pnpm tauri:dev` live gate as D-10 (`tauri dev` does not rebuild the sidecar; restart it).

### Pitfall 10: Gates that fail on removal
`knip` ratchet (vanished finding), `check:ipc-contract` (regenerate after dropping `removeFolder`), `boundaries`, `clippyRatchet` (new Rust must not add warnings; the macOS ceiling is an equality ratchet), `prettier --check` on the written paths per the repo convention.

### Pitfall 11: Quit-time kill changes
Replacing `pkill -f` with tracked PID drops the "kill a runner that this session did not spawn" behavior (e.g. a legendary left over from a previous sidecar). That is intended; mention in the SUMMARY.

## Code Examples

### Dependabot security-only (`.github/dependabot.yml`)
```yaml
# Source: docs.github.com (configuring-dependabot-security-updates): open-pull-requests-limit: 0
# disables version updates; security updates still open PRs once enabled in repo settings.
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly }
    open-pull-requests-limit: 0
  - package-ecosystem: cargo
    directory: /src-tauri
    schedule: { interval: weekly }
    open-pull-requests-limit: 0
```

### cargo-deny + audit jobs
```yaml
# Source: github.com/EmbarkStudios/cargo-deny-action (v2); pnpm audit exit code is non-zero at/above --audit-level
  cargo-deny:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: EmbarkStudios/cargo-deny-action@v2
        with:
          manifest-path: src-tauri/Cargo.toml
          command: check advisories
          arguments: ''
  pnpm-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
      - run: pnpm audit --prod --audit-level high
      - run: pnpm audit --prod || true   # warn-only view of the rest
```
(`pnpm/action-setup@v4` and `checkout@v6` match the versions in `.github/actions/install-deps/action.yml` and the other workflows.)

### Fatal-on-uncaught with bounded flush: see Evidence 2.

### Opener builder (main.rs:783)
```rust
.plugin(tauri_plugin_opener::Builder::new().open_js_links_on_click(false).build())
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| cargo-deny `vulnerability = "deny"` / `severity-threshold` | removed in 0.20 (all vulnerabilities fail; `ignore` list is the only escape) | No severity bar possible for Rust |
| `child.kill()` only on Windows | Job Object `KILL_ON_JOB_CLOSE` | Reaps grandchildren and survives shell crash |
| name-based `pkill -f` | tracked PID | No collateral kills |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Deleting the renderer `removeFolder` channel (instead of containing against install roots) is acceptable to the operator | Evidence 4 | Locked D-09 says contain; planner must confirm or fall back to the installed-paths union |
| A2 | Ignoring the four `zip` RUSTSEC IDs is acceptable because the updater is never invoked | Evidence 10 | If the updater is used in a way not found by grep (e.g. `tauri.conf` auto-check), the ignore hides a real exposure |
| A3 | macOS bundle-extension denylist (`prefpane`, `saver`, ...) is the right extra set beyond `.app` | Evidence 3 | A launchable bundle type is missed (low impact: still directories) |
| A4 | libuv `detached` does not set `CREATE_BREAKAWAY_FROM_JOB` | Evidence 9 | Detached children could escape the Job Object; UAT catches it |
| A5 | react-router v6.30 → 7.18 is a drop-in bump for this app's usage | Evidence 10 | Router regressions; caught by typecheck/tests/live boot |
| A6 | stderr write callback is a sufficient flush for the fatal path | Evidence 2 | Last log line lost; sink promise is the second path |
| A7 | Games becoming Job members (die on quit) on Windows is acceptable | Evidence 9 | Behavior change for running games; operator decides |
| A8 | `cargo test --bin gamelib-shell` may fail on Linux first run | Evidence 11 | Plan handles via `continue-on-error` then triage |

## Open Questions

1. **D-09 vs evidence (A1).** Recommend deleting the renderer `removeFolder` channel. If the operator wants D-09 literally, the only non-circular roots are installed games' `install_path` and queued `params.path`, never `defaultInstallPath`.
2. **zip advisories (A2).** Ignore with reason vs. removing `tauri-plugin-updater` (out of scope) vs. waiting for an upstream release; check `cargo update -p tauri-plugin-updater --dry-run` at plan time.
3. **Windows games dying on quit (A7).** Accept parity with Unix, or set `JOB_OBJECT_LIMIT_BREAKAWAY_OK` and have games opt out (needs `CREATE_BREAKAWAY_FROM_JOB`, which Node cannot pass).
4. **i18next-http-backend 3.x vs 4.x** (lows). 3.0.6 per D-19; 4.0.10 clears everything.
5. **Linux `cargo test` viability** is unknowable here; resolved empirically by the first CI run.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node / pnpm | all JS work | yes | 22.23.4 / 10.28.0 | — |
| cargo (macOS arm64) | Rust work, `cargo check` | yes | present | — |
| cargo-deny | local baseline run | not installed globally; built in scratchpad (0.20.2) | 0.20.2 | `cargo install cargo-deny --locked` |
| Linux host / apt deps | Linux leg verification | no (macOS host) | — | verify only via CI run |
| Windows PC | D-20 UAT, Windows compile | operator's PC only | — | manual UAT item |
| GitHub admin | enable Dependabot security updates | operator action | — | human step |
| ctx7/Context7, slopcheck | docs / package gate | not used (no new packages; docs read from vendored crate sources and official pages) | — | — |

**Missing with no fallback:** none blocking planning. **Human steps:** enable Dependabot security updates in repo settings; Windows UAT; macOS live boot.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | jest 29.7 (ts-jest, projects: backend/common/frontend/preload/meta/relay) + `cargo test --bin gamelib-shell` |
| Config file | `/Users/graysonmitchell/Projects/GameLib/jest.config.js`; Rust tests are inline `#[cfg(test)] mod` |
| Quick run command | `pnpm exec jest <path> --silent` ; `cd src-tauri && cargo test --bin gamelib-shell <filter>` |
| Full suite command | `pnpm test:ci && pnpm codecheck && pnpm lint && pnpm find-deadcode && pnpm boundaries && pnpm check:ipc-contract && pnpm smoke:sidecar && (cd src-tauri && cargo test --bin gamelib-shell)` |

### Phase Requirements → Test Map (no requirement IDs assigned; keyed by decision)
| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|-------------|
| D-14 | Linux leg compiles/tests | CI | `gh workflow run rust-test.yml` + `gh run view` | Wave 0 (workflow edit) |
| D-17/18/19 | audit clean of highs; deny clean | CLI | `pnpm audit --prod --audit-level high`; `cargo deny --manifest-path src-tauri/Cargo.toml check advisories` | deny.toml new |
| D-19 | router + locales still work | jest + live | `pnpm exec jest src/frontend -t router`; live boot | existing |
| D-06/07/08 (TS) | URL + folder policy, reveal routing | jest | `pnpm exec jest src/backend/sidecar/__tests__/openPolicy.test.ts` | Wave 0 new |
| D-06 (Rust) | `open_path_policy_check` parity | cargo | `cargo test --bin gamelib-shell shell_open` | Wave 0 new |
| D-06 parity | same fixtures both layers | jest + cargo | both above read `openPolicyCases.json` | Wave 0 new |
| D-09 | channel removed; helper async; no timers | jest | `jest downloadqueue shellFilesFlows ipcSchemas/shellFiles` + `pnpm check:ipc-contract` | update existing |
| D-10 | capabilities pinned; opener builder; link handler | jest + live | `jest src/backend/__tests__/capabilitiesDefault.test.ts tauriShellSource.test.ts`; `pnpm tauri:dev` | update existing |
| D-11 | handlers gone, shortcuts tests repointed | jest + knip | `jest src/backend/shortcuts src/backend/sidecar/__tests__`; `pnpm find-deadcode` | update existing |
| D-12 | store fail-closed | jest | `jest src/backend/storeManagers/steam/__tests__/tokenStore.test.ts` + suites in Pitfall 8 | rewrite |
| D-13 | tracked kills, no `pkill` | jest | `jest src/backend/__tests__/trackedChildren.test.ts launcher_callRunner.test.ts` | Wave 0 new (fake HOME for real-spawn arm) |
| D-04 | fatal uncaught, bounded flush | jest | `jest src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts` | extend |
| D-01/03 | no dialog on quit; dialog on death | cargo + UAT | `cargo test --bin gamelib-shell on_sidecar_eof` ; UAT (kill -9, Cmd+Q) | Wave 0 new |
| D-20 | Job Object compiles; reaps | Windows CI compile + manual UAT | `cargo test --bin gamelib-shell` on windows-latest; UAT in `72-UAT.md` | manual |

### Sampling Rate
- **Per task commit:** the touched test file(s) via the quick command, plus `npx prettier --check <written paths>` (scoped per repo convention).
- **Per wave merge:** the full suite command above (jest `--maxWorkers=2` is the CI shape).
- **Phase gate:** full suite green + live `pnpm tauri:dev` boot (D-10/react-router/i18n) + macOS UAT (dialog) + Windows UAT (Job Object) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/common/__fixtures__/openPolicyCases.json` + `src/backend/sidecar/__tests__/openPolicy.test.ts`
- [ ] `src-tauri/src/shell_open.rs` with `#[cfg(test)]` parity tests
- [ ] `src/backend/__tests__/trackedChildren.test.ts`
- [ ] `on_sidecar_eof` / `begin_shutdown` Rust tests
- [ ] `src-tauri/deny.toml`, `.github/dependabot.yml`, `72-UAT.md` (shape per convention)
- [ ] Shared `setTokenStore(fakeStore)` test helper for steam suites

## Security Domain

`security_enforcement` is not set to false in `.planning/config.json`, so included.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (Steam refresh token) | fail-closed `TokenStore`, keyring-backed install (D-12) |
| V4 Access Control | yes | Tauri capability ACL trimmed (D-10); Rust open-path policy (D-06) |
| V5 Input Validation | yes | zod schemas (Phase 67) as shape layer + `openPolicy` semantic layer; `assertPlausibleAbsolutePath`/`assertContainedPath` |
| V6 Cryptography | yes (TLS stack) | dependency patches (rustls trio, undici) not custom crypto |
| V10/V14 Supply chain / config | yes | audit gate, cargo-deny, Dependabot |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Renderer-supplied URL opens `file://`/`smb://` | Elevation | scheme allow-list in Rust + sidecar |
| Renderer-supplied path launches `.app`/exe | Elevation | dir-only, bundle-extension rejection, files revealed |
| Arbitrary recursive delete | Tampering | remove the renderer channel (or contain) |
| Remote content in `main` inheriting grants | Elevation | trim `opener`/`shell`/`updater` grants, `withGlobalTauri:false` |
| Name-based kill hits unrelated process | DoS | tracked PID |
| Orphaned CLI processes holding auth | Info disclosure | Job Object / group reap |
| Silent dead backend | Repudiation/DoS | EOF dialog |
| Plaintext token written | Info disclosure | fail-closed store |
| Known-vulnerable dependencies | multiple | bumps + gates |

## Recommended Plan / Wave Split (honors D-16)

| Wave | Plan | Content | Depends |
|------|------|---------|---------|
| 1 | 72-01 | Linux leg in `rust-test.yml` (matrix + apt + `cargo check --all-targets`, test `continue-on-error` then triage); fix any Linux compile breaks; update 71-CONTEXT D-02 note + ROADMAP | none |
| 1 | 72-02 | JS bumps: overrides, follow-redirects/source-map-js/undici, react-router-dom 7, i18next-http-backend 3.0.6, remove importer-less npm packages; `cargo update -p` rustls trio; live-boot check of router + locales | none |
| 2 | 72-03 | Gates: `deny.toml` (+ reasoned zip ignores), cargo-deny job, `pnpm audit` job, `dependabot.yml`; human step: enable Dependabot security updates | 72-02 |
| 3 | 72-04 | Open policy: `shell_open.rs` (policy, arms, `mod` decl), sidecar `openPolicy.ts`, strict split, `showConfigFileInFolder` reveal, parity fixtures/tests, caller behavior-change notes | none |
| 3 | 72-05 | Capability trim + `withGlobalTauri:false` + opener Builder + renderer link handler + `capabilitiesDefault.test.ts`; live `pnpm tauri:dev` UAT item | 72-02 (npm removals) |
| 3 | 72-06 | Delete 14 `ipc_handler.ts` (+ repoint 2 shortcuts tests), token store fail-closed, `removeFolder` channel removal + async helper, knip baseline + `gen:ipc-contract` | none (touches `shellFiles` registration, so sequence after 72-04 if both edit `shellFilesFlowRegistration.ts`) |
| 4 | 72-07 | Dead sidecar: `shutting_down` flag, `on_sidecar_eof`, dialog, fatal `uncaughtException` with bounded flush; UAT (macOS) | none |
| 4 | 72-08 | `trackedChildren` registry, `callRunner`/`runWineCommand` hooks, replace 4 `killPattern` sites, delete `killPattern` | none |
| 5 | 72-09 | Windows Job Object (`Win32_System_JobObjects`, `SidecarState.job`, `shutdown_child` arm) + `72-UAT.md` Windows item | 72-07 (same `SidecarState`/`shell_state.rs`/`main.rs:859`) |

Same-file collisions to sequence: 72-04/72-06 (`shellFilesFlowRegistration.ts`), 72-05/72-04 (`main.rs`, `store_embed.rs`), 72-07/72-09 (`shell_state.rs`, `main.rs:859`, `sidecar.rs`). Groups remain independently mergeable (D-16).

## Project Constraints (from CLAUDE.md)
- Stack is React + TypeScript on Rust/Tauri; do not raise deviation from upstream Heroic as a caveat.
- `<verify>` blocks: scoped `npx prettier --check` over exact written paths (check `--file-info` first; omit if all ignored).
- Spawning child processes in `src/` or `meta/` tests: `createFakeHomeProfile()` (isolated by default, named real-profile arm only where justified).
- Sidecar timers/watchers/handles: `unref()`, no unbounded boot work; exit by event-loop drain at stdin EOF (the fatal-uncaught `exit(1)` is the one sanctioned explicit exit; document it).
- UAT items: `### N.` at column 0, inline `expected:`, `result:` opens with a status word.
- Todos created must carry `severity:`, `platform:`, `ready:` frontmatter.
- Say `/gsd-execute-phase` (hyphen). Dev launch is `pnpm tauri:dev` (never `tauri:dev:run`); `tauri dev` does not rebuild the sidecar.
- Do not read `graphify-out/GRAPH_REPORT.md`/`graph.json`.
- No direct repo edits outside a GSD workflow.

## Sources

### Primary (HIGH)
- Repository code (file:line evidence throughout; this session's greps and reads): `src-tauri/capabilities/default.json`, `tauri.conf.json`, `src-tauri/src/{main,sidecar,shell_state,store_embed,relay_commands,ipc_contract,terminate_veto}.rs`, `src/backend/{utils,launcher}.ts`, `src/backend/sidecar/{processGuards,bootstrap,shellFilesFlowRegistration,appShellFlowRegistration,rendererPathGuard,installFlowRegistration}.ts`, `src/backend/storeManagers/steam/tokenStore.ts`, `.github/workflows/{rust-test,release-tauri}.yml`.
- Vendored crate sources in `~/.cargo/registry`: `tauri-plugin-opener-2.5.4` (`lib.rs:182-236`, `init-iife.js`), `tauri-plugin-shell-2.3.5`, `tauri-plugin-dialog-2.7.2`, `windows-sys-0.60.2` (JobObjects).
- Tool runs: `pnpm audit --prod --json` (2026-11-08), `cargo-deny 0.20.2 check advisories`, `cargo update --dry-run`, `cargo tree -i`, `npm view`.
- embarkstudios.github.io/cargo-deny/checks/advisories/cfg.html ; github.com/EmbarkStudios/cargo-deny-action ; docs.github.com Dependabot security updates ; github.com/i18next/i18next-http-backend CHANGELOG.

### Secondary (MEDIUM)
- Node `fs.rm` retry semantics (nodejs.org docs, from knowledge, consistent with Node 22).

### Tertiary (LOW / ASSUMED)
- libuv detached flag behavior on Windows; macOS bundle-extension list; react-router v6→v7 specifics; stderr pipe flush semantics.

## Metadata

**Confidence breakdown:**
- Standard stack / bumps: HIGH (tool-verified)
- Architecture and caller evidence: HIGH (grep/read)
- Pitfalls: HIGH for opener init script, cargo-deny baseline, EOF race; MEDIUM for Windows Job semantics and Linux test viability

**Research date:** 2026-11-08
**Valid until:** 2026-11-15 for audit/cargo-deny lists (advisory DBs move daily); 30 days for the architecture findings.
