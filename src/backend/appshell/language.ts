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
import { logInfo, LogPrefix } from '../logger'

export async function changeLanguage(language: string): Promise<void> {
  logInfo(['Changing Language to:', language], LogPrefix.Backend)
  await i18next.changeLanguage(language)
  gameInfoStore.clear()
  GlobalConfig.get().setSetting('language', language)
  backendEvents.emit('languageChanged')
}
