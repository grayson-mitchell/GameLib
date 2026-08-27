# Phase 35: Electron cutover — remove the Electron build - Context

**Gathered:** 2026-08-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Retire the Electron shell so Tauri is the only one. Concretely: delete the Electron main
process and its entry points, delete `electron-vite`/`electron-builder`, delete the preload
`contextBridge` path, remove `electron` from `package.json` entirely, and collapse the
`isTauri()` branches. Ship a packaged Tauri artifact as the only build.

This is the one phase that deliberately breaks the additive/reversible invariant every prior
phase preserved.

**In scope, beyond the deletion itself** (each decided below, not assumed):
- Real Tauri implementations for three subsystems that go permanently inert otherwise: tray
  icon + tray settings, `gamelib://` deep links, wake lock.
- `R-34.5-G1-PKG` — the packaged Tauri asset root, both halves (homed here 2026-08-23).
- Renderer bundler migration off `electron-vite` onto plain Vite.
- Linux/Windows/macOS artifact set and the `electron-updater` → Tauri-updater handover.
- SEAM.md convergence items deferred to the cutover: Phase 29 D-08, Phase 31 D-02, Phase 33 D-04.

**Not in scope:** new user-facing features; anything the four decided areas below do not name.

</domain>

<decisions>
## Implementation Decisions

### Dependency state — re-measured 2026-08-28, several roadmap premises have moved

These are findings, not decisions, but planning must start from them rather than from the
roadmap's prose. **Re-derive each before trusting it** — this repo has three recorded instances
of blocker records rotting silently.

- **D-00a — The IPC port gate is SATISFIED.** The roadmap's blocking line ("only 27 of 210 IPC
  channels are on the sidecar", 2026-07-25) is stale. `.planning/IPC-PORT-INVENTORY.md` marks
  slices 34.1–34.6 and the late-discovered set as PORTED, and the preload-surface gate was
  re-derived 2026-08-25 at commit `3b44e05da`: 220 distinct channels, **0 unbucketed**, with
  `--self-test` run first so the zero is a measurement rather than a vacuous pass. The
  inventory's `## Totals` table (225/52/159) is explicitly a **frozen Phase 34.1-era snapshot**
  and must not be read as current.
- **D-00b — `isTauri()` grew 3×.** The roadmap describes it as "10 files, ~42 refs, nearly all
  under `src/preload/`". Measured today: **28 files, 140 references**, spanning `src/preload/`,
  `src/frontend/`, `src/backend/sidecar/` and `src/common/`. Plan against the real number.
- **D-00c — Phase 34's final leg is UNMET.** Phase 34 reads 17/17 on disk, but plan `34-07`
  (the all-platform, Node-free, live tag-push gate) is recorded **user-deferred**. Windows and
  Linux Tauri builds are code-complete and CI-wired (3-OS `tauri-action` matrix, graceful skip)
  but have **never been live-verified**. With macOS x64 retired by 34.18, the roadmap's
  "all three platforms shipping on Tauri first" is true on paper only.
- **D-00d — The 34.6 live gate stands at FAIL 7/9** by standing operator decision, with Step 8
  (Epic logout, wry-layer) a genuine unaddressed failure. This phase inherits it; see D-09.
- **D-00e — GameLib has published no releases of its own.** `gh release list` returns only
  inherited upstream Heroic tags (v2.22.1 and older). There are no existing users on an Electron
  build, so the `electron-updater` → Tauri-updater handover is a clean break with **no migration
  path to design**. This removes a whole class of concern.
- **D-00f — The preload cut is small; the backend cut is not.** `src/preload/index.ts` documents
  in its own header that Tauri never loads that bundle — the renderer imports `./tauriAttach`
  directly. So deleting `contextBridge` is genuinely small. The weight is elsewhere: see D-01.

### Cut depth

- **D-01:** Full de-Electron. `electronStub.ts` is DELETED, all 67 files rewritten.
  `electronStub.ts` is not a small stub — it is a **build-time alias for `electron` across the
  entire sidecar** (`--alias:electron=./src/backend/sidecar/electronStub.ts`), and **67 files
  under `src/backend/` import from `'electron'`**. The alias is load-bearing in **three** build
  paths: `meta/buildSidecarSea.ts`, `meta/esbuildWorkerBundleShared.ts:290`, and
  `meta/buildDecompressWorkerDev.ts`. All three must be handled.
  *Rejected: keeping it as a permanent first-party shim (smaller, but leaves `from 'electron'`
  lying about provenance); keeping everything as-is (leaves the phase goal unmet).*

- **D-02:** One module, same 22 exports. `electronStub.ts` becomes a single module (e.g.
  `src/backend/platform/index.ts`) exporting the same names: `app`, `dialog`, `shell`,
  `Notification`, `safeStorage`, `clipboard`, `Tray`, `BrowserWindow`, `session`, `screen`,
  `net`, `Menu`, `protocol`, `powerSaveBlocker`, `nativeImage`, `ipcMain`, `handlerRegistry`,
  `listenerRegistry`, `bindTransport`. Every import site changes **exactly one string**:
  `from 'electron'` → `from 'backend/platform'`.
  **Rationale, and it is the load-bearing part:** this makes the 67-file diff mechanical and
  grep-verifiable, so the single largest diff in an irreversible phase is also the most boring
  one. No behavior moves.
  *Rejected: splitting by concern (diff stops being mechanical); no aggregate at all (moves
  LOGIC, not just imports, in the phase that cannot be cleanly rolled back).*

- **D-03:** `electron` leaves `package.json` completely, including devDependencies. The type
  surface moves first-party too: the **12 `import type ... from 'electron'` sites** and **32
  `Electron.` namespace references** get declarations in the platform module, and
  `src/backend/__mocks__/electron.ts` becomes the platform mock.
  **This makes the phase's success test a single grep** — `electron` appears nowhere in `src/`
  or `package.json` — rather than a judgment call.
  Note: `electronStub.ts` imports nothing from `electron` itself, so the module is already
  self-contained; only the consumers' type imports need homes.
  *Rejected: keeping `electron` as a types-only devDep (nothing structural then stops a future
  edit importing a VALUE and resurrecting the dependency).*

- **D-04:** `electron-store` disposition is Claude's discretion. See Claude's Discretion below.

### Dead Electron APIs

- **D-05:** Build three, accept and strip the rest. Tray icon + tray settings, `gamelib://`
  deep links, and wake lock get **real Tauri implementations**. Everything still inert after
  that — `session.fromPartition`, `screen.getPrimaryDisplay`, `net.request`, `Menu`, the
  `imagecache` protocol, `BrowserWindow.getAllWindows`, `clipboard.readText` — is accepted as a
  documented permanent gap, **and any UI affordance that lies about it is deleted.**
  **The phase rule this establishes: nothing ships an affordance it cannot honor.**

- **D-06:** Tray. `src/backend/tray_icon/tray_icon.ts` is a whole subsystem (tray menu,
  quick-launch entries, show/hide) that is entirely dead under Tauri, and
  `src/frontend/screens/Settings/components/TraySettings.tsx` is a **live settings panel the
  user can toggle that changes nothing**. Tauri v2 has a first-party tray-icon API. Implement it.
  Note the tray context menu is built with `Menu.buildFromTemplate` (`tray_icon.ts:113`) and
  calls `handleProtocol` (`tray_icon.ts:107`) — so D-06 and D-07 are coupled.

- **D-07:** Deep links. `protocol.handle('gamelib')` + `app.setAsDefaultProtocolClient('gamelib')`
  at `main.ts:502-507`, backing `gamelib://launch/...`. `src/backend/protocol.ts` has a full
  parser and `src/backend/__tests__/protocol.test.ts` an existing suite — both survive; only
  registration changes. `tauri-plugin-deep-link` is the analog.

- **D-08:** Wake lock. `powerSaveBlocker` is D-08-accepted-gap today, and **its own source
  comment says "revisit at the Phase 35 cutover"** — that is now. Real effect of leaving it: the
  machine can sleep mid-depot-download, and `launcher.ts:190` holds `prevent-display-sleep` while
  a game runs. `33-RESEARCH` rejected both existing Tauri wake-lock plugins on maintenance
  grounds, so this likely means a small first-party Rust binding rather than a plugin.

- **D-09:** Logout clears the embedded browser by DELETING THE WEBVIEW DATA DIRECTORY, not by
  clearing cookies. `session.fromPartition` (the D-09 accepted no-op) has exactly two real
  callers — `humble/user.ts` and `legendary/user.ts` — and that is the same surface as the
  folded Epic-logout todo and the standing 34.6 live-gate Step 8 FAIL. Wholesale directory
  removal sidesteps the known wry defect where cookie deletion **reports success without
  deleting**, and is strictly stronger than `clearStorageData()` (it takes localStorage and
  IndexedDB too).
  **Known costs to design around:** it is coarse — clearing one runner without the others
  requires per-runner data directories — and the webview may need to be closed first.
  *Rejected: fixing per-cookie deletion at the wry layer (open-ended platform debugging inside
  an irreversible phase, at exactly the point that is already failing); clearing tokens only
  (would ship the 34.6 Step 8 failure as permanent, and it is security-relevant on a shared
  machine).*

- **D-10:** Artwork disk cache is ACCEPTED as lost. `CachedImage` is already gated on
  `imageCacheSchemeAvailable()` (34.4.1 gap cycle 2, plan 27) and never emits `imagecache://`
  when the scheme is not served, so nothing is broken — artwork loads live over http(s).
  **State plainly in the release notes:** every library render re-fetches from the CDN, and
  **offline the library shows no art at all** where the Electron build showed cached art.
  Degrades gracefully rather than failing.
  *Rejected: re-implementing via Tauri's `register_uri_scheme_protocol` (adds Rust surface to a
  phase that is otherwise deleting things); sidecar-cached via IPC (round-trips per image are
  the wrong shape for a grid of hundreds of tiles).*

### Build + release

- **D-11:** Linux ships AppImage only; the Flatpak path is DELETED. Match what
  `tauri.conf.json` already targets (`["nsis","appimage","dmg"]`). Drop deb/rpm/pacman/tar.xz,
  and delete `flatpak/`, `dist:flatpak` and `flatpak:prepare` outright — that path is built
  around `com.heroicgameslauncher.hgl.yml` and Heroic's Flathub identity, which GameLib cannot
  publish under anyway. Adding deb/rpm later is a one-line `targets` change.
  *Rejected: AppImage+deb+rpm (three artifacts to smoke-test per release in an already-heavy
  phase); full parity incl. Flatpak (Flatpak packaging of a Tauri app with a bundled sidecar and
  helper binaries is its own project, for a channel GameLib has never used).*

- **D-12:** The release pipeline is smaller than the roadmap implies. `.github/workflows/release-tauri.yml`
  **already exists and already uses `tauri-action@v1`**, `verify:updater-key`, Apple/Windows
  signing gates, and the CrossOver index fetch. Its only Electron coupling is one step —
  line 165, `pnpm exec electron-vite build`. The `renderer:` block of `electron.vite.config.ts`
  (lines 75-101) is already plain-Vite-shaped: `root: '.'`, `input: index.html`, `outDir: 'build'`,
  `emptyOutDir: false`, `srcAliases`, and the `react`/`svgr`/`vite_plugin_react_dev_tools`/
  `preserveRunnerSymlinksPlugin` plugin set. Migrating it to `vite.config.ts` is close to a lift
  of that block. **`preserveRunnerSymlinksPlugin` must survive the move** — it exists because
  vite's `copyDir` dereferences symlinks and codesign then rejects the bundle (F-34.9-01).

- **D-13:** Updater handover is a clean break. Tauri's updater plugin is already configured in
  `tauri.conf.json` (pubkey, GitHub endpoint, `installMode: passive`) and `tauri-plugin-updater = "2"`
  is in `Cargo.toml`. Delete `src/backend/updater.ts` and the `electron-updater` dependency. Per
  D-00e there are no existing users, so no migration shim is needed.

- **D-14:** `isPackaged` source is Claude's discretion. See Claude's Discretion below.

- **D-15:** Dev loop shape is Claude's discretion. See Claude's Discretion below.

### Cutover gate + rollback

- **D-16:** The gate is a PACKAGED macOS arm64 live run, plus CI artifacts for Windows/Linux.
  A blocking human gate driven against a packaged `.app` — **not a dev build** — covering
  install, launch, library, login, and the newly-built tray/deep-link/wake-lock work. Windows
  and Linux prove out by the CI matrix producing installable artifacts plus a smoke launch.
  **Packaged-not-dev is the specific lesson `R-34.5-G1-PKG` teaches:** Phase 34.5's clean
  4 PASS / 0 FAIL was measured on a dev build and said nothing about the bundle.
  *Rejected: packaged live gates on all three platforms (blocks the cutover on Windows/Linux
  hardware access); closing 34-07 first as separate work (considered, and still available to the
  planner as a sequencing option if research finds the CI-artifact path insufficient).*

- **D-17:** Ordering and point-of-no-return are Claude's discretion. See Claude's Discretion.
  **The structural constraint the planner must respect:** the 67-file rewrite **cannot be
  additive**. Once `from 'electron'` becomes `from 'backend/platform'`, the Electron main process
  would run against the sidecar shim instead of real Electron. "Keep `pnpm start` working until
  the last plan" is therefore **not available** the way it was in every prior phase — the plan
  must state where the irreversible step is rather than pretending there isn't one.

- **D-18:** Parked bugs and folded todos are RE-TESTED BEFORE the delete, FIXED after. While
  both shells still build, run them against **both** and record which reproduce where. This is
  observation, not fixing, so it is cheap — and it captures an A/B signal that is **destroyed
  permanently the moment Electron is deleted** ("does this reproduce under Electron?" becomes
  unanswerable forever). Fixes land after, informed by that record. Anything found to be
  Tauri-only and severe may still block the D-16 gate.
  Named parked bug: `debug-uninstall-game-vanishes-parked` — still open, seven hypotheses
  eliminated, root cause not found.

- **D-19:** `R-34.5-G1-PKG` has two independent halves and both are required; either alone is
  inert. (a) Locale files are absent from the bundle entirely — `tauri.conf.json`'s
  `bundle.resources` lists only `["../build/bin/"]`, artifact-proven 2026-08-22 against a mounted
  DMG. (b) The packaged resolution branch is unreachable — `paths.ts:73-76` resolves `publicDir`
  as `resolve(app.getAppPath(), app.isPackaged || process.env.CI === 'e2e' ? 'build' : 'public')`
  and `electronStub.ts:207` hardcodes `isPackaged: false`. **Fixing (b) alone resolves correctly
  to an empty directory.** Consequence carried: `REQ-34.2-02` is proven for dev and FALSE for a
  packaged build; `G-34.2-UAT-02` in `34.2-HUMAN-UAT.md` is `status: diagnosed` with a
  `blocked_on:` pointing here. A ready-made harness may exist — the `'build'` branch is already
  reachable under `CI=e2e`, so an existing e2e path may prove the fix without a full packaging
  run per iteration.

### Claude's Discretion

Four decisions were explicitly delegated. Each carries a stated default — a planner or
researcher may depart from it, but must say why.

- **D-04:** `electron-store`. It is the **last thing in the tree that requires `electron`**:
  `electron-store@8.2.0`'s `index.js` line 3 is
  `const {app, ipcMain, ipcRenderer, shell} = require('electron')`, and it is a thin wrapper over
  `conf@^10.2.0`. Only two real backend files import it: `src/backend/cache.ts` and
  `src/backend/electron_store.ts`. **Consequence if kept:** the esbuild `--alias:electron=` must
  survive in all three build paths **purely to satisfy one third-party line**, so `electron` would
  be gone from `package.json` yet still load-bearing in the build, and D-03's clean grep test
  gains an asterisk. `meta/buildSidecarSea.ts` documents this coupling in its own comments.
  **Default: swap to `conf` directly.** The platform module already owns the `userData` path that
  electron-store's default derives from. **Research must first confirm** (i) the `conf@10` API
  delta against electron-store's surface, and (ii) whether `src/frontend/helpers/electronStores.ts`
  is a real import or a same-named renderer mirror. *Alternative if that check goes badly:* keep
  electron-store and keep the alias — zero risk to the store layer, which touches every persisted
  setting in the app.

- **D-14:** Where `isPackaged` comes from. **A correct resolver already exists**:
  `isPackagedSidecar()` at `src/backend/sidecar/humbleFlowRegistration.ts:159` resolves via
  `node:sea` and fails closed, and `src/backend/sidecar/devSecretVault.ts` deliberately reuses it
  rather than re-deriving (its own "guardrail (c)"). So `electronStub.ts:207`'s `isPackaged: false`
  is a **second, wrong derivation of the same fact sitting next to a right one** — which is why
  `R-34.5-G1-PKG` half (b) is unreachable.
  **Default: move `isPackagedSidecar()` into `backend/platform` and have `app.isPackaged`
  delegate to it — one derivation.** This closes half (b) as a side effect.
  **Security note that constrains the alternatives:** devSecretVault's fail-closed guard depends
  on this value, so two derivations that could disagree is a latent bypass, not merely untidy. A
  build-time constant fails OPEN if a build path forgets to stamp it — the wrong direction.
  Research should confirm `isPackagedSidecar()`'s `node:sea` check holds for every spawn path
  before making it the single source.

- **D-15:** Dev loop. Today `pnpm tauri:dev` runs `electron-vite build` (a full production
  renderer build) before `tauri dev` — **no HMR at all**. That is the direct cause of two
  recorded gotchas: `tauri dev` serving a stale static bundle, and `tauri:dev` exiting 0 without
  replacing a running instance. `main.ts:321/329` already know `localhost:5173` from the Electron
  dev shape.
  **Default: a Vite dev server via `devUrl` + `beforeDevCommand`, plus a separate build-mode
  script.** Real HMR structurally kills the stale-bundle failure class.
  **The tension to resolve, and it is not hypothetical:** with `devUrl`, dev and packaged load
  the renderer by different mechanisms, so a dev-only pass stops being evidence about the
  packaged build — and `R-34.5-G1-PKG` is *precisely* a dev-passes/packaged-fails bug. Keeping a
  build-then-serve script alongside preserves that evidence path. Research should check whether
  `devUrl` interacts with `frontendDist`/resource resolution in a way that would mask the bug.

- **D-17:** Plan ordering and the point of no return.
  **Default ordering:** (1) additive work while both shells still run — plain Vite, tray, deep
  links, wake lock, `backend/platform` created but not yet consumed, and the D-18 A/B re-test;
  (2) tag `pre-electron-cutover`; (3) delete the Electron entry points — `src/backend/main.ts`,
  `src/preload/index.ts`, `electron-vite`, `electron-builder` — **this is the point of no
  return**, one small reviewable plan; (4) the 67-file rewrite, which by then is behaviorally
  **inert**, because nothing runs under Electron anymore and the sidecar already resolves to the
  shim via the alias.
  **Why this ordering:** it puts the irreversible step in the *small* diff and the large diff in
  the safe zone. The intuitive inverse (rewrite first, delete after) puts the point of no return
  *inside* the 67-file diff and leaves an interval where the Electron build is silently broken
  while still appearing to exist — the worst state to be interrupted in.
  *Explicitly rejected: a dual-mode platform module that re-exports real electron under Electron.
  It reintroduces exactly the `isTauri()`-shaped branching this phase exists to delete.*

### Folded Todos

All three groups fold into Phase 35 scope. **Rationale for folding rather than deferring:** each
is survivable today only because the Electron build still ships alongside. The moment the cut
lands there is no fallback, so each becomes a release blocker.

**Tauri channel dead ends** — all three are invisible-failure shapes:
- `2026-08-24-installed-json-watcher-never-ported-to-the-tauri-sidecar.md` (and its duplicate
  `2026-08-25-installed-json-watcher-not-ported-to-tauri.md` — dedupe when planning)
- `2026-08-24-opendialog-is-missing-from-long-running-channels-so-every-file-picker-flow-dies-silently.md`
  — 60s picker timeout
- `2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md`

**Tauri UI dead ends** — each is an affordance that lies, so D-05's rule applies (fix or delete):
- `2026-08-22-about-window-is-unreachable-under-tauri.md` — `tauriShowAboutWindow` is **fully
  implemented** and cannot be invoked by any user action
- `2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md`
- `2026-08-26-path-rejection-dialog-uses-an-oversized-large-text-window.md`

**Epic logout cookie clear** — arrives here whether folded or not; it is the 34.6 Step 8 FAIL:
- `2026-08-24-epic-logout-reports-clearing-cookies-it-does-not-clear.md`
- `2026-08-23-epic-logout-cookie-clear-unobserved-and-unowned.md`
- Disposition is **D-09** (delete the webview data directory).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The port gate and the seam
- `.planning/IPC-PORT-INVENTORY.md` — the completion gate for this phase. Read `## Preload-surface
  coverage` and `## Not an IPC channel, but blocks Phase 35` (lines 380-392) in particular. Its
  `## Totals` table is a frozen Phase 34.1-era snapshot — **do not read it as current** (D-00a).
- `.planning/phases/27-tauri-shell-walking-skeleton/SEAM.md` — the authoritative port backlog and
  its two load-bearing invariants. Phase 28 kept it current, so it is trustworthy for 29-35.
- `.planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/preload-surface-gate.py`
  — re-derives the preload surface from source at run time. Run with `--self-test` first.
- `.planning/phases/34.6-*/34.6-PRELOAD-SURFACE-REDERIVE.md` — the 2026-08-25 zero-findings record.

### Deferred items that land here
- `.planning/phases/34.5-*/34.5-deferred-items.md` item 12 — `R-34.5-G1-PKG`'s routing criterion
  ("whichever plan first exercises a packaged, non-dev build"). That is this phase.
- `.planning/phases/34.2-*/34.2-HUMAN-UAT.md` — `G-34.2-UAT-02`, `status: diagnosed`, with a
  `blocked_on:` field pointing here. Its evidence block **misquotes** `paths.ts` (drops the
  `|| process.env.CI === 'e2e'` clause). Re-grep `publicDir` before trusting any line number.
- `.planning/ROADMAP.md` lines 4189-4271 — the Phase 35 entry, including the full two-half
  description of `R-34.5-G1-PKG`. Read alongside D-00a–D-00f, which correct several of its premises.
- SEAM.md convergence: Phase 29 D-08 (Electron `SECRET_STORE_KEYS` deny-list vs Tauri fail-closed
  allow-list), Phase 31 D-02 (settings divergence), Phase 33 D-04 (boot-time auto-resume).

### Project skills — planners get these ONLY by invoking the Skill tool
- `Skill("spike-findings-gamelib")` — Tauri v2 rearchitecture patterns, the Node sidecar,
  Electron-API parity, the preload seam, and the login-webview/cookie-read surface. **Directly
  load-bearing for D-09.**
- `Skill("sketch-findings-gamelib")` — required if any UI is touched (D-05's strip-the-dead-UI
  rule reaches `TraySettings.tsx`).

### Live-gate format precedent
- `.planning/phases/34.18-*/34.18-LIVE-GATE.md` — 21/21 criteria with every `Observed:` field
  filled; the format that has worked in this repo. Use for D-16.
- `.planning/phases/34.6-*/` live-gate documents — for the FAIL 7/9 disposition (D-00d).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets — do not rebuild
- `src/backend/sidecar/__tests__/electronReachLedger.test.ts` — already tracks Electron reach
  across the backend. **This is the natural enforcement point for D-03's single-grep success
  test.** It is also the heaviest `from 'electron'` importer (13), so it changes shape.
- `isPackagedSidecar()` — `src/backend/sidecar/humbleFlowRegistration.ts:159`. A real, fail-closed,
  `node:sea`-backed resolver. See D-14.
- `src/backend/protocol.ts` + `src/backend/__tests__/protocol.test.ts` — full `gamelib://` parser
  and suite. Survives D-07 intact; only registration changes.
- `src/backend/tray_icon/tray_icon.ts` — the tray subsystem. Its menu construction and
  `handleProtocol` call are the D-06/D-07 coupling.
- `nativeImageShim.ts` — already a real, `sips`-backed implementation, not a stub. Carries over.
- `.github/workflows/release-tauri.yml` — a working `tauri-action@v1` pipeline with signing gates.
  One Electron-coupled step (line 165). See D-12.
- `electron.vite.config.ts:75-101` — the `renderer:` block, already plain-Vite-shaped. See D-12.

### Established patterns that constrain this phase
- **The esbuild alias is in three build paths**, not one: `meta/buildSidecarSea.ts`,
  `meta/esbuildWorkerBundleShared.ts:290`, `meta/buildDecompressWorkerDev.ts`. A change that
  misses one produces a build that works in dev and fails in the SEA or the worker.
- **`preserveRunnerSymlinksPlugin` is load-bearing** (F-34.9-01): vite's `copyDir` dereferences
  symlinks, every `Python.framework` symlink in the onedir runners becomes a real file, and
  codesign then rejects the bundle as "ambiguous". It must survive the Vite migration.
- **The `publicDir` → `outDir` copy path has burned this repo four times**, and the fourth
  instance killed Phase 34.5. Treat `R-34.5-G1-PKG` half (a) as a minefield, not a one-line
  config add.
- **Stubs in this codebase carry decision IDs and rationale in-comment** (D-08 wake lock, D-09
  session, D-04 clipboard.readText). When deleting or replacing one, carry its rationale forward
  rather than dropping it — several of those comments record *why* an obvious approach failed.

### Integration points
- `src/preload/index.ts` — the `contextBridge` block. Its header already documents that Tauri
  never loads this bundle. `src/preload/api/*` must SURVIVE — `tauriAttach` consumes it.
- `src/backend/constants/paths.ts:73-76` — `publicDir`. The `R-34.5-G1-PKG` half (b) site.
- `src/backend/main.ts` — the Electron main entry: `protocol.handle` (502), `setAsDefaultProtocolClient`
  (507), `Menu.setApplicationMenu(null)` (309), `powerSaveBlocker` (650/655), `screen` (386),
  `electron-updater`, and the `isPackaged` CSP branches (321/329). Deleting this file is D-17's
  point of no return.
- `src/backend/main_window.ts:33` — `screen.getPrimaryDisplay()` window sizing; moot once Tauri
  owns the window, but confirm rather than assume.

</code_context>

<specifics>
## Specific Ideas

- **"Nothing ships an affordance it cannot honor."** D-05's rule, and the cleanest one-line test
  for whether a stub is acceptable: if a user can see or click it, it works or it goes.
- **Make the big diff the boring one.** D-02 and D-17 are both applications of this: the
  mechanical 67-file change should be reviewable by grep, and the irreversible step should be the
  small plan you can read in full.
- **Packaged, not dev.** Stated three separate times during discussion (D-16, D-15's tension,
  D-19). Phase 34.5 closed on a clean 4/0/0/0 measured against dev, and that number said nothing
  about the artifact. Any gate claim in this phase must name which build it was measured on.

</specifics>

<deferred>
## Deferred Ideas

- **Linux deb/rpm/pacman/tar.xz artifacts** — deferred by D-11 to a future one-line `targets`
  change once AppImage is proven.
- **Flatpak distribution under a GameLib identity** — deleted by D-11, not merely deferred. If it
  ever returns it is its own project (Tauri + bundled sidecar + helper binaries).
- **Artwork disk cache under Tauri** (`register_uri_scheme_protocol`) — accepted as lost by D-10.
  Worth revisiting if offline use or CDN bandwidth becomes a real complaint.
- **Per-runner webview data directories** — surfaced by D-09 as the enabler for clearing one
  runner's session without the others. Only needed if wholesale deletion proves too coarse.
- **Closing Phase 34's deferred `34-07` all-platform live gate as separate work** — considered as
  a gate option and not selected, but D-00c means it remains genuinely open. It is still available
  to the planner as a sequencing choice.

### Reviewed Todos (not folded)

Of 36 keyword matches, most were noise. These were read and left out as belonging elsewhere:
- Humble keyring slots / `keyring_available` silent prompt (`2026-08-17-*`) — auth surface, not
  the cutover.
- `SteamGame.getGameInfo()` empty on async cache miss; Steam depot install generic error;
  startup orphan scan (`2026-08-2*`) — Steam defect cluster, Phase 37 lineage.
- LibraryTour dead `data-tour` anchors; 34.11 residual review warnings — frontend, unrelated to
  the shell.
- 44 eslint errors blocking pre-push; i18n catalog refreshes; CheapShark→IsThereAnyDeal migration
  — tooling and product questions independent of the cutover.
- Winetricks search/selection UX; `moveInstall` rsync flags on macOS; `importGame` folder
  validation; `PathSelectionBox` onBlur unlinking EGS sync — 34.6-era todos, non-blocking and
  not shell-coupled.

</deferred>

---

*Phase: 35-electron-cutover-remove-the-electron-build*
*Context gathered: 2026-08-28*
