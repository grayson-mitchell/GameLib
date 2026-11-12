import EventEmitter from 'events'

import type TypedEventEmitter from 'typed-emitter'
import type {
  GameStatus,
  RecentGame,
  ReleasesInfo,
  WineVersionInfo
} from 'common/types'

export type BackendEvents = {
  gameStatusUpdate: (payload: GameStatus) => void
  recentGamesChanged: (recentGames: RecentGame[]) => void
  languageChanged: () => void
  settingChanged: (obj: {
    key: string
    oldValue: unknown
    newValue: unknown
  }) => void
  [key: `progressUpdate-${string}`]: (progress: GameStatus) => void
  wineVersionInstalled: (versionInfo: WineVersionInfo, path: string) => void
  wineVersionUninstalled: (versionInfo: WineVersionInfo) => void
  releasesInfoReady: (releasesInfo: ReleasesInfo) => void
}

// The boot-owned event bus (66.4-17, D-05): one emitter per AppRuntime, never a module singleton, so two
// boots (or two tests) never see each other's events. Construction adds no listener and arms no timer.
//
// This can be used to emit/listen to events to decouple components
// For example:
//   When the list of recent games changes, a `recentGamesChanged` event is emitted.
//   The `tray_icon` module listens to this event with `events.on` to update
//   the list of recent games in the tray icon's context menu asynchronously
//
// Usage:
//   Emit events with `events.emit("eventName", arg1, arg2)
//   Listen to events with `events.on("eventName", (arg1, arg2) => { ... })
export type BackendEventBus = TypedEventEmitter<BackendEvents>

export function createBackendEvents(): BackendEventBus {
  return new EventEmitter() as BackendEventBus
}
