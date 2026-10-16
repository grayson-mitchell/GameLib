---
created: 2026-10-11T00:00:00.000Z
title: "In-app Stores tab embed is macOS + Linux only: Windows renders WebviewUnavailablePanel and every store_embed_* RPC returns unsupported-platform"
area: tauri-shell
severity: major
platform: windows
ready: live-gate
found_by: "operator, 2026-10-11, running the Windows build: the Stores tab shows the unavailable panel; no pending todo tracked the implementation"
files:
  - src-tauri/Cargo.toml
  - src-tauri/src/main.rs
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx
  - public/locales/en/gamelib.json
  - src/backend/__tests__/tauriShellSource.test.ts
  - src/frontend/screens/WebView/components/__tests__/WebviewUnavailablePanel.test.tsx
  - meta/i18nCatalogPresenceBaseline.json
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
  - src/frontend/screens/WebView/storeEmbedZoom.ts

audit_acknowledged:
  milestone: v0.8
  at: 2026-10-16
---

## Gap

On Windows the Stores tab never shows a store. `src/frontend/screens/WebView/index.tsx` gates
the live embed on `platform === 'darwin' || platform === 'linux'`; every other platform falls
through to `<WebviewUnavailablePanel reason="platform" />`, whose body copy
(`webview.unavailable.platform.body`) still says the feature "is available on macOS" — stale
since the Linux arm landed, and the only thing a Windows user sees.

The Rust side matches by design. In `src-tauri/src/main.rs` the ten `store_embed_*` dispatch
arms (`open`, `set_bounds`, `hide`, `show`, `close`, `take_nav_events`, `back`, `forward`,
`reload`, `navigate`) are compiled under `#[cfg(any(target_os = "macos", target_os = "linux"))]`;
the Windows branch of each returns `Err("store_embed_<op>:unsupported-platform")`. The
`unstable` Tauri feature that exposes `Window::add_child` is enabled only in the
`[target.'cfg(target_os = "macos")'.dependencies]` and `[target.'cfg(target_os = "linux")'.dependencies]`
tables of `src-tauri/Cargo.toml`, so the Windows build never compiles the embed path at all.

Nothing else about stores is missing on Windows: Steam login, library sync and native install
were discharged PASS in the Phase 38 Windows sittings, and `public/bin/x64/win32/` ships
`legendary.exe`, `gogdl.exe`, `nile.exe` and `comet.exe`. This todo is only the in-app
store/wiki browser.

## How the gap lost its tracking

- Phase 40 (D-01) scoped the embed to macOS and filed the Windows unknown as Phase 38 ledger item
  `38-E01`, whose own text said it was "an implementation task before it is a verification task".
- Linux got a real implementation in quick `260930-blh` (GTK-box-native layout). Windows did not.
- `38-E01` was discharged PASS on 2026-09-30 (sitting 13) against the **spike 027 feasibility
  harness** (`.planning/spikes/027-windows-add-child-crosscheck/app/`), which requests `unstable`
  unconditionally. Its `platform_gate` field still reads "SHIPPED APP, unchanged". The
  feasibility question closed, Phase 38 closed with zero open items, and no implementation todo
  was filed. This file is that todo.

## What spike 027 already established on Windows (WebView2, scale 1.25)

- `add_child` attaches: `add_child OK` in 95 ms; the child is a `WRY_WEBVIEW` HWND of the main window.
- Placement tracks the slot rect (shot-017 / shot-020 in the sitting-13 evidence).
- Drag-resize keeps up: 187 embed-rect updates, gap median 43 ms, no tearing (38-E04 branch b).
- `data_store_identifier` is a **silent no-op on WebView2**, same as the other backends: the embed
  shares the process-wide cookie jar with the login windows. Nothing here claims isolation.

## Shape of the fix (mirror quick 260930-blh)

1. `src-tauri/Cargo.toml`: add `[target.'cfg(target_os = "windows")'.dependencies]` with
   `tauri = { version = "2", features = ["unstable"] }`. Re-run the `cargo tree -e features`
   measurement the macOS table's comment describes, for the Windows target.
2. `src-tauri/src/main.rs`: widen the store-embed section's cfg from `any(macos, linux)` to
   include `windows` and drop the ten `:unsupported-platform` arms for it. Positioning: macOS uses
   `set_position`/`set_size`, Linux uses the GTK box; check whether WebView2 needs its own
   `set_bounds` path (spike 027's harness is the reference).
3. `src/frontend/screens/WebView/index.tsx`: admit `win32` in the platform check (line ~514) and
   update the D-01/D-02 comment above it.
4. `WebviewUnavailablePanel.tsx` + `public/locales/en/gamelib.json`
   (`webview.unavailable.platform.body`): reword so the copy no longer names macOS alone, or
   retire the `platform` reason if no platform is left to show it.
5. `tauriShellSource.test.ts` / `cargoFeatures` jest suites pin the cfg shape — update their
   expectations in the same commit.

## Verification needed (Windows machine, live)

- `cargo check` / `pnpm tauri:dev` natively on Windows. Quick 260930-blh could NOT verify a
  Windows compile from Linux (`cc-rs` could not find `lib.exe`; the gnu target failed in
  `tauri-build`), and CI runs no cargo step, so the operator's Windows box is the first place
  this compiles for real.
- Open the Stores tab, confirm the Steam and GOG storefronts render in the slot, navigate,
  back/forward/reload, drag-resize the window, and check the panel copy on a non-embeddable route
  (`/store/epic` stays scoped out on every platform, D-05).
- Re-run the Phase 38 `38-E01` criteria P1-P5 against the **shipped app** this time, and record
  the result alongside the harness result in `38-VERIFICATION.md` so the ledger item's
  `platform_gate` text stops being true.

## Non-goals

- Epic store embed (permanent scope-out, D-05, Cloudflare Turnstile).
- Per-store cookie isolation (`data_store_identifier` is a no-op on all three backends).
- Login windows: those already have a Windows arm; only the sheet presentation is macOS-only.

## Addendum (2026-10-12, quick 261012-f25): the WebView2 embed is built — what remains is a live gate

What was built (commits `21f99ba7d` and `35561176e`):

- A `[target.'cfg(target_os = "windows")'.dependencies]` table in `src-tauri/Cargo.toml` unioning
  `tauri/unstable`. `Cargo.lock` is unchanged.
- The store-embed cfg in `main.rs` widened from macOS + Linux to macOS + Linux + Windows (77
  gates: section, dispatch arms, tests).
- Windows is positioned through the macOS `set_position`/`set_size` path, with the zero-area-rect
  guard and the show-before-navigate existing-embed path. The reason is spike 027: WS_CHILD HWND +
  unconditional `SetWindowPos`, 0 px error at scale 1.25. No Windows-only positioning code exists.
- No Tauri command was added (spike 027's sync-command deadlock: `add_child` from a sync command on
  the main thread never returned on WebView2). The arms stay on the sidecar RPC path, whose
  dispatch always runs on a worker thread.
- The ten `:unsupported-platform` strings are kept only for targets outside macOS/Linux/Windows;
  no shipped target compiles them.
- The renderer gate in `WebView/index.tsx` admits `win32`.

Shape-of-fix step 4 resolved as KEEP, not retire:

- The D-34 deep-link escape hatch renders the panel with no `reason`, so the `platform` reason is
  still reached on every OS.
- `tauriAttach.ts` yields only darwin/win32/linux, so the gate's own branch is now a defensive
  fallback.
- The body copy is OS-neutral ("GameLib can't open this page in its in-app store and wiki
  browser.").
- 48 stale machine translations of that one key were invalidated key-presence-only (D-09); those
  locales show English until the next MT re-fill. No translation was written by hand or by model.

Desk evidence (this Windows box, x86_64-pc-windows-msvc; numbers in `.planning/quick/261012-f25-*/evidence/`):

- `cargo check` clean; warning count 10, same as baseline.
- `cargo test --bin gamelib-shell`: full suite 286 -> 313 passed, 0 failed; `store_embed` filter 1 -> 26
  passed.
- `cargo tree -e features -i tauri`: `unstable` count 0 -> 1 on the native target (also 1 for the
  linux-gnu and apple-darwin targets).
- `Cargo.lock` unchanged; `cargo fmt --check` exit 0.
- Jest: gate test observed RED then GREEN; Task 1 files 5 suites / 328 tests, Task 2 files 3 suites /
  388 tests, 0 failed.
- `pnpm codecheck`, scoped `prettier --check`, lint-translations (gamelib), i18n-churn-guard: clean.
  Presence baseline re-recorded by the lint's own writer, 864 -> 912 pairs (+48).

NOT verified:

- The live app on Windows. Operator checks W1-W10: W1 Steam renders in the slot, nothing drawn over
  the chrome; W2 GOG renders; W3 in-embed navigation updates the host label; W4 drag-resize tracks
  the slot; W5 Library round trip hides then shows the embed; W6 GOG -> Epic -> GOG leaves the
  embed at the slot, not 0,0 or 0x0; W7 a NavShell popover hides the embed (D-33) and it returns;
  W8 the same at a non-100% Accessibility Zoom; W9 the packaged NSIS build repeats W1-W2; W10 re-run
  Phase 38 `38-E01` P1-P5 against the shipped app.
- The packaged NSIS build.
- The macOS and Linux compile of this change.
- `38-E01` P1-P5 against the shipped app, still owed in `38-VERIFICATION.md`.

Open observations for the operator, NOT decided here:

- The embed's Chrome UA keeps its `Macintosh` platform token on Windows, as on Linux.
- On a supported OS the D-34 deep-link panel's heading still says "on this platform". That path is
  now the only practical one to the platform reason, so a dedicated origin reason may be worth a
  follow-up.
- Embed alignment at a non-100% Accessibility Zoom is unmeasured on every platform. The renderer's
  zoom is a webview zoom, and the slot rect is CSS px.

What remains: an operator live gate on Windows. This file stays in `pending/` and is NOT closed.

## Live results (2026-10-12, operator, Windows, `pnpm tauri:dev` at `36d88c94d`)

Dev build, not the packaged app. Results are as the operator reported them; nothing was captured.

- W1 PASS: Steam renders in the slot.
- W2 PASS: GOG renders.
- W3 PASS: navigating inside the embed updates the host label.
- W4 PASS: drag-resize tracks the slot.
- W5 PASS: a round trip through the Library hides the embed and shows it again.
- W6 PASS: GOG -> Epic -> GOG puts the embed back at the slot.
- W7 PASS: a NavShell popover hides the embed, and it returns afterwards.
- Epic shows the unavailable panel, as expected (D-05 scope-out on every platform). The other stores
  load.

Still open: W8 (non-100% Accessibility Zoom), W9 (the packaged NSIS build repeats W1-W2), W10
(`38-E01` P1-P5 against the shipped app, recorded in `38-VERIFICATION.md`). The macOS and Linux
compile of this change is also unverified. This file stays `ready: live-gate` in `pending/`.

## W8 FAIL and fix (2026-10-12, quick 261012-gn8)

### Live result, as reported

- W8 FAIL. Operator, Windows, `pnpm tauri:dev` at `4c3e745b9`, Accessibility zoom 120%: "the
  browser is now displaced... overlaps the increased size".
- Dev build. Nothing was captured.

### Diagnosis: two causes, both in the bounds path, neither specific to Windows

1. The renderer sent CSS px, while Rust positions in logical px (macOS/Windows
   `LogicalPosition`/`LogicalSize`; Linux `gtk::Fixed` logical units). Under webview zoom f,
   logical = CSS x f. App zoom is a webview zoom (`getCurrentWebview().setZoom`), so the CSS
   viewport shrinks by f and the embed was drawn at 1/f scale, shifted toward the window origin.
2. `store_embed_open`'s existing-embed branch re-applies the rect on Linux only. On macOS and
   Windows it shows and navigates and drops the rect. Zoom is changed on the Accessibility screen
   while the hook is unmounted, so on return the embed kept its 100% geometry while the chrome
   around the slot had grown.

These are code-reading findings (the lines were re-read at `4c3e745b9`), not live measurements.

### The fix (renderer only)

- `e97265b1c`: bounds are the slot's `getBoundingClientRect()` x `--webview-zoom`, read from the
  root's inline style at every flush (`storeEmbedZoom.ts`). An absent, non-numeric, non-finite or
  <= 0 value reads as 1, so the 100% payload is unchanged.
- `a8e03e290`: a MutationObserver on the root style re-flushes when the published factor changes
  (the preload writes it only after `setZoom` resolves, so a zoom-caused resize can read a stale
  factor), and every successful `storeEmbedOpen` is followed by one throttled `setBounds`, which
  re-applies geometry on the macOS/Windows existing-embed path.
- No Rust or preload change. The D-18 single-writer invariant is kept: the hook still has one rect
  read, one `storeEmbedSetBounds` call site and one `storeEmbedOpen` call site, and the zoom factor
  is a unit conversion, not a geometry source.

### Desk evidence (numbers in `.planning/quick/261012-gn8-*/evidence/`)

- Task 1 (`jest-task1.json`): 2 suites, 47 tests, 0 failed (hook suite 29, helper suite 18). RED
  observed first (`jest-red-task1.json`): Z1 and Z2 failed on their assertions, and the helper
  suite failed to resolve its module.
- Task 2 (`jest-task2.json`, helper + hook + `storeEmbedReloadLoop`): 3 suites, 63 tests, 0 failed
  (hook suite 36). RED observed first (`jest-red-task2.json`): Z3, Z3b, Z4, Z5, Z6 failed.
- Three mutation runs (`mutations.txt`): deleting the factor comparison reddens Z4, deleting the
  disposed check reddens Z7, deleting the status check reddens Z8, one failure each; each was
  reverted by hand.
- `pnpm codecheck` and `pnpm lint` PASS (`production: PASS | tests: PASS`); scoped
  `prettier --check` clean over the four source and test paths.
- `storeEmbedSingleOpener.test.ts` fails on this Windows box at BASE too (a backslash path from
  `relative()`). It is pre-existing and unrelated, and was not run as a gate.

### NOT verified

- The live app at any zoom.
- macOS and Linux, although the fix applies to them too.
- The latent sibling, an un-measured "window resized while away from the store route" stale
  geometry, which the open follow-up should also cover.

### W8 re-run steps for the operator

Each is a pass/fail line. Vite HMR should pick up the renderer change in the running dev instance.

- R1: at 100%, Stores (Steam) sits at the slot.
- R2: Settings, then Accessibility, set Zoom to 120%, wait at least 1 s, return to Stores. The
  embed fills the slot exactly and overlaps no top tab, sidebar or store controls. This is the
  sequence that failed.
- R3: at 120%, drag-resize the window; the embed tracks.
- R4: at 120%, GOG -> Epic -> GOG and a Library round trip; the embed returns to the slot.
- R5: back at 100%, Stores sits at the slot.
- R6: at a zoom below 100% (for example 80%), Stores sits at the slot.

### Spike 017

Its "1:1 viewport-to-logical" finding in `Skill("spike-findings-gamelib")` holds only at zoom 1.
Update that skill reference once W8 passes live, not before.

### Still open

- W8 re-run, W9, W10.
- The macOS/Linux compile of 261012-f25.
- This file stays in `pending/` at `ready: live-gate`.

## W8 re-run (2026-10-12, operator, Windows, `pnpm tauri:dev` at `47cd338b4`)

W8 PASS at 120% and at 80% Accessibility zoom, with the zoom-aware bounds fix from quick
261012-gn8 (`e97265b1c`, `a8e03e290`). This is the operator's report: they gave one verdict per
zoom level, not a result for each of R1-R6, and nothing was captured. The spike 017 "1:1" finding in
`Skill("spike-findings-gamelib")` now carries the zoom caveat (SKILL.md and
`references/tauri-embedded-store-browser.md`).

Still open: W9 (the packaged NSIS build repeats W1-W2), W10 (`38-E01` P1-P5 against the shipped
app, recorded in `38-VERIFICATION.md`), the macOS/Linux compile and the macOS/Linux live run of
261012-f25 and 261012-gn8, and the case where the window is resized while away from the store
route. This file stays `ready: live-gate` in `pending/`.
