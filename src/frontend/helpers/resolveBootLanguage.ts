/**
 * debug/app-starts-in-german (2026-10-14): `configStore` is the authoritative source for
 * the boot-time UI language. `localStorage['language']` is a deliberate "remember the
 * last explicit choice" shadow -- its only writer is `LanguageSelector`'s
 * `handleChangeLanguage`, which writes it alongside `configStore.set` -- but it is
 * per-WebKit-origin and never invalidated, so it silently outlives a configStore
 * reset/migration/reinstall. When that happens, resolution falls through to a language
 * nobody currently chose, with zero diagnostic trail: every candidate log call on this
 * path (`console.*`, `tauriTransport.ts`'s `STORE_LAZY_MISS_MARKER`) is renderer-local
 * and never reaches `gamelib.log` (confirmed via `src-tauri/src/main.rs:2111`; `logInfo`
 * is unported, Phase 34.3 -- `logError` is the only renderer->sidecar channel wired to
 * `gamelib.log` today). Extracted to a pure function (rather than inlined in
 * `index.tsx`) so this silent-fallback mechanism is unit-testable without mocking
 * `configStore`/`localStorage`/`window.api`. No change to resolution precedence itself:
 * no logic defect was found in the fallback order, only this observability gap.
 */
export type ResolvedLanguageSource = 'configStore' | 'localStorage' | 'default'

export interface ResolveBootLanguageResult {
  languageCode: string
  resolvedFrom: ResolvedLanguageSource
}

export function resolveBootLanguage(
  configLanguage: string | undefined,
  storedLanguage: string | null,
  logFallback: (message: string) => void
): ResolveBootLanguageResult {
  if (configLanguage !== undefined) {
    return { languageCode: configLanguage, resolvedFrom: 'configStore' }
  }

  const resolvedFrom: ResolvedLanguageSource =
    storedLanguage !== null ? 'localStorage' : 'default'
  const languageCode = storedLanguage ?? 'en'

  logFallback(
    `[GameLib] configStore has no 'language' key; resolved to "${languageCode}" via ` +
      (resolvedFrom === 'localStorage'
        ? `stale localStorage fallback (was "${storedLanguage}")`
        : "the 'en' default")
  )

  return { languageCode, resolvedFrom }
}
