# Phase 35: Electron cutover — remove the Electron build - Discussion Log

> **Audit trail only.** Do not use as input for planning, research, or execution agents.
> Decisions are captured in `35-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-08-28
**Phase:** 35-electron-cutover-remove-the-electron-build
**Areas discussed:** Cut depth, Dead Electron APIs, Build + release, Cutover gate + rollback

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Cut depth | Does `electronStub.ts` survive? | ✓ |
| Dead Electron APIs | session/powerSaveBlocker/Menu/protocol/screen/net disposition | ✓ |
| Build + release | Vite migration, electron-builder → tauri build, updater handover | ✓ |
| Cutover gate + rollback | What proves the cut is safe, how to undo | ✓ |

**User's choice:** All four.

**Notes:** Presented alongside a re-measurement of the roadmap's dependency premises, several of
which had gone stale — see `35-CONTEXT.md` D-00a–D-00f. Most consequential finding surfaced
before area selection: `electronStub.ts` is a build-time alias for `electron` across the entire
sidecar, with 67 backend files importing from `'electron'`, which reframed "cut depth" from a
file-deletion question into the largest item in the phase.

---

## Todo folding

| Option | Description | Selected |
|--------|-------------|----------|
| Tauri channel dead ends | installed.json watcher unported; `openDialog` 60s timeout; `winetricksInstall` silent no-op | ✓ |
| Tauri UI dead ends | About window unreachable; EOS native dialog; oversized path-rejection dialog | ✓ |
| Epic logout cookie clear | wry-layer; the standing 34.6 live-gate Step 8 FAIL | ✓ |
| None — keep as todos | Leave all in the queue; Phase 35 stays a pure deletion phase | |

**User's choice:** All three groups folded.

**Notes:** 36 todos matched by keyword; most were noise. Folding rationale was that each of these
is survivable today only because the Electron build ships alongside — each becomes a release
blocker once the fallback is gone. Non-folded matches are recorded in CONTEXT.md's Reviewed Todos.

---

## Cut depth

### Q1 — Does `electronStub.ts` survive the cut?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep it, drop the dep | Shim becomes first-party platform API; `electron` leaves as runtime dep; 67 files untouched | |
| Delete it — rewrite 67 files | Every `from 'electron'` becomes an honest first-party import; alias disappears | ✓ |
| Keep everything as-is | Delete only the Electron build; shim, alias and dep all stay | |
| You decide | Defer to the planner | |

**User's choice:** Delete it — rewrite 67 files.

**Notes:** Chose the larger cut over the cheaper shim despite the alias being load-bearing in
three build paths. This is what the roadmap literally specifies, and it makes the phase goal
actually met rather than nominally met.

### Q2 — What replaces `from 'electron'` at those 67 sites?

| Option | Description | Selected |
|--------|-------------|----------|
| One module, same 22 exports | Mechanical one-string rewrite; grep-verifiable; zero behavior moves | ✓ |
| Split by concern | platform/app.ts, platform/dialog.ts etc.; honest module graph, non-mechanical diff | |
| No aggregate at all | Each consumer imports the concrete thing it needs; moves logic, not just imports | |
| You decide | Defer to research | |

**User's choice:** One module, same 22 exports.

**Notes:** Selected on the reviewability argument — in an irreversible phase, the largest diff
should be the most boring one.

### Q3 — Does `electron` leave package.json completely, including devDependencies?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — types move first-party too | 12 `import type` sites + 32 `Electron.` refs get first-party declarations; success test becomes a single grep | ✓ |
| No — keep as a types-only devDep | Cheaper, but nothing stops a future edit importing a VALUE and resurrecting the dep | |
| Yes, but narrow each site | Per-site inline types, no shared surface to drift | |
| You decide | Defer to research | |

**User's choice:** Yes — types move first-party too.

### Q4 — What happens to `electron-store`?

| Option | Description | Selected |
|--------|-------------|----------|
| Swap to `conf` directly | Kills the last `require('electron')`; lets the alias be deleted rather than kept as a vestige | |
| Keep it — keep the alias | Zero risk to the store layer; alias survives for one third-party line | |
| Patch electron-store | pnpm patch out line 3; keeps store layer byte-identical | |
| You decide | Defer to research | ✓ |

**User's choice:** You decide.

**Notes:** Recorded as Claude's discretion with a stated default (swap to `conf`), contingent on
two research checks: the conf@10 API delta, and whether `src/frontend/helpers/electronStores.ts`
is a real import or a same-named renderer mirror.

---

## Dead Electron APIs

### Q1 — Which get REAL Tauri implementations rather than shipping inert?

| Option | Description | Selected |
|--------|-------------|----------|
| Tray icon + tray settings | `tray_icon.ts` dead; `TraySettings.tsx` is a live panel that changes nothing | ✓ |
| `gamelib://` deep links | `protocol.handle` + `setAsDefaultProtocolClient`; parser and tests already exist | ✓ |
| Wake lock during downloads | D-08's own comment says "revisit at the Phase 35 cutover" | ✓ |
| Accept all — strip the dead UI | Ship stubs as documented gaps; delete affordances that lie | ✓ |

**User's choice:** All four.

**Notes:** All four selected, which combined two readings — disambiguated in Q2 rather than
guessed.

### Q2 — Disambiguation

| Option | Description | Selected |
|--------|-------------|----------|
| Fix those 3, accept + strip the rest | Tray/deep links/wake lock built; remaining stubs accepted, lying UI deleted | ✓ |
| Accept all — strip everything | No new implementations; all three become post-cutover todos | |
| Fix all of them | Nothing inert survives; session, screen, net, Menu, imagecache also implemented | |

**User's choice:** Fix those 3, accept + strip the rest.

**Notes:** Established the phase rule recorded as D-05: nothing ships an affordance it cannot honor.

### Q3 — Losing the artwork disk cache

| Option | Description | Selected |
|--------|-------------|----------|
| Accept — it's already gated | `imageCacheSchemeAvailable()` gating exists and is tested; art loads live over http(s) | ✓ |
| Re-implement as a Tauri URI scheme | `register_uri_scheme_protocol`; restores offline parity; adds Rust surface | |
| Cache in the sidecar, no protocol | No new Rust; IPC round-trips per image | |
| You decide | Defer to research | |

**User's choice:** Accept — it's already gated.

**Notes:** Accepted with the offline regression stated explicitly for release notes: offline, the
library shows no art at all where the Electron build showed cached art.

### Q4 — How does logout clear the embedded browser session?

| Option | Description | Selected |
|--------|-------------|----------|
| Delete the webview data directory | Sidesteps the wry defect where cookie deletion reports success without deleting | ✓ |
| Fix cookie deletion at the wry layer | Cleanest conceptually; open-ended platform debugging in an irreversible phase | |
| Accept — clear tokens only | Would ship the 34.6 Step 8 failure as permanent; security-relevant on a shared machine | |
| You decide | Defer to research | |

**User's choice:** Delete the webview data directory.

**Notes:** This question exists because `session.fromPartition` is stubbed and its only real
callers (`humble/user.ts`, `legendary/user.ts`) are the same surface as the folded Epic-logout
todo and the standing 34.6 live-gate Step 8 FAIL.

---

## Build + release

Two questions were dissolved rather than asked, by findings surfaced during scouting:
`release-tauri.yml` already exists and already uses `tauri-action@v1` (only one Electron-coupled
step), and `gh release list` shows GameLib has published no releases of its own — so the
`electron-updater` → Tauri-updater handover is a clean break with no migration path to design.

### Q1 — Linux artifact set and Flatpak

| Option | Description | Selected |
|--------|-------------|----------|
| AppImage only — delete Flatpak | Matches tauri.conf targets; deletes the Heroic-branded Flathub path | ✓ |
| AppImage + deb + rpm | Targets-array edit; three artifacts to smoke-test per release | |
| Full parity including Flatpak | Nothing regresses; Flatpak of a Tauri app with sidecar is its own project | |
| You decide | Defer to research | |

**User's choice:** AppImage only — delete Flatpak.

### Q2 — Where does `isPackaged` come from?

| Option | Description | Selected |
|--------|-------------|----------|
| Delegate to `isPackagedSidecar()` | One derivation; already fail-closed; closes R-34.5-G1-PKG half (b) as a side effect | |
| Build-time constant | Deterministic, but a third derivation, and fails OPEN if a build path forgets to stamp | |
| Derive from the resource dir | Reuses `GAMELIB_APP_ROOT`; path-shape inference is brittle | |
| You decide | Defer to research | ✓ |

**User's choice:** You decide.

**Notes:** Recorded as Claude's discretion with a stated default (delegate to the existing
`isPackagedSidecar()`). Surfaced during scouting: a correct resolver already exists at
`humbleFlowRegistration.ts:159` and `devSecretVault.ts` deliberately reuses it, so
`electronStub.ts:207`'s `isPackaged: false` is a second, wrong derivation of the same fact — and
devSecretVault's fail-closed security guard depends on the value.

### Q3 — Dev loop after the migration

| Option | Description | Selected |
|--------|-------------|----------|
| Vite dev server via `devUrl` | Real HMR; kills the stale-bundle failure class | |
| Keep build-then-serve | Dev and packaged load identically, so dev results still say something about the bundle | |
| Both — dev server plus a build-mode script | HMR for daily work; build-mode path preserved for packaged-shaped verification | |
| You decide | Defer to research | ✓ |

**User's choice:** You decide.

**Notes:** Recorded as Claude's discretion with a stated default (dev server plus a build-mode
script). The unresolved tension: with `devUrl`, a dev-only pass stops being evidence about the
packaged build — and `R-34.5-G1-PKG` is precisely a dev-passes/packaged-fails bug.

---

## Cutover gate + rollback

### Q1 — What has to pass before the Electron path is deleted?

| Option | Description | Selected |
|--------|-------------|----------|
| Packaged macOS arm64 live + CI artifacts | Blocking human gate on a packaged `.app`; Windows/Linux via CI matrix + smoke launch | ✓ |
| Packaged live gate on all three platforms | Also closes Phase 34's deferred 34-07; needs Windows/Linux hardware | |
| Close 34-07 FIRST, separately | Platform bugs surface while a rollback still exists | |
| You decide | Defer to research | |

**User's choice:** Packaged macOS arm64 live + CI artifacts.

**Notes:** Asked after discovering that Phase 34's plan `34-07` — the all-platform, Node-free,
live tag-push gate — is recorded user-deferred, so "all three platforms shipping on Tauri" is
currently true on paper only.

### Q2 — Point of no return and rollback

| Option | Description | Selected |
|--------|-------------|----------|
| Delete Electron entry points FIRST | Irreversible step lands in the small diff; the 67-file rewrite is then behaviorally inert | |
| Rewrite first, delete after | Follows the roadmap's intuition; puts the point of no return inside the 67-file diff | |
| Dual-mode platform module | Keeps the rewrite reversible; reintroduces `isTauri()`-shaped branching | |
| You decide | Defer to the planner | ✓ |

**User's choice:** You decide.

**Notes:** Recorded as Claude's discretion with a stated default (entry points first, tag, then
the inert rewrite). Framed by a structural constraint surfaced during the question: the 67-file
rewrite cannot be additive, because once `from 'electron'` becomes `from 'backend/platform'` the
Electron main process would run against the sidecar shim. "Keep `pnpm start` working until the
last plan" is not available in this phase.

### Q3 — When do parked bugs and folded todos get exercised?

| Option | Description | Selected |
|--------|-------------|----------|
| Re-test before the delete, fix after | Cheap observation; captures the A/B signal before it's destroyed permanently | ✓ |
| Re-test AND fix before the delete | Cut onto a known-clean shell; makes the date depend on an unbounded investigation | |
| Re-test after the cut | Simplest ordering; forfeits the Electron comparison forever | |
| You decide | Defer to research | |

**User's choice:** Re-test before the delete, fix after.

---

## Claude's Discretion

Four decisions were explicitly delegated. Each carries a stated default in `35-CONTEXT.md`; a
planner or researcher may depart from it but must say why.

- **D-04** — `electron-store` disposition. Default: swap to `conf` directly.
- **D-14** — `isPackaged` source. Default: delegate to the existing `isPackagedSidecar()`.
- **D-15** — dev loop shape. Default: Vite dev server via `devUrl` plus a build-mode script.
- **D-17** — plan ordering and the point of no return. Default: delete Electron entry points
  first, tag there, then perform the now-inert 67-file rewrite.

## Deferred Ideas

- Linux deb/rpm/pacman/tar.xz artifacts — a future one-line `targets` change.
- Flatpak under a GameLib identity — deleted, not deferred; would be its own project.
- Artwork disk cache under Tauri via `register_uri_scheme_protocol`.
- Per-runner webview data directories, if D-09's wholesale deletion proves too coarse.
- Closing Phase 34's deferred `34-07` all-platform live gate as separate work — offered as a gate
  option, not selected, but still genuinely open.

## Threads noticed and not opened

Offered at the closing checkpoint; the user chose to proceed to context.

- Whether the tray + deep-link + wake-lock build is large enough to be its own phase ahead of the
  cut rather than riding inside a deletion phase.
- What happens to `test:e2e` (Playwright driving an `electron-vite build`), and whether the
  `CI=e2e` branch can serve as a harness for the `R-34.5-G1-PKG` fix.
- Whether `src/preload/` survives as a directory once `contextBridge` is gone.
- How the 34.6 live gate's standing FAIL 7/9 is dispositioned rather than silently inherited.
- What `main_window.ts`'s `screen`-based window sizing becomes when Tauri owns the window.
- Whether `Menu.setApplicationMenu(null)` at `main.ts:309` means GameLib intends no app menu at all.
