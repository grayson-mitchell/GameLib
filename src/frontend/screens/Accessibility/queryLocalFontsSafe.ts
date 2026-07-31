/**
 * Guards the Chromium-only `queryLocalFonts` Window API (34.4.1 gap cycle 2,
 * plan 27).
 *
 * `queryLocalFonts` is declared ambiently in `common/typedefs/dom-additions.ts`
 * so the call type-checks everywhere -- but that declaration does NOT mean the
 * API exists at runtime. Under Tauri's macOS shell (WKWebView) it THROWS (see
 * project skill `spike-findings-gamelib`,
 * `references/tauri-chromium-only-web-apis.md`), and on any other engine that
 * lacks it the bare identifier is simply absent from the global scope.
 *
 * This is the single place `queryLocalFonts()` is ever called. Both failure
 * shapes degrade to the caller-supplied default fonts and neither can escape
 * as an unhandled rejection -- the whole point of extracting this out of
 * `index.tsx` is so the guard can be exercised directly in this project's
 * jsdom-less frontend jest project (see `jest.config.js`'s docstring):
 * `index.tsx` pulls in MUI + several `.css`-importing UI components that
 * cannot be safely `require()`'d under a plain Node test environment, but
 * this module has zero such dependencies.
 *
 * The predicate is a capability check, never a platform sniff (`isTauri()` is
 * not referenced here) -- see the stale-guard regression precedent at
 * `frontend/state/__tests__/GlobalStateSteamLogout.test.ts` for why that
 * distinction matters in this codebase specifically.
 */
export async function queryLocalFontsSafe(
  defaultFonts: string[]
): Promise<string[]> {
  if (typeof queryLocalFonts !== 'function') {
    window.api.logError(
      'Accessibility: queryLocalFonts is unavailable on this shell -- using default fonts'
    )
    return defaultFonts
  }

  try {
    const systemFonts = await queryLocalFonts()
    return [
      ...defaultFonts,
      ...new Set(systemFonts.map((font) => font.family))
    ]
  } catch (error) {
    window.api.logError(
      `Accessibility: queryLocalFonts threw (${String(error)}) -- using default fonts`
    )
    return defaultFonts
  }
}
