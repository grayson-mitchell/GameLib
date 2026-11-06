import type { Runner } from '../../types'

export interface ShortcutsSync {
  processShortcut: (combination: string) => void
}

export interface ShortcutsAsync {
  shortcutsExists: (appName: string, runner: Runner) => boolean
  // Resolves whether shortcuts exist on disk once the add has settled (the `shortcutsExists`
  // predicate), never before.
  addShortcut: (
    appName: string,
    runner: Runner,
    fromMenu: boolean
  ) => Promise<boolean>
  // Resolves whether shortcuts exist on disk once the removal has settled (the `shortcutsExists`
  // predicate), never before.
  removeShortcut: (appName: string, runner: Runner) => Promise<boolean>
  addToSteam: (appName: string, runner: Runner) => Promise<boolean>
  removeFromSteam: (appName: string, runner: Runner) => Promise<void>
  isAddedToSteam: (appName: string, runner: Runner) => Promise<boolean>
}
