/**
 * Single source of truth for macOS detection inside the Tauri webview (Phase 34.1 gap
 * cycle 1, plan 34.1-10, G4).
 *
 * Extracted out of `tauriAttach.ts`'s inline platform-sniffing expression so that the
 * `window.platform` computation (`tauriAttach.ts`) and the macOS decoration branch
 * (`tauriWindowChrome.ts`'s `applyFramelessDecorations`) cannot silently drift apart by
 * each re-deriving the same predicate differently. This project's standing rule "a test
 * must exercise the PRODUCTION call shape, not a hand-built ideal one" is why this is an
 * importable module both call sites share, rather than two independently-inlined
 * expressions that a future edit could quietly diverge.
 *
 * `applyFramelessDecorations` is called from inside `tauriAttach.ts`'s never-throw
 * pre-paint attach path (SEAM Invariant A: a throw there blanks the window), so this
 * predicate must never throw even if the underlying browser platform read is missing or
 * misbehaves -- it returns `false` in that case rather than propagating.
 */
export const isMacWebview = (): boolean => {
  try {
    return navigator.platform.toLowerCase().includes('mac')
  } catch {
    return false
  }
}
