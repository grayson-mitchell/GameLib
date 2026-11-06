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
        path: `${STEAM}game(Constants|SessionState|Requirements|ProtocolUrl|DrmLaunch|Eligibility|Install|Launch|LaunchOverlay|BridgeLaunch|Maintenance|Uninstall)\\.ts$`
      },
      to: {
        path: `${STEAM}games\\.ts$`,
        dependencyTypesNot: ['type-only']
      }
    }
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' }
  }
}
