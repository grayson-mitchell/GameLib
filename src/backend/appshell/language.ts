/**
 * Language-change handler body (Phase 34.1 Plan 02, D-07/D-08).
 *
 * Backs `main.ts`'s `addListener('changeLanguage', ...)` registration
 * (`main.ts:514-520`, inside the `app.whenReady()` block) with a
 * byte-identical body, extracted so the Node sidecar can import the same
 * behavior the Electron build runs (single source of truth, D-07). `main.ts`
 * keeps the registration line -- still inside `app.whenReady()` -- as a
 * one-line delegation to this export (D-08).
 *
 * The `backendEvents.emit('languageChanged')` call MUST stay last: the tray
 * and any other listener rebuild off it.
 *
 * MUST NOT import `electron` (or anything that transitively reaches it) --
 * the Node sidecar imports this module directly (D-09).
 */

import i18next from 'i18next'

import { GlobalConfig } from '../config'
import { backendEvents } from '../backend_events'
import { gameInfoStore } from '../storeManagers/legendary/electronStores'
import { logInfo, logWarning, LogPrefix } from '../logger'

/**
 * CR-01 (Phase 34.1 code review): `i18next.changeLanguage()` MUST NOT be able to
 * abort the persist path below.
 *
 * `i18next.use(Backend).init({...})` exists in exactly ONE place in the whole backend
 * -- `main.ts`'s `app.whenReady()` block -- so under the headless Node sidecar the
 * shared i18next singleton is never initialized. Calling `changeLanguage()` on an
 * uninitialized instance throws SYNCHRONOUSLY (verified against the installed i18next
 * 22.5.1: `TypeError: Cannot read properties of undefined (reading
 * 'toResolveHierarchy')`). Because this function is `async`, that throw became a
 * rejection which `appShellFlowRegistration.ts`'s `.catch(logSendFailure)` swallowed --
 * so under Tauri EVERY line after the await was dead: the language setting never
 * persisted (reverted on next launch), the Legendary game-info cache was never
 * invalidated for the new locale, and `languageChanged` listeners never fired.
 *
 * The three statements after the await are the ones the USER's language change actually
 * depends on -- the renderer runs its OWN i18next instance (`src/frontend/index.tsx`)
 * for every string it displays, so a missing BACKEND translator degrades backend-side
 * strings (tray/dialog/notification labels) but must never block persisting the choice.
 * Ordering is unchanged, and `backendEvents.emit('languageChanged')` MUST stay last.
 *
 * Under Electron nothing changes: i18next IS initialized there, the call resolves, and
 * the catch is never entered.
 */
export async function changeLanguage(language: string): Promise<void> {
  logInfo(['Changing Language to:', language], LogPrefix.Backend)
  try {
    await i18next.changeLanguage(language)
  } catch (error) {
    logWarning(
      [
        'i18next.changeLanguage failed (uninitialized instance? expected under the',
        'headless sidecar) -- persisting the language setting anyway:',
        error
      ],
      LogPrefix.Backend
    )
  }
  gameInfoStore.clear()
  GlobalConfig.get().setSetting('language', language)
  backendEvents.emit('languageChanged')
}
