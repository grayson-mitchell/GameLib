/**
 * The Windows shortcut oracle (94-07, D-12, D-23): what the TypeScript spawns to write a `.lnk`, how
 * it reads the redirected Desktop out of the registry, and which icon it picks, recorded as the
 * goldens the Rust port replays on every OS (Windows and Linux are proven by CI replay only, D-11).
 *
 * One slice, `windows`, with four case families (the id prefix names the family):
 *
 *   lnk-    the real `addShortcuts` on a faked win32 host. Every spawn goes through the Phase 87
 *           spawn-trace recorder (`createSpawnTracer`), which scripts the exit codes, so nothing runs:
 *           program, argv, the env diff against the process env the child inherits, the CRLF stdin
 *           script, and (from a thin wrapper, because the recorder does not keep them) `replaceEnv`,
 *           the timeout and `windowsHide`. Success needs exit 0 AND the `.lnk` on disk; a call-through
 *           `existsSync` spy answers for the `.lnk` so nothing is written anywhere.
 *   env-    `writeWindowsShortcut` driven directly: file and URL targets, arguments, icon and index,
 *           the `explorer.exe` indirection under each `SystemRoot` spelling.
 *   reg-    `readWindowsShellFolder` over scripted `reg.exe` output (REG_SZ, REG_EXPAND_SZ with
 *           `%USERPROFILE%`, value absent, non-zero exit, timeout, a spawn that throws, ...).
 *   icon-   `resolveWindowsShortcutIcon` over fake install trees in the profile: the store exe, the
 *           bounded scan (depth <= 3, 20,000 entries, helper-exe filter, name tiers) and the shell exe.
 *
 * Modes (see testUtils/shortcutsOracle/harness.ts):
 *   GAMELIB_WRITE_SHORTCUTS_GOLDEN=1   rewrite every golden from the TypeScript
 *   (default)                          recompute and compare, offline
 *
 * Host independence. This file is run on Windows and on ubuntu, and the goldens must be equal:
 *   - the child's inherited environment is the jest process env, so the recorded env diff is the
 *     `GAMELIB_LNK_*` keys only, and `inheritsProcessEnv` records that the rest is passed through;
 *   - `SystemRoot` is set to a synthetic value (or removed) around each case, never the host's;
 *   - the registry Desktop is the synthetic `Z:\GameLibOracle\Desktop`, `%USERPROFILE%` expands
 *     against a synthetic env passed in, and the redaction scan keeps real accounts out;
 *   - icon paths are made with `join` and so carry the host separator; they are recorded in the
 *     Windows form (`\`), which is what the product writes.
 *
 * Every case runs on a fresh `createFakeHomeProfile()`; the harness spawns nothing.
 */
import { mkdirSync, writeFileSync } from 'fs'
import fsPromises from 'fs/promises'
import { dirname, join } from 'path'
import gracefulFs from 'graceful-fs'
import { addShortcuts } from '../../shortcuts/shortcuts'
import {
  buildShortcutEnv,
  POWERSHELL_ARGS,
  WRITE_SHORTCUT_SCRIPT,
  WRITE_SHORTCUT_TIMEOUT_MS,
  writeWindowsShortcut,
  type ShortcutDetails
} from '../../shortcuts/windowsShortcut'
import { resolveWindowsShortcutIcon } from '../../shortcuts/windowsShortcutIcon'
import { readWindowsShellFolder } from 'backend/sidecar/knownFolders'
import { createSpawnTracer } from 'backend/testUtils/engineWineOracle/spawnTrace'
import {
  assertManifest,
  expectEmptyCasesToFail,
  mockPlatform,
  normalisePaths,
  syncManifest,
  withShortcutsOracleProfile,
  writeOrCompareGolden,
  type ShortcutsOracleProfile
} from 'backend/testUtils/shortcutsOracle/harness'
import { HOSTILE_NAMES } from './hostileNames'
import { REG_ENV } from './windowsInputs'
import type { GameInfo } from 'common/types'
import type { Game } from 'common/types/game_manager'
import type { ProcessRunner, RunOptions } from 'backend/process/types'

const SLICE = 'windows'
/** The case count this plan commits; a later edit may raise it, never lower it. */
const FLOOR = 30

/** A registry Desktop folder nothing may create anything under. */
const REGISTRY_DESKTOP = 'Z:\\GameLibOracle\\Desktop'
/** The `SystemRoot` the explorer.exe indirection sees; the host's own is never recorded. */
const SYSTEM_ROOT = 'Z:\\GameLibOracle\\Windows'
const USER_SHELL_FOLDERS =
  'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders'

/** What `reg.exe query ... /v <name>` prints (CRLF, four-space gutters). */
const regOutput = (
  name: string,
  type: 'REG_SZ' | 'REG_EXPAND_SZ',
  data: string
): string =>
  `\r\n${USER_SHELL_FOLDERS}\r\n    ${name}    ${type}    ${data}\r\n\r\n`

// ------------------------------------------------------------------ shared

interface ScriptedStep {
  program: string
  code?: number | null
  stdout?: string
  stderr?: string
  timedOut?: boolean
  throws?: string
  repeat?: boolean
}

interface RunOptionsRecord {
  replaceEnv: boolean
  timeoutMs: number | null
  windowsHide: boolean | null
  /** The env passed is the whole base env plus keys, not a bare map. */
  inheritsProcessEnv: boolean | null
}

/**
 * A spawn-trace recorder over `scripted` outputs, plus a wrapper that keeps the three run options
 * the recorder does not (`replaceEnv`, `timeoutMs`, `windowsHide`). `baseEnv` is the process env at
 * the moment of the call, so the recorded diff is only what the code under test added.
 */
function tracedRunner(scripted: readonly ScriptedStep[]): {
  runner: Pick<ProcessRunner, 'run'>
  spawns: () => unknown[]
} {
  const baseEnv = { ...process.env }
  const tracer = createSpawnTracer({ baseEnv, scripted })
  const options: RunOptionsRecord[] = []
  const runner: Pick<ProcessRunner, 'run'> = {
    run: (program: string, argv: readonly string[], opts?: RunOptions) => {
      const env = opts?.env
      options.push({
        replaceEnv: opts?.replaceEnv ?? false,
        timeoutMs: opts?.timeoutMs ?? null,
        windowsHide: opts?.windowsHide ?? null,
        inheritsProcessEnv: env
          ? Object.entries(baseEnv).every(([k, v]) => env[k] === v)
          : null
      })
      return tracer.runner.run(program, argv, opts)
    }
  }
  return {
    runner,
    spawns: () =>
      tracer.records.map((record, i) => ({
        program: record.program,
        argv: record.argv,
        options: options[i],
        envDiff: record.envDiff,
        cwd: record.cwd,
        stdin: record.stdin,
        result: record.result
      }))
  }
}

/** Runs `fn` with `SystemRoot` and `SYSTEMROOT` set as `value` (`undefined` removes both). */
async function withSystemRoot<T>(
  value: string | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const saved = new Map<string, string | undefined>()
  for (const key of ['SystemRoot', 'SYSTEMROOT']) {
    saved.set(key, process.env[key])
    delete process.env[key]
  }
  if (value !== undefined) process.env.SystemRoot = value
  try {
    return await fn()
  } finally {
    delete process.env.SystemRoot
    delete process.env.SYSTEMROOT
    for (const [key, original] of saved) {
      if (original !== undefined) process.env[key] = original
    }
  }
}

/** `a/b` or `a\b` to the Windows form, for the icon paths `join` built with the host separator. */
const windowsForm = (text: string): string => text.split('/').join('\\')

const stripPaths = (value: string, profile: ShortcutsOracleProfile): string =>
  normalisePaths(value, profile)

/** The shared `existsSync` answer: a `.lnk` is "on disk" when the case says its write succeeded. */
function spyLnkExists(present: boolean): () => void {
  const real = gracefulFs.existsSync
  const spy = jest
    .spyOn(gracefulFs, 'existsSync')
    .mockImplementation((path) =>
      String(path).toLowerCase().endsWith('.lnk') ? present : real(path)
    )
  return () => spy.mockRestore()
}

// --------------------------------------------------------------------- lnk

interface LnkCase {
  family: 'lnk'
  id: string
  title: string
  appName: string
  runner: string
  settings: { addDesktopShortcuts: boolean; addStartMenuShortcuts: boolean }
  fromMenu: boolean
  /** The reg.exe answer; `null` is a failing reg.exe (no Desktop folder). */
  desktop: string | null
  powershell: Omit<ScriptedStep, 'program'>
  /** Whether the `.lnk` exists after a powershell exit 0. */
  lnkPresent: boolean
  install?: 'store-exe' | 'gog'
}

const BOTH = { addDesktopShortcuts: true, addStartMenuShortcuts: true }

function lnkCases(): LnkCase[] {
  const cases: LnkCase[] = []
  const base = {
    family: 'lnk' as const,
    runner: 'legendary',
    settings: BOTH,
    fromMenu: false,
    desktop: REGISTRY_DESKTOP as string | null,
    powershell: { code: 0 },
    lnkPresent: true
  }
  const plain = HOSTILE_NAMES.find((n) => n.id === 'plain')
  if (!plain) throw new Error('no plain hostile name')
  // Every hostile title and app name: both `.lnk` files, the URL percent-encoded into the env.
  for (const name of HOSTILE_NAMES) {
    cases.push({
      ...base,
      id: `lnk-${name.id}`,
      title: name.title,
      appName: name.appName
    })
  }
  const on = (id: string, patch: Partial<LnkCase>): void => {
    cases.push({
      ...base,
      title: plain.title,
      appName: plain.appName,
      id: `lnk-plain-${id}`,
      ...patch
    })
  }
  // Which files each setting asks for.
  on('desktop-only', { settings: { ...BOTH, addStartMenuShortcuts: false } })
  on('menu-only', { settings: { ...BOTH, addDesktopShortcuts: false } })
  on('neither', {
    settings: { addDesktopShortcuts: false, addStartMenuShortcuts: false }
  })
  on('from-menu', {
    settings: { addDesktopShortcuts: false, addStartMenuShortcuts: false },
    fromMenu: true
  })
  // Runners other than the default end up percent-encoded in the target.
  for (const runner of ['gog', 'nile', 'sideload', 'steam']) {
    on(`runner-${runner}`, { runner })
  }
  // How the write can fail.
  on('exit0-no-lnk', { lnkPresent: false })
  on('exit1-stderr', {
    powershell: { code: 1, stderr: '  Add-Type : Cannot add type.\r\n' },
    lnkPresent: false
  })
  on('exit1-no-stderr', { powershell: { code: 1 }, lnkPresent: false })
  on('exit1-stderr-long', {
    powershell: { code: 1, stderr: `${'e'.repeat(4200)}tail` },
    lnkPresent: false
  })
  on('exit0-with-stderr-noise', {
    powershell: { code: 0, stderr: 'Preparing modules for first use.' }
  })
  on('timeout', {
    powershell: { code: null, timedOut: true },
    lnkPresent: false
  })
  on('spawn-throws', {
    powershell: { throws: 'spawn powershell.exe ENOENT' },
    lnkPresent: false
  })
  // The registry could not answer: no Desktop path, the Start Menu `.lnk` is still written.
  on('registry-failed', { desktop: null })
  on('registry-failed-desktop-only', {
    desktop: null,
    settings: { ...BOTH, addStartMenuShortcuts: false }
  })
  // The icon chain's answer reaches the env.
  on('icon-store-exe', { install: 'store-exe' })
  on('icon-gog', { install: 'gog', runner: 'gog' })
  return cases
}

async function runLnk(c: LnkCase): Promise<unknown> {
  return withShortcutsOracleProfile(async (profile) => {
    const restorePlatform = mockPlatform('win32')
    const restoreExists = spyLnkExists(c.lnkPresent)
    try {
      return await withSystemRoot(SYSTEM_ROOT, async () => {
        const scripted: ScriptedStep[] = [
          c.desktop === null
            ? { program: 'reg.exe', code: 1, stderr: 'ERROR: not found' }
            : {
                program: 'reg.exe',
                code: 0,
                stdout: regOutput('Desktop', 'REG_SZ', c.desktop)
              },
          { program: 'powershell.exe', repeat: true, ...c.powershell }
        ]
        const traced = tracedRunner(scripted)

        const installPath = join(profile.home, 'Games', 'Oracle Install')
        let executable = ''
        if (c.install === 'store-exe') {
          mkdirSync(installPath, { recursive: true })
          executable = 'Oracle.exe'
          writeFileSync(join(installPath, executable), 'x')
        }
        const gogExecutable = join(installPath, 'GogGame.exe')
        if (c.install === 'gog') {
          mkdirSync(installPath, { recursive: true })
          writeFileSync(gogExecutable, 'x')
        }
        const gameInfo = {
          runner: c.runner,
          app_name: c.appName,
          art_cover: '',
          art_square: '',
          install: {
            is_dlc: false,
            executable,
            ...(c.install ? { install_path: installPath } : {})
          },
          is_installed: true,
          title: c.title,
          canRunOffline: true
        } as unknown as GameInfo
        const game = { getGameInfo: () => gameInfo } as unknown as Game
        const deps = {
          libraryManagers: {
            gog: {
              getExecutable: () => gogExecutable,
              getProductApi: () => Promise.resolve()
            }
          },
          runner: traced.runner,
          aborts: {
            create: () => {
              throw new Error('no download in a windows case')
            }
          },
          config: {
            getSettings: () => ({ ...c.settings, addSteamShortcuts: false })
          },
          paths: profile.paths,
          imageTools: {}
        } as unknown as Parameters<typeof addShortcuts>[0]

        let outcome: unknown
        try {
          await addShortcuts(deps, game, c.fromMenu)
          outcome = { result: 'resolved' }
        } catch (error) {
          outcome = {
            result: 'rejected',
            message: stripPaths(
              error instanceof Error ? error.message : String(error),
              profile
            )
          }
        }
        const spawns = traced
          .spawns()
          .map((spawn) => normalisePaths(spawn, profile))
        return {
          family: c.family,
          platform: 'win32',
          input: {
            title: c.title,
            appName: c.appName,
            runner: c.runner,
            settings: c.settings,
            fromMenu: c.fromMenu,
            registryDesktop: c.desktop,
            powershell: c.powershell,
            lnkPresentAfterExit0: c.lnkPresent,
            install: c.install ?? null
          },
          outcome,
          spawns
        }
      })
    } finally {
      restoreExists()
      restorePlatform()
    }
  })
}

// --------------------------------------------------------------------- env

interface EnvCase {
  family: 'env'
  id: string
  lnk: string
  details: ShortcutDetails
  /** `undefined` removes SystemRoot. */
  systemRoot: string | undefined
  lnkPresent: boolean
}

const EXPLORER_TARGET = 'gamelib://launch?appName=2951630&runner=steam'

function envCases(): EnvCase[] {
  const lnk = 'Z:\\GameLibOracle\\Desktop\\Game.lnk'
  const mk = (
    id: string,
    details: ShortcutDetails,
    patch: Partial<EnvCase> = {}
  ): EnvCase => ({
    family: 'env',
    id: `env-${id}`,
    lnk,
    details,
    systemRoot: SYSTEM_ROOT,
    lnkPresent: true,
    ...patch
  })
  return [
    mk('url-target', { target: EXPLORER_TARGET }),
    mk('url-target-with-args', { target: EXPLORER_TARGET, args: '--flag x' }),
    mk('url-double-quote', { target: 'gamelib://launch?appName=a"b&runner=x' }),
    mk('url-target-icon', {
      target: EXPLORER_TARGET,
      icon: 'Z:\\GameLibOracle\\Games\\G\\G.exe',
      iconIndex: 3
    }),
    mk('url-icon-default-index', {
      target: EXPLORER_TARGET,
      icon: 'Z:\\GameLibOracle\\Games\\G\\G.exe'
    }),
    mk('file-target', { target: 'Z:\\GameLibOracle\\Games\\G\\G.exe' }),
    mk('file-target-args-icon', {
      target: 'Z:\\GameLibOracle\\Games\\G\\G.exe',
      args: '-windowed "a b"',
      icon: 'Z:\\GameLibOracle\\Games\\G\\G.ico',
      iconIndex: 1
    }),
    // One letter before the colon is a drive, not a scheme; two or more is a scheme.
    mk('drive-letter-is-not-a-scheme', { target: 'c:relative\\thing.exe' }),
    mk('two-letter-scheme-is-a-url', { target: 'ab:thing' }),
    mk('other-scheme-is-a-url', { target: 'steam://rungameid/42' }),
    mk('explicit-undefined-args-icon', {
      target: 'Z:\\GameLibOracle\\Games\\G\\G.exe',
      args: undefined,
      icon: undefined,
      iconIndex: undefined
    }),
    mk('empty-args-url', { target: EXPLORER_TARGET, args: '' }),
    // The explorer.exe indirection under each SystemRoot spelling.
    mk(
      'systemroot-unset',
      { target: EXPLORER_TARGET },
      { systemRoot: undefined }
    ),
    mk(
      'systemroot-trailing-backslash',
      { target: EXPLORER_TARGET },
      { systemRoot: `${SYSTEM_ROOT}\\` }
    ),
    mk('systemroot-empty', { target: EXPLORER_TARGET }, { systemRoot: '' }),
    mk(
      'unicode-lnk',
      { target: EXPLORER_TARGET },
      {
        lnk: 'Z:\\GameLibOracle\\Desktop\\幻想 \u{1F3AE}.lnk'
      }
    ),
    mk('exit0-no-lnk', { target: EXPLORER_TARGET }, { lnkPresent: false })
  ]
}

async function runEnv(c: EnvCase): Promise<unknown> {
  return withShortcutsOracleProfile(async (profile) => {
    const restoreExists = spyLnkExists(c.lnkPresent)
    try {
      return await withSystemRoot(c.systemRoot, async () => {
        // `buildShortcutEnv` over the process env, for the env it builds before any spawn.
        const traced = tracedRunner([
          { program: 'powershell.exe', code: 0, repeat: true }
        ])
        const outcome = await writeWindowsShortcut(
          { runner: traced.runner },
          c.lnk,
          c.details
        )
        return normalisePaths(
          {
            family: c.family,
            input: {
              lnk: c.lnk,
              details: c.details,
              systemRoot: c.systemRoot ?? null,
              lnkPresentAfterExit0: c.lnkPresent
            },
            outcome,
            spawns: traced.spawns()
          },
          profile
        )
      })
    } finally {
      restoreExists()
    }
  })
}

// --------------------------------------------------------------------- reg

interface RegCase {
  family: 'reg'
  id: string
  name: 'Desktop' | 'Personal'
  step: Omit<ScriptedStep, 'program'>
  env: NodeJS.ProcessEnv
}

function regCases(): RegCase[] {
  const mk = (
    id: string,
    step: RegCase['step'],
    patch: Partial<RegCase> = {}
  ): RegCase => ({
    family: 'reg',
    id: `reg-${id}`,
    name: 'Desktop',
    step,
    env: REG_ENV,
    ...patch
  })
  const sz = (data: string, name = 'Desktop') => regOutput(name, 'REG_SZ', data)
  const expand = (data: string, name = 'Desktop') =>
    regOutput(name, 'REG_EXPAND_SZ', data)
  return [
    mk('sz-absolute', {
      code: 0,
      stdout: sz('Z:\\GameLibOracle\\Desktop')
    }),
    mk('expand-userprofile', {
      code: 0,
      stdout: expand('%USERPROFILE%\\Desktop')
    }),
    mk('expand-onedrive', {
      code: 0,
      stdout: expand('%ONEDRIVE%\\Desktop')
    }),
    mk('expand-case-insensitive-name', {
      code: 0,
      stdout: expand('%userprofile%\\Desktop')
    }),
    mk('expand-unset-variable', {
      code: 0,
      stdout: expand('%GAMELIBNOSUCHVAR%\\Desktop')
    }),
    mk('expand-two-variables', {
      code: 0,
      stdout: expand('%USERPROFILE%\\%ONEDRIVE%')
    }),
    mk('sz-keeps-percent-literal', {
      code: 0,
      stdout: sz('Z:\\GameLibOracle\\100%\\Desktop')
    }),
    mk('value-absent', {
      code: 0,
      stdout: `\r\n${USER_SHELL_FOLDERS}\r\n\r\n`
    }),
    mk('other-value-only', {
      code: 0,
      stdout: sz('Z:\\GameLibOracle\\Docs', 'Personal')
    }),
    mk('value-name-case-differs', {
      code: 0,
      stdout: sz('Z:\\GameLibOracle\\Desktop', 'DESKTOP')
    }),
    mk('nonzero-exit', {
      code: 1,
      stderr:
        'ERROR: The system was unable to find the specified registry key or value.'
    }),
    mk('nonzero-exit-with-valid-output', {
      code: 1,
      stdout: sz('Z:\\GameLibOracle\\Desktop')
    }),
    mk('timeout', { code: null, timedOut: true }),
    mk('spawn-throws', { throws: 'spawn reg.exe ENOENT' }),
    mk('relative-path', { code: 0, stdout: sz('Desktop') }),
    mk('drive-relative-path', { code: 0, stdout: sz('Z:Desktop') }),
    mk('replacement-character', {
      code: 0,
      stdout: sz('Z:\\GameLibOracle\\D\uFFFDsktop')
    }),
    mk('normalises-dot-segments', {
      code: 0,
      stdout: sz('Z:\\GameLibOracle\\Other\\..\\Desktop\\.')
    }),
    mk('unc-path', { code: 0, stdout: sz('\\\\server\\share\\Desktop') }),
    mk('unicode-path', { code: 0, stdout: sz('Z:\\GameLibOracle\\桌面') }),
    mk('empty-data', {
      code: 0,
      stdout: `\r\n${USER_SHELL_FOLDERS}\r\n    Desktop    REG_SZ    \r\n`
    }),
    mk('lf-only-output', {
      code: 0,
      stdout: sz('Z:\\GameLibOracle\\Desktop').replaceAll('\r\n', '\n')
    }),
    mk(
      'personal-folder',
      {
        code: 0,
        stdout: expand('%USERPROFILE%\\Documents', 'Personal')
      },
      { name: 'Personal' }
    )
  ]
}

async function runReg(c: RegCase): Promise<unknown> {
  return withShortcutsOracleProfile(async (profile) => {
    const traced = tracedRunner([{ program: 'reg.exe', ...c.step }])
    const folder = await readWindowsShellFolder(
      { runner: traced.runner },
      c.name,
      c.env
    )
    return normalisePaths(
      {
        family: c.family,
        input: { name: c.name, env: c.env, scripted: c.step },
        folder: folder ?? null,
        spawns: traced.spawns()
      },
      profile
    )
  })
}

// -------------------------------------------------------------------- icon

/** A planned install tree: relative `/` path -> byte size. A trailing `/` makes an empty directory. */
type Files = Record<string, number>

interface IconCase {
  family: 'icon'
  id: string
  title: string
  /** The install directory's own name (the scan's first name tier). */
  dir: string
  files: Files
  /** The store executable as the install record holds it; `abs:` marks a path inside the profile. */
  storeExecutable?: string
  /** `none`: no installPath is passed. */
  installPath?: 'dir' | 'none'
  /** The GameLib shell exe: absent, a getter that throws, a file, a non-exe file, or missing. */
  shell: 'file' | 'throws' | 'missing' | 'not-exe'
  /** Filler directory entries injected into `readdir` for the install root (budget cases). */
  filler?: number
}

function iconCases(): IconCase[] {
  const cases: IconCase[] = []
  const mk = (
    id: string,
    patch: Pick<IconCase, 'title' | 'dir' | 'files'> & Partial<IconCase>
  ): void => {
    cases.push({ family: 'icon', id: `icon-${id}`, shell: 'file', ...patch })
  }
  // 1. The store's own executable.
  mk('store-exe-relative', {
    title: 'Store Game',
    dir: 'Store Game',
    files: { 'bin/Game.exe': 10, 'Other.exe': 900 },
    storeExecutable: 'bin/Game.exe'
  })
  mk('store-exe-absolute', {
    title: 'Store Game',
    dir: 'Store Game',
    files: { 'Elsewhere.exe': 10 },
    storeExecutable: 'abs:Elsewhere.exe',
    installPath: 'none'
  })
  mk('store-ico', {
    title: 'Store Game',
    dir: 'Store Game',
    files: { 'goggame-1.ico': 10, 'Game.exe': 900 },
    storeExecutable: 'goggame-1.ico'
  })
  mk('store-dll', {
    title: 'Store Game',
    dir: 'Store Game',
    files: { 'res.dll': 10, 'Game.exe': 900 },
    storeExecutable: 'res.dll'
  })
  mk('store-exe-uppercase-extension', {
    title: 'Store Game',
    dir: 'Store Game',
    files: { 'GAME.EXE': 10 },
    storeExecutable: 'GAME.EXE'
  })
  mk('store-png-rejected', {
    title: 'Art',
    dir: 'Art',
    files: { 'cover.png': 10, 'Art.exe': 50 },
    storeExecutable: 'cover.png'
  })
  mk('store-exe-missing-falls-to-scan', {
    title: 'Missing',
    dir: 'Missing',
    files: { 'Real.exe': 10 },
    storeExecutable: 'Gone.exe'
  })
  mk('store-exe-is-a-directory', {
    title: 'Dir',
    dir: 'Dir',
    files: { 'weird.exe/': 0, 'Real.exe': 10 },
    storeExecutable: 'weird.exe'
  })
  // 2. The scan: name tiers.
  mk('scan-name-beats-larger-launcher', {
    title: 'Total War: PHARAOH DYNASTIES',
    dir: 'Total War PHARAOH DYNASTIES',
    files: { 'Pharaoh.exe': 100, 'launcher/launcher.exe': 900 }
  })
  mk('scan-title-equal-beats-dir-contained', {
    title: 'WazHack',
    dir: 'WazHack Install',
    files: { 'WazHack.exe': 100, 'WazHackInstall.exe': 100 }
  })
  mk('scan-contained-three-chars', {
    title: 'Some Long Title',
    dir: 'Some Long Title',
    files: { 'Som.exe': 10, 'unrelated.exe': 900 }
  })
  mk('scan-contained-two-chars-is-not-a-match', {
    title: 'Some Long Title',
    dir: 'Some Long Title',
    files: { 'So.exe': 10, 'zeta.exe': 900 }
  })
  mk('scan-punctuation-and-case-normalised', {
    title: 'The Dig!',
    dir: 'The Dig!',
    files: { 'THE_dig.exe': 10, 'Larger.exe': 900 }
  })
  mk('scan-unicode-name', {
    title: '幻想郷',
    dir: '幻想郷',
    files: { '幻想郷.exe': 10, 'Other.exe': 900 }
  })
  // 3. The helper filter.
  mk('helper-crash-handler-filtered', {
    title: 'WazHack',
    dir: 'WazHack',
    files: { 'UnityCrashHandler32.exe': 900, 'WazHack.exe': 100 }
  })
  mk('helper-only-falls-to-shell', {
    title: 'Nothing',
    dir: 'Nothing',
    files: { 'unins000.exe': 900, 'UnityCrashHandler64.exe': 800 }
  })
  mk('helper-name-equal-title-is-kept', {
    title: 'Crash Bandicoot',
    dir: 'Crash Bandicoot',
    files: { 'Crash Bandicoot.exe': 10, 'Other.exe': 900 }
  })
  mk('helper-matches-on-the-relative-path', {
    title: 'Game',
    dir: 'Game',
    files: { 'redist/Game2.exe': 900, 'Plain.exe': 10 }
  })
  mk('helper-words', {
    title: 'Zeta',
    dir: 'Zeta',
    files: {
      'dxsetup.exe': 1,
      'oalinst.exe': 2,
      'easyanticheat.exe': 3,
      'workshop.exe': 4,
      'editor.exe': 5,
      'installer.exe': 6,
      'repair.exe': 7,
      'wipe.exe': 8,
      'directx.exe': 9,
      'setup.exe': 10,
      'Game.exe': 1
    }
  })
  // 4. Ordering: tier, depth, size, relative path.
  mk('order-shallower-beats-larger', {
    title: 'Zeta',
    dir: 'Zeta',
    files: { 'deep/Big.exe': 900, 'Small.exe': 10 }
  })
  mk('order-larger-at-equal-depth', {
    title: 'Zeta',
    dir: 'Zeta',
    files: { 'a.exe': 10, 'b.exe': 20 }
  })
  mk('order-relative-path-tiebreak', {
    title: 'Zeta',
    dir: 'Zeta',
    files: { 'b.exe': 10, 'a.exe': 10, 'c.exe': 10 }
  })
  // 5. Depth: levels 0..3 are scanned, a fourth is not.
  mk('depth-three-is-found', {
    title: 'Zeta',
    dir: 'Zeta',
    files: { 'a/b/c/Game.exe': 10 }
  })
  mk('depth-four-is-not-scanned', {
    title: 'Zeta',
    dir: 'Zeta',
    files: { 'a/b/c/d/Game.exe': 10 }
  })
  mk('depth-two-name-beats-root-other', {
    title: 'Factorio',
    dir: 'Factorio',
    files: { 'bin/x64/factorio.exe': 10, 'Other.exe': 900 }
  })
  // 6. The entry budget (20,000 entries, root first, breadth first).
  mk('budget-last-entry-is-listed', {
    title: 'Zeta',
    dir: 'Zeta',
    files: { 'Game.exe': 10 },
    filler: 19_999
  })
  mk('budget-one-past-is-cut', {
    title: 'Zeta',
    dir: 'Zeta',
    files: { 'Game.exe': 10 },
    filler: 20_000
  })
  mk('budget-spent-before-subdirectories', {
    title: 'Zeta',
    dir: 'Zeta',
    files: { 'bin/Game.exe': 10 },
    filler: 19_999
  })
  // 7. Extension and file kind.
  mk('scan-only-exe', {
    title: 'Zeta',
    dir: 'Zeta',
    files: { 'Game.ico': 10, 'Game.dll': 10, 'Game.exe.txt': 10 }
  })
  mk('scan-exe-uppercase', {
    title: 'Zeta',
    dir: 'Zeta',
    files: { 'GAME.EXE': 10 }
  })
  // 8. The shell exe.
  mk('shell-when-no-install', {
    title: 'Zeta',
    dir: 'Zeta',
    files: {},
    installPath: 'none'
  })
  mk('shell-when-empty-install', {
    title: 'Zeta',
    dir: 'Zeta',
    files: {}
  })
  mk('shell-getter-throws', {
    title: 'Zeta',
    dir: 'Zeta',
    files: {},
    shell: 'throws'
  })
  mk('shell-missing', {
    title: 'Zeta',
    dir: 'Zeta',
    files: {},
    shell: 'missing'
  })
  mk('shell-not-an-exe-extension', {
    title: 'Zeta',
    dir: 'Zeta',
    files: {},
    shell: 'not-exe'
  })
  mk('install-beats-shell', {
    title: 'Zeta',
    dir: 'Zeta',
    files: { 'Game.exe': 10 }
  })
  return cases
}

/** A directory entry as `readdir({ withFileTypes })` yields one, for the injected filler. */
function fillerEntry(name: string) {
  return {
    name,
    isSymbolicLink: () => false,
    isDirectory: () => false,
    isFile: () => true
  }
}

async function runIcon(c: IconCase): Promise<unknown> {
  return withShortcutsOracleProfile(async (profile) => {
    const games = join(profile.home, 'Games')
    const installRoot = join(games, c.dir)
    mkdirSync(installRoot, { recursive: true })
    for (const [relative, size] of Object.entries(c.files)) {
      const file = join(installRoot, ...relative.split('/'))
      if (relative.endsWith('/')) {
        mkdirSync(file, { recursive: true })
        continue
      }
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, Buffer.alloc(size))
    }
    let shellExe: string | undefined
    if (c.shell === 'file') {
      shellExe = join(profile.home, 'gamelib-shell.exe')
      writeFileSync(shellExe, Buffer.alloc(8))
    } else if (c.shell === 'not-exe') {
      shellExe = join(profile.home, 'gamelib-shell')
      writeFileSync(shellExe, Buffer.alloc(8))
    } else if (c.shell === 'missing') {
      shellExe = join(profile.home, 'gamelib-shell-missing.exe')
    }
    const deps = {
      paths: {
        get exe(): string {
          if (shellExe === undefined) {
            throw new Error('GAMELIB_SHELL_EXE is not set')
          }
          return shellExe
        }
      }
    }

    const realReaddir = fsPromises.readdir.bind(fsPromises)
    const readdirSpy =
      c.filler === undefined
        ? null
        : jest.spyOn(fsPromises, 'readdir').mockImplementation(((
            path: string,
            options: unknown
          ) => {
            if (path !== installRoot) {
              return (realReaddir as (...a: unknown[]) => unknown)(
                path,
                options
              )
            }
            return (
              realReaddir(path, { withFileTypes: true }) as Promise<
                Array<{ name: string }>
              >
            ).then((real) => [
              ...Array.from({ length: c.filler ?? 0 }, (_, i) =>
                fillerEntry(`filler-${String(i).padStart(5, '0')}.dat`)
              ),
              ...[...real].sort((a, b) => (a.name < b.name ? -1 : 1))
            ])
          }) as unknown as typeof fsPromises.readdir)

    try {
      const storeExecutable =
        c.storeExecutable === undefined
          ? undefined
          : c.storeExecutable.startsWith('abs:')
            ? join(games, c.storeExecutable.slice('abs:'.length))
            : c.storeExecutable
      if (c.storeExecutable?.startsWith('abs:')) {
        const file = join(games, c.storeExecutable.slice('abs:'.length))
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, Buffer.alloc(10))
      }
      const answer = await resolveWindowsShortcutIcon(deps, {
        title: c.title,
        installPath: c.installPath === 'none' ? undefined : installRoot,
        storeExecutable
      })
      return {
        family: c.family,
        input: {
          title: c.title,
          installDirectory: c.installPath === 'none' ? null : c.dir,
          files: c.files,
          storeExecutable: c.storeExecutable ?? null,
          shell: c.shell,
          injectedEntriesBeforeTheRealOnes: c.filler ?? 0
        },
        answer: answer
          ? {
              ...answer,
              icon: windowsForm(stripPaths(answer.icon, profile))
            }
          : null
      }
    } finally {
      readdirSpy?.mockRestore()
    }
  })
}

// ------------------------------------------------------------------- suite

type AnyCase = LnkCase | EnvCase | RegCase | IconCase

const CASES: AnyCase[] = [
  ...lnkCases(),
  ...envCases(),
  ...regCases(),
  ...iconCases()
]

async function runCase(c: AnyCase): Promise<unknown> {
  switch (c.family) {
    case 'lnk':
      return runLnk(c)
    case 'env':
      return runEnv(c)
    case 'reg':
      return runReg(c)
    case 'icon':
      return runIcon(c)
  }
}

describe('Windows shortcut oracle (94-07)', () => {
  const ids = CASES.map((c) => c.id)

  it('the case list is at or above the floor and agrees with the committed manifest', () => {
    syncManifest(SLICE, ids, FLOOR)
    assertManifest(SLICE, ids, FLOOR)
  })

  it('an empty case list fails the floor', () => {
    expectEmptyCasesToFail(SLICE, FLOOR)
  })

  it('pins the constants the Rust writer reproduces', () => {
    expect(POWERSHELL_ARGS).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      '-'
    ])
    expect(WRITE_SHORTCUT_TIMEOUT_MS).toBe(30_000)
    expect(WRITE_SHORTCUT_SCRIPT).toContain('\r\n')
    expect(buildShortcutEnv('a.lnk', { target: 'x' }, {})).toHaveProperty(
      'GAMELIB_LNK_PATH',
      'a.lnk'
    )
  })

  it.each(CASES.map((c) => [c.id, c] as const))('%s', async (_id, c) => {
    writeOrCompareGolden(SLICE, c.id, await runCase(c))
  })
})
