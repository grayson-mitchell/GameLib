// These changes are not in the official types yet as they're not widely supported yet
declare global {
  /**
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Window/queryLocalFonts)
   *
   * HAZARD (34.4.1 gap cycle 2, F-6 root cause): this ambient declaration only
   * makes `queryLocalFonts()` type-check -- it does NOT mean the API exists at
   * runtime. It is Chromium-only. Under Tauri's macOS shell (WKWebView) the
   * call THROWS (not "returns undefined", not "rejects with a clean error") --
   * see project skill `spike-findings-gamelib`,
   * `references/tauri-chromium-only-web-apis.md`. Every call site MUST guard
   * both the "API absent" and "API present but throws" shapes; see
   * `frontend/screens/Accessibility/queryLocalFontsSafe.ts` for the pattern.
   */
  function queryLocalFonts(): Promise<FontData[]>

  interface Window {
    /**
     * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Window/queryLocalFonts)
     * Same runtime hazard as the ambient global above: declared, not guaranteed present.
     */
    queryLocalFonts(): Promise<FontData[]>
  }

  /** [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/FontData) */
  interface FontData {
    /** [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/FontData/family) */
    family: string
    /** [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/FontData/fullName) */
    fullName: string
    /** [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/FontData/postscriptName) */
    postscriptName: string
    /** [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/FontData/style) */
    style: string
    /** [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/FontData/blob) */
    blob(): Promise<Blob>
  }

  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WindowControlsOverlay) */
  interface WindowControlsOverlay {
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WindowControlsOverlay/visible) */
    visible: boolean
  }

  interface Navigator {
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Navigator/windowControlsOverlay) */
    readonly windowControlsOverlay: WindowControlsOverlay
  }
}

export {}
