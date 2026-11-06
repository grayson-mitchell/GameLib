import type {
  ImportGameArgs,
  InstallParams,
  MoveGameArgs,
  Runner,
  StatusPromise,
  UpdateParams
} from '../../types'

// ts-prune-ignore-next
export interface InstallAsync {
  checkGameUpdates: () => Promise<string[]>
  // Phase 21 (21-09), D-09: registered Steam libraries for the multi-library
  // install-location override picker (D-08 — registered folders only, never
  // an arbitrary filesystem browse). Gated server-side on the D-13 opt-in —
  // returns [] when native install is OFF, EXCEPT for a bottle-routed title:
  // pass its `appName` and the backend answers with targets regardless of the
  // toggle (quick 261030-o77: the toggle only scopes mac-native titles).
  listSteamLibraryTargets: (
    appName?: string
  ) => Promise<{ path: string; steamappsDir: string; isPrimary: boolean }[]>
  // quick 261105-upw: backend-authoritative InstallApp-route discriminator for
  // the install modal. installAppRoute is true only for feature ON + native
  // OFF + non-bottle title on macOS; libraries are then the registered targets.
  // quick 261106-s3n: true only when "Delete Steam games directly in GameLib"
  // is ON and this appId is a native-root install (backend-authoritative).
  getSteamDeleteRoute: (appName?: string) => Promise<{ gamelibDelete: boolean }>
  getSteamInstallAppTargets: (appName?: string) => Promise<{
    installAppRoute: boolean
    libraries: { path: string; steamappsDir: string; isPrimary: boolean }[]
  }>
  install: (args: InstallParams) => Promise<void>
  uninstall: (
    appName: string,
    runner: Runner,
    shouldRemovePrefix: boolean,
    shoudlRemoveSetting: boolean
  ) => Promise<void>
  moveInstall: (args: MoveGameArgs) => Promise<void>
  importGame: (args: ImportGameArgs) => StatusPromise
  updateGame: (args: UpdateParams) => Promise<void>
}
