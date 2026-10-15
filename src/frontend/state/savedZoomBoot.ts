/**
 * Applies the saved Accessibility zoom to the webview once at startup
 * (quick 261015-p3q). `GlobalState`'s `zoomPercent` is read back from
 * `configStore` at boot and shown on the Accessibility slider, but until this
 * module nothing on the boot path ever called `window.api.setZoomFactor` --
 * the slider's `onChange` (`setZoomPercent`, `GlobalState.tsx:610-619`) was
 * the ONLY caller. A saved 150% rendered the UI at 100% on every relaunch
 * until the slider was touched again.
 *
 * Kept pure and React-free so it imports under this project's
 * `testEnvironment: 'node'` jest project (the Frontend project): no `window`,
 * no `document` and no `configStore` touched at module scope, and nothing
 * imported from `src/frontend/screens`. `GlobalState.tsx` itself cannot be
 * imported under that same jest project (it reads `window.localStorage` at
 * module scope), which is why the real behaviour lives here rather than in a
 * test that imports the class directly -- see
 * `GlobalStateSavedZoomWiring.test.ts` for the source-text gate that pins the
 * one call site this module is wired into.
 *
 * `ZOOM_PERCENT_MIN`/`MAX` are duplicated from the Accessibility screen's
 * range input (`src/frontend/screens/Accessibility/index.tsx`'s `min="60"` /
 * `max="200"`) rather than imported from it, for the same reason this module
 * stays React-free: importing from `src/frontend/screens` would pull a React
 * screen into a module that must import cleanly under node. The duplication
 * is deliberately guarded by an anti-drift arm in
 * `savedZoomBoot.test.ts` that reads the JSX source with `readFileSync` and
 * asserts the two stay equal -- precedent: `focusRowMigration.ts`'s
 * `FOCUS_ROW_VIEW_VALUES` duplication and its own named guard.
 */

export const ZOOM_PERCENT_MIN = 60
export const ZOOM_PERCENT_MAX = 200
export const ZOOM_PERCENT_DEFAULT = 100

/**
 * Resolves a persisted `zoomPercent` value to a safe percent to apply.
 *
 * Only a finite `number` within [`ZOOM_PERCENT_MIN`, `ZOOM_PERCENT_MAX`] is
 * admitted; everything else -- out of range, `NaN`, `Infinity`, a string, an
 * object, `null`, `undefined` -- resolves to `ZOOM_PERCENT_DEFAULT`. An
 * out-of-range value is NOT clamped to the nearest endpoint: a value the
 * slider cannot produce is treated as absent (corruption), not as an extreme
 * the user actually asked for (T-261015-P3Q-01, T-261015-P3Q-02).
 */
export function resolveSavedZoomPercent(raw: unknown): number {
  if (
    typeof raw !== 'number' ||
    !Number.isFinite(raw) ||
    raw < ZOOM_PERCENT_MIN ||
    raw > ZOOM_PERCENT_MAX
  ) {
    return ZOOM_PERCENT_DEFAULT
  }
  return raw
}

interface ApplySavedZoomAtBootDeps {
  /** The raw, untrusted persisted `zoomPercent` -- `this.state.zoomPercent`. */
  savedZoomPercent: unknown
  /** Forwards to `window.api.setZoomFactor`. */
  setZoomFactor: (zoomFactor: string) => void
  /** Forwards to `window.api.logError` (or equivalent) on failure. */
  onError: (error: unknown) => void
}

/**
 * Applies the resolved saved zoom percent exactly once, synchronously, with
 * no debounce -- the property that distinguishes this boot path from
 * `setZoomPercent`'s 500ms `zoomTimer` slider-drag coalescer. The call is
 * UNCONDITIONAL even when the resolved percent is 100: applying 100 is what
 * publishes `--webview-zoom` on boot (`tauriSetZoomFactor` ->
 * `publishWebviewZoom`), and on a sub-1200px screen factor 1 is itself a
 * screen-scaled zoom that function computes.
 *
 * Never throws (T-261015-P3Q-03): the `setZoomFactor` call is wrapped in
 * try/catch and any error is reported through `deps.onError`; if the
 * reporter itself throws, the error is swallowed rather than propagated --
 * same reasoning as `focusRowMigration.ts`'s `hydrateFocusRowSelection`: the
 * reporter IS the IPC bridge, and if it is down too, there is nowhere else
 * for either error to go. This function is called synchronously from
 * `componentDidMount`, where a throw would take the whole app's mount with
 * it.
 *
 * Returns the percent that was applied (post-resolution).
 */
export function applySavedZoomAtBoot(deps: ApplySavedZoomAtBootDeps): number {
  const percent = resolveSavedZoomPercent(deps.savedZoomPercent)
  try {
    deps.setZoomFactor((percent / 100).toString())
  } catch (error) {
    try {
      deps.onError(error)
    } catch {
      // The reporter is the IPC bridge; if it is down too, there is nowhere
      // else for either error to go.
    }
  }
  return percent
}
