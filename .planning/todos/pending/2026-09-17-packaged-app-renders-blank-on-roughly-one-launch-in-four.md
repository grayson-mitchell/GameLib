---
created: 2026-09-17T00:00:00.000Z
title: "Packaged .app renders blank — FIXED: the data router rendered its initial-load state as nothing; empty-root window measured 10/10 before, 0/10 after"
area: build
severity: minor
platform: macos
ready: blocked
source: phase 44-08 live gate (2026-09-17); incidental finding, not part of that phase's scope
files:
  - src/frontend/App.tsx:326
  - src/frontend/__tests__/routerInitialLoadFallback.test.ts
  - src/frontend/blankRenderProbe.ts
  - src/frontend/index.tsx:23
---

# Packaged .app renders blank, and #root is EMPTY when it does

## RESOLVED 2026-09-23 — cause found, fixed, and measured

`App()` rendered `<RouterProvider router={router} />` with **no `fallbackElement`**. Every
route module is behind `lazy:` (`makeLazyFunc`), and while the data router resolves the
FIRST one it renders `fallbackElement` — which, absent, is `null`. Every route element lives
inside the router, including the `Root` that owns `<div className="App">`, so for that window
`#root` is completely empty and the app paints `body`'s theme background and nothing else.

The mutation record is what named it, after two wrong hypotheses (below). Three launches out
of three, identical:

```
ROOT-EMPTIED removed=[div.UpdateComponent] added=[] sameContainer=true  t=202ms  rootKids=0
after-emptied +250ms kids=1 first=div#app.App.frameless.macOverlayTitlebar t=462ms rootKids=1
```

React's own `<Suspense>` fallback is removed, **nothing replaces it**, and ~260-290ms later
the real app arrives. A blank launch is that window never closing.

**Fix** (`src/frontend/App.tsx`):

1. `fallbackElement={<Loading />}` on `RouterProvider` — the initial-load state now renders
   something instead of nothing.
2. `makeLazyFunc` races the module import against `ROUTE_MODULE_TIMEOUT_MS` (20s). A
   *rejected* import already landed on `errorElement` (`RouteErrorSurface`); one that never
   settles landed nowhere, which is exactly what a blank-forever launch looks like. It now
   becomes a visible error instead of an invisible hang.

**Verification, same bundle shape and same harness throughout:**

| build | ROOT-EMPTIED | launches |
| --- | --- | --- |
| before any change | 2 | 3 |
| after the `GlobalState` hypothesis | 10 | 10 |
| after the fallback-suspense hypothesis | 10 | 10 |
| with the mutation-naming probe (diagnosis) | 3 | 3 |
| **with `fallbackElement` + bounded route wait** | **0** | **10** |

All 10 post-fix launches rendered (9 confirmed by pixels at stddev ~64 against a ~27 desktop
baseline; the 10th was captured while the page was `hidden`, and its geometry sample confirms
`#root` 1280x800 with the grid resolved).

Gated by `src/frontend/__tests__/routerInitialLoadFallback.test.ts` — 9 assertions, both
halves revert-to-red proven (removing `fallbackElement` reds 2; restoring the unbounded
`await importedFile` reds 1).

### TWO REFUTED HYPOTHESES — do not re-try either

Both were implemented, built, and measured on the packaged app, and both left the empty-root
window at **10 launches out of 10**. Both have been reverted.

1. **`withTranslation()` on `GlobalState`** — a suspending component rendered above the
   `<Suspense>` boundary. A real hazard in principle (React deletes a root's committed
   children when a suspension has no boundary above it), just not what was firing here.
2. **`useTranslation()` in `screens/Loading` + `UpdateComponent`** — a suspending fallback,
   same reasoning. Also not it: the fallback was being *removed*, not failing to render.

The lesson worth keeping: both hypotheses were plausible, documented React behaviours that
explained the symptom, and both were wrong. What settled it was logging the MutationObserver's
`removedNodes` / `addedNodes` — i.e. asking the DOM what actually changed instead of asking
which theory fit.

### What remains open

- The historical 1-in-39 blank has NOT been reproduced since the fix, and could not be
  reproduced on demand before it either. The mechanism it needed is gone and the window it
  lived in is measured closed, but that is inference, not a reproduction.
- A genuinely stalled route module now shows a spinner for 20s and then an error screen. That
  is a visible failure rather than a dead window; it does not make the stall itself go away.
- **Close condition:** one release cycle with no blank report and no `ROOT-EMPTIED` in any
  log. Then delete `src/frontend/blankRenderProbe.ts`, its `index.tsx` import and the
  `probeMark` call sites, and move this todo to `completed/`.
- **`ready: blocked`, not `live-gate`** (changed 2026-09-23). Nothing here needs a live run on
  this Mac any more — the fix is measured. It is parked on a release cycle elapsing. Left as
  `live-gate` it would keep surfacing in `grep -l 'ready: live-gate'` as pickup-able work and
  cost whoever picked it up a build and ten launches to learn there is nothing to gate.

## Problem

`GameLib.app` launches, spawns its shell and sidecar, opens its window — and renders
**nothing but the theme background**.

**Measured 2026-09-23** on a correctly signed, release-shaped bundle
(`Identifier=com.gamelib.shell`, `flags=0x10000(runtime)`, `TeamIdentifier=S7U223QWXJ`,
`Sealed Resources version=2`) built with
`vite build && build:sidecar-sea && build:decompress-worker-dev && tauri build --bundles app`
and `APPLE_SIGNING_IDENTITY` set:

| arm | launches | blank |
| --- | --- | --- |
| warm repeat launches | 13 | 0 |
| window created while the app is NOT frontmost (`open -g`), activated after | 5 | 0 |
| first launch of a `ditto` copy at a path macOS has never seen | 9 | 0 |
| under full CPU load (one `yes` per core) | 5 | **1** |
| forced: display asleep through boot (`pmset displaysleepnow` at t+1s) | 3 | 0 |
| forced: full CPU load AND display asleep through boot | 4 | 0 |

**1 blank in 39 launches, not 1 in 4.** The original "1 in 4" was one blank followed by
three renders — n=1 on the failure side. Keep that in mind before planning around a rate.

**Signing is NOT the cause.** Disproved 2026-09-17 and unchanged: blank renders occur on
correctly signed bundles. Do not re-run the signing investigation.

## What the blank launch actually looks like

Captured by the in-tree probe (`src/frontend/blankRenderProbe.ts`) on the blank launch:

```
t+500ms   complete/visible/focus=false  root 1280.00x0.00  NO .App
t+1500ms  complete/hidden/focus=false   root 1280.00x0.00  NO .App
t+3000ms  complete/hidden/focus=false   root 1280.00x0.00  NO .App
t+6000ms  complete/hidden/focus=false   root 1280.00x0.00  NO .App
```

Region stddev **0.00** (flat) against a 60.60 rendered reference, window frontmost.

And in the same log, one second **before** the first of those samples:

```
(09:32:55) [Frontend]: [refreshLibrary] runner=all origin=mount
(09:32:55) [Backend]:  Frontend Ready
```

Both come from `GlobalState.componentDidMount` (`GlobalState.tsx:1790`). **So React
committed a tree, and then the tree was removed.** This is an unmount, not a failure to
mount, and not a layout or paint failure.

The probe's own timers fired on schedule throughout (09:32:55 / :56 / :57 / 33:00), so JS
was running normally the whole time — only React's tree was gone.

## Two premises from the original report are REFUTED — do not reuse them

1. **"`#root` was populated."** The reasoning was that `bootErrorSurface.ts:62` bails when
   `root.childElementCount > 0` and paints `#141414` only into an empty `#root`, so a light
   page proved `#root` had children. It proves nothing: that function runs **only** from the
   `error` / `unhandledrejection` handlers. A blank launch throws nothing observable, so it
   never runs at all. Measured: `#root` is empty and 0px high.
2. **"WebContent RSS 58 MB means content was never laid out at a paintable size."**
   Attributing RSS by pid-set difference across a launch — a bare `grep WebContent` matches
   ~16 processes belonging to other apps, so max-RSS is usually somebody else's — GameLib's
   own WebContent on four **fully rendered** launches measured **44.1 / 60.6 / 79.2 /
   99.1 MB**. The 50 MB band is normal for a rendered window at ~10s. RSS discriminates
   nothing here.

Also dead: the `App.css` grid suspicion. `.App .content` already carries the F-10 guard
(`min-height: 0`, a length, with `overflow-y: auto`) and `.App` is
`height: 100vh; overflow: hidden`. Every rendered launch resolved
`grid-template-rows: 0px 42px 758px 0px`. On the blank launch there is no `.App` element at
all, so no grid value can be the cause.

## The mechanism — `#root` is emptied on HEALTHY launches too

Measured 2026-09-23 on three ordinary, fully rendering launches of the final probe build.
Two of the three emitted this during boot:

```
[BLANKPROBE-MARK] app-chunk-import-done  t=644ms  vis=visible rootKids=1
[BLANKPROBE-MARK] ROOT-EMPTIED -- the mounted tree was removed  t=706ms  vis=visible rootKids=0
[BLANKPROBE-MARK] i18next-loaded  t=742ms  vis=visible rootKids=0
...
t+1500ms  root 1280.00x800.00  kids: 1   rows 40px 42px 718px 0px
```

**So the boot NORMALLY mounts, empties `#root`, and re-mounts ~60ms later.** The blank
launch is not a different event — it is this same transient with the re-mount missing.

**The explanation first written here was WRONG and is kept only as a warning.** It read:
`GlobalState` is `withTranslation()(GlobalState)` rendered outside the `<Suspense>`
boundary, i18next is `useSuspense: true`, so a namespace load suspends with no boundary
above it and React deletes the root's committed children — with the `i18next-loaded` events
landing right after each `ROOT-EMPTIED` as the predicted correlation. It fits every symptom
and it is a real React hazard. It was implemented and measured, and the empty-root window
stayed at 10 launches out of 10. So did the second suspense hypothesis. See
**TWO REFUTED HYPOTHESES** above.

The correlation was real and misleading: `i18next-loaded` lands right after `ROOT-EMPTIED`
because both trail the same chunk import, not because one causes the other.

What actually empties the root is in **RESOLVED** at the top of this file: the data router's
initial-load state rendered `null`. The mutation record is what separated the two —
`removed=[div.UpdateComponent] added=[]` is the `<Suspense>` fallback being taken away with
nothing put in its place, which no suspend-above-the-boundary story predicts.

## What is NOT established

Written before the cause was found. Three of these four are now settled; they are kept with
their outcome so the open one is not lost among them.

- ~~**Why the re-mount sometimes never arrives.**~~ SETTLED. There is no re-mount to wait
  for: the router rendered `null` for the whole initial-load state, and a route module that
  never settled left it there forever. Now bounded at 20s onto `errorElement`. The point
  underneath still stands: **no error reached the log** on the blank run, and that absence
  was never evidence — the only paths that could have carried one were `bootErrorSurface`'s
  post-mount `console.error` (invisible on a release build) and `index.tsx`'s
  `logError(ev.error)`, which never sees a rejection at all. The probe forwards both.
- ~~**Whether `hidden` matters.**~~ SETTLED as a correlate only, and now moot. Seven
  deliberate launches booted entirely hidden (display asleep from t+1s, four also
  CPU-saturated) and all mounted normally by t+1500ms.
- ~~**Whether the state is terminal.**~~ Moot: the window it describes no longer exists.
- **Whether the released DMG reproduces.** STILL UNTESTED, and the only one of these worth
  anything now. The bundle that DID reproduce is release-shaped and signed by the standard
  build command, which is the closest available proxy; the GitHub draft release's own DMG
  (2026-08-28, 0 downloads) has not been run. It predates the fix, so a blank launch from it
  would confirm the mechanism rather than reopen anything.

## Severity

`minor` since the fix landed (2026-09-23). The frontmatter is the live value; the reasoning
below is the pre-fix state, kept because the rate correction in it is still the best number
anyone has.

Before the fix it was held at `major`, deliberately, with the rate corrected downward:

- not `critical` — 1 in 39, no data loss, and relaunching clears it;
- not `minor` — it was a whole-app failure on a correctly signed artefact produced by the
  standard release build, reproduced 2026-09-23 at HEAD, and a user who hit it saw a dead
  window with no error anywhere.

It is `minor` now because the fix is in and measured (0 of 10, against 10 of 10 on each
failed attempt); what is left is a probe to remove and a release cycle to watch.

## Solution

### Already done (2026-09-23)

`src/frontend/blankRenderProbe.ts` is in the tree and imported from `index.tsx`. On every
launch it emits boot-stage markers plus three geometry samples, and it exists to make the
NEXT occurrence self-documenting rather than to be run by hand:

- forwards every `error` and `unhandledrejection` — post-mount included — with text and
  stack, through `window.api.logInfo`;
- watches `#root` with a `MutationObserver` and logs `ROOT-EMPTIED` plus a full geometry
  sample the instant the mounted tree is removed;
- logs `visibilitychange` transitions.

That closes the gap that made this expensive: on a release build the event currently leaves
no trace anywhere, because the release webview has no devtools and nothing forwards its
console.

### Next, in order

Steps 1 and 2 are DONE — the recurrence was captured (`ROOT-EMPTIED` with its `removed=`
list), it named the mechanism, and the remedy followed from it rather than from the
`#root`-is-empty recovery that step 2 warned against. Only step 3 remains, and it waits on
the close condition in **What remains open** at the top:

1. ~~Wait for a recurrence and read `ROOT-EMPTIED` plus the error lines around it.~~ Done
   2026-09-23; that single log window did name the mechanism, as this predicted.
2. ~~Only then decide the remedy.~~ Done. The warning held: the recovery would have papered
   over the window while leaving the router rendering nothing.
3. **Remove `blankRenderProbe.ts`, its `index.tsx` import and the `probeMark` call sites**
   after one clean release cycle, then move this todo to `completed/`.

## Method notes

- **Launch at least 3 times per arm.** An intermittent failure confirms whichever hypothesis
  is tested first; the originating session drew two conclusions from one launch each and
  both were wrong.
- **Read `~/Library/Logs/GameLib/gamelib.log` FIRST**, and read the `[Frontend]` lines in
  it: `[refreshLibrary] origin=mount` is proof that `GlobalState` mounted, which is what
  makes "the tree was removed" separable from "the tree never rendered". The file is rotated
  to `gamelib.log.old` on each launch.
- **A capture harness must be able to tell "blank" from "not on screen".** Three trials here
  scored flat-desktop because dismissing the keychain prompt returned focus to another app
  and left the GameLib window behind it. Compare every shot against a pre-launch desktop
  baseline: a blank window reads stddev < 12, an absent one reads the baseline's ~27, a
  rendered one ~60. Activate the window before capturing.
- A freshly signed bundle no longer matches the login keychain ACL, so macOS raises a
  SecurityAgent prompt over the window on every launch. Dismiss it identically in every arm
  (`pkill -x SecurityAgent` once a second through boot) so it stays a held-constant
  condition rather than a per-trial variable.
- `tauri build` exits 1 on the updater signing step long after the bundle is complete;
  `--bundles app` leaves the `.app` in place instead of deleting it with the DMG.
