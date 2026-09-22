---
created: 2026-09-17T00:00:00.000Z
title: "Packaged .app renders blank — the React tree MOUNTS and is then REMOVED, leaving #root empty (measured 1 in 39, not 1 in 4)"
area: build
severity: major
platform: macos
ready: live-gate
source: phase 44-08 live gate (2026-09-17); incidental finding, not part of that phase's scope
files:
  - src/frontend/blankRenderProbe.ts
  - src/frontend/index.tsx:23
  - src/frontend/bootErrorSurface.ts:62
  - src/frontend/state/GlobalState.tsx:1790
---

# Packaged .app renders blank, and #root is EMPTY when it does

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

Why the root empties at all: `GlobalState` is `withTranslation()(GlobalState)`
(`GlobalState.tsx:1988`) and `index.tsx` renders it **outside** the `<Suspense>` boundary —
`<GlobalState><I18nextProvider><Suspense fallback={<Loading/>}><App/>`. i18next is
configured `react: { useSuspense: true }`, so once a namespace load is outstanding
`withTranslation()` suspends, and a suspension with **no Suspense boundary above it** makes
React delete the root's committed children. The `i18next-loaded` events land right after
each `ROOT-EMPTIED`, which is the correlation this predicts.

That also explains why no `<Loading/>` ever appears: the fallback is *below* the component
that suspends, so it cannot cover this.

**Fix direction (not yet implemented, and deliberately not implemented blind):** stop the
root from being emptied — put a `<Suspense>` boundary above `GlobalState`, or have the
namespaces `GlobalState` needs loaded before `root.render` (the `i18next.init` promise is
already available at that point), or take `withTranslation` off the outermost component. A
"re-render if `#root` is empty" recovery would paper over the same window and should not be
the first move.

## What is NOT established

- **Why the re-mount sometimes never arrives.** The emptying itself is now explained (see
  above), but not why React fails to re-commit on the blank launch — a lost wakeup when the
  suspended promise resolves is a guess, not a measurement. **No error reached the log** on
  the blank run, and absence was not evidence: the only paths that could have carried one
  were `bootErrorSurface`'s post-mount `console.error` (invisible on a release build) and
  `index.tsx`'s `logError(ev.error)`, which never sees a rejection at all. The probe now
  forwards both.
- **Whether `hidden` matters.** The blank run went `hidden` between t+500ms and t+1500ms and
  stayed hidden. But seven deliberate launches booted entirely hidden (display asleep from
  t+1s, four of them also CPU-saturated) and all mounted normally by t+1500ms. So `hidden`
  is a correlate, not a demonstrated cause, and CPU load plus `hidden` is not a recipe.
- **Whether the state is terminal.** The window was still empty ~15s in, after being
  activated. Nothing has observed it past that point.
- **Whether the released DMG reproduces.** Still untested as such. The bundle that DID
  reproduce is release-shaped and signed by the standard build command, which is the
  closest available proxy; the GitHub draft release's own DMG (2026-08-28, 0 downloads) has
  not been run.

## Severity

Held at `major`, deliberately, with the rate corrected downward:

- not `critical` — 1 in 39, no data loss, and relaunching clears it;
- not `minor` — it is a whole-app failure on a correctly signed artefact produced by the
  standard release build, reproduced 2026-09-23 at HEAD, and a user who hits it sees a dead
  window with no error anywhere.

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

1. **Wait for a recurrence and read `ROOT-EMPTIED` plus the error lines around it.** That
   single log window names the mechanism; everything above is inference without it.
2. Only then decide the remedy. The obvious candidate — re-render when `#root` is found
   empty post-mount — is a recovery, not a fix, and shipping it before the cause is known
   would hide the defect while leaving it live.
3. Remove `blankRenderProbe.ts`, its `index.tsx` import and the `probeMark` call sites when
   this closes.

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
