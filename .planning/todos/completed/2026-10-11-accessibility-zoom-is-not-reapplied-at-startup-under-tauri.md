---
created: 2026-10-11T08:40:00.000Z
title: Saved Accessibility zoom is never re-applied at startup under Tauri
area: ui
severity: medium
platform: any
ready: live-gate
found_by: "quick 261011-t4y planning (desk read), 2026-10-11"
files:
  - src/frontend/state/GlobalState.tsx:549
  - src/frontend/state/GlobalState.tsx:609-618
  - src/preload/api/tauriWindowChrome.ts:126-140
---

## Observation (desk-derived, unmeasured)

The Accessibility screen's Zoom range persists `zoomPercent` (`configStore.set('zoomPercent', ...)` in
`setZoomPercent`, `GlobalState.tsx:609-618`) and, after a 500ms debounce, calls
`window.api.setZoomFactor(percent / 100)`, which reaches `tauriSetZoomFactor` and
`getCurrentWebview().setZoom(...)`.

That is the **only** caller chain. `setZoomPercent` has one caller, the Accessibility slider's `onChange`.
The saved value is read back into state at boot (`GlobalState.tsx:549`,
`zoomPercent: configStore.get('zoomPercent', 100)`), so the slider shows the saved number, but nothing in
`src-tauri/src`, `src/preload` or GlobalState's boot path applies it to the webview. So the webview runs at
factor 1 after every launch until the Zoom slider is touched.

Desk read only: no run has set a non-100% zoom, restarted, and measured.

## Why it matters

A saved zoom that silently is not in effect: the Accessibility screen says 150%, the app renders at 100%.
It is also relevant to the Library tile-size slider (quick 261011-t4y): that work publishes the applied
factor as `--webview-zoom` from `tauriSetZoomFactor` after `setZoom` resolves. A boot re-apply routed through
`tauriSetZoomFactor` would therefore publish `--webview-zoom` automatically, and would close residual (c) of
that task's Resolution (a `window.location.reload()` leaving the webview zoomed while the property resets).

## Fix options (not chosen)

- Re-apply in GlobalState's constructor or `componentDidMount` by calling `window.api.setZoomFactor` with
  the saved `zoomPercent / 100` once, without the debounce.
- Apply it from the Tauri shell or preload at webview creation, before first paint, to avoid a flash at
  100%; this needs the setting available outside the frontend state.
- Have the Accessibility screen apply it on mount (weakest: only runs if the screen is opened).

## Owed

Live confirmation: set Accessibility Zoom to 150%, quit and relaunch, and observe whether the UI renders at
150% or at 100% with the slider still reading 150%. Then re-check Library tile width at the same zoom after
whichever fix lands.

## Resolution (quick 261015-p3q)

**Fix option taken:** the first of the three listed above -- re-apply in `GlobalState`'s boot path. A new
pure helper, `src/frontend/state/savedZoomBoot.ts` (`resolveSavedZoomPercent` + `applySavedZoomAtBoot`), is
called as the FIRST statement of `componentDidMount`'s body (before the CR-01 focusRow block and before the
first `window.api.handle*` registration), passing `this.state.zoomPercent`, a thunk forwarding to
`window.api.setZoomFactor`, and an `onError` forwarding to `window.api.logError`. The call is unconditional
(even a resolved 100% is applied, because that is what publishes `--webview-zoom` from boot) and undebounced
(no `setTimeout`, unlike `setZoomPercent`'s 500ms `zoomTimer` slider-drag coalescer).

**Options declined, and why:**
- Apply from the Tauri shell or preload before first paint -- NOT taken. It needs the `zoomPercent` setting
  available outside frontend state, which is new plumbing the chosen layer does not need: `GlobalState`
  already reads the saved value at boot (`zoomPercent: configStore.get('zoomPercent', 100)`) and already
  owns the one `window.api.setZoomFactor` call site (`setZoomPercent`).
- Apply on the Accessibility screen's own mount -- NOT taken (weakest option). It only runs if that screen
  is opened, so a user who never revisits Accessibility after setting a zoom would still boot at factor 1
  on every subsequent launch.

**Measured, not asserted:**
- `savedZoomBoot.test.ts`: 13/13 passed (range endpoints, out-of-range non-clamping, non-finite/non-number
  inputs, undebounced timing under fake timers, the throwing-`setZoomFactor`/throwing-`onError` guards, and
  the anti-drift arm against `Accessibility/index.tsx`'s `min`/`max`).
- `GlobalStateSavedZoomWiring.test.ts`: 5/5 passed. Self-test arm violation counts: **0 violations** over
  the real, post-fix `GlobalState.tsx` source; **2 violations** over the synthetic pre-fix source (missing
  import, call not found inside `componentDidMount`) -- plus two further self-test arms (debounce-wrapped
  call, call ordered after the first handler registration) each independently proven to turn up a
  violation, so the matcher is not vacuous in any of the three ways it could silently pass.
- `pnpm codecheck`: exit 0 (both `tsc` invocations).
- `pnpm lint:src`: 1089/1124 problems (production: PASS, ceiling unbumped).
- `pnpm lint:tests`: 638/638 problems (tests: PASS, ceiling unbumped, zero new warnings in either new test
  file).
- `src/preload/__tests__/windowChrome.test.ts`: 27/27 passed, unchanged by the comment-only doc edit.
- `tauriWindowChrome.ts`'s `setZoomFactor` doc comment no longer states the opposite of what the code now
  does, and cites `261015-p3q`.

**Still NOT verified -- the half this todo's own `## Owed` asked for:** no run has set a non-100% zoom,
quit, relaunched, and measured whether the UI renders at the saved percent from first paint or jumps from
100%. Every number above is a desk check (a unit-level call assertion plus the unchanged `tauriSetZoomFactor`
chain downstream of it). Filed as a live-gate follow-up:
`.planning/todos/pending/2026-10-15-saved-zoom-boot-re-apply-unverified-on-a-real-relaunch.md`.

**Accepted limitation of the chosen layer:** the first paint still happens at factor 1, and the apply lands
just after mount -- so a non-100% user sees a brief jump on every launch. This is the trade the chosen layer
makes, not a defect; the live-gate follow-up names it explicitly so a visible jump is not re-filed as a new
bug.
