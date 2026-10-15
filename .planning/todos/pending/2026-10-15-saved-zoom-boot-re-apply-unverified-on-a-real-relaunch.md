---
created: 2026-10-15T00:00:00.000Z
title: Saved-zoom boot re-apply is unverified on a real relaunch
area: ui
severity: minor
platform: macos
ready: live-gate
found_by: "quick 261015-p3q execution, 2026-10-15"
files:
  - src/frontend/state/savedZoomBoot.ts
  - src/frontend/state/GlobalState.tsx
  - src/preload/api/tauriWindowChrome.ts
---

## Observation (desk-derived, unmeasured)

Quick 261015-p3q wired a boot-time re-apply of the saved Accessibility `zoomPercent` through
`GlobalState.componentDidMount` -> `applySavedZoomAtBoot` -> `window.api.setZoomFactor` ->
`tauriSetZoomFactor` -> `getCurrentWebview().setZoom()` -> `publishWebviewZoom('--webview-zoom')`. The unit
level is pinned (`savedZoomBoot.test.ts` 13/13, `GlobalStateSavedZoomWiring.test.ts` 5/5 with a self-test arm
proving the matchers can fail), but **severity is `minor`, not `medium`**: the desk-provable half is pinned
by two gates and nothing downstream of the call site changed (`tauriSetZoomFactor` and `publishWebviewZoom`
are untouched), so the live arm below is expected to **confirm** the wiring rather than **discover** a new
defect. No run has actually set a non-100% zoom, quit, relaunched, and measured.

## Why `platform: macos` and `ready: live-gate`

This needs the operator's Mac (the only hardware this app runs on) and a real quit-and-relaunch cycle --
nothing a desk edit, `tsc`, jest, or a source-text gate can observe.

`pnpm tauri:dev` is the right launcher for this gate. No real-keyring arm is needed: nothing in this chain
touches auth, so the dev-vault-vs-keyring distinction that matters for sign-in gates does not apply here.
**Caution:** a live `tauri dev` relaunches on every commit -- if one is already running, ask the operator to
quit it before any code wave touches this tree, or the relaunch will consume the very state this gate needs
to observe.

## Arms to run

**(a) Primary arm -- the boot re-apply itself.** Set Accessibility Zoom to 150%, quit the app, relaunch, and
read whether the UI renders at 150% from the first paint or visibly jumps from 100% to 150% shortly after
mount. Measure and record how long the 100%-rendered window lasts (the accepted limitation below predicts a
brief jump, not a silent stay-at-100%).

**(b) The `--webview-zoom` arm.** Before touching the slider, read the `--webview-zoom` custom property off
`document.documentElement`'s INLINE style on boot (DevTools: `document.documentElement.style.getPropertyValue('--webview-zoom')`)
and confirm it is already published rather than absent. Then re-check Library tile width at 150% zoom -- this
is residual (c) of quick 261011-t4y and the second half of the source todo's `## Owed`: the Library divides
tile width by this property, so a boot apply that correctly publishes it should keep tiles unresized by
Accessibility zoom from the very first Library paint, not only after the slider is touched.

**(c) The known limitation -- score, do not re-file.** The chosen layer (`GlobalState.componentDidMount`)
accepts a brief first paint at factor 1 before the apply lands, because applying any later than the earliest
statement of `componentDidMount` would only widen that window, and applying earlier (shell/preload,
before the webview exists) was explicitly declined in the source todo's resolution. If arm (a) shows a brief
jump at 150%, that is the EXPECTED cost of the chosen layer, scored as such -- not filed again as a new
defect.

## Not in scope here

Whether a faster-than-boot apply is worth the architectural cost of moving the zoom setting out of frontend
state and into the shell/preload layer. That was considered and declined in the source todo's resolution;
re-open only with a new measurement showing the first-paint jump is unacceptable in practice, not from this
todo.
