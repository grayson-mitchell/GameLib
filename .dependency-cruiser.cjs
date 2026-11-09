'use strict'

// Phase 62 import-graph rules (D-13, D-14).
//
// Every rule runs at severity 'error' with a zero count; there is no baseline file and
// `pnpm boundaries` runs without `--ignore-known` (D-15).

const STEAM = '^src/backend/storeManagers/steam/'
const DEPOT_SUBTREE = `${STEAM}depot(\\.ts$|/)`

module.exports = {
  forbidden: [
    {
      // Phase 61 plan 10 (D-12): the engine layer serves every store, so it never imports a
      // store manager. Store-specific inputs reach it through injected deps (the adapters in
      // storeManagers/<store>/engine/). Static, dynamic and type-only imports all count.
      name: 'engine-is-store-agnostic',
      severity: 'error',
      comment:
        'src/backend/engine must not import from src/backend/storeManagers.',
      from: { path: '^src/backend/engine/' },
      to: { path: '^src/backend/storeManagers/' }
    },
    {
      // A store manager never reaches into a sibling manager. Tests are exempt: they may
      // exercise cross-store interplay without being production coupling.
      name: 'no-cross-store-manager',
      severity: 'error',
      comment:
        'Store managers (steam|gog|legendary|nile|sideload) must not import each other.',
      from: {
        path: '^src/backend/storeManagers/(steam|gog|legendary|nile|sideload)/',
        pathNot: ['/__tests__/', '/__mocks__/', '\\.test\\.ts$']
      },
      to: {
        path: '^src/backend/storeManagers/(steam|gog|legendary|nile|sideload)/',
        pathNot: '^src/backend/storeManagers/$1/'
      }
    },
    {
      // Static, dynamic and type-only imports all count (launcher.ts also has a dynamic
      // import of steam/bottle).
      name: 'launcher-only-via-store-managers-index',
      severity: 'error',
      comment:
        'launcher.ts reaches store managers only through storeManagers/index.ts.',
      from: { path: '^src/backend/launcher\\.ts$' },
      to: {
        path: '^src/backend/storeManagers/',
        pathNot: '^src/backend/storeManagers/index\\.ts$'
      }
    },
    {
      // D-08: the depot/ children must not depend back on the depot.ts parent.
      name: 'no-depot-parent-back-edge',
      severity: 'error',
      comment:
        'steam/depot/** must not import steam/depot.ts (or depot/index.ts).',
      from: { path: `${STEAM}depot/` },
      to: { path: `${STEAM}depot(\\.ts|/index\\.ts)$` }
    },
    {
      // Phase 65 D-05: steam/library/ holds SteamLibraryManager in index.ts; its sibling
      // modules must never import it back.
      name: 'no-library-index-back-edge',
      severity: 'error',
      comment:
        'steam/library/*.ts siblings must not import steam/library/index.ts (or steam/library).',
      from: { path: `${STEAM}library/(?!index\\.ts$)[^/]+\\.ts$` },
      to: { path: `${STEAM}library/index\\.ts$` }
    },
    {
      // Scoped to the depot subtree on purpose: games.ts <-> library.ts is an existing cycle
      // the games.ts split cannot remove.
      name: 'no-circular-depot',
      severity: 'error',
      comment:
        'No import cycle made up only of modules in the steam depot subtree.',
      from: { path: DEPOT_SUBTREE },
      to: { circular: true, viaOnly: { path: DEPOT_SUBTREE } }
    },
    {
      // Guards against cycles back into games.ts while it is split.
      name: 'games-split-modules-are-leaves',
      severity: 'error',
      comment:
        'Modules split out of steam/games.ts must not runtime-import games.ts.',
      from: {
        path: `${STEAM}(game(Constants|SessionState|Requirements|ProtocolUrl|DrmLaunch|Eligibility|Install|Launch|LaunchOverlay|BridgeLaunch|Maintenance|Uninstall|InstallBridge|InstallDepot|BridgeWineLaunch|BridgeLaunchGate|Metadata)|bridgeInstallState)\\.ts$`
      },
      to: {
        path: `${STEAM}games\\.ts$`,
        dependencyTypesNot: ['type-only']
      }
    },
    {
      // Phase 66 D-11 / RESEARCH Pitfall 1: the process runner is a leaf. Importing
      // logger/config/utils would re-form the logger -> config -> spawn cycle.
      name: 'runner-is-a-leaf',
      severity: 'error',
      comment:
        'src/backend/process/ may import only files inside src/backend/process/.',
      from: { path: '^src/backend/process/', pathNot: ['/__tests__/'] },
      to: { path: '^src/', pathNot: '^src/backend/process/' }
    },
    {
      // Phase 66 D-11 / RESEARCH Pitfall 1: no npm package either; Node builtins only.
      name: 'runner-no-npm',
      severity: 'error',
      comment:
        'src/backend/process/ imports Node builtins only, no npm package.',
      from: { path: '^src/backend/process/', pathNot: ['/__tests__/'] },
      to: {
        dependencyTypes: [
          'npm',
          'npm-dev',
          'npm-optional',
          'npm-peer',
          'npm-no-pkg',
          'npm-unknown'
        ]
      }
    }
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' }
  }
}
