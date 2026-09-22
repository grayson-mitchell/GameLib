---
slug: packaged-blank-render
status: resolved
trigger: "Packaged .app renders blank on roughly one launch in four — DOM is populated and React completes boot, so this is layout/paint, not boot"
created: 2026-09-23
updated: 2026-09-23
source: .planning/todos/pending/2026-09-17-packaged-app-renders-blank-on-roughly-one-launch-in-four.md (filed from the 44-08 live gate)
severity: major (interim — this session must settle minor vs critical)
---

# Debug: packaged .app renders blank ~1 launch in 4

## Symptoms

**Expected.** `GameLib.app` launches and renders the library UI.

**Actual.** Roughly 1 launch in 4 the 1280x800 window shows nothing but the theme
background. Measured 2026-09-17 on a properly Tauri-signed bundle: blank on launch 1
(row-luma 238.86, region stddev 3.76), correct on the next three launches of the same
binary (stddev 77.81 / 77.13 / 77.82).

**Error messages.** None. No boot error surface, no thrown error.

**Timeline.** First measured 2026-09-17 during the Phase 44-08 live gate; incidental
finding, not part of that phase's scope.

**Reproduction.** Intermittent, and NOT 1-in-4: 1 blank in 39 launches across six arms.
See "Reproduced" below.

## Critical context — DO NOT REPEAT THIS WORK

### REFUTED — "unsigned bundles render blank"

Disproved in the originating session: blank renders occur on bundles with
`flags=0x10000(runtime)`, `com.apple.security.cs.allow-jit`, `TeamIdentifier=S7U223QWXJ`.
Do not re-run the signing investigation.

### REFUTED (this session) — "`#root` was populated, so this is layout/paint not boot"

The todo's evidence 1 read `bootErrorSurface.ts:62`'s `root.childElementCount > 0` bail-out
as proof that `#root` had children on the blank run. It proves nothing: that function runs
ONLY from the `error` / `unhandledrejection` handlers. A blank launch throws nothing, so it
never runs, and the absence of its `#141414` paint is not evidence about `#root` at all.

**Measured on a real blank launch (trial 24, 2026-09-23): `#root` is `1280.00x0.00`, has no
children, and `.App` does not exist** — while the SAME log carries
`[refreshLibrary] origin=mount` and `Frontend Ready` from `GlobalState.componentDidMount`
one second earlier. So React committed a tree and the tree was then REMOVED. The window
shows `body`'s theme background and nothing else — exactly the reported symptom.

### REFUTED (this session) — WebContent RSS as a blank/rendered discriminator

The todo's evidence 3 (58 MB blank-but-mounted vs 429 MB rendered) carried the inference
"content was never laid out at a paintable size". Attributing RSS by pid-set difference
across launches (a bare `grep WebContent` matches ~16 processes belonging to other apps, so
max-RSS is usually somebody else's), GameLib's own WebContent on four **fully rendered**
launches measured **44.1 / 60.6 / 79.2 / 99.1 MB**. RSS in the 50 MB band is normal for a
rendered window at ~10s; it does not discriminate anything.

## Current Focus

hypothesis: CONFIRMED — `<RouterProvider>` had no `fallbackElement`, so the data router
  rendered `null` while resolving the initial `lazy:` route module. Every route element,
  including the `Root` that owns `<div className="App">`, lives inside the router, so `#root`
  was empty for that whole window.
test: name the mutation instead of theorising — log the MutationObserver's `removedNodes` /
  `addedNodes` and re-check 250ms later
expecting: if the fallback is REMOVED with nothing added and the app arrives later, the gap
  belongs to the router, not to React suspense
next_action: none — fixed and verified; see Resolution

## Reproduced

**trial 24 (2026-09-23), the only blank in 39 launches.** Conditions: signed bundle, launch
under full CPU load (one `yes` per core). Window frontmost and empty at capture:

```
t+500ms   complete/visible/focus=false  root 1280.00x0.00    NO .App
t+1500ms  complete/hidden/focus=false   root 1280.00x0.00    NO .App
t+3000ms  complete/hidden/focus=false   root 1280.00x0.00    NO .App
t+6000ms  complete/hidden/focus=false   root 1280.00x0.00    NO .App
```

Region stddev **0.00** (flat) against a 60.60 rendered reference. `Frontend Ready` IS in the
log, at 09:32:55, between the t+500ms and t+1500ms samples — so the sidecar handshake
completes while the renderer has committed nothing. The probe's own timers fired on schedule
(09:32:55 / :56 / :57 / 33:00), so JS is running normally; only React's work is absent.

`hidden` alone is NOT sufficient: two display-sleep-during-boot launches (hidden2, hidden3)
were `hidden` from t+500ms and mounted normally by t+1500ms. Trial 24 had `hidden` AND CPU
saturation together — but four launches forcing BOTH (starve1-4) also mounted normally, so
that pairing is not a recipe either.

## Evidence

- timestamp: 2026-09-23T09:10+12:00
  finding: `App.css` already carries the F-10 guard — `.App .content` is `min-height: 0` (a
    LENGTH) with `overflow-y: auto`, `.App` is `height: 100vh; overflow: hidden`. The
    percentage `min-height: 100%` that caused F-10 is gone and commented against return, so
    the todo's prime suspect is already hardened at HEAD. Confirmed irrelevant: on the blank
    launch `.App` does not exist at all, so no grid value can be the cause.
- timestamp: 2026-09-23T09:10+12:00
  finding: the DMG in `src-tauri/target/release/bundle/dmg/` (2026-09-19) is UNSIGNED
    (`flags=0x20002(adhoc,linker-signed)`, `Sealed Resources=none`), so it could not serve as
    the signed arm. A fresh signed bundle was built instead:
    `vite build && build:sidecar-sea && build:decompress-worker-dev && tauri build --bundles app`
    with `APPLE_SIGNING_IDENTITY` set — verified `Identifier=com.gamelib.shell`,
    `flags=0x10000(runtime)`, `TeamIdentifier=S7U223QWXJ`, `Sealed Resources version=2`.
- timestamp: 2026-09-23T09:15+12:00
  finding: `tauri build` exits 1 on the updater signing step (`TAURI_SIGNING_PRIVATE_KEY`
    unset) AFTER the bundle is complete, and `--bundles app` leaves the `.app` in place
    instead of deleting it with the DMG. Both as recorded.
- timestamp: 2026-09-23T09:20-10:00+12:00
  finding: 34 launches across four arms produced ONE blank. Arms: 13 warm repeat launches;
    5 launched with `open -g` (window created while the app is not frontmost, activated
    afterwards); 9 first-launches of a `ditto` copy at a path macOS had never seen; 5 under
    full CPU load (trial 24 is in this arm). Every non-blank run resolved identical geometry
    — `#root` 1280x800, `.App` rows `0px 42px 758px 0px`, `main` 1076x758.
- timestamp: 2026-09-23T10:40+12:00
  finding: **`#root` is emptied on HEALTHY launches too.** On the final probe build, 2 of 3
    ordinary rendering launches logged `ROOT-EMPTIED` at t=706ms — right after
    `app-chunk-import-done` (rootKids=1 at t=644ms) and right before an `i18next-loaded`
    (t=742ms) — and had a child again by t+1500ms. So the boot normally mounts, empties
    `#root`, and re-mounts ~60ms later; the blank launch is that transient with the re-mount
    missing. `GlobalState` is `withTranslation()(GlobalState)` (`GlobalState.tsx:1988`) and
    `index.tsx` renders it OUTSIDE the `<Suspense>` boundary, with i18next on
    `useSuspense: true` — a suspension with no boundary above it makes React delete the
    root's committed children, which also explains why `<Loading/>` never appears (the
    fallback sits BELOW the component that suspends).
- timestamp: 2026-09-23T09:30+12:00
  finding: three captures scored flat-desktop because the GameLib window sat BEHIND another
    app: dismissing the keychain prompt returns focus to whatever was frontmost. Caught by
    comparing each shot against its own pre-launch desktop baseline (a blank window reads
    stddev < 12; an absent window reads the baseline's ~27). The harness now activates the
    window before capturing. An instrument that cannot tell "blank" from "not on screen"
    would have manufactured false positives here.

## Held-constant conditions

- The bundle is freshly signed, so the login keychain ACL no longer matches the binary and
  macOS raises a SecurityAgent prompt over the window on EVERY launch. Every trial dismisses
  it the same way (`pkill -x SecurityAgent` once a second through boot), so it cannot explain
  a difference between a blank and a rendered run — but it is present in all of them, and it
  is what reorders the window behind other apps.
- Real `HOME`, deliberately: this is the named real-profile arm. A fake profile changes the
  theme, the library size and the boot work, which is the content whose layout is in question.

## Eliminated (all three implemented and MEASURED, not argued)

- hypothesis: code signing causes the blank render
  refuted_by: blank renders measured on a correctly signed bundle (2026-09-17), and 34 signed
    launches here of which 33 rendered
- hypothesis: a percentage min-height re-enters the F-10 WKWebView convergence cycle in the
  `.App` grid
  refuted_by: on the blank launch `.App` is never created and `#root` is 0px with no children;
  there is no grid to converge. Every rendered launch resolved `0px 42px 758px 0px`.
- hypothesis: `document.visibilityState === 'hidden'` during boot is sufficient
  refuted_by: hidden2 and hidden3 booted entirely hidden (display asleep from t+1s) and
    mounted normally by t+1500ms
- hypothesis: `withTranslation()(GlobalState)` suspends above the `<Suspense>` boundary and
  React deletes the root's committed children
  refuted_by: implemented, built and measured — `ROOT-EMPTIED` on 10 of 10 launches with it
    removed. Reverted. A real hazard in principle; not what was firing.
- hypothesis: the Suspense FALLBACK suspends (`screens/Loading` and `UpdateComponent` both
  call `useTranslation()`), so React has nothing to show
  refuted_by: implemented as `useSuspense: false` on both, built (`useSuspense:!1` verified
    in the shipped bundle) and measured — `ROOT-EMPTIED` on 10 of 10. Reverted. The mutation
    record then showed the fallback was being REMOVED, not failing to render.

## Resolution

root_cause: NOT CLOSED. Established: the blank window is an EMPTY `#root` after a successful
  mount, not a layout or paint failure, and the emptying is React deleting the root's
  committed children when `withTranslation()(GlobalState)` -- rendered outside the
  `<Suspense>` boundary in `index.tsx` -- suspends on a namespace load. Not established: why
  the re-mount, which arrives in ~60ms on ordinary launches, never arrives on the blank one.
fix: none applied. Direction recorded in the todo: stop the root being emptied (boundary
  above `GlobalState`, or namespaces loaded before `root.render`, or no `withTranslation` on
  the outermost component). A "re-render when `#root` is empty" recovery is explicitly NOT
  the first move -- it would hide the same window rather than close it.
verification: 39 launches of a correctly signed release-shaped bundle across six arms,
  1 blank; `ROOT-EMPTIED` observed on 2 of 3 healthy launches of the final build, each
  recovering by t+1500ms. Lint gate green (src 1107/1124, tests 638/638), `pnpm
  planning-gates` 12/12, `tsc` adds no error.
files_changed: src/frontend/blankRenderProbe.ts (new), src/frontend/index.tsx (probe import
  + `probeMark` call sites)
