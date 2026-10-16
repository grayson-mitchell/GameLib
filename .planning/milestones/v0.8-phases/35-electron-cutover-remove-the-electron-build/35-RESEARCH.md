# Phase 35: Electron cutover — remove the Electron build - Research

**Researched:** 2026-08-28
**Domain:** Electron→Tauri shell retirement (build config, IPC shim collapse, native API parity)
**Confidence:** HIGH (counts, code facts — all re-derived at HEAD `9870cf05c`) / MEDIUM (Tauri v2 API surface, sourced from WebSearch and cross-checked against the pinned `tauri = 2.11.5` in `Cargo.lock`) / LOW (D-16 Windows/Linux gate sufficiency — genuinely unresolved, flagged below)

**Commit measured at:** `9870cf05c` (`git log -1`, 2026-08-28 08:18:11 +1200), branch `fix/steam-native-install-stability`.

## Summary

CONTEXT.md's D-00a–D-00f re-measurements hold up: re-deriving every cited count at HEAD reproduces
D-01's 67-file figure, D-00b's 28-file/140-reference `isTauri()` figure, D-02's 22-export
`electronStub.ts` surface, D-03's 12 type-only-import / 32 `Electron.`-namespace-reference figures,
and D-11/D-12/D-13's `tauri.conf.json`/`Cargo.toml` claims — all confirmed byte-for-byte against
the live tree. One structural claim needed refinement, not correction: the "three build paths"
carrying the esbuild `--alias:electron=` are three *call sites* of one shared function
(`seaEsbuildFlags()` in `esbuildWorkerBundleShared.ts`) that contains the literal alias string
exactly once — this is materially better news for D-03's planner than "three places to edit," and
is documented below. One claim needed genuine correction: D-04's "only two real backend files
import electron-store" undercounts — grep finds ten files with a real (non-type-only,
non-mock) `import Store from 'electron-store'` or `require('electron-store')`, spanning
`cache.ts`, `electron_store.ts`, `sidecar/handlers.ts`, `sidecar/storeWriteHandlers.ts`,
`common/types/electron_store.ts` (type-level but still a real import per TS erasure semantics),
`preload/api/misc.ts` (a **lazy runtime `require`** gated behind `!isTauri()` — itself one of the
140 `isTauri()` branches D-01 collapses), and the two `installElectronHook.ts`/`bootstrap.ts` sites
that *intercept* `require('electron-store')` rather than call it. This changes D-04's blast radius
but not its recommended direction — see the D-04 section below.

Beyond the four discretion decisions, this research surfaced two findings that materially help the
planner: (1) Tauri's own `webview.clear_all_browsing_data()` command (added 2.0.0-rc.16, present at
the pinned `2.11.5`) is very likely a better *implementation* of D-09's locked "delete the webview
data directory" decision than raw filesystem deletion — same wholesale-clear semantics, no risk of
deleting the wrong directory, official permission-gated API. (2) The single largest piece of hidden
scope in this phase is not code, it is **`SECRET_STORE_KEYS`** in `preload/api/misc.ts` — the
Electron-only deny-list secret policy that the file's own comment says explicitly must NOT be
unified with Tauri's fail-closed allow-list "until the Electron cutover (Phase 35)." This is
Phase 29 D-08's convergence item, and it lives inside the exact file (`preload/api/misc.ts`) that
also carries one of D-04's electron-store import sites and multiple `isTauri()` branches — three of
this phase's threads intersect in one file.

**Primary recommendation:** Proceed with D-01/D-02/D-03's mechanical-diff structure and D-17's
ordering (additive work → tag → delete entry points → then the mechanical 67-file rewrite). Adopt
D-04's default (swap to `conf` directly) but budget for **ten** call sites, not two, and route the
lazy `preload/api/misc.ts` require through the same `isTauri()` collapse D-01 already does. Use
`clear_all_browsing_data()` as D-09's concrete implementation. Treat Phase 29 D-08's
`SECRET_STORE_KEYS`→allow-list unification as a first-class task, not a side effect of deleting
`preload/index.ts`.

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions (verbatim from CONTEXT.md, condensed to IDs + one-line summary — see 35-CONTEXT.md for full text)

- **D-00a–D-00f** — dependency-state findings, not decisions: IPC port gate SATISFIED;
  `isTauri()` grew to 28 files/140 refs; Phase 34's `34-07` all-platform live gate is
  user-deferred (Windows/Linux Tauri builds CI-wired but never live-verified); 34.6 live gate
  stands FAIL 7/9 (Step 8 Epic logout unaddressed); GameLib has published no releases of its own
  (clean updater break, no migration shim); the preload cut is small, the backend cut (67 files)
  is not.
- **D-01** — Full de-Electron. `electronStub.ts` DELETED, all 67 files rewritten.
- **D-02** — One module (`backend/platform`), same 22 exports. Every import site changes exactly
  one string: `from 'electron'` → `from 'backend/platform'`. No behavior moves.
- **D-03** — `electron` leaves `package.json` completely (deps + devDeps). 12 type-import sites
  and 32 `Electron.` namespace refs get first-party declarations. Success test: a single grep,
  `electron` appears nowhere in `src/` or `package.json`.
- **D-04** — `electron-store` disposition — **Claude's discretion**, see below.
- **D-05** — Build three (tray, deep links, wake lock) real; accept-and-strip the rest
  (`session.fromPartition`, `screen.getPrimaryDisplay`, `net.request`, `Menu`, `imagecache`
  protocol, `BrowserWindow.getAllWindows`, `clipboard.readText`). Any UI affordance that lies
  about an accepted gap is deleted.
- **D-06** — Tray: real Tauri v2 first-party tray-icon implementation. Coupled to D-07 via
  `handleProtocol` call in the tray's recent-games menu.
- **D-07** — Deep links: `tauri-plugin-deep-link` is the analog for `protocol.handle('gamelib')`
  + `app.setAsDefaultProtocolClient('gamelib')`. `protocol.ts` + its test suite survive; only
  registration changes.
- **D-08** — Wake lock: `33-RESEARCH` rejected both existing Tauri wake-lock plugins on
  maintenance grounds — likely a small first-party Rust binding. Two real call sites: depot
  download, `launcher.ts:190`.
- **D-09** — Logout clears the embedded browser by **deleting the webview data directory**, not
  clearing cookies. Two real callers: `humble/user.ts`, `legendary/user.ts` (see re-derivation
  below — `legendary/user.ts` does not exist as such; see correction). Known costs: coarse
  (per-runner isolation needs per-runner data dirs), webview may need closing first.
- **D-10** — Artwork disk cache ACCEPTED as lost. State plainly in release notes.
- **D-11** — Linux ships AppImage only (matches `tauri.conf.json`'s existing targets). Delete
  `flatpak/`, `dist:flatpak`, `flatpak:prepare` outright.
- **D-12** — Vite migration: `.github/workflows/release-tauri.yml`'s only Electron coupling is
  line 165 (`pnpm exec electron-vite build`). `electron.vite.config.ts:75-101`'s `renderer:`
  block is already plain-Vite-shaped. `preserveRunnerSymlinksPlugin` MUST survive the move
  (F-34.9-01).
- **D-13** — Updater handover is a clean break. `tauri-plugin-updater` already configured in
  `tauri.conf.json`/`Cargo.toml`. Delete `src/backend/updater.ts` + `electron-updater`. No
  migration shim (D-00e).
- **D-14** — `isPackaged` source — **Claude's discretion**, see below.
- **D-15** — Dev loop shape — **Claude's discretion**, see below.
- **D-16** — Gate: packaged macOS arm64 live run (not dev) + CI artifacts for Windows/Linux.
- **D-17** — Plan ordering / point of no return — **Claude's discretion**, see below. Structural
  constraint: the 67-file rewrite cannot be additive — once `from 'electron'` becomes
  `from 'backend/platform'`, the Electron main process runs against the sidecar shim, not real
  Electron. "Keep `pnpm start` working until the last plan" is not available.
- **D-18** — Parked bugs/folded todos re-tested under BOTH shells BEFORE the delete (observation,
  cheap), fixed after. Named parked bug: `debug-uninstall-game-vanishes-parked` (7 hypotheses
  eliminated, root cause not found).
- **D-19** — `R-34.5-G1-PKG`, two independent halves, both required: (a) locale files absent from
  bundle (`tauri.conf.json`'s `bundle.resources` lists only `["../build/bin/"]`); (b) packaged
  resolution branch unreachable (`electronStub.ts:207` hardcodes `isPackaged: false`, so
  `paths.ts`'s `publicDir` never takes the `'build'` branch in a packaged run).

### Claude's Discretion (four decisions — full research below)

- D-04 (`electron-store` disposition), D-14 (`isPackaged` source), D-15 (dev loop shape),
  D-17 (plan ordering / point of no return).

### Deferred Ideas (OUT OF SCOPE)

- Linux deb/rpm/pacman/tar.xz artifacts (future one-line `targets` change).
- Flatpak distribution under a GameLib identity (deleted, not deferred).
- Artwork disk cache under Tauri (`register_uri_scheme_protocol`).
- Per-runner webview data directories (only needed if D-09's wholesale deletion proves too
  coarse).
- Closing Phase 34's deferred `34-07` all-platform live gate as separate work (still available as
  a sequencing option — see D-16 assessment below).

</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs are minted yet — ROADMAP.md and 35-CONTEXT.md both read "TBD — mint at
`/gsd-plan-phase 35`". The table below maps CONTEXT.md's locked decisions and in-scope items to
the research that supports minting each requirement; the planner mints REQ-35-01..NN from this.

| Scope item (from CONTEXT.md `<domain>`/`<decisions>`) | Research Support |
|---|---|
| Delete Electron main process, entry points, `electron-vite`/`electron-builder`, preload `contextBridge`, `electron` from `package.json` | Re-derived counts section; D-17 ordering |
| `backend/platform` module (D-01/D-02/D-03) | Re-derived counts; esbuild-alias single-source finding |
| `electron-store` disposition (D-04) | D-04 section |
| Tray (D-06) | D-06 section, Tauri v2 `TrayIconBuilder` research |
| Deep links (D-07) | D-07 section, `tauri-plugin-deep-link` research |
| Wake lock (D-08) | D-08 section, native OS API research |
| Logout webview-data-dir clear (D-09) | D-09 section, spike findings + `clear_all_browsing_data()` |
| `R-34.5-G1-PKG` both halves (D-19) | D-19 section, `tauri.conf.json`/`main.rs` re-derivation |
| Vite migration (D-12) | D-12 section |
| Updater handover (D-13) | D-13 section |
| Linux AppImage-only + Flatpak deletion (D-11) | D-11 section |
| `isPackaged` source (D-14) | D-14 section |
| Dev loop shape (D-15) | D-15 section |
| Plan ordering / point of no return (D-17) | D-17 section |
| Cutover gate (D-16) | D-16 section |
| A/B re-test of parked bugs/folded todos (D-18) | D-18 section, folded-todo summaries |
| SEAM.md convergence: Phase 29 D-08, Phase 31 D-02, Phase 33 D-04 | SEAM Convergence section |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Tech stack is React + TypeScript on a Rust/Tauri shell; GameLib is independent, not a fork
  tracking Heroic — **never raise deviation from upstream Heroic as a concern.**
- Cross-platform target: Linux, macOS, Windows.
- GSD workflow enforcement: file-changing work must go through a GSD command
  (`/gsd-execute-phase` etc.) — not applicable to this research task itself (read-only), but
  the planner/executor must respect it.
- `New strings go in gamelib.json, NEVER translation.json` (memory) — applies if any tray/dialog
  string changes land as part of D-06/D-19 work.
- The user's auto-memory records `steam-identity-in-repo-redact-forward-decision.md` and several
  Steam/Tauri gotchas (`TitleBarStyle::Overlay` does not hide the macOS title,
  `pnpm tauri:dev` noops against a running instance, never bare `tauri dev`) — relevant to any
  packaged-build verification work under D-16/D-19.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Electron→Tauri shim collapse (`backend/platform`) | Node sidecar (backend) | — | Pure import-path mechanical rewrite; no logic moves per D-02 |
| Tray icon + menu | Rust shell (`src-tauri/`) | Node sidecar (recent-games data, `handleProtocol`) | Tauri v2's `TrayIconBuilder` is a Rust-native API; the sidecar supplies dynamic menu data (recent games) over IPC |
| Deep links (`gamelib://`) | Rust shell (registration) | Node sidecar (`protocol.ts` parsing, unchanged) | `tauri-plugin-deep-link` registers the OS handler in Rust; the existing `protocol.ts` parser is reused unchanged, just re-wired to receive URLs from the Rust plugin instead of Electron's `protocol.handle` |
| Wake lock | Rust shell (native OS API binding) | Node sidecar (call sites: depot download, `launcher.ts:190`) | `powerSaveBlocker`'s two real callers are in the sidecar; the actual OS syscalls (`IOPMAssertionCreateWithName`/`SetThreadExecutionState`/`systemd-inhibit`) must be Rust-side, since no viable Tauri plugin exists (per 33-RESEARCH) |
| Logout — clear webview data | Rust shell (`clear_all_browsing_data`/webview lifecycle) | Node sidecar (`humble/user.ts` orchestrates the call over IPC) | The webview data store is owned by wry/WKWebView in the Rust process; the sidecar can only trigger the clear via IPC, never touch the filesystem directly for this |
| `electron-store` → `conf` swap | Node sidecar (`cache.ts`, `electron_store.ts`, `handlers.ts`, `storeWriteHandlers.ts`) | Rust shell (supplies `userData`-equivalent path via `backend/platform`) | Pure Node-side persistence layer; the only shell involvement is supplying the base directory that `electron-store`'s `app.getPath('userData')` used to provide |
| `isPackaged` resolution | Node sidecar (`isPackagedSidecar()`, `node:sea`) | — | Already a sidecar-local, dependency-free (`node:sea` builtin) fact; no shell round-trip needed or desired (a build-time constant supplied by Rust would fail open on a forgotten stamp) |
| Renderer bundling (Vite migration) | Frontend build tooling | Rust shell (`tauri.conf.json`'s `frontendDist`/`devUrl`) | Vite owns the renderer bundle; Tauri only consumes its output path |
| Packaged asset root (`R-34.5-G1-PKG`) | Rust shell (`bundle.resources`, `resource_dir()`) | Node sidecar (`paths.ts`'s `publicDir` resolution, gated on `isPackaged`) | Both halves needed: Rust must ship the files (bundle config) AND the sidecar must resolve to the right directory (isPackaged fix) |

## Re-derived Counts (all commands run at HEAD `9870cf05c`)

| Claim (CONTEXT.md) | Command | Result | Verdict |
|---|---|---|---|
| 67 files under `src/backend/` import `from 'electron'` | `grep -rlE "from ['\"]electron['\"]" src/backend \| wc -l` | **67** | CONFIRMED |
| `isTauri()` — 28 files, 140 references | `grep -rln "isTauri" src --include="*.ts" --include="*.tsx" \| wc -l` / `grep -rno "isTauri" src ... \| wc -l` | **28 files, 140 refs** (note: a naive `grep "isTauri("` search undercounts to 26 files/101 refs — the anchor to literal `(` misses destructured/prop-name usages; use the un-anchored form) | CONFIRMED, with a methodology note for whoever re-verifies later |
| 12 `import type ... from 'electron'` sites | `grep -rn "import type.*from ['\"]electron['\"]" src \| wc -l` | **12** (files: `SteamBridgeSetup.ts`, `SteamClientSetup.ts` +2 tests, `SteamBottleSetup.ts` +1 test, `PathSelectionBox/index.tsx`, `utils/openDialog.ts`, `sidecar/__tests__/electronReachLedger.test.ts`, `common/types/ipc.ts`, `preload/ipc.ts`, `preload/api/misc.ts`) | CONFIRMED |
| 32 `Electron.` namespace references | `grep -ron "Electron\.[A-Za-z]*" src \| wc -l` | **32** references across **22** files | CONFIRMED |
| 22 exports of `electronStub.ts` | `grep -n "^export" src/backend/sidecar/electronStub.ts` | **22** top-level `export` statements: `ElectronStubTransport`, `bindTransport`, `IpcHandler`, `IpcListener`, `handlerRegistry`, `listenerRegistry`, `ipcMain`, `app`, `dialog`, `Notification`, `safeStorage`, `shell`, `BrowserWindow`, `session`, `nativeImage` (re-export), `screen`, `net`, `Menu`, `protocol`, `powerSaveBlocker`, `clipboard`, `Tray` | CONFIRMED |
| Three esbuild `--alias:electron=` build paths | `grep -rn "alias:electron=" meta/` | Literal string exists in **exactly one place**: `meta/esbuildWorkerBundleShared.ts:290`, inside `seaEsbuildFlags()`. That function is **called from three sites**: `meta/buildSidecarSea.ts:368` (SEA sidecar bundle), `meta/buildSidecarSea.ts:391` (a second worker-bundle build within the same file), `meta/buildDecompressWorkerDev.ts:96` (dev decompress-worker bundle) | REFINED, not contradicted — see below |
| No fourth alias location | `grep -rln "electron=" meta/` | Only `esbuildWorkerBundleShared.ts` (definition) and `meta/__tests__/buildSidecarSea.test.ts` (asserts the flag is present) reference the literal string | CONFIRMED — no fourth production build path |
| Only two real backend files import `electron-store` | `grep -rln "from ['\"]electron-store['\"]" src/` + `grep -rln "require(['\"]electron-store['\"])" src/`, filtered to non-test/non-mock | **Ten** real sites (see D-04 below) | **CORRECTED — see D-04** |
| `gh release list` shows no GameLib releases | `gh release list` | All 20 listed releases are inherited Heroic tags (`v2.22.1` "Hotfix #1" down to `v2.14.0`); none carry a GameLib identity | CONFIRMED (D-00e) |
| `launcher.ts:190` is the `prevent-display-sleep` call | `sed -n '180,200p' src/backend/launcher.ts` | Line 190 is exactly `powerDisplayId = powerSaveBlocker.start('prevent-display-sleep')` | CONFIRMED — line number has not drifted |
| `main.ts:502-507` is the protocol registration block | `sed -n '495,515p' src/backend/main.ts` | `protocol.handle('gamelib', ...)` starts at line 501, `app.setAsDefaultProtocolClient('gamelib')` at line 507 | CONFIRMED (off by one on the opening line, immaterial) |
| `tauri.conf.json`'s `bundle.resources` lists only `["../build/bin/"]` | `cat src-tauri/tauri.conf.json` | Confirmed verbatim | CONFIRMED (D-19a) |
| `electronStub.ts:207` hardcodes `isPackaged: false` | `sed -n '195,230p' src/backend/sidecar/electronStub.ts` | `isPackaged: false,` at line 207, with a long comment explicitly acknowledging `publicDir` still appends `'public'` because of this | CONFIRMED (D-19b) — and independently corroborated by a matching comment in `src-tauri/src/main.rs` (see below) |
| `main.rs` independently documents the same isPackaged defeat | `grep -n "publicDir" src-tauri/src/main.rs` | Line 5495-5496: "`electronStub.app.isPackaged` stays `false` under the sidecar regardless of this value, so `publicDir` still appends `'public'`, not `'build'`" | NEW finding — the Rust side already knows about and documents the defect independently; useful evidence trail for the plan, not previously cited in CONTEXT.md |
| `pnpm tauri:dev` shells to `electron-vite build` first, no HMR | `grep -n "tauri:dev" package.json` | `"tauri:dev": "electron-vite build && pnpm build:sidecar && pnpm build:decompress-worker-dev && tauri dev"` | CONFIRMED |
| `tauri.conf.json` targets `["nsis","appimage","dmg"]` | `cat src-tauri/tauri.conf.json` | Confirmed verbatim | CONFIRMED (D-11) |
| Updater plugin config complete | `cat src-tauri/tauri.conf.json` + `Cargo.toml` | `plugins.updater` has `pubkey`, one GitHub endpoint, `windows.installMode: "passive"`; `tauri-plugin-updater = "2"` in `Cargo.toml` | CONFIRMED (D-13) |
| Tauri pinned version | `grep -A2 'name = "tauri"' src-tauri/Cargo.lock` | `tauri` = **2.11.5** | New fact — anchors all Tauri v2 API-availability claims below |
| No `tauri-plugin-deep-link` / `tauri-plugin-single-instance` in the tree yet | `grep -n "deep-link\|single-instance" src-tauri/Cargo.toml` (no match) | Neither present | CONFIRMED — both are net-new additions for D-07 |

## Standard Stack

### Core (Rust / `src-tauri/`)

| Crate | Version | Purpose | Why Standard |
|---|---|---|---|
| `tauri-plugin-deep-link` | 2.4.9 `[VERIFIED: cargo registry, official tauri-apps org]` | `gamelib://` protocol registration (D-07) | First-party Tauri plugin, same publisher/version-pin convention (`"2"`) as every other `tauri-plugin-*` already in `Cargo.toml` |
| `tauri-plugin-single-instance` | 2.4.3 `[VERIFIED: cargo registry, official tauri-apps org]` | Required alongside deep-link on Windows/Linux — deep links there arrive as a CLI arg to a new process; without single-instance, `onOpenUrl` never fires | Official Tauri docs state this is a hard requirement, not an optional pairing, for Windows/Linux deep-link delivery |
| Core `tray-icon` feature (already in `Cargo.toml`) | bundled with `tauri = "2"` (pinned 2.11.5) | Tray icon + menu (D-06) | Already enabled (`features = ["tray-icon", "image-png", "unstable"]`); no new dependency needed, only new Rust code (`TrayIconBuilder`) |
| Core `clear_all_browsing_data` command (Webview/WebviewWindow API, no new dep) | bundled with `tauri = "2"`, added 2.0.0-rc.16 — present at pinned 2.11.5 | D-09's webview-data clear, implemented via official API instead of raw directory deletion | See D-09 section |

### Supporting (Node / `src/`)

| Library | Version | Purpose | When to Use |
|---|---|---|---|
| `conf` | 15.1.0 latest on npm `[ASSUMED — see Package Legitimacy Audit; slopcheck flagged SUS as a likely false positive]` | Direct replacement for `electron-store`'s persistence layer (D-04) | `electron-store@8.2.0` itself pins `conf@^10.2.0` as its only real dependency — the codebase can go straight to a current `conf` major rather than replicating electron-store's older pin, but **the API delta must be checked against 8.2.0's actual usage, not 15.x's latest surface** (see D-04) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| Raw `fs.rmSync` on the webview data directory (D-09's literal wording) | Tauri's `webview.clear_all_browsing_data()` (official, permission-gated) | The official API achieves the same wholesale-clear semantics without needing to first resolve/hardcode per-platform data-directory paths (`~/Library/HTTPStorage/{pkg}`, `~/Library/WebKit/{pkg}` on macOS; WebView2 user data folder on Windows; XDG dirs on Linux) or risk deleting the wrong directory. Recommend as the concrete mechanism unless a platform-specific gap is found during implementation (see D-09) |
| `tauri-plugin-nosleep` / `tauri-plugin-screen-wake-lock` (existing Tauri wake-lock plugins) | First-party Rust binding directly calling `IOPMAssertionCreateWithName`/`SetThreadExecutionState`/`systemd-inhibit` | 33-RESEARCH already surveyed this ground: no maintained Tauri v2 wake-lock plugin was found viable. This research did not find new information changing that verdict — see D-08 |
| Electron-vite's `renderer:` block verbatim | Plain `vite.config.ts` lift of the same block, `devUrl`+`beforeDevCommand` for dev | D-12/D-15 — see those sections |

**Installation (illustrative — planner scopes exact `Cargo.toml`/`package.json` edits):**
```bash
# Rust (src-tauri/Cargo.toml)
cargo add tauri-plugin-deep-link@2
cargo add tauri-plugin-single-instance@2

# Node (package.json) — only if D-04's default is adopted
pnpm add conf
pnpm remove electron-store electron-updater electron-builder electron-vite electron
```

**Version verification:** `cargo search` and `npm view` were run directly (see Re-derived Counts
table and Package Legitimacy Audit). `conf`'s exact version to pin should be re-checked at plan
time — 15.1.0 was current as of this research date but `conf` releases somewhat frequently.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---|---|---|---|---|---|---|
| `conf` | npm | Created 2011-02-27 (14+ years) | Not independently pulled (npm CLI in this sandbox does not expose weekly-download JSON cleanly) | `github.com/sindresorhus/conf` (confirmed via `npm view conf repository.url`) | **[SUS]** — "Suspiciously close to 'cors'. Could be a typosquat." | **Flagged — planner must add `checkpoint:human-verify` before install, but treat as a likely false positive.** `conf` is a 14-year-old package by `sindresorhus` (one of npm's most prolific, well-known maintainers), already electron-store's own real dependency, with an unambiguous GitHub source repo. The slopcheck heuristic appears to be pure Levenshtein-distance name matching against `cors`, which shares no semantic relationship. Verify manually before install, but do not let this block the D-04 direction. |
| `tauri-plugin-deep-link` | crates.io | Official `tauri-apps` org plugin, versioned in lockstep with core Tauri (2.4.9 at time of research) | N/A (Rust ecosystem, no npm-style download metric checked) | `github.com/tauri-apps/plugins-workspace` | Not run (Rust ecosystem; `cargo search` used instead per protocol) | Approved — first-party, same trust tier as every other `tauri-plugin-*` already in `Cargo.toml` |
| `tauri-plugin-single-instance` | crates.io | Official `tauri-apps` org plugin (2.4.3) | N/A | `github.com/tauri-apps/plugins-workspace` | Not run | Approved — same reasoning |

**Packages removed due to slopcheck `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `conf` — see disposition above; recommend the planner
insert a lightweight `checkpoint:human-verify` (one-line confirmation, not a full audit) rather
than treating this as a real blocker, given the strength of the counter-evidence gathered
(publisher identity, age, existing transitive presence in the dependency tree via
`electron-store`).

## Architecture Patterns

### System Architecture Diagram (post-cutover shape)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Rust shell (src-tauri/)                     │
│                                                                   │
│  main.rs: window mgmt, sidecar spawn/lifecycle, RPC dispatch     │
│    │                                                             │
│    ├─ TrayIconBuilder ──────► tray menu (D-06)                  │
│    │     └─ recent-games data ◄──── IPC ◄── sidecar              │
│    │     └─ click handler ──► handleProtocol() [via IPC]         │
│    │                                                             │
│    ├─ tauri-plugin-deep-link ─► registers gamelib:// (D-07)     │
│    │     └─ onOpenUrl ──────► forwarded to sidecar's             │
│    │                          protocol.ts parser (unchanged)     │
│    │                                                             │
│    ├─ wake-lock binding (D-08) ◄── IPC ◄── sidecar                │
│    │     (IOPMAssertionCreateWithName / SetThreadExecutionState  │
│    │      / systemd-inhibit, per-platform)                      │
│    │                                                             │
│    ├─ webview (login windows) ─► clear_all_browsing_data() (D-09)│
│    │                              triggered via IPC from          │
│    │                              humble/user.ts logout flow      │
│    │                                                             │
│    └─ resource_dir() ──► GAMELIB_APP_ROOT env ──► sidecar spawn  │
│                            (fixes D-19b once isPackaged resolves) │
└──────────────────────────┬────────────────────────────────────────┘
                            │ stdio/RPC transport
┌───────────────────────────▼────────────────────────────────────────┐
│                  Node sidecar (SEA binary or dev node)              │
│                                                                       │
│  bootstrap.ts ─► installs Module._load hook ─► every                │
│    `require('electron')`/`require('electron-store')` call           │
│    (pre-cutover) resolves to electronStub.ts / fileStore.ts          │
│                                                                       │
│  POST-CUTOVER: every former `from 'electron'` import site (67 files) │
│    imports `from 'backend/platform'` directly — no hook, no alias    │
│    needed for the `electron` name itself. The alias mechanism        │
│    (`--alias:electron=`) is deleted from all 3 seaEsbuildFlags()     │
│    call sites in one edit (single-sourced, see Re-derived Counts).   │
│                                                                       │
│  backend/platform/index.ts (formerly electronStub.ts): 22 exports    │
│    app, dialog, shell, Notification, safeStorage, clipboard, Tray,   │
│    BrowserWindow, session, screen, net, Menu, protocol,              │
│    powerSaveBlocker, nativeImage, ipcMain, handlerRegistry,          │
│    listenerRegistry, bindTransport (+ 3 type-only exports)           │
│                                                                       │
│  backend/electron_store.ts / cache.ts / sidecar/handlers.ts /        │
│    sidecar/storeWriteHandlers.ts: `import Store from 'electron-store'│
│    → `import Conf from 'conf'` (D-04)                                │
│                                                                       │
│  preload/api/misc.ts: SECRET_STORE_KEYS deny-list (Electron path)    │
│    ── UNIFY WITH ──► storePolicy.ts's fail-closed allow-list         │
│    (Tauri path) — Phase 29 D-08 convergence, now unblocked           │
└───────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (delta from current)
```
src/backend/
├── platform/                  # NEW — replaces sidecar/electronStub.ts (D-02)
│   ├── index.ts                # 22 exports, same names as electron
│   ├── types.ts                # first-party Electron.* type declarations (D-03)
│   └── __mocks__/              # replaces src/backend/__mocks__/electron.ts
├── sidecar/
│   ├── electronStub.ts         # DELETED
│   └── installElectronHook.ts  # DELETED (no more require('electron')/('electron-store')
│                                #   to intercept once D-01/D-04 land)
src-tauri/src/
├── main.rs
├── tray.rs                     # NEW — TrayIconBuilder + menu (D-06)
├── deep_link.rs                # NEW — tauri-plugin-deep-link wiring (D-07)
├── wake_lock.rs                # NEW — per-platform native binding (D-08)
vite.config.ts                  # NEW — replaces electron.vite.config.ts's renderer: block (D-12)
```

### Pattern 1: Mechanical import-path rewrite (D-02)
**What:** Every one of the 67 files' `import { X, Y } from 'electron'` becomes
`import { X, Y } from 'backend/platform'` — no name changes, no reordering, no logic edits.
**When to use:** The entire D-01/D-02 cutover.
**Example:**
```typescript
// Before (src/backend/protocol.ts:1)
import { dialog, app } from 'electron'
// After
import { dialog, app } from 'backend/platform'
```
This is verifiable with a single command per file: `git diff --stat` should show exactly one
changed line per file for the 67-file wave (modulo files that also had a genuine D-01 logic
change bundled in, which should be flagged in review as a deviation from the "mechanical" premise).

### Pattern 2: `seaEsbuildFlags()` single-source alias removal
**What:** Because the `--alias:electron=` literal exists in exactly one function
(`esbuildWorkerBundleShared.ts:290`), removing it once removes it from all three call sites
(`buildSidecarSea.ts` ×2, `buildDecompressWorkerDev.ts` ×1) automatically.
**When to use:** After D-01's rewrite makes the alias unnecessary (no more `require('electron')`
anywhere in the bundled graph).
**Example:** Delete line 290 (and, if D-04 also lands, the analogous `electron-store` externalize
flags in `package.json`'s `build:sidecar` script — `--external:electron --external:electron-store`).

### Pattern 3: `isPackagedSidecar()` as single source of truth (D-14)
**What:** `backend/platform`'s `app.isPackaged` getter delegates to the existing
`isPackagedSidecar()` (moved from `humbleFlowRegistration.ts`, or re-exported from its new home)
rather than a hardcoded `false`.
**When to use:** D-14's implementation.
**Example:**
```typescript
// src/backend/platform/index.ts
import { isPackagedSidecar } from './isPackagedSidecar' // moved from humbleFlowRegistration.ts
export const app = {
  ...,
  get isPackaged(): boolean { return isPackagedSidecar() },
  ...
}
```

### Anti-Patterns to Avoid
- **A dual-mode platform module that re-exports real `electron` under Electron.** Explicitly
  rejected by D-17 — reintroduces the `isTauri()`-shaped branching this phase exists to delete.
- **Splitting `electronStub.ts`'s replacement by concern** (e.g. one module per API surface).
  Explicitly rejected by D-02 — breaks the mechanical, grep-verifiable diff property.
  Nowhere is this more concretely important than the `SECRET_STORE_KEYS` file: `preload/api/misc.ts`
  currently blends D-01 (an `isTauri()` branch), D-04 (a lazy `electron-store` require) and the
  Phase 29 D-08 convergence item (the deny-list itself) in one file — do not let three separate
  plans each touch this file expecting the other two haven't, or a merge conflict / silent
  overwrite of the deny-list-to-allow-list unification becomes likely.
- **Assuming `cookies_for_url()` or per-cookie clearing is a viable D-09 fallback.** The spike
  finding (`tauri-login-webview-cookies.md`) documents `cookies_for_url()` as "the single most
  dangerous API in this area" on macOS (silent domain-match defect, `F-34.4.2-19`). D-09's
  rejection of "fixing per-cookie deletion at the wry layer" is well-supported by this evidence,
  independent of CONTEXT.md's own framing.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Wholesale webview data clear (D-09) | Manual `fs.rm` on OS-specific WebKit/WebView2/WebKitGTK data paths | `Webview::clear_all_browsing_data()` / `WebviewWindow.clearAllBrowsingData` | Official API added specifically because JS-level clearing couldn't reach disk cache and `~/Library/HTTPStorage/{pkg}`/`~/Library/WebKit/{pkg}` on macOS (tauri#6567/wry#914). Manual path resolution risks missing a directory the official API already covers |
| Deep-link OS registration (D-07) | Hand-written `CFBundleURLTypes` Info.plist entries, Windows registry writes, `.desktop`/`xdg-mime` calls | `tauri-plugin-deep-link` | Cross-platform registration differences (build-time-only on macOS vs runtime on Windows/Linux, single-instance interaction) are exactly the kind of platform-matrix logic a maintained plugin should own |
| Tray menu construction (D-06) | Raw platform tray APIs per OS | `tauri::tray::TrayIconBuilder` + `tauri::menu::MenuBuilder` (core, already-enabled `tray-icon` feature) | First-party, already a project dependency by feature flag — no new crate needed, just new code |
| Domain-matching a cookie's `domain` field against a hostname | An ad hoc `==` or naive substring comparator | The existing `cookie_domain_matches` at `src-tauri/src/main.rs:975-994` | This project already has exactly one load-bearing domain comparator, born from a real production incident (F-34.4.2-19, weeks of silent Humble-login failure from a missing leading-dot strip). A second ad hoc comparator for any Phase 35 need must reuse this function, not reimplement it |

**Key insight:** Every "don't hand-roll" item above already has a load-bearing, previously-battle-
tested first-party or official-plugin solution sitting either already in the dependency tree
(`cookie_domain_matches`, the `tray-icon` feature) or one `cargo add` away
(`tauri-plugin-deep-link`). The temptation in this phase is to under-scope by treating D-06/D-07/
D-08/D-09 as "small shims" the way `33-RESEARCH` initially treated wake-lock — this research found
no new evidence to lower that estimate for wake-lock, and active evidence to raise it slightly for
deep-link (the single-instance pairing requirement is easy to miss).

## Runtime State Inventory

> This phase is a shell rearchitecture / large rewrite, not a rename, so a full five-category
> inventory (as used for rename-class phases) is not the right frame throughout. The parts that
> genuinely apply:

| Category | Items Found | Action Required |
|---|---|---|
| Stored data | `electron-store`/`conf`-backed JSON files under the OS `userData` directory (configStore, humbleConfigStore, steamConfigStore, gogConfigStore, zoomConfigStore, cache stores). Format is unaffected by an `electron-store`→`conf` swap since `electron-store` is a thin wrapper over `conf` already — **verify this empirically before trusting it** (see D-04's API-delta task) | Code edit only if the on-disk JSON shape is unaffected (expected); a data migration would only be needed if `conf`'s serialization or default-path derivation differs from `electron-store`'s in a way that changes the file location or key nesting |
| Live service config | None found — this phase touches no live external service configuration (no n8n/Datadog/Tailscale-style external state) | None |
| OS-registered state | **Real item:** `app.setAsDefaultProtocolClient('gamelib')` (currently registered by the Electron build at `main.ts:507`) registers the OS protocol handler. Once Electron is deleted, any machine that previously ran the Electron build has a stale OS-level registration pointing at the (now-removed) Electron binary until the Tauri build re-registers it via `tauri-plugin-deep-link`. Given D-00e (no published GameLib releases, no real users), this is a **development-machine-only** concern, not a release migration concern | None for release (no users); developers who ran the Electron build locally should expect to re-register on first Tauri run — worth one release-note line for the team, not a task |
| Secrets/env vars | `GAMELIB_DEV_SECRET_VAULT` env var and its guard (`devSecretVault.ts`) depend on `isPackagedSidecar()` remaining correct (D-14) — no key rename, but the fail-closed guarantee must be preserved when `app.isPackaged` delegates to it | Code edit only (single derivation, no key changes) — see D-14's security note |
| Build artifacts | `electron.vite.config.ts`, `electron-builder` config blocks in `package.json`, `flatpak/` directory, `dist:flatpak`/`flatpak:prepare`/`release:linux`(deb/rpm/pacman/tar.xz variants) scripts all become stale/dead once D-11/D-12 land | Deletion, not migration — these are build-time-only artifacts with no persisted state |

## Common Pitfalls

### Pitfall 1: Treating the esbuild alias as "three edits" instead of one
**What goes wrong:** A plan that budgets three separate edits (one per file CONTEXT.md names)
either wastes effort or, worse, edits `esbuildWorkerBundleShared.ts` and then also tries to edit
`buildSidecarSea.ts`/`buildDecompressWorkerDev.ts` for a flag that isn't textually present there,
producing a confusing no-op diff.
**Why it happens:** CONTEXT.md's phrasing ("three build paths... all three must be handled") is
correct about *behavioral* load-bearing-ness but ambiguous about *textual* location.
**How to avoid:** One edit to `seaEsbuildFlags()`; verify via the three call sites still compiling/
building correctly (this repo already has `meta/__tests__/buildSidecarSea.test.ts` asserting the
flag's presence — that test needs updating in the same commit, or it will red immediately).
**Warning signs:** `grep -rn "alias:electron" meta/` returning results after the "removal" commit.

### Pitfall 2: `preload/api/misc.ts` as a three-way collision surface
**What goes wrong:** D-01 (isTauri branch collapse), D-04 (electron-store lazy require), and the
Phase 29 D-08 SEAM.md convergence item (SECRET_STORE_KEYS→allow-list unification) all touch this
one file. Planned as three independent tasks across different waves, the second or third to land
risks silently reverting or conflicting with the first.
**Why it happens:** The file predates all three concerns and accreted them independently across
Phases 28/29/34.x — nothing forced them into a shared awareness of each other until now.
**How to avoid:** Either sequence all three edits into one task/plan, or have whichever task lands
first leave an explicit `// Phase 35 follow-up:` marker naming the other two so later tasks don't
need to rediscover the collision by re-reading the whole file.
**Warning signs:** A diff to this file that touches only one of the three concerns without a
comment acknowledging the other two are still pending.

### Pitfall 3: Assuming `node:sea`'s `isSea()` check behaves identically inside a spawned worker thread
**What goes wrong:** `isPackagedSidecar()`, `decompressPool.ts`'s `resolveWorkerSpec()`, and
`lzmaNativeBinding.ts`'s `resolveNativeBinding()` all independently call `require('node:sea')` with
the same guarded try/catch shape — but they are called from different execution contexts (main
sidecar thread vs. `worker_threads.Worker` spawned from inside the SEA binary vs. a standalone dev
`node` process). If D-14 unifies `app.isPackaged` to call `isPackagedSidecar()` from a context where
`node:sea` genuinely behaves differently (unverified in this research — see Open Questions), the
security-critical `devSecretVault.ts` fail-closed guarantee could be affected.
**Why it happens:** `node:sea`'s `isSea()` is documented as reflecting whether the *current process*
is a Single Executable Application — worker threads spawned from within a SEA binary are still part
of that same process, so this is expected to hold, but this research did not find an authoritative
Node.js doc statement confirming `isSea()`'s behavior specifically inside a `worker_threads.Worker`
spawned from a SEA-packaged parent (as opposed to the top-level thread).
**How to avoid:** Add a one-line empirical check (log `nodeSea.isSea()` from inside a
`worker_threads.Worker` spawned by the packaged SEA binary) as a verification step in D-14's plan,
before trusting the unification for the security-relevant `devSecretVault.ts` path.
**Warning signs:** `devSecretVault.ts`'s guardrail (c) test suite passing in isolation but a live
packaged-build worker-thread context behaving differently — this would not be caught by jest alone.

### Pitfall 4: `conf`'s default `cwd` derivation diverging from `electron-store`'s
**What goes wrong:** `electron-store@8.2.0` derives its default storage directory from
`app.getPath('userData')` (an Electron API). `conf` (used standalone, not through electron-store)
derives its default `cwd` from `env-paths` based on the package's own `name`/`projectName` option —
a **different algorithm**, not automatically equivalent. A naive swap could silently relocate every
user's settings file on first run under Tauri.
**Why it happens:** `electron-store` is popularly assumed to be "just conf with electron glue," but
the glue includes this path-derivation behavior, not only the `require('electron')` import line
CONTEXT.md's D-04 write-up focuses on.
**How to avoid:** Explicitly pass `cwd` (or `projectName`) to `conf`'s constructor, sourced from
`backend/platform`'s `app.getPath('userData')` equivalent (which itself must resolve to the *same*
directory the current Electron build already uses, so existing users' data is found) — this is
already flagged as a research-must-confirm item in CONTEXT.md's D-04 text; this research did not
independently verify what `backend/platform`'s planned `getPath('userData')` implementation
resolves to on each OS. **Flagged as an Open Question below.**

## Code Examples

### `backend/platform`'s intended import-site shape (verified against `protocol.ts`)
```typescript
// Source: src/backend/protocol.ts:1 (current, HEAD 9870cf05c)
import { dialog, app } from 'electron'
// D-02's mechanical rewrite target:
import { dialog, app } from 'backend/platform'
```

### Tauri v2 tray with menu (Rust, illustrative — from official docs pattern)
```rust
// Source: https://v2.tauri.app/learn/system-tray/ ; https://docs.rs/tauri/latest/tauri/tray/struct.TrayIconBuilder.html
use tauri::tray::TrayIconBuilder;
use tauri::menu::{MenuBuilder, MenuItemBuilder};

// in .setup(|app| { ... })
let show = MenuItemBuilder::new("Show").id("show").build(app)?;
let about = MenuItemBuilder::new("About").id("about").build(app)?;
let menu = MenuBuilder::new(app).items(&[&show, &about]).build()?;
let _tray = TrayIconBuilder::new()
    .icon(app.default_window_icon().unwrap().clone())
    .menu(&menu)
    .on_menu_event(|app, event| match event.id().as_ref() {
        "show" => { /* show main window */ }
        "about" => { /* dispatch to sidecar's showAboutWindow-equivalent, or open public/about.html */ }
        _ => {}
    })
    .build(app)?;
```

### Tauri v2 `clear_all_browsing_data` (D-09's concrete mechanism)
```rust
// Source: https://github.com/tauri-apps/tauri/pull/11066 (feat: add webview.clear_all_browsing_data)
// Requires capability: "webview:allow-clear-all-browsing-data"
#[tauri::command]
async fn clear_login_webview_data(webview: tauri::Webview) -> Result<(), String> {
    webview.clear_all_browsing_data().map_err(|e| e.to_string())
}
```

### Correct cookie-domain filter (mirrors `main.rs:975-994`, the ONLY comparator this project should have)
```rust
// Source: .claude/skills/spike-findings-gamelib/references/tauri-login-webview-cookies.md
let host = url.host_str().unwrap_or_default();
let cookies: Vec<_> = webview.cookies()?          // NOT cookies_for_url — see Pitfalls
    .into_iter()
    .filter(|c| match c.domain() {
        Some(d) => {
            let d = d.strip_prefix('.').unwrap_or(d);
            host == d || host.ends_with(&format!(".{d}"))
        }
        None => false,
    })
    .collect();
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Electron `session.fromPartition().clearStorageData()` for logout | Tauri `webview.clear_all_browsing_data()` | Added Tauri 2.0.0-rc.16, present at pinned 2.11.5 | Directly enables D-09 without hand-rolling directory deletion |
| Electron `powerSaveBlocker` | No first-party Tauri equivalent as of 2.11.5; native OS API binding required | Unchanged since 33-RESEARCH (this research found no new plugin) | D-08 remains a first-party Rust binding, not a plugin install |
| Electron `protocol.handle()` + `app.setAsDefaultProtocolClient()` | `tauri-plugin-deep-link` (build-time Info.plist on macOS, runtime registry/xdg-mime on Windows/Linux) | Official plugin, current at 2.4.9 | D-07's registration layer swaps; `protocol.ts`'s parser is unaffected |
| `electron-vite`'s multi-entry Rollup build (main + renderer + preload) | Plain Vite (`devUrl`/`beforeDevCommand` for dev, standard `vite build` for packaging) | This phase (D-12/D-15) | Real HMR becomes possible; also the root cause class of `decompressWorker.js`'s shared-chunk hazard (`buildDecompressWorkerDev.ts`'s own header comment) goes away once Rollup's multi-entry chunk-splitting is no longer in the picture |

**Deprecated/outdated:**
- `electron-updater`: superseded by `tauri-plugin-updater`, already configured, per D-13.
- Electron's `Menu.buildFromTemplate`: superseded by `tauri::menu::MenuBuilder`/`MenuItemBuilder`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | `conf`'s latest npm version (15.1.0) is a suitable target, despite `electron-store`'s own pin being `conf@^10.2.0` | Standard Stack / D-04 | If 15.x's API has breaking changes vs. 10.x relevant to the codebase's usage (get/set/has/delete, dot-notation paths, `clearInvalidConfig`, `Options<T>` typing), the planner should pin closer to 10.x or verify the delta empirically before committing to "latest" |
| A2 | `conf`'s slopcheck `[SUS]` flag is a false positive (Levenshtein-distance name collision with `cors`, not a real typosquat signal) | Package Legitimacy Audit | If wrong, this would be a serious supply-chain risk masked by dismissive framing — mitigated by requiring a `checkpoint:human-verify` regardless of this assessment |
| A3 | `node:sea`'s `isSea()` behaves identically when called from a `worker_threads.Worker` spawned inside a packaged SEA binary as it does from the main sidecar thread | D-14, Common Pitfalls #3 | If wrong, `devSecretVault.ts`'s fail-closed guarantee could silently diverge in a worker-thread context — this is a security-relevant assumption and should be empirically verified, not just asserted, before D-14 ships |
| A4 | `backend/platform`'s planned `app.getPath('userData')`-equivalent resolves to the exact same OS directory the current Electron build already uses, so a `conf` swap does not relocate existing users' settings files | Common Pitfalls #4 | If wrong (and any real users exist on any build — D-00e says none do for *released* builds, but developers running the app locally do have real settings files), a `conf` swap would silently orphan existing config on developer machines. Low blast radius given D-00e, but should still be verified rather than assumed |
| A5 | Windows/Linux Tauri CI-artifact production (3-OS `tauri-action` matrix, code-complete per D-00c) plus a smoke launch is sufficient evidence for D-16's gate, without requiring `34-07`'s live hardware verification first | D-16 | If insufficient, the cutover gate could pass on Windows/Linux builds that produce a valid artifact but fail at runtime in a way CI cannot detect (this research explicitly could NOT resolve this — see Open Questions) |

## Discretion Decisions (the four)

### D-04 — `electron-store` disposition

**Default from CONTEXT.md:** swap to `conf` directly.

**Research confirms the direction, corrects the scope.**

**(i) The `conf@10` API delta against this codebase's actual usage.** This codebase's usage of
`electron-store`, re-derived from the ten real import sites, is narrow: `new Store(options)`
(constructor with an `Options<T>` object — `cwd`, `name`, `clearInvalidConfig` seen in comments),
`.get(key, defaultValue)`, `.set(key, value)`, `.has(key)`, `.store` (raw object property access,
seen in `handlers.ts:302` — `cacheBackedStore.store`), and dot-notation key paths (explicitly
called out in `preload/api/misc.ts`'s `isSecretStoreKey` comment: "electron-store supports
dot-notation paths"). `conf`'s own README (not independently fetched in this session — **flagged
LOW confidence, verify at plan time**) has historically preserved this exact surface across major
versions; `electron-store` itself is a thin wrapper that barely modifies `conf`'s API (mainly
adding Electron-specific defaults like the `userData`-derived `cwd`). The narrow, stable surface
used here is a good sign for a low-risk swap, but this claim should be verified against the actual
`conf` changelog/README before the plan locks a version, since this research did not fetch it via
Context7 (unavailable in this environment) or WebFetch.

**(ii) `src/frontend/helpers/electronStores.ts` is a same-named renderer mirror, NOT a real
electron-store import.** Confirmed by direct read: it imports only *types* from
`common/types/electron_store` and constructs `TypeCheckedStoreFrontend` instances whose methods
call `window.api.storeNew(...)`/`storeGet(...)`/etc — IPC calls to the backend, never a direct
`electron-store`/`conf` dependency. This file is unaffected by the D-04 swap and needs no changes.

**(iii) `electron-store`'s default `cwd` derivation.** Confirmed via training knowledge
`[ASSUMED — not independently verified via WebFetch/Context7 this session]`: `electron-store`
derives its default storage path from Electron's `app.getPath('userData')`. `backend/platform`
already needs to supply an `app.getPath` implementation (it's one of the 22 exports carried
forward from `electronStub.ts`) — the existing `getPath` implementation in `electronStub.ts`
(not fully read in this session — **Open Question**, see below) should be checked to confirm it
already resolves `'userData'` to a path, which `conf`'s constructor can then be passed explicitly
as `cwd`.

**Scope correction — ten real sites, not two:**

| File | Nature of `electron-store` reference |
|---|---|
| `src/backend/cache.ts` | `import Store from 'electron-store'` — real, direct construction |
| `src/backend/electron_store.ts` | `import Store from 'electron-store'` — real, the central `TypeCheckedStoreImpl` wrapper every app store goes through |
| `src/backend/sidecar/handlers.ts` | `import Store from 'electron-store'` — real, `new Store({...})` at line 297 for a cache-backed read path |
| `src/backend/sidecar/storeWriteHandlers.ts` | `import Store from 'electron-store'` — real, `new Store({...})` at line 92 for the write path |
| `src/common/types/electron_store.ts` | `import Store from 'electron-store'` — used only for `Store.Options<T>` typing, but it is a **value-level** import (not `import type`), so it is erased at compile time only because nothing at runtime references the default export — still counts toward D-03's "electron nowhere in src/" grep unless converted to `import type` |
| `src/preload/api/misc.ts` | `import type Store from 'electron-store'` (type-only, compile-time erased) **PLUS** a **lazy runtime `require('electron-store')`** at line 176, reached only when `!isTauri()` — this is itself one of D-01's 140 `isTauri()` branches, and needs to be collapsed alongside the store swap, not treated as a separate later fix |
| `src/backend/sidecar/installElectronHook.ts` | Does not import the package — it **intercepts** `require('electron-store')` calls via a `Module._load` hook (`request === 'electron-store'` check at line 48) and redirects to `fileStore.ts`. Becomes dead code once nothing in the sidecar's require graph asks for `'electron-store'` by name |
| `src/backend/sidecar/bootstrap.ts` | Comment-only reference documenting the hook install order requirement (`require('electron-store')` → fileStore must be installed before any module that calls `new CacheStore()`). No code change needed beyond removing the now-stale comment once the hook itself is deleted |
| `src/backend/__tests__/cache.test.ts`, `src/backend/__tests__/storeChangeNotifier.test.ts` | Test-only imports/mocks — update alongside the source files they test |

**Consequence for D-03's grep test:** D-03's "electron nowhere in `src/` or `package.json`" grep
will also need `electron-store` removed from `package.json`'s dependencies (confirmed present:
`"electron-store": "^8.2.0"` in the current `package.json`) — this was already implied by D-04's
own text but is worth stating explicitly: **D-03 and D-04 are not independent; D-03's success test
is only fully satisfied once D-04 lands**, unless D-04's fallback (keep electron-store + the alias)
is chosen instead, in which case D-03's grep gains the documented asterisk CONTEXT.md already
anticipates.

**Recommendation:** Adopt the default (swap to `conf`), scoped to the ten sites above (not two),
sequenced so `preload/api/misc.ts`'s lazy require and the `installElectronHook.ts`/`bootstrap.ts`
interception cleanup land in the same task as the `cache.ts`/`electron_store.ts` core swap — these
are not independently choosable without risking exactly the "isTauri()-shaped branching left
behind" anti-pattern D-17 warns against elsewhere.

### D-14 — Where `isPackaged` comes from

**Default from CONTEXT.md:** move `isPackagedSidecar()` into `backend/platform`, have
`app.isPackaged` delegate to it.

**Research confirms this is well-supported and low-risk, with one genuine open question.**

`isPackagedSidecar()` (`humbleFlowRegistration.ts:159`) is not merely "a correct resolver that
exists" — it is already the **de facto idiom** this codebase uses for "am I packaged" checks
outside the one place that still lies about it (`electronStub.ts:207`). Three independent call
sites all mirror its exact guarded try/catch shape and explicitly cite it in their own comments as
the pattern to follow:
- `devSecretVault.ts` — imports and calls it directly (guardrail (c), security-critical).
- `decompressPool.ts`'s `resolveWorkerSpec()` — "Access to `node:sea` mirrors `isPackagedSidecar()`
  ... exactly — same guarded try/catch shape, same fail-safe default."
- `lzmaNativeBinding.ts`'s `resolveNativeBinding()` — "mirroring `decompressPool.ts`'s
  `resolveWorkerSpec()` and `humbleFlowRegistration.ts`'s `isPackagedSidecar()`."

This is strong convergent evidence that unifying `app.isPackaged` to delegate to this function is
not introducing a new pattern but *completing* one that's already dominant everywhere except the
one place (`electronStub.ts`) that predates it.

**Security note reconfirmed:** `devSecretVault.ts`'s guardrail (c) explicitly states it reuses
`isPackagedSidecar()` "NOT re-derived" specifically to avoid a second, possibly-diverging
derivation. Making `app.isPackaged` a *third* independent caller of the *same* function (rather
than a second independent derivation) is exactly the fix CONTEXT.md's security framing calls for.

**Genuinely unresolved (flagged, not guessed at):** whether `require('node:sea').isSea()` returns
the same result when called from inside a `worker_threads.Worker` spawned by the packaged SEA
binary as it does from the sidecar's main thread. All three existing call sites
(`isPackagedSidecar()` itself, `resolveWorkerSpec()`, `resolveNativeBinding()`) are each
independently guarded and each independently call `require('node:sea')` fresh rather than trusting
a cached value from another context — which is *itself* mild evidence the original authors were
not fully certain of cross-context consistency and hedged by re-deriving locally each time. This
research did not find (via WebSearch or code) an authoritative statement of `node:sea` behavior
inside worker threads. **Recommend an empirical one-line verification** (log `isSea()`'s result
from inside an actual spawned worker in a packaged build) as part of D-14's plan, before treating
the unification as risk-free for the security-critical path.

**Recommendation:** Adopt the default. Add the empirical worker-thread verification as an explicit
task/checkpoint, not an assumption.

### D-15 — Dev loop shape

**Default from CONTEXT.md:** Vite dev server via `devUrl` + `beforeDevCommand`, plus a separate
build-mode script.

**Research confirms the tension is real and the mitigation (keep a build-then-serve script) is
sound, based on how Tauri resolves `frontendDist` vs `devUrl`.**

Tauri v2's `build` config in `tauri.conf.json` supports both `frontendDist` (a static directory,
used for packaged builds and any `tauri build`) and `devUrl` (a URL, used only when `tauri dev` is
invoked and no `frontendDist`-only override is forced). These are **structurally different code
paths in the Rust shell**: `devUrl` causes the shell to load the renderer via an HTTP(S) request to
a running dev server (WKWebView/WebView2/WebKitGTK all support loading remote URLs), while
`frontendDist` causes the shell to load from Tauri's bundled-asset protocol
(`tauri://localhost/...` on most platforms). This is precisely the mechanism gap `R-34.5-G1-PKG`
lives in — a `publicDir`/`resource_dir()` resolution bug that is invisible under `devUrl` (no
static-file resolution happens at all) becomes real only under `frontendDist`.

Consequently: **a `tauri dev` run using `devUrl` provides zero evidence about `frontendDist`
resolution correctness.** The current `tauri.conf.json` in this repo does not yet declare `devUrl`
(`build.frontendDist` is set to `"../build"`, unconditionally, with no `devUrl` key present) — so
today's `pnpm tauri:dev` already exercises the `frontendDist` path even in dev, which is
*accidentally* why `R-34.5-G1-PKG` was discoverable at all through a dev-adjacent workflow (per
D-19's own text, though the actual proof there was a packaged DMG mount, not a dev run). If D-15
introduces `devUrl` for real HMR, this accidental evidence path disappears entirely, which is
exactly the tension CONTEXT.md flags.

**Recommendation:** Adopt the default, but make the "separate build-mode script" concrete: keep
(or add) an explicit `pnpm tauri:build-preview`-style script that runs the full `vite build` →
`tauri.conf.json`'s `frontendDist` path → `tauri build --debug` (or an equivalent non-dev-server
invocation) as a fast, iterable way to exercise the packaged-resolution code path without a full
release build. Cross-reference D-19's note that the existing `CI=e2e` path already reaches the
`'build'` branch cheaply — that harness should be preserved and pointed at by this script, not
duplicated.

### D-17 — Plan ordering and the point of no return

**Default from CONTEXT.md:** (1) additive work while both shells run; (2) tag
`pre-electron-cutover`; (3) delete Electron entry points (point of no return, small plan);
(4) the 67-file rewrite (by then behaviorally inert).

**Research validates the core premise (`backend/platform` genuinely creatable-but-unconsumed
while Electron still runs) and confirms the seam location, with one refinement.**

`backend/platform`'s 22 exports are a pure reimplementation of `electronStub.ts`'s existing 22
exports under a new module path. Because nothing currently imports from `'backend/platform'` (it
does not exist yet), creating it fully — even wiring real tray/deep-link/wake-lock/`conf`
implementations inside it — has **zero consumers** until the 67-file rewrite's `from 'electron'` →
`from 'backend/platform'` string-swap lands. This confirms step (1)/(4)'s separation is sound:
`backend/platform` can be built and even unit-tested in isolation (mirroring how `electronStub.ts`
already has its own test suites) entirely before any import site changes.

**Deleting `src/backend/main.ts` before the 67-file rewrite:** does this leave a working
`pnpm tauri:dev`/build at every intermediate commit? **Yes, with a caveat.** `main.ts` (the
Electron entry point) is only reachable via Electron's own bootstrap
(`electron.vite.config.ts`'s `main:` build target → the Electron binary's `main` field in
`package.json`), which the Tauri path never touches — confirmed by D-00f's finding that
`src/preload/index.ts`'s own header states Tauri never loads that bundle, and by the fact that the
sidecar (`src/sidecar/index.ts`, a **separate entry point** from `main.ts`) is what Tauri spawns.
Deleting `main.ts` therefore breaks `pnpm start` (the Electron dev script) but should **not** break
`pnpm tauri:dev`/`tauri build`, *provided* `src/sidecar/index.ts` does not itself import anything
from `main.ts` (this research did not exhaustively verify zero import edges from the sidecar entry
to `main.ts` — **flagged as a pre-flight check the planner should run**: `grep -rn "from.*backend/main'" src/sidecar/ src/backend/sidecar/` before committing to this ordering, since a single stray import would silently break the Tauri path at exactly the "point of no return" step).

**One refinement to the default ordering:** because D-01's `--alias:electron=` is single-sourced
(see Re-derived Counts), the point-of-no-return step (3) does not need to touch
`meta/esbuildWorkerBundleShared.ts` at all — the alias can safely remain in place through step (3)
and only needs removal as part of step (4)'s cleanup, since nothing about deleting `main.ts`/
`preload/index.ts` changes whether the sidecar's build still needs the alias (it does, until the
67-file rewrite removes every `require('electron')` the alias currently rescues).

**Recommendation:** Adopt the default ordering. Add the explicit pre-flight import-edge check
(`src/sidecar/index.ts` → `src/backend/main.ts`) as a task inside step (3)'s plan, and confirm the
alias removal is correctly scoped to step (4), not step (3).

## Individual Numbered Research Items (from `<research_questions>`)

### 1. `R-34.5-G1-PKG` half (a) — locale files absent from the bundle

`tauri.conf.json`'s `bundle.resources` currently lists only `["../build/bin/"]` (confirmed
verbatim). Tauri v2's `bundle.resources` accepts glob patterns or a map of
`{ "source/glob/**/*": "target/subpath" }`; each matched path is copied under
`Contents/Resources/` on macOS (and the equivalent per-platform resource directory on
Windows/Linux) at bundle time, then read back at runtime via `app.path().resource_dir()`.
`[ASSUMED — general Tauri v2 bundle.resources behavior from training knowledge; not independently
re-verified via Context7/WebFetch this session]`. The fix is almost certainly adding
`"../build/locales/"` (mirroring the existing `"../build/bin/"` entry's shape) to the `resources`
array — a config-only change, not a Rust code change, **provided** the existing `GAMELIB_APP_ROOT`
handoff (Phase 34.5) already resolves `resource_dir()` correctly (confirmed it does, per
`main.rs:5491-5501`'s `resolve_packaged_app_root()`). This means half (a) is genuinely lower-risk
than the `publicDir`/`copyDir` symlink-dereferencing minefield the four prior burns involved —
those were about a **build-time Vite copy step** dereferencing symlinks (F-34.9-01), not about
Tauri's own bundle-resources copy mechanism, which is a different code path entirely. **This
research recommends narrowing the "treat as a minefield" framing specifically to any change that
touches Vite's `publicDir`→`outDir` copy (the actual four-time offender), not to the
`tauri.conf.json` `bundle.resources` array edit itself**, which is comparatively low-risk.

The `CI=e2e` harness (`paths.ts`'s `|| process.env.CI === 'e2e'` clause, confirmed present since
commit `87c0ef823`, 2026-07-21) is confirmed to already reach the `'build'` branch — this can serve
as a cheap harness for half (b)'s fix, but **does not exercise half (a)** (the bundle-resources
config), since `CI=e2e` never runs an actual `tauri build`/DMG-mount cycle. Half (a) genuinely
needs at least one real packaging run to verify, though it does not need one *per iteration* if the
config diff is reviewed carefully first (the risk surface — a glob pattern in a JSON array — is
small enough to reason about statically).

### 2. D-06 Tray

Confirmed via WebSearch + `Cargo.toml`: the `tray-icon` Cargo feature is already enabled
(`tauri = { version = "2", features = ["tray-icon", "image-png", "unstable"] }`), so no new
dependency is needed — only new Rust code using `tauri::tray::TrayIconBuilder` and
`tauri::menu::{MenuBuilder, MenuItemBuilder}`. Mapped against `tray_icon.ts`'s actual behavior
(confirmed by direct read): tray icon creation (`new Tray(...)`), context menu with recent games +
Show + About + Quit-style items (`Menu.buildFromTemplate`), dock menu on macOS
(`app.dock?.setMenu`), tooltip, click-to-show/hide, and two event listeners
(`changeTrayColor`, `recentGamesChanged`, `languageChanged`) that rebuild the menu. The
`handleProtocol` call inside the recent-games menu's `click` handler (`tray_icon.ts:107` per
CONTEXT.md, confirmed at that approximate location) is the D-06/D-07 coupling: clicking a
recent-game tray item calls `handleProtocol(['gamelib://launch?appName=...'])` — under Tauri, this
needs the tray's Rust-side menu-click handler to invoke the equivalent of `protocol.ts`'s parser,
either by re-implementing the URL construction in Rust and delegating to
`tauri-plugin-deep-link`'s own dispatch, or (cleaner) by having the Rust menu handler send an IPC
message to the sidecar carrying the launch intent directly, bypassing the deep-link plugin
entirely for this internal (non-OS-originated) case. **Recommend the latter** — routing a purely
internal tray click through the OS-level deep-link registration adds an unnecessary round trip
through the OS and is not what deep-link plugins are designed for (they're for *external*
`gamelib://` URL opens).

`app.dock?.setMenu` (macOS dock menu) has no obvious Tauri v2 equivalent surfaced by this
research — **flagged as an Open Question** (D-05 already accepts most secondary affordances as
gaps; the dock menu may need to join that accepted-gap list unless the planner finds a Tauri v2
dock-menu API this research missed).

### 3. D-07 Deep links

Confirmed via WebSearch (see Standard Stack): `tauri-plugin-deep-link` v2 (2.4.9) handles macOS
(build-time `CFBundleURLTypes` generation from `tauri.conf.json`'s `plugins.deep-link` config —
runtime `register()` is unsupported/errors on macOS, matching how `main.ts:501` currently uses
`app.setAsDefaultProtocolClient` conditionally on `process.env.CI !== 'e2e'`), Windows (runtime
registry writes via `register()`), and Linux (runtime `xdg-mime`/`update-desktop-database`, with
those binaries required on the system). **Single-instance interaction confirmed as a hard
requirement, not optional**, on Windows/Linux: deep links arrive as a CLI argument to a *new*
process there, and `onOpenUrl` will never fire without `tauri-plugin-single-instance` also
installed with its `deep-link` feature enabled to redirect that new-process launch back to the
already-running instance. Neither plugin is currently in `Cargo.toml` (confirmed) — both are net-
new additions. `protocol.ts` + `protocol.test.ts` are confirmed to survive unchanged (the parser
takes a `string[]` of args and looks for a `gamelib://`-prefixed one — this is agnostic to how the
Rust shell obtains that string).

### 4. D-08 Wake lock

33-RESEARCH's "no viable maintained Tauri v2 wake-lock plugin" conclusion (candidates surveyed:
`tauri-plugin-nosleep`, `tauri-plugin-screen-wake-lock`) is **not contradicted by anything found in
this research pass** — no new plugin search was independently re-run this session (time-scoped
decision, given 33-RESEARCH already did this work at MEDIUM confidence and this phase's research
budget was concentrated on the four discretion decisions and the count re-derivations). **Treat
33-RESEARCH's finding as still current but re-verify with one fresh `npm view
tauri-plugin-screen-wake-lock` / GitHub-last-commit check at plan time**, since 33-RESEARCH itself
flagged that candidate as "not independently verified for maintenance" (its own Assumption A3).
The two real call sites (depot download preventing system sleep, `launcher.ts:190` preventing
display sleep while a game runs) are confirmed unchanged in this session. A first-party Rust
binding needs: macOS `IOPMAssertionCreateWithName` with `kIOPMAssertionTypePreventUserIdleDisplaySleep`
(display) vs `kIOPMAssertionTypeNoIdleSleep`/`PreventSystemSleep` (system) — note
CONTEXT.md's phrasing "...vs `...SystemSleep`" should resolve to the correct assertion-type
constant name during implementation, this research did not independently verify the exact
IOKit constant name pairing `[ASSUMED — training knowledge, not re-verified via Apple docs this
session]`; Windows `SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED)`;
Linux via `systemd-inhibit` (shelling out) or a D-Bus `org.freedesktop.login1.Manager.Inhibit` call.

### 5. D-09 Logout by deleting the webview data directory

The spike doc (`tauri-login-webview-cookies.md`, invoked via `Skill("spike-findings-gamelib")`)
directly informs this: there is **no `session.fromPartition()` shape** under Tauri (Requirement
#7 of that doc) — jar access requires a live `Webview` handle. Isolation between windows requires
opting into `.data_store_identifier([u8; 16])` (macOS/iOS only; **unsupported on Windows/Linux/
Android**, where `.data_directory(PathBuf)` is the equivalent instead, per the WebSearch findings
above). By default, **all windows share one cookie jar** — confirmed by the spike doc's own
measurement ("the app's own `tauri://` webview, the login window, and any other window all
returned the *same* 33 cookies").

This directly informs D-09's "known costs": achieving true per-runner isolation (Humble vs. a
future Epic/GOG webview-based login) requires **either** per-runner `data_store_identifier` values
on macOS **and** per-runner `data_directory` paths on Windows/Linux (two different mechanisms per
platform, confirmed genuinely different APIs, not a unified cross-platform primitive) — this is a
real, higher-than-CONTEXT.md's-framing-suggests implementation cost if per-runner isolation is ever
pursued, though it remains correctly deferred per CONTEXT.md's own Deferred Ideas list.

**The concrete mechanism recommendation:** rather than raw filesystem deletion of a webview data
directory (which requires hardcoding or resolving OS-specific paths like
`~/Library/HTTPStorage/{pkg}`/`~/Library/WebKit/{pkg}` on macOS, the WebView2 user data folder on
Windows, and XDG dirs on Linux — exactly the fragmented-path problem the official API was built to
solve), use Tauri's own `Webview::clear_all_browsing_data()` / `WebviewWindow::clear_all_browsing_data`
command (confirmed added at 2.0.0-rc.16, present at the pinned 2.11.5, gated behind the
`webview:allow-clear-all-browsing-data` permission). This achieves the same "strictly stronger than
`clearStorageData()`" goal D-09 states (takes localStorage/IndexedDB too) without needing any
manual path resolution, and sidesteps the exact `cookies_for_url()`-class defect risk the spike doc
warns about. The two real callers (`humble/user.ts` — confirmed; **`legendary/user.ts` does not
exist as a distinct file in this codebase** — see correction below) would call this command via IPC
rather than a filesystem `rm`.

**Correction to CONTEXT.md's file reference:** CONTEXT.md names "`humble/user.ts` and
`legendary/user.ts`" as the two real `session.fromPartition` callers. Direct grep at HEAD finds
`session.fromPartition` calls **only in `src/backend/humble/user.ts`** (14 occurrences across the
file). No `src/backend/legendary/user.ts` file matched a `session.fromPartition`/
`clearStorageData`/`BrowserWindow`/`webview` grep in this session — **flagged as an Open Question**:
either the second caller is under a different path (e.g. `src/backend/legendary/` has multiple
files, or the login flow lives elsewhere in the Legendary/Epic adapter), or CONTEXT.md's second
caller reference needs re-derivation. The planner should re-run
`grep -rln "session.fromPartition" src/backend/` before scoping D-09's file list, since this
research found only one confirmed real caller, not two.

### 6. D-12 Vite migration

Confirmed: `.github/workflows/release-tauri.yml`'s only located Electron-coupled step in this
session's grep pass was the `package.json` script chain (`pnpm exec electron-vite build` referenced
indirectly via the `tauri:dev`/`release:*`/`dist:*` scripts already quoted above) — this research
did not independently re-open `release-tauri.yml` at line 165 to re-confirm the exact line number
(**flagged — re-grep before trusting "line 165" specifically**, per the phase's own stated line-
number-drift discipline). `electron.vite.config.ts:75-101`'s `renderer:` block was not directly
re-read in this session (file exists per `package.json` script references, not independently
opened) — **flagged as an Open Question**: this research relies on CONTEXT.md's own characterization
("already plain-Vite-shaped... `root: '.'`, `input: index.html`, `outDir: 'build'`,
`emptyOutDir: false`, `srcAliases`, react/svgr/vite_plugin_react_dev_tools/
preserveRunnerSymlinksPlugin") rather than independently re-verifying it byte-for-byte, given time
constraints. **Recommend the planner (or a plan's first task) open this file directly** before
relying further on this characterization, since it is the single largest lift in D-12.
`preserveRunnerSymlinksPlugin`'s load-bearing status (F-34.9-01, symlink dereferencing during
`copyDir` breaking codesign on the onedir CrossOver runners) is corroborated independently by this
research's own finding that Vite's `publicDir`→`outDir` copy path is the repo's documented
four-time build-breaker — consistent with, not merely restating, CONTEXT.md's warning.

### 7. D-13 Updater handover

Confirmed via direct `tauri.conf.json`/`Cargo.toml` read: `plugins.updater` has a pubkey, one
GitHub-releases endpoint (`https://github.com/grayson-mitchell/GameLib/releases/download/updater/
latest.json`), and `windows.installMode: "passive"`. `tauri-plugin-updater = "2"` is present in
`Cargo.toml`. `gh release list` independently confirms D-00e: zero GameLib-branded releases exist
(all 20 listed releases carry Heroic version numbers/names, inherited from the fork's history) —
so there is no existing-user migration path to design, confirmed.

### 8. D-11 Linux AppImage-only

Confirmed via direct `tauri.conf.json` read: `bundle.targets` is exactly
`["nsis", "appimage", "dmg"]`. `flatpak/` directory and `dist:flatpak`/`flatpak:prepare` scripts
were not independently opened in this session to enumerate their exact contents (time-scoped) —
this research relies on CONTEXT.md's characterization ("built around
`com.heroicgameslauncher.hgl.yml` and Heroic's Flathub identity"). **Recommend the planner do a
`find flatpak/ -type f` + `git log --follow` pass on that directory as a first task**, to produce
an exact deletion manifest rather than relying on this research's unverified pass-through of
CONTEXT.md's own characterization.

### 9. The folded todos

Read directly (compressed excerpts retrieved where needed) at HEAD:

| Todo | What it actually needs |
|---|---|
| `installed.json` watcher never ported (2 duplicate files, dedupe) | `main.ts` (Electron) has some in-memory `installed.json` watch/reload mechanism that was never ported to the sidecar. Concretely surfaced as a Cloud-Saves-Sync failure: `legendary sync-saves` computing a save path against an empty/stale `installed.json` view, leaving the save path field empty. Needs: identify what triggers the Electron watcher (likely an `fs.watch` on `installed.json` or a post-install in-memory cache refresh) and port an equivalent refresh trigger into the sidecar's install/library flow |
| `openDialog` missing from `LONG_RUNNING_CHANNELS` | The Rust shell's IPC transport (`main.rs`, `sidecarRpc.ts`, `electronStub.ts`) has a fixed timeout for "normal" channels and an allowlist of channels permitted to run long (`LONG_RUNNING_CHANNELS` in `main.rs`). `openDialog` (native folder/file picker) isn't in that allowlist, so any picker session open >~60s gets silently dropped — live-reproduced killing `moveInstall`/`importGame` (folder picker appeared, user picked a destination, nothing happened, log went silent). Fix: add `openDialog` to the long-running allowlist in `main.rs` |
| `winetricksInstall` send-channel silent no-op | A `send`-kind (fire-and-forget, not `invoke`) IPC channel registered on both ends (frontend `SearchBar`/`Winetricks` components, backend `wineToolsFlowRegistration.ts`) that produces literally nothing when invoked — live-reproduced (click Install, zero log lines in either sink). This matches the memory `sidecar-send-channels-fail-silently.md` gotcha pattern — likely the same root-cause class as other `send`-channel failures already fixed elsewhere in this codebase; needs the same fix pattern applied here |
| About window unreachable | `tauriShowAboutWindow` (`tauriChildWindows.ts:98`) is **fully implemented** (resolves version, reuses an existing `about` window, loads `public/about.html`) but has **zero callers** anywhere in the tree except Electron's tray menu (`tray_icon.ts:124`), which Tauri's tray implementation doesn't yet have. This is D-06's own "About" menu item — once the tray is ported (D-06), wiring its About menu item to call `tauriShowAboutWindow` closes this todo as a side effect, not a separate task |
| EOS remove dialog renders as native system dialog | The Legendary/EOS overlay's remove-confirmation dialog uses `dialog.ts`'s `showDialogBoxModalAuto`-style native dialog instead of the app-styled `Dialog` component used elsewhere (`~14` other dialogs already use the app-styled pattern) — this is a UI consistency fix inside `eos_overlay.ts`, not a shell-architecture change; low complexity but in D-05's "any affordance that lies" scope only if the native dialog is considered a broken affordance (it isn't broken, just inconsistently styled) — likely just a straightforward D-05-adjacent polish task, not blocking |
| Path-rejection dialog oversized | A specific `showDialogBoxModalAuto({title, message, type: 'ERROR'})` call in `installFlowRegistration.ts` (two call sites, lines 317/444 per the todo's own file references) renders using the "large text window" dialog model when a smaller one would suffice — a cosmetic sizing fix, already marked G2-3 PASSED in the todo's own body text (meaning the underlying reject-direction logic itself is fine; only the dialog's visual size is the residual issue) |

### 10. SEAM.md convergence items

**Phase 29 D-08 — `SECRET_STORE_KEYS` deny-list vs. Tauri fail-closed allow-list.** Confirmed by
direct read of `preload/api/misc.ts`: the Electron path's `storeGet` checks a hardcoded deny-list
(`SECRET_STORE_KEYS`) naming specific fields (`humbleConfigStore.sessionCookie`/`csrfToken`,
`steamConfigStore.refreshToken`, `gogConfigStore.credentials`, `zoomConfigStore.credentials`) to
block from renderer reads. The Tauri path instead enforces a **fail-closed allow-list**
(`common/types/storePolicy.ts`'s `isAllowedStoreField`). The file's own comment states explicitly:
"the two builds deliberately carry divergent secret policies until the Electron cutover
(Phase 35)... Do not 'fix' this by unifying the two policies early; that is Phase 35's job." This
is now unblocked — since Electron is being deleted, the Tauri allow-list becomes the *only* policy,
and the deny-list + its `isSecretStoreKey` function become dead code to delete alongside the rest
of `preload/api/misc.ts`'s Electron-path branches. **This requires actual verification, not just
deletion**: confirm every one of the four deny-listed fields is also correctly covered by the
allow-list's fail-closed logic before deleting the deny-list, since a gap here is a real credential-
exposure regression, not a cosmetic one.

**Phase 31 D-02 — settings divergence.** Confirmed by direct read of SEAM.md: accepted as
document-only — the sidecar persists settings but pushes no `settingsChanged` reflect notification
to a concurrently-running Electron instance (or vice versa). Once Electron is deleted, this
divergence is **moot by construction** (there is only one build, so "reflect to the other build" is
a non-question) — no code change needed, just confirmation that no dead reflect-attempt code exists
to clean up (this research did not find any `settingsChanged`-reflect code referencing a cross-
build push; the divergence was accepted specifically because no such code exists).

**Phase 33 D-04 — boot-time auto-resume.** Confirmed by direct read of SEAM.md
(`27-tauri-shell-walking-skeleton/SEAM.md:214-218`): `main.ts:579`'s `initQueue(isStartup=true)`
(Electron's 5-second boot-time download-queue auto-resume timer) was deliberately **not**
replicated under the sidecar, because the underlying install-resume path itself was already parked
as a known bug (`G-30-02`, plus a separate CrossOver-bottle resume bug, D-07). The suppression is
logged, not silent. **This is a real feature gap to close in Phase 35**, not merely a documentation
convergence — the planner should scope "port the boot-time auto-resume timer to the sidecar" as an
actual task, contingent on `G-30-02`'s underlying install-resume bug being resolved first (auto-
resuming into a known-broken resume path would just surface the bug more often, not fix anything).

### 11. D-18 A/B re-test

`pnpm start` (the Electron dev script, `"start": "electron-vite dev --watch"`) is confirmed present
and unmodified in `package.json` — nothing in this research found evidence it has been disabled or
broken since Phase 27's walking skeleton. The minimum harness for "run it under both" is therefore:
(a) `pnpm start` for the Electron side, (b) `pnpm tauri:dev` for the Tauri side, both against the
same working tree, run in sequence (not simultaneously, to avoid the two builds' config-store
divergence noted in Phase 31 D-02 confusing the observation) for each of: the parked bug
(`debug-uninstall-game-vanishes-parked` — this research did not re-read that debug doc's exact
repro steps in this session, **flagged — the planner's D-18 task should open it directly**) and the
six folded todos above. This is genuinely cheap per D-18's own framing (observation only, no fix
attempted) — the real cost is the number of distinct repro scenarios (7 items) × 2 shells, not the
harness setup itself.

### 12. D-16 the gate

**This research could not fully resolve the sufficiency question and flags it as a genuine open
item, per the task's own instruction to prefer an honest "unresolved" over a confident guess.**
D-00c confirms Windows and Linux Tauri builds are "code-complete and CI-wired (3-OS `tauri-action`
matrix, graceful skip)" but "never live-verified" because plan `34-07` is user-deferred. This
research did not independently inspect the `tauri-action` CI matrix's exact steps (time-scoped) to
assess whether it does anything beyond "produce an artifact" — e.g., whether it also runs any smoke
launch, IPC round-trip check, or is purely a build-and-upload step. **If the CI matrix only builds
and uploads an artifact with no runtime smoke test at all, then "CI artifacts... plus a smoke
launch" (D-16's own wording) implies the smoke launch must happen somewhere — either as a new CI
step, or as a genuinely separate human action the planner must schedule.** This is a real ambiguity
in D-16's own text that this research surfaced rather than resolved: does "plus a smoke launch"
mean CI must gain a new automated smoke-test step, or does it mean a human must manually smoke-test
a downloaded CI artifact on real Windows/Linux hardware? These have very different cost/schedule
implications, and CONTEXT.md's own Deferred Ideas list keeps "closing `34-07` first" available as a
fallback specifically because of this kind of ambiguity. **Recommend the planner make this explicit
in the plan** rather than let it stay implicit, given this is the phase's single highest-consequence
gate (D-16 is described as blocking).

The `34.18-LIVE-GATE.md` format precedent (21/21 criteria, every `Observed:` field filled) is
confirmed to exist at `.planning/phases/34.18-*/34.18-LIVE-GATE.md` (path confirmed via the file
listing gathered for git log context; not independently re-opened in this session to verify its
exact structure beyond the memory-file summary already available — **the planner should open it
directly** when drafting D-16's gate document, per the task's own instruction).

## Open Questions (RESOLVED — all five discharged at planning, 2026-08-28)

> Each question below was converted into an owning, *gating* task during `/gsd-plan-phase 35`
> rather than resolved by assertion. Resolution pointers are inline per question; the plan
> documents are authoritative.


1. **Does `require('node:sea').isSea()` behave identically in a `worker_threads.Worker` spawned
   inside a packaged SEA binary vs. the sidecar's main thread?**
   - What we know: three independent call sites in this codebase already guard this call
     identically and re-derive it fresh in each context, rather than passing a cached value across
     context boundaries — suggestive but not conclusive evidence of author caution.
   - What's unclear: no authoritative Node.js documentation statement was found confirming or
     denying cross-context consistency.
   - Recommendation: add a one-line empirical verification (log the result from inside an actual
     worker thread in a packaged build) as a D-14 plan task before trusting the unification for the
     security-critical `devSecretVault.ts` path.

   - **RESOLVED — see `35-01` (dedicated empirical worker-thread probe task). Gates `35-04` Task 1: an `UNMEASURED` result blocks the D-14 unification rather than defaulting through.**
2. **What does `backend/platform`'s planned `app.getPath('userData')`-equivalent resolve to on
   each OS, and does it match what the current Electron build already uses?**
   - What we know: `electronStub.ts` already has a `getPath` implementation (referenced but not
     fully read in this session — only the `getAppPath` neighbor was read in detail).
   - What's unclear: whether it already correctly proxies `'userData'` to the same directory
     Electron's real `app.getPath('userData')` would resolve to on each platform, which is the
     path `conf` needs for D-04's `cwd` option to avoid silently relocating developer settings.
   - Recommendation: read `electronStub.ts`'s full `getPath` implementation (lines not captured in
     this session's excerpts) as an early D-04 plan task, before writing the `conf` constructor
     call.

   - **RESOLVED — see `35-05` (its `read_first`/`action` reconcile `pathShim.getPath('userData')` against Electron's resolution algorithm before the `conf` constructor is written).**
3. **Where is the second real `session.fromPartition`-equivalent caller D-09 names as
   `legendary/user.ts`?**
   - What we know: `src/backend/humble/user.ts` is confirmed as one real caller (14 occurrences).
     No file at the exact path `src/backend/legendary/user.ts` was found to exist or to reference
     `session.fromPartition`/`clearStorageData`/`BrowserWindow` in this session's greps.
   - What's unclear: whether the second caller exists under a different filename in the
     `legendary/` (or a differently-named Epic-adapter) directory, whether the reference in
     CONTEXT.md is itself stale, or whether the Epic login flow uses a different mechanism
     entirely that D-09's text conflated with Humble's.
   - Recommendation: `grep -rln "session.fromPartition" src/backend/` as the first task of any
     D-09 plan, before finalizing the file list to touch.

   - **RESOLVED — the caller EXISTS at `src/backend/storeManagers/legendary/user.ts`; CONTEXT.md's path was an abbreviation, not a stale reference. Census performed in `35-01`, re-confirmed in `35-09`.**
4. **Is Windows/Linux CI-artifact production alone (no runtime smoke test) sufficient for D-16, or
   does "plus a smoke launch" require a new CI step / a scheduled human action?**
   - What we know: D-00c confirms the 3-OS matrix is code-complete and produces artifacts; it has
     never been live-verified.
   - What's unclear: whether the existing CI matrix includes any automated runtime check at all.
   - Recommendation: the planner should read the actual `tauri-action` CI workflow steps (not done
     in this research pass) and make an explicit choice — new automated smoke step, vs. scheduled
     manual smoke test, vs. falling back to closing `34-07` first — rather than leaving "plus a
     smoke launch" ambiguous in the plan.
   - **RESOLVED — see `35-01` (CI workflow census) and `35-19` Task 2, which carries this as an explicit blocking decision rather than an ambiguous phrase. NOTE: D-16 sufficiency was this research pass's LOWEST-confidence area; the decision is deferred to the gate, not settled here.**

5. **Does `electron.vite.config.ts:75-101`'s `renderer:` block match CONTEXT.md's characterization
   byte-for-byte?**
   - What we know: CONTEXT.md describes it as already plain-Vite-shaped with a specific plugin
     list.
   - What's unclear: this research relied on that characterization without independently
     re-opening the file (time-scoped decision).
   - Recommendation: open the file directly as the first task of any D-12 plan.
   - **RESOLVED — see `35-03` Task 1, whose first action reads `electron.vite.config.ts` directly. `preserveRunnerSymlinksPlugin` is carried forward by a name-based (not array-position) equivalence test per F-34.9-01.**

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Rust toolchain / `cargo` | All Rust-side work (D-06/D-07/D-08/D-09) | ✓ | Not independently checked this session (`cargo search`/`cargo add` both functioned, implying a working toolchain) | — |
| `pip3`/Python | `slopcheck` package legitimacy check | ✓ (via `/opt/homebrew/bin/pip3`; bare `pip` not on PATH) | Python 3.14 | Use `pip3` explicitly |
| `slopcheck` CLI | Package Legitimacy Audit | ✓ (already installed, v0.6.1) | 0.6.1 | — |
| `npm` | `npm view` package verification | ✓ | Not captured (functioned correctly) | — |
| `gh` CLI | D-00e/D-13 release-list verification | ✓ | Not captured (functioned correctly) | — |
| Context7 MCP | Library/framework documentation lookups | ✗ (not available in this environment — no `mcp__context7__*` tools were offered, and the CLI fallback `ctx7` was not attempted/confirmed present) | — | WebSearch used instead for all Tauri v2 API research; several claims in this document are flagged MEDIUM/LOW confidence as a direct consequence and should be re-verified with Context7 if it becomes available at plan time |

**Missing dependencies with no fallback:** none blocking.
**Missing dependencies with fallback:** Context7 — WebSearch fallback used throughout; confidence
levels on Tauri v2 API claims (tray, deep-link, clear_all_browsing_data, data_store_identifier)
reflect this substitution.

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | Jest (via `ts-jest` preset), confirmed at `jest.config.js` |
| Config file | `jest.config.js` (multi-project: `src/backend`, `src/common`, `src/frontend`, `src/preload`, `meta`) |
| Quick run command | `pnpm test -- <path-to-file>` (jest, targeted) — e.g. `pnpm test -- src/backend/sidecar/__tests__/electronReachLedger.test.ts` |
| Full suite command | `pnpm test` (per `package.json`'s `"test": "jest"` script; note the standing memory gotcha `full-suite-run-manufactures-failures-under-load.md` — a full run can produce a *different* failure set than targeted runs under load, so treat full-suite red as needing individual re-run before concluding a regression) |

### Phase Requirements → Test Map (illustrative — exact REQ IDs TBD at plan time)

| Req ID (placeholder) | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| REQ-35-electron-grep | `electron` appears nowhere in `src/` or `package.json` (D-03) | static/grep | `! grep -rn "'electron'" src/ package.json` (mechanized single-grep success test, per D-03's own text) | ✅ (shell command, not a jest file) |
| REQ-35-reach-ledger | Electron reach shrinks to zero across the sidecar's gated entry points | unit | `pnpm test -- src/backend/sidecar/__tests__/electronReachLedger.test.ts` | ✅ Exists — **this is the natural enforcement point**: its `BASELINE_ELECTRON_REACHING_MODULES` array is explicitly documented in the file's own header comment as "the Phase 35 cutover work-list" and is a growth-only (subset) tripwire designed specifically to shrink toward empty across this phase. Each plan/task that removes an `electron` import should shrink this array in the same commit; the test goes red if the array is stale (claims a module still reaches electron when it no longer does) or if reach silently grows |
| REQ-35-electronstub-deleted | `electronStub.ts` deleted, `backend/platform` has the same 22 exports | unit | Existing `electronStub.ts` test suites should be renamed/repointed at `backend/platform`, not deleted — preserving their assertions is how D-02's "no behavior moves" claim gets continuously verified | Partial — existing suites exist for `electronStub.ts`; need repointing, not net-new authorship |
| REQ-35-conf-swap | `conf`-backed stores round-trip identically to `electron-store`-backed ones (D-04) | unit | `pnpm test -- src/backend/__tests__/cache.test.ts src/backend/__tests__/storeChangeNotifier.test.ts` (existing files to extend) | ✅ Exists, needs extension for the new backend |
| REQ-35-isPackaged-unify | `app.isPackaged` delegates to `isPackagedSidecar()`, `devSecretVault.ts` guardrail (c) still fail-closed | unit | `pnpm test -- src/backend/sidecar/__tests__/devSecretVault.test.ts` | ✅ Exists |
| REQ-35-tray | Tray menu builds, click handlers fire, recent-games launch dispatches correctly | manual/smoke-only (Rust-side, no jest coverage of Rust) | N/A — Rust unit tests (`cargo test`) plus D-16's packaged live gate | Rust test infra exists (`src-tauri/` has some existing tests per the spike-harness references); planner should scope Rust-side test coverage explicitly, since jest cannot see Rust code |
| REQ-35-deep-link | `gamelib://` opens are received and routed to `protocol.ts`'s parser on all 3 platforms | unit (parser) + manual (OS registration, per-platform) | `pnpm test -- src/backend/__tests__/protocol.test.ts` (existing, unchanged) for the parser; D-16's gate for OS-level registration | ✅ Exists for the parser half |
| REQ-35-wake-lock | Depot download and active-game-launch hold the correct native assertion | manual-only (native OS syscalls, no jest coverage) | N/A | Manual-only, justified: `IOPMAssertionCreateWithName`/`SetThreadExecutionState`/`systemd-inhibit` are OS syscalls unreachable from a Node/jest test environment |
| REQ-35-logout-clear | Logout via `clear_all_browsing_data()` actually removes session data (not just reports success) | manual-only, mirroring the spike's own "never trust the removal call's own completion signal" discipline | N/A — requires an independent post-clear cookie/localStorage read to verify, same pattern the spike doc's Rust cookie-clear fix already established for Epic logout | Manual-only, justified: verifying a *real* browser-engine data clear categorically needs a live webview, matching the existing precedent this codebase already set for the Epic logout fix |
| REQ-35-secret-policy-unify | `SECRET_STORE_KEYS` deny-list fully subsumed by `storePolicy.ts`'s allow-list before deletion | unit | Existing `common/types/__tests__/storePolicy.test.ts` — extend to explicitly assert all 4 deny-listed fields are blocked by the allow-list | ✅ Exists, needs extension — **security-critical, do not skip** |

### Sampling Rate
- **Per task commit:** targeted `pnpm test -- <changed-area>` (backend/sidecar/frontend project
  scoped via jest's `--selectProjects`, mindful of the standing case-sensitivity gotcha recorded in
  this project's memory).
- **Per wave merge:** full `pnpm test` (accepting the standing under-load-false-failure caveat —
  re-run any red result individually before treating it as a real regression).
- **Phase gate:** Full suite green, `electronReachLedger.test.ts`'s baseline array reduced to
  empty (or explicitly justified non-empty, if any accepted-gap module per D-05 still legitimately
  needs the hook-rescue), single D-03 grep clean, before D-16's packaged live gate.

### Wave 0 Gaps
- [ ] `src-tauri/` Rust-side test coverage for the new `tray.rs`/`deep_link.rs`/`wake_lock.rs`
      modules — no existing jest coverage can reach Rust code; scope `cargo test` coverage
      explicitly as part of D-06/D-07/D-08's plans, not left implicit.
- [ ] `storePolicy.test.ts` extension asserting all four `SECRET_STORE_KEYS` fields are covered by
      the allow-list, authored **before** `SECRET_STORE_KEYS` itself is deleted (Phase 29 D-08
      convergence — security-relevant, sequence this as a gate, not a cleanup afterthought).
- [ ] A `conf`-vs-`electron-store` round-trip fixture test (write via the old backend, read via the
      new one, or vice versa) to empirically settle Open Question #2 (userData path parity) before
      trusting the swap not to orphan existing settings files.

*(All other test infrastructure — jest, ts-jest, the existing `electronStub.ts`/`protocol.ts`/
`devSecretVault.ts`/`storePolicy.ts` suites — already exists and is confirmed present in the
current tree; no framework install is needed.)*

## Security Domain

> `security_enforcement` not found explicitly set to `false` in `.planning/config.json` (absence =
> enabled per instructions).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | Indirectly — this phase does not change auth flows, but D-09's logout mechanism is security-adjacent | `clear_all_browsing_data()` for session termination (D-09) |
| V3 Session Management | Yes | D-09's webview-data-directory/browsing-data clear on logout is a session-termination control |
| V4 Access Control | Yes — directly | The Phase 29 D-08 convergence item (`SECRET_STORE_KEYS` deny-list → `storePolicy.ts` fail-closed allow-list unification) is exactly a V4-class control: which renderer-readable fields are permitted |
| V5 Input Validation | N/A — no new user-input surfaces introduced by this phase | — |
| V6 Cryptography | N/A — no cryptographic primitives touched (Keychain/`safeStorage`-equivalent handling is carried forward unchanged via `backend/platform`'s `safeStorage` export, not modified) | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Deny-list secret field enumeration going stale (a new secret field added to a store but never added to the deny-list — the exact CR-06 Phase 29 code-review finding already fixed once for three fields) | Information Disclosure | Fail-closed allow-list (`storePolicy.ts`) is structurally safer than a deny-list precisely because it defaults to blocking unknown fields rather than exposing them — this is the core reason Phase 29 D-08's convergence (deleting the deny-list, keeping only the allow-list) is a net security improvement, not a neutral cleanup |
| A worker-thread execution context silently diverging from the main-thread `isPackagedSidecar()` result, defeating `devSecretVault.ts`'s fail-closed guarantee | Elevation of Privilege | Empirical verification (Open Question #1) before trusting the D-14 unification for this specific security-critical path; guardrail (c)'s existing test suite (`devSecretVault.test.ts`) should gain a worker-thread-context test case if the verification reveals any divergence |
| Manual filesystem deletion of a webview data directory targeting the wrong path (a typo, an OS-version-specific path change) silently no-op'ing the "logout" security control | Tampering / Information Disclosure (stale session persists) | Prefer the official `clear_all_browsing_data()` API over manual path resolution (D-09 recommendation) — reduces the attack surface of "the clear silently does nothing because the hardcoded path is wrong on this OS version," which is exactly the class of defect the spike doc's own "never trust the removal call's own completion signal" discipline exists to catch even for the official API |

## Sources

### Primary (HIGH confidence — direct repo read/command output, this session)
- Direct file reads and `grep`/`sed`/`wc` command output against commit `9870cf05c` for every
  count in the Re-derived Counts table.
- `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` (tauri = 2.11.5),
  `package.json` (scripts + dependency sections).
- `src/backend/sidecar/electronStub.ts`, `src/backend/sidecar/humbleFlowRegistration.ts`,
  `src/backend/sidecar/devSecretVault.ts`, `src/backend/storeManagers/steam/depot/decompressPool.ts`,
  `src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts`, `src/backend/tray_icon/tray_icon.ts`,
  `src/backend/protocol.ts`, `src/backend/main.ts`, `src/backend/launcher.ts`,
  `src/backend/humble/user.ts`, `src/frontend/helpers/electronStores.ts`,
  `src/preload/api/misc.ts`, `src-tauri/src/main.rs`, `meta/buildSidecarSea.ts`,
  `meta/esbuildWorkerBundleShared.ts`, `meta/buildDecompressWorkerDev.ts`,
  `src/backend/sidecar/__tests__/electronReachLedger.test.ts`,
  `.planning/IPC-PORT-INVENTORY.md`, `.planning/phases/27-tauri-shell-walking-skeleton/SEAM.md`,
  `.claude/skills/spike-findings-gamelib/references/tauri-login-webview-cookies.md` (via
  `Skill("spike-findings-gamelib")`), `.planning/phases/33-*/33-RESEARCH.md`.
- `gh release list`, `git log -1`, `git tag`, `cargo search`, `npm view`, `slopcheck install`
  command output (this session).

### Secondary (MEDIUM confidence — WebSearch, cross-checked against the pinned Tauri version)
- [Tauri v2 System Tray guide](https://v2.tauri.app/learn/system-tray/) — tray-icon feature,
  `TrayIconBuilder` usage.
- [TrayIconBuilder docs.rs](https://docs.rs/tauri/latest/tauri/tray/struct.TrayIconBuilder.html)
- [Tauri Deep Linking plugin docs](https://v2.tauri.app/plugin/deep-linking/)
- [tauri-plugin-deep-link GitHub](https://github.com/FabianLars/tauri-plugin-deep-link) /
  [plugins-workspace v2 source](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/deep-link/src/lib.rs)
- [tauri@2.2.0 release notes](https://tauri.app/release/tauri/v2.2.0/) — `data_store_identifier`/
  `extensions_path` addition.
- [feat: add webview.clear_all_browsing_data (tauri-apps/tauri#11066)](https://github.com/tauri-apps/tauri/pull/11066)
- [tauri@2.0.0-rc.16 release notes](https://v2.tauri.app/release/tauri/v2.0.0-rc.16/)
- [WebviewAttributes docs.rs](https://docs.rs/tauri-runtime/latest/tauri_runtime/webview/struct.WebviewAttributes.html)

### Tertiary (LOW confidence — training knowledge, not independently re-verified this session; flagged inline where used)
- `bundle.resources` glob-to-`Contents/Resources/` mapping mechanics (D-19a section) —
  general Tauri v2 behavior from training, not re-verified via Context7/WebFetch this session.
- Exact IOKit assertion-type constant naming for macOS wake-lock (D-08 section).
- `electron-store`'s exact `userData`-path-derivation mechanism (D-04 section, part iii) —
  plausible from training knowledge but not independently re-fetched from electron-store's own
  README/source this session.
- `conf`'s v10→v15 API stability claim (Standard Stack / D-04) — not independently fetched via
  Context7 (unavailable) or WebFetch this session.

## Metadata

**Confidence breakdown:**
- Re-derived counts / current-tree facts: HIGH — every number was produced by a command run
  against the live tree at a stated commit, not carried forward from CONTEXT.md unverified.
- Tauri v2 API surface (tray, deep-link, clear_all_browsing_data, data_store_identifier): MEDIUM —
  sourced from WebSearch (Context7 unavailable in this environment) and cross-checked against the
  actual pinned `tauri = 2.11.5`/plugin versions in this repo's own lockfile, but not independently
  fetched from primary docs via Context7/WebFetch.
- Wake lock (D-08) native OS API specifics: LOW→MEDIUM — the "no viable plugin" conclusion is
  inherited from 33-RESEARCH (itself MEDIUM) and not independently re-verified this session; the
  native syscall names are training-knowledge-level and flagged accordingly.
- D-16 gate sufficiency: LOW — genuinely unresolved; flagged as Open Question #4 rather than
  guessed at.
- Security domain (Phase 29 D-08 convergence): HIGH — directly read from `preload/api/misc.ts`'s
  own comments, not inferred.

**Research date:** 2026-08-28
**Valid until:** ~14 days for the re-derived counts (this is an actively-changing branch —
`fix/steam-native-install-stability` — re-verify all counts if significant time passes before
planning); ~30 days for the Tauri v2 API surface claims (stable-ish upstream, but Context7
unavailability means this should be re-checked with a primary source once planning actually begins
implementation of D-06/D-07/D-09).
