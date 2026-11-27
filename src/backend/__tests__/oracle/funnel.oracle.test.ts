/**
 * The launch funnel oracle (88.3-01, D-11, D-12, D-13, D-14, D-20, D-22, D-25): the TS launch funnel
 * (`runLaunchEventCallback` behind `launchEventCallback` in `src/backend/launcher.ts`), driven through the real
 * `createLauncher(deps).launchEventCallback(params)` over `createFakeLauncherDeps` and recorded as the golden the Rust
 * funnel over `ManagerHooks` (88.3-04, 88.3-05) has to reproduce. The golden exists before any Rust funnel does, and it
 * is recorded from the TS only: write mode exists in this file and nowhere else.
 *
 * Slice `gamelib-launch/tests/fixtures/golden/funnel/`:
 *   cases.json      built from the case tables below (write mode rewrites it, compare mode checks it)
 *   deltas.json     the documented Rust-side differences (D-19), an object keyed by delta name
 *   MANIFEST.json   `{ count, floor }`
 *   expected/<case>/result.json   how each Play ended: `{ plays: [{ status } | { rejected }] }`
 *   expected/<case>/events.json   the ordered transcript (see `FunnelEvent` in testUtils/launchOracle/funnelTrace.ts):
 *                                 status pushes, bus emits, gamelib.log lines, per-game log frames, Rust requests with
 *                                 their replies, hook and script calls, store writes and host calls
 *   (requests.json, spawns.json and tree.json are the harness's fixed files; the funnel spawns nothing itself)
 *
 * Isolation (D-12, D-13, D-22): every case runs on a fresh fake HOME inside `withPinnedBaseEnv`, with an injected
 * platform and `isCLINoGui`, a `Date`-only fake clock pinned to 2026-01-01T00:00:00.000Z that moves by `sessionMs` inside
 * the scripted `launch`, and every recorded path normalised to a placeholder. Nothing reads the real profile and no child
 * is spawned. The logger is spied on, never mocked. Behaviour that looks wrong is kept as recorded and listed in the plan
 * SUMMARY under `D-20 candidates` (D-20); a fix is never mixed into a golden diff.
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite cases.json, deltas.json, MANIFEST.json and every expected/ folder
 *   (default)                        recompute and compare, offline
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  assertManifest,
  expectEmptyCasesToFail,
  goldenDir,
  loadCases,
  syncManifest,
  writeOrCompareGolden
} from 'backend/testUtils/engineWineOracle/harness'
import { engineWineOracleMode } from 'backend/testUtils/engineWineOracle/recorder'
import {
  assertCasesCoverTitles,
  slug,
  tsTestTitles
} from 'backend/testUtils/launchOracle/census'
import {
  funnelScenario,
  recordFunnel,
  type Answer,
  type FunnelEvent,
  type FunnelScenario,
  type RustAnswer
} from 'backend/testUtils/launchOracle/funnelTrace'
import {
  allPairs,
  uncoveredPairs,
  type Axes,
  type Row
} from 'backend/testUtils/launchOracle/pairwise'
import type { GameSettings, InstallPlatform, Runner } from 'common/types'

const CRATE = 'gamelib-launch'
const SLICE = 'funnel'
/** The case count this plan committed; a later edit may raise it, never lower it. */
const FUNNEL_FLOOR = 59
/** The stem of a case that stands for one `it` title of launcher.engineStep.test.ts. */
const CENSUS_STEM = 'launcher.engineStep'
const ENGINE_STEP_TEST = join(__dirname, '..', 'launcher.engineStep.test.ts')

const mode = engineWineOracleMode()

interface FunnelCase {
  id: string
  /** What the case pins; it only reads well in `cases.json`. */
  note?: string
  /** The pairwise row this case was built from. */
  axes?: Row
  scenario: FunnelScenario
}

const ok = (value: unknown = null): Answer => ({ resolves: value })
const fail = (message: string): Answer => ({ rejects: message })

const WINE = {
  name: 'Wine-Test',
  bin: '/pins/wines/Wine-Test/bin/wine',
  type: 'wine' as const
}
const OVERLAY_WINE = {
  name: 'Overlay',
  bin: '/pins/engines/crossover/bin/wine',
  type: 'crossover' as const
}
const HEALED_WINE = {
  name: 'Wine-Healed',
  bin: '/pins/wines/Wine-Healed/bin/wine',
  type: 'wine' as const
}
/** `launch_check_wine_before_launch`: the wine is fine, one line for the game log. */
const WINE_OK = {
  ok: true,
  log: [{ level: 'info', parts: ['Wine check: ok'] }]
}
const LAST_USED = {
  type: 'basic' as const,
  name: 'Windowed',
  parameters: '--windowed'
}
const EXPLICIT = {
  type: 'basic' as const,
  name: 'Safe mode',
  parameters: '--safe'
}

// ---- the tracer (88.3-01 Task 1) -------------------------------------------------------------

/** Tracer: one native legendary launch, nothing else going on. */
function tracerCases(): FunnelCase[] {
  return [
    {
      id: 'funnel--native-legendary-plain',
      note: 'the end-to-end tracer: native legendary, no scripts, saves off, verbose logs on, engine step skips, launch resolves true',
      scenario: funnelScenario({})
    }
  ]
}

// ---- the pairwise matrix (D-14) --------------------------------------------------------------

const AXES = {
  runner: ['legendary', 'gog', 'nile', 'sideload'],
  native: ['native', 'windows'],
  engine: ['skip', 'legacy', 'use'],
  verboseLogs: ['on', 'off'],
  disableLogs: ['off', 'on'],
  saves: ['off', 'on-online', 'on-offline'],
  window: ['none', 'minimize-mac', 'minimize-tray', 'minimize-no-tray-linux'],
  scripts: ['none', 'before', 'after', 'both'],
  launchResult: ['true', 'false'],
  launchOption: ['none', 'last-used'],
  firstPlay: ['first', 'repeat'],
  playtimeSync: ['on', 'off']
} satisfies Axes

/**
 * The rows the TS can reach: a native game takes no engine step (`skip` only), and the playtime sync switch is read for a
 * GOG launch only (every other runner carries the default `on`).
 */
const feasible = (row: Row): boolean =>
  (row.native !== 'native' || row.engine === 'skip') &&
  (row.runner === 'gog' || row.playtimeSync === 'on')

const WINDOW_RULES: Record<
  string,
  {
    platform: 'mac' | 'linux'
    minimizeOnLaunch: boolean
    noTrayIcon: boolean
  }
> = {
  none: { platform: 'linux', minimizeOnLaunch: false, noTrayIcon: false },
  'minimize-mac': { platform: 'mac', minimizeOnLaunch: true, noTrayIcon: true },
  'minimize-tray': {
    platform: 'linux',
    minimizeOnLaunch: true,
    noTrayIcon: false
  },
  'minimize-no-tray-linux': {
    platform: 'linux',
    minimizeOnLaunch: true,
    noTrayIcon: true
  }
}

const WINDOWS_INSTALL: Record<string, InstallPlatform> = {
  legendary: 'Windows',
  gog: 'windows',
  nile: 'Windows',
  sideload: 'Windows'
}

/** The reply of `engine_launch_select` for each kind, as the crate answers it. */
function engineReply(
  kind: 'skip' | 'legacy' | 'use' | 'refused',
  key: string,
  settings: Partial<GameSettings>,
  lines: string[]
): unknown {
  switch (kind) {
    case 'skip':
      return { kind: 'skip' }
    case 'legacy':
      return { kind: 'legacy', key, logLines: lines }
    case 'refused':
      return { kind: 'refused', key, logLines: lines }
    case 'use':
      return {
        kind: 'use',
        key,
        selection: {},
        prefix: {},
        logLines: lines,
        launchSettings: { ...settings, wineVersion: OVERLAY_WINE }
      }
  }
}

function pairwiseScenario(row: Row): FunnelScenario {
  const runner = row.runner as Runner
  const appName = `${runner}-app`
  const native = row.native === 'native'
  const engine = row.engine as 'skip' | 'legacy' | 'use'
  const rule = WINDOW_RULES[String(row.window)]
  if (!rule) throw new Error(`no window rule for ${String(row.window)}`)
  const scripts = String(row.scripts)
  const verboseLogs = row.verboseLogs === 'on'
  const gameSettings: Partial<GameSettings> = {
    verboseLogs,
    autoSyncSaves: row.saves !== 'off',
    savesPath: '/pins/saves',
    gogSaves:
      runner === 'gog' ? [{ name: 'saves', location: '/pins/gog/saves' }] : [],
    wineVersion: WINE,
    ...((scripts === 'before' || scripts === 'both') && {
      beforeLaunchScriptPath: '/pins/scripts/before.sh'
    }),
    ...((scripts === 'after' || scripts === 'both') && {
      afterLaunchScriptPath: '/pins/scripts/after.sh'
    }),
    ...(row.launchOption === 'last-used' && { lastUsedLaunchOption: LAST_USED })
  }
  const rust: Record<string, RustAnswer> = {
    engine_launch_select: ok(
      engineReply(engine, `${runner}:${appName}`, gameSettings, [
        `engine=${engine}`
      ])
    ),
    info_recent_add: ok()
  }
  if (engine === 'use') rust.engine_launch_end = ok()
  if (!native && engine !== 'use') {
    rust.launch_check_wine_before_launch = ok(WINE_OK)
  }
  return funnelScenario({
    runner,
    appName,
    title: `Title of ${runner}`,
    native,
    platform: rule.platform,
    installPlatform: native ? undefined : WINDOWS_INSTALL[runner],
    online: row.saves !== 'on-offline',
    tsStore: {
      hasApp: row.firstPlay === 'repeat',
      totalPlayed: row.firstPlay === 'repeat' ? 120 : 0
    },
    globalSettings: {
      minimizeOnLaunch: rule.minimizeOnLaunch,
      noTrayIcon: rule.noTrayIcon,
      disableLogs: row.disableLogs === 'on',
      disablePlaytimeSync: row.playtimeSync === 'off'
    },
    gameSettings,
    gameConfigSettings: { verboseLogs },
    rust,
    hooks: {
      launch: ok(row.launchResult === 'true'),
      presence: runner === 'gog'
    }
  })
}

const pairwiseRows = (): Row[] => allPairs(AXES, feasible)

function pairwiseCases(): FunnelCase[] {
  return pairwiseRows().map((row, index) => ({
    id: `funnel--pairwise-${String(index + 1).padStart(2, '0')}`,
    axes: row,
    scenario: pairwiseScenario(row)
  }))
}

// ---- every title of launcher.engineStep.test.ts, one named case each (D-14) ------------------

const D1 = 'launcher engine step (61-14, 87-52) > '
const D2 =
  'the end of a launch releases the display sleep blocker (87-73, RF2) > '
const D3 = 'launcher engine step request: the offline flag (87-63, F1) > '
const D4 = 'launcher deadline arming position (61-16) > '

const STORED = {
  verboseLogs: true,
  wineVersion: {
    name: 'stored',
    bin: '/pins/wines/stored/bin/wine',
    type: 'wine' as const
  }
}
const OVERLAY = {
  verboseLogs: true,
  wineVersion: {
    name: 'overlay',
    bin: '/pins/wines/overlay/bin/wine',
    type: 'wine' as const
  },
  afterLaunchScriptPath: '/overlay/after.sh'
}
const QUAIL_KEY = 'legendary:Quail'
const USE_REPLY = {
  kind: 'use',
  key: QUAIL_KEY,
  selection: {},
  prefix: {},
  logLines: ['engine=crossover version=24.0', 'bottle=Quail'],
  launchSettings: OVERLAY
}

/** The launcher the engine step suite built: a Windows legendary game on macOS, the monitor offline, nothing stored. */
const quail = (patch: Parameters<typeof funnelScenario>[0]): FunnelScenario =>
  funnelScenario({
    appName: 'Quail',
    title: 'Quail',
    native: false,
    platform: 'mac',
    online: false,
    tsStore: { hasApp: true },
    globalSettings: {
      minimizeOnLaunch: false,
      noTrayIcon: true,
      disablePlaytimeSync: true
    },
    gameSettings: STORED,
    rust: {
      engine_launch_select: ok({ kind: 'skip' }),
      launch_check_wine_before_launch: ok(WINE_OK),
      engine_launch_end: ok(),
      info_recent_add: ok()
    },
    ...patch
  })

const ENGINE_STEP_CASES: Record<string, FunnelScenario> = {
  [`${D1}runs the step once, after the log writer and before the Wine check, sending the launch facts`]:
    quail({}),
  [`${D1}'use': skips the Wine check, runs on the reply's settings, writes its log lines and releases after the launch`]:
    quail({ rust: { engine_launch_select: ok(USE_REPLY) } }),
  [`${D1}'use': releases the selection when the launch throws`]: quail({
    rust: { engine_launch_select: ok(USE_REPLY) },
    hooks: { launch: fail('boom') }
  }),
  [`${D1}'%s': the Wine check runs as today, no overlay, no release`]: quail({
    rust: {
      engine_launch_select: ok({ kind: 'legacy', key: QUAIL_KEY, logLines: [] })
    }
  }),
  [`${D1}'refused': reports done, closes the log, aborts, and never launches`]:
    quail({
      rust: {
        engine_launch_select: ok({
          kind: 'refused',
          key: QUAIL_KEY,
          logLines: ['refused']
        })
      }
    }),
  [`${D1}a reply the crate never produces fails the launch instead of guessing an engine`]:
    quail({
      rust: {
        engine_launch_select: ok({ kind: 'use', key: QUAIL_KEY, logLines: [] })
      }
    }),
  [`${D2}'refused': stops the blocker it started once, logs it once, sends done once`]:
    quail({
      rust: {
        engine_launch_select: ok({
          kind: 'refused',
          key: QUAIL_KEY,
          logLines: []
        })
      }
    }),
  [`${D2}after a refused launch the next launch starts a fresh blocker (the id was cleared)`]:
    quail({
      rust: {
        engine_launch_select: {
          sequence: [
            ok({ kind: 'refused', key: QUAIL_KEY, logLines: [] }),
            ok({ kind: 'skip' })
          ]
        }
      },
      playAgain: { online: false }
    }),
  [`${D2}a rejected engine step sends done, stops and clears the blocker, and rejects with the original error`]:
    quail({
      rust: {
        engine_launch_select: {
          sequence: [fail('engine_launch_select is down'), ok({ kind: 'skip' })]
        }
      },
      playAgain: { online: false }
    }),
  [`${D2}a failed Wine check stops and clears the blocker and sends done once`]:
    quail({
      rust: {
        launch_check_wine_before_launch: {
          sequence: [ok({ ok: false, log: [] }), ok(WINE_OK)]
        }
      },
      playAgain: { online: false }
    }),
  [`${D2}a normal launch stops the blocker once at its end and clears the id`]:
    quail({ playAgain: { online: false } }),
  [`${D3}with the monitor in %s the request says offline: %s`]: quail({
    online: false
  }),
  [`${D3}reads the monitor when the request is built, not when Play was pressed (the Epic offline prompt path)`]:
    quail({ online: true, goesOfflineDuringGetSettings: true }),
  [`${D3}a second Play after the network comes back says online again (the flag is never latched)`]:
    quail({ online: false, playAgain: { online: true } })
}

/** The one title with no golden of its own: a source-text gate (D-15). */
const NOT_PORTED: Record<string, string> = {
  [`${D4}the arm moved into Rust with the wine prepare step: launcher.ts holds no arm call and the adapter ends with one finish call`]:
    'source-text gate, dropped per D-15'
}

function engineStepCases(): FunnelCase[] {
  return Object.entries(ENGINE_STEP_CASES).map(([title, scenario]) => ({
    id: `${CENSUS_STEM}--${slug(title)}`,
    note: title,
    scenario
  }))
}

// ---- the named incidents ---------------------------------------------------------------------

/** A Windows game on macOS whose engine step skips and whose Wine check passes. */
const windowsGame = (
  patch: Parameters<typeof funnelScenario>[0]
): FunnelScenario =>
  funnelScenario({
    native: false,
    platform: 'mac',
    installPlatform: 'Windows',
    rust: {
      engine_launch_select: ok({ kind: 'skip' }),
      launch_check_wine_before_launch: ok(WINE_OK),
      info_recent_add: ok()
    },
    ...patch
  })

const incident = (
  id: string,
  note: string,
  scenario: FunnelScenario
): FunnelCase => ({ id, note, scenario })

const WINE_HEAL = {
  ok: true,
  log: [{ level: 'info', parts: ['Wine check: the game wine was replaced'] }],
  wineVersion: HEALED_WINE
}

function incidentCases(): FunnelCase[] {
  return [
    incident(
      'funnel--folder-missing-asks-and-aborts',
      'the install folder is gone: Rust asks whether to uninstall, the funnel reports done and aborts before any settings read',
      funnelScenario({
        installPath: 'absent',
        rust: { launch_ask_force_uninstall: ok(0) }
      })
    ),
    incident(
      'funnel--engine-refused-releases-the-blocker',
      'the engine step refuses: the display blocker is released, done is sent, the log is closed, the result is abort',
      windowsGame({
        rust: {
          engine_launch_select: ok(
            engineReply('refused', 'legendary:alpha', {}, ['refused'])
          )
        }
      })
    ),
    incident(
      'funnel--engine-throws-releases-the-blocker-and-rethrows',
      'the engine request rejects: done, the blocker released, the log closed and the same error rethrown',
      windowsGame({
        rust: { engine_launch_select: fail('engine_launch_select is down') }
      })
    ),
    incident(
      'funnel--wine-check-fails-releases-the-blocker',
      'the Wine check answers not ok: an error line, the blocker released, done, the log closed, the result is error',
      windowsGame({
        rust: {
          launch_check_wine_before_launch: ok({
            ok: false,
            log: [{ level: 'error', parts: ['Wine check: no usable wine'] }]
          })
        }
      })
    ),
    incident(
      'funnel--recent-game-rejects-still-done',
      'CR-41: the recent-game write rejects: a warning is logged and the launch still ends done',
      funnelScenario({
        rust: {
          engine_launch_select: ok({ kind: 'skip' }),
          info_recent_add: fail('info_recent_add: the store is locked')
        }
      })
    ),
    incident(
      'funnel--launch-rejects-writes-the-exception',
      'the launch rejects: the exception goes to the gamelib log and the game log, the launch ends with an error result',
      funnelScenario({ hooks: { launch: fail('the game could not start') } })
    ),
    incident(
      'funnel--cli-no-gui-exits',
      'launched from the command line without a window: the app exits after the final done',
      funnelScenario({ isCLINoGui: true })
    ),
    incident(
      'funnel--gog-playtime-posted',
      'a GOG launch posts the session to the server and sets and clears presence',
      funnelScenario({
        runner: 'gog',
        appName: 'gog-app',
        hooks: { presence: true }
      })
    ),
    incident(
      'funnel--gog-playtime-sync-disabled',
      'a GOG launch with playtime sync disabled logs the skipped post and posts nothing',
      funnelScenario({
        runner: 'gog',
        appName: 'gog-app',
        globalSettings: { disablePlaytimeSync: true },
        hooks: { presence: true }
      })
    ),
    incident(
      'funnel--gog-playtime-post-rejects',
      'D-20: a rejected GOG playtime post rejects the whole launch, before the recent-game write and before done',
      funnelScenario({
        runner: 'gog',
        appName: 'gog-app',
        hooks: { presence: true, updateGOGPlaytime: fail('gog is unreachable') }
      })
    ),
    incident(
      'funnel--saves-download-rejects-logs-and-goes-on',
      'the cloud save sync rejects before and after the launch: each is logged as an error and the launch goes on',
      funnelScenario({
        gameSettings: {
          autoSyncSaves: true,
          savesPath: '/pins/saves',
          gogSaves: []
        },
        hooks: { syncSaves: fail('cloud saves are unreachable') }
      })
    ),
    incident(
      'funnel--persist-bottle-wine-version-hook',
      'a non-native game whose store defines persistBottleWineVersion: the hook is handed the wine the check settled on',
      windowsGame({
        rust: {
          launch_check_wine_before_launch: ok(WINE_HEAL)
        },
        hooks: { persistBottleWineVersion: true }
      })
    ),
    incident(
      'funnel--wine-check-heals-and-persists',
      'the Wine check replaces the game wine and the global one: the game setting and the global setting are both written',
      windowsGame({
        rust: {
          launch_check_wine_before_launch: ok({
            ...WINE_HEAL,
            persistGameWine: true,
            globalWineVersion: HEALED_WINE
          })
        }
      })
    ),
    incident(
      'funnel--before-script-rejects-releases-engine',
      'D-20: a rejected before-launch script ends the launch with the engine released and nothing else: the blocker stays held and done is never sent',
      windowsGame({
        gameSettings: { beforeLaunchScriptPath: '/pins/scripts/before.sh' },
        scripts: { before: fail('before.sh failed') },
        rust: {
          engine_launch_select: ok(
            engineReply(
              'use',
              'legendary:alpha',
              { beforeLaunchScriptPath: '/pins/scripts/before.sh' },
              ['engine=crossover']
            )
          ),
          engine_launch_end: ok()
        }
      })
    ),
    incident(
      'funnel--after-script-rejects',
      'D-20: a rejected after-launch script skips the log close and rejects the launch after the engine is released',
      windowsGame({
        gameSettings: { afterLaunchScriptPath: '/pins/scripts/after.sh' },
        scripts: { after: fail('after.sh failed') },
        rust: {
          engine_launch_select: ok(
            engineReply(
              'use',
              'legendary:alpha',
              { afterLaunchScriptPath: '/pins/scripts/after.sh' },
              ['engine=crossover']
            )
          ),
          engine_launch_end: ok()
        }
      })
    ),
    incident(
      'funnel--launch-arguments-win-over-last-used',
      'explicit launch arguments, skipVersionCheck and args reach the launch; the last used option does not replace them',
      funnelScenario({
        gameSettings: { lastUsedLaunchOption: LAST_USED },
        params: {
          launchArguments: EXPLICIT,
          skipVersionCheck: true,
          args: ['--extra']
        }
      })
    ),
    incident(
      'funnel--engine-skip-wine-check-runs',
      'a skipped engine step leaves the Wine check to run as before, with no overlay and no release',
      windowsGame({})
    ),
    incident(
      'funnel--long-session-sets-runs-for-me-on-mac',
      'a session past the threshold on macOS writes the runs-for-me record (the store write, the push, the log line)',
      funnelScenario({ platform: 'mac', sessionMs: 90_000 })
    ),
    incident(
      'funnel--short-session-leaves-runs-for-me-alone',
      'a session under the threshold on macOS writes no runs-for-me record',
      funnelScenario({ platform: 'mac', sessionMs: 5_000 })
    ),
    incident(
      'funnel--steam-playtime-tracked-externally',
      'a runner whose playtime is tracked outside the funnel (steam) records no play session',
      funnelScenario({
        runner: 'steam',
        appName: 'steam-app',
        platform: 'mac',
        sessionMs: 90_000
      })
    )
  ]
}

function funnelCases(): FunnelCase[] {
  return [
    ...tracerCases(),
    ...pairwiseCases(),
    ...engineStepCases(),
    ...incidentCases()
  ]
}

/** Every named incident case this plan names (plus the extras it adds), so a dropped one fails by name. */
const INCIDENT_IDS = [
  'funnel--folder-missing-asks-and-aborts',
  'funnel--engine-refused-releases-the-blocker',
  'funnel--engine-throws-releases-the-blocker-and-rethrows',
  'funnel--wine-check-fails-releases-the-blocker',
  'funnel--recent-game-rejects-still-done',
  'funnel--launch-rejects-writes-the-exception',
  'funnel--cli-no-gui-exits',
  'funnel--gog-playtime-posted',
  'funnel--gog-playtime-sync-disabled',
  'funnel--gog-playtime-post-rejects',
  'funnel--saves-download-rejects-logs-and-goes-on',
  'funnel--persist-bottle-wine-version-hook'
]

/** The documented Rust-side differences (D-19): delta name -> why the Rust funnel does not copy the TS here. */
const DELTAS: Record<string, string> = {
  'events-bus-emit':
    "The TS funnel emits every gameStatusUpdate twice: as a frontend message and on the backend event bus (sendGameStatusUpdate). Nothing outside tests listens: a grep of src and meta for on('gameStatusUpdate'/once(/addListener( at HEAD (88.3-01) finds one match, the engineWineResolvers test, and the only bus listeners in non-test code are 'releasesInfoReady', 'settingChanged' and the per-app 'progressUpdate-<app>' of installStallWatchdog. So the Rust funnel emits only the frontend message; the bus entries of the golden are recorded for completeness and the replay skips them.",
  'reads-folded-into-launch-facts':
    'The TS recorder lists the play marker and every read the TS funnel made: game.getSettings, config.getSettings (three to five times per launch) and gameConfigs.get(app).getSettings (the verboseLogs read, a different store from the game settings). The Rust funnel asks the managers once, with launch_facts, before it does anything, so none of those reads is an event of the Rust funnel and the replay drops those kinds from the golden. What the reads returned is still compared: it is the input of every later event.'
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

describeSkipOnWindows('launch funnel oracle (88.3-01)', () => {
  const built = funnelCases()
  const casesFile = join(goldenDir(CRATE, SLICE), 'cases.json')
  if (mode === 'write') {
    mkdirSync(dirname(casesFile), { recursive: true })
    writeFileSync(casesFile, json(built))
    writeFileSync(join(goldenDir(CRATE, SLICE), 'deltas.json'), json(DELTAS))
  }
  const cases = loadCases<FunnelCase>(CRATE, SLICE)

  it('cases.json is exactly what the case builder produces', () => {
    expect(cases).toEqual(JSON.parse(JSON.stringify(built)))
  })

  it('deltas.json is exactly the documented delta table, each with a reason of its own', () => {
    const committed: unknown = JSON.parse(
      readFileSync(join(goldenDir(CRATE, SLICE), 'deltas.json'), 'utf8')
    )
    expect(committed).toEqual(DELTAS)
    for (const reason of Object.values(DELTAS)) {
      expect(reason.length).toBeGreaterThan(20)
    }
  })

  it.each(cases)('$id', async (c) => {
    const recorded = await recordFunnel(c.scenario)
    writeOrCompareGolden(CRATE, SLICE, c.id, {
      result: recorded.result,
      events: recorded.events
    })
  })

  const byId = (id: string): FunnelCase => {
    const found = cases.find((c) => c.id === id)
    if (!found) throw new Error(`${id} is missing from cases.json`)
    return found
  }

  it('the tracer records the funnel in the order the TS made its calls', async () => {
    const { events, result } = await recordFunnel(
      byId('funnel--native-legendary-plain').scenario
    )
    expect(result).toEqual({ plays: [{ status: 'done' }] })
    const at = (match: (e: FunnelEvent) => boolean, label: string): number => {
      const index = events.findIndex(match)
      if (index === -1) throw new Error(`the tracer has no ${label}`)
      return index
    }
    const status = (wanted: string) => (e: FunnelEvent) =>
      e.kind === 'frontend' &&
      e.channel === 'gameStatusUpdate' &&
      (e.args[0] as { status: string }).status === wanted
    const order = [
      at(status('launching'), 'launching status'),
      at(
        (e) => e.kind === 'appState' && e.member === 'wakeLock.start',
        'display-sleep start'
      ),
      at(
        (e) => e.kind === 'rust' && e.channel === 'engine_launch_select',
        'engine_launch_select request'
      ),
      at((e) => e.kind === 'hook' && e.hook === 'launch', 'launch hook call'),
      at(
        (e) => e.kind === 'gameLog' && e.rotate,
        'per-game log entry that rotates'
      ),
      at(
        (e) => e.kind === 'tsStore' && e.key.endsWith('.lastPlayed'),
        'lastPlayed write'
      ),
      at(
        (e) => e.kind === 'rust' && e.channel === 'info_recent_add',
        'info_recent_add request'
      ),
      at(status('done'), 'done status')
    ]
    expect(order).toEqual([...order].sort((a, b) => a - b))
    // The log rotates once: the first accepted per-game entry claims it, every later one carries false.
    const frames = events.filter((e) => e.kind === 'gameLog')
    expect(frames.length).toBeGreaterThan(0)
    expect(frames.filter((e) => e.rotate)).toHaveLength(1)
    expect(frames[0]?.rotate).toBe(true)
  })

  it('every pair of pairwise axis values that can occur together is in some funnel--pairwise row', () => {
    const rows = cases
      .filter((c) => c.id.startsWith('funnel--pairwise-'))
      .map((c) => c.axes as Row)
    expect(rows.length).toBeGreaterThan(0)
    expect(uncoveredPairs(AXES, rows, feasible)).toEqual([])
    // Every value of every axis appears in at least one row (a one-axis claim, not a pair).
    for (const [axis, values] of Object.entries(AXES)) {
      for (const value of values) {
        expect(rows.some((row) => row[axis] === value)).toBe(true)
      }
    }
  }, 120_000)

  it('every title of launcher.engineStep.test.ts is a named case, or a source-text gate dropped per D-15', () => {
    const titles = tsTestTitles(ENGINE_STEP_TEST)
    const ids = cases
      .map((c) => c.id)
      .filter((id) => id.startsWith(`${CENSUS_STEM}--`))
      .map((id) => id.slice(CENSUS_STEM.length + 2))
    assertCasesCoverTitles(ids, titles, NOT_PORTED)
    // One case per title and no case without a title: a renamed test cannot leave a stale golden.
    expect(ids).toHaveLength(titles.length - Object.keys(NOT_PORTED).length)
  })

  it('every named incident has a case', () => {
    const ids = new Set(cases.map((c) => c.id))
    for (const id of INCIDENT_IDS) expect(ids).toContain(id)
  })

  it('records the behaviours that look wrong exactly as the TS has them (D-20)', async () => {
    const run = async (id: string) =>
      (await recordFunnel(byId(id).scenario)).events
    const sent = (events: FunnelEvent[], status: string) =>
      events.filter(
        (e) =>
          e.kind === 'frontend' &&
          e.channel === 'gameStatusUpdate' &&
          (e.args[0] as { status: string }).status === status
      )
    const member = (events: FunnelEvent[], name: string) =>
      events.filter((e) => e.kind === 'appState' && e.member === name)

    // A rejected GOG playtime post rejects the launch before the recent-game write and before done.
    const gog = await run('funnel--gog-playtime-post-rejects')
    expect(sent(gog, 'done')).toHaveLength(0)
    expect(
      gog.some((e) => e.kind === 'rust' && e.channel === 'info_recent_add')
    ).toBe(false)

    // A rejected before-launch script leaves the display blocker held and sends no done.
    const before = await run('funnel--before-script-rejects-releases-engine')
    expect(member(before, 'wakeLock.start')).toHaveLength(1)
    expect(member(before, 'wakeLock.stop')).toHaveLength(0)
    expect(sent(before, 'done')).toHaveLength(0)

    // The funnel reads the global settings more than once and the per-game config once, in one launch.
    const plain = await run('funnel--native-legendary-plain')
    expect(
      plain.filter((e) => e.kind === 'config' && e.member === 'getSettings')
        .length
    ).toBeGreaterThan(1)
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, cases.length)
    assertManifest(CRATE, SLICE, cases, FUNNEL_FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, SLICE, FUNNEL_FLOOR)
  })
})
