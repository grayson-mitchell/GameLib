/**
 * Quick 261120-uzn: literal-safe elevated launches for GOG on Windows.
 *
 * The pure tests run on every OS (ubuntu CI included). The round trips run real Windows
 * PowerShell 5.1, WITHOUT elevation, and are skipped elsewhere. Every spawn goes through
 * createRealRunner() (a fresh fake-HOME profile); no module is mocked.
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { initHeadless } from 'backend/logger'
import { createSpawnAsync, type SpawnAsync } from 'backend/spawnAsync'
import { createRealRunner } from 'backend/testUtils/realRunner'
import {
  MAX_BATCH_STATEMENT_CHARS,
  batchStatement,
  elevatedStartProcessArgs,
  gogUninstallerSwitches,
  gogUninstallStep,
  powershellCommandArgs,
  runElevatedSteps,
  startProcessStatement,
  toPowerShellLiteral,
  toPowerShellPathLiteral,
  toWindowsArgument,
  type ElevatedStep
} from '../windowsElevation'

const winDescribe = process.platform === 'win32' ? describe : describe.skip

beforeAll(() => initHeadless())

interface SpawnCall {
  command: string
  args: string[]
  options: unknown
}

function recordingSpawn(result: {
  code: number | null
  stderr?: string
  reject?: boolean
}): { spawnAsync: SpawnAsync; calls: SpawnCall[] } {
  const calls: SpawnCall[] = []
  const spawnAsync: SpawnAsync = (command, args, options) => {
    calls.push({ command, args, options })
    if (result.reject) return Promise.reject(new Error('spawn failed'))
    return Promise.resolve({
      code: result.code,
      stdout: '',
      stderr: result.stderr ?? ''
    })
  }
  return { spawnAsync, calls }
}

describe('261120-uzn PowerShell quoting', () => {
  it('toPowerShellLiteral doubles apostrophes and leaves $ and backticks alone', () => {
    expect(toPowerShellLiteral("Baldur's Gate")).toBe("'Baldur''s Gate'")
    expect(toPowerShellLiteral('a $x `b $(calc)')).toBe("'a $x `b $(calc)'")
  })

  it('toPowerShellPathLiteral escapes backtick, [ and ] and otherwise equals the plain literal', () => {
    expect(toPowerShellPathLiteral('C:\\a[1]`b')).toBe("'C:\\a`[1`]``b'")
    expect(toPowerShellPathLiteral("C:\\Some Game\\it's")).toBe(
      toPowerShellLiteral("C:\\Some Game\\it's")
    )
  })

  it('toWindowsArgument follows the CommandLineToArgvW rules', () => {
    expect(toWindowsArgument('/KEEPSAVES')).toBe('/KEEPSAVES')
    expect(toWindowsArgument('/dir=C:\\a b')).toBe('"/dir=C:\\a b"')
    expect(toWindowsArgument('say "hi"')).toBe('"say \\"hi\\""')
    expect(toWindowsArgument('a\\"b')).toBe('"a\\\\\\"b"')
    expect(toWindowsArgument('C:\\a b\\')).toBe('"C:\\a b\\\\"')
    expect(toWindowsArgument('')).toBe('""')
  })
})

describe('261120-uzn GOG uninstall step', () => {
  it('gogUninstallerSwitches is the Galaxy silent switch set', () => {
    expect(gogUninstallerSwitches('1207658930')).toEqual([
      '/VERYSILENT',
      '/ProductId=1207658930',
      '/galaxyclient',
      '/KEEPSAVES'
    ])
  })

  it('gogUninstallStep adds /dir= and no working directory', () => {
    const step = gogUninstallStep('C:\\g\\unins000.exe', '12', 'C:\\g')
    expect(step.filePath).toBe('C:\\g\\unins000.exe')
    expect(step.args).toEqual([...gogUninstallerSwitches('12'), '/dir=C:\\g'])
    expect(step.workingDirectory).toBeUndefined()
  })

  it('elevatedStartProcessArgs builds one Start-Process statement with single-quoted items', () => {
    const step = gogUninstallStep(
      'C:\\Some Game\\unins000.exe',
      '12',
      'C:\\Some Game'
    )
    const args = elevatedStartProcessArgs(step)
    expect(args.slice(0, 3)).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-Command'
    ])
    expect(args).toEqual(powershellCommandArgs(args[3] as string))
    const statement = args[3] as string
    expect(statement.startsWith('Start-Process -FilePath ')).toBe(true)
    expect(statement).toContain('-Verb RunAs')
    expect(statement).toContain('-Wait')
    for (const item of [
      "'/VERYSILENT'",
      "'/ProductId=12'",
      "'/galaxyclient'",
      "'/KEEPSAVES'",
      `'"/dir=C:\\Some Game"'`
    ]) {
      expect(statement).toContain(item)
    }
  })

  it('omits -ArgumentList when there are no arguments', () => {
    const statement = startProcessStatement(
      { filePath: 'C:\\x.exe', args: [] },
      { elevate: true }
    )
    expect(statement).not.toContain('-ArgumentList')
  })
})

describe('261120-uzn runElevatedSteps', () => {
  it('makes no spawn for no steps', async () => {
    const { spawnAsync, calls } = recordingSpawn({ code: 0 })
    expect(await runElevatedSteps({ spawnAsync }, [])).toEqual({
      spawns: 0,
      failed: 0
    })
    expect(calls).toEqual([])
  })

  it('spawns one step directly, with cwd only when a working directory is set', async () => {
    const plain: ElevatedStep = { filePath: 'C:\\a.exe', args: ['/x'] }
    const withCwd: ElevatedStep = { ...plain, workingDirectory: 'C:\\w' }
    const one = recordingSpawn({ code: 0 })
    expect(await runElevatedSteps(one, [plain])).toEqual({
      spawns: 1,
      failed: 0
    })
    expect(one.calls).toEqual([
      {
        command: 'powershell',
        args: elevatedStartProcessArgs(plain),
        options: { windowsHide: true }
      }
    ])
    const two = recordingSpawn({ code: 0 })
    await runElevatedSteps(two, [withCwd])
    expect(two.calls[0]?.options).toEqual({
      windowsHide: true,
      cwd: 'C:\\w'
    })
  })

  it('counts a non-zero exit as failed without throwing', async () => {
    const { spawnAsync } = recordingSpawn({ code: 1, stderr: ' declined ' })
    expect(
      await runElevatedSteps({ spawnAsync }, [
        { filePath: 'C:\\a.exe', args: [] }
      ])
    ).toEqual({ spawns: 1, failed: 1 })
  })

  it('does not swallow a spawn rejection', async () => {
    const { spawnAsync } = recordingSpawn({ code: 0, reject: true })
    await expect(
      runElevatedSteps({ spawnAsync }, [{ filePath: 'C:\\a.exe', args: [] }])
    ).rejects.toThrow('spawn failed')
  })
})

describe('261120-uzn batched elevation', () => {
  const steps: ElevatedStep[] = [
    { filePath: 'C:\\a b\\one.exe', args: ['/x', 'y z'] },
    { filePath: 'C:\\two.exe', args: [], workingDirectory: 'C:\\w' },
    { filePath: 'C:\\three.exe', args: ["it's"] }
  ]

  function decodeBatch(statement: string): string[] {
    const encoded = /'(-EncodedCommand)','([A-Za-z0-9+/=]+)'/.exec(
      statement
    )?.[2]
    return Buffer.from(encoded as string, 'base64')
      .toString('utf16le')
      .split('\n')
  }

  it('batchStatement is one hidden elevated Start-Process of an encoded script, one line per step', () => {
    const statement = batchStatement(steps, { elevate: true })
    expect(
      statement.startsWith("Start-Process -FilePath 'powershell.exe'")
    ).toBe(true)
    expect(statement).toContain('-WindowStyle Hidden')
    expect(statement).toContain('-Verb RunAs')
    expect(statement).toContain('-Wait')
    expect(statement).toContain(
      "'-NoProfile','-NonInteractive','-EncodedCommand','"
    )
    const lines = decodeBatch(statement)
    expect(lines).toEqual(
      steps.map((step) => startProcessStatement(step, { elevate: false }))
    )
    for (const line of lines) expect(line).not.toContain('RunAs')
  })

  it('runElevatedSteps puts several steps under ONE spawn', async () => {
    const { spawnAsync, calls } = recordingSpawn({ code: 0 })
    expect(await runElevatedSteps({ spawnAsync }, steps)).toEqual({
      spawns: 1,
      failed: 0
    })
    expect(calls).toEqual([
      {
        command: 'powershell',
        args: powershellCommandArgs(batchStatement(steps, { elevate: true })),
        options: { windowsHide: true }
      }
    ])
  })

  it('falls back to one elevated spawn per step when the batch is too long', async () => {
    const big: ElevatedStep[] = [
      { filePath: 'C:\\a.exe', args: ['a'.repeat(20_000)] },
      { filePath: 'C:\\b.exe', args: ['b'.repeat(20_000)] }
    ]
    expect(batchStatement(big, { elevate: true }).length).toBeGreaterThan(
      MAX_BATCH_STATEMENT_CHARS
    )
    const { spawnAsync, calls } = recordingSpawn({ code: 0 })
    expect(await runElevatedSteps({ spawnAsync }, big)).toEqual({
      spawns: 2,
      failed: 0
    })
    expect(calls.map((call) => call.args)).toEqual(
      big.map((step) => elevatedStartProcessArgs(step))
    )
  })
})

/** Writes argv (after the output path) and the cwd to argv[2] as JSON. */
const PROBE = `
const fs = require('fs')
fs.writeFileSync(process.argv[2], JSON.stringify({ args: process.argv.slice(3), cwd: process.cwd() }))
`

winDescribe('261120-uzn real PowerShell round trip (not elevated)', () => {
  jest.setTimeout(60_000)
  const harness = createRealRunner()
  const spawnAsync = createSpawnAsync({ runner: harness.runner })
  // A name with a space, an apostrophe and a wildcard-looking [x].
  const folder = mkdtempSync(join(tmpdir(), "gl o'brien [x] "))

  afterAll(() => {
    harness.dispose()
    rmSync(folder, { recursive: true, force: true })
  })

  it('delivers every argument verbatim, resolves a bracketed working directory and runs no injected code', async () => {
    const probe = join(folder, 'probe.js')
    const out = join(folder, 'out.json')
    const marker = join(folder, 'marker.txt')
    writeFileSync(probe, PROBE)
    const probeArgs = [
      ...gogUninstallerSwitches('1207658930'),
      "/dir=C:\\Games\\Bal's Gate [GOG] $env:USERNAME `tick",
      'say "hi" there',
      'C:\\trailing dir\\',
      `'; New-Item -ItemType File -Path '${marker}'; '`
    ]
    const step: ElevatedStep = {
      filePath: process.execPath,
      args: [probe, out, ...probeArgs],
      workingDirectory: folder
    }

    const res = await spawnAsync(
      'powershell',
      powershellCommandArgs(startProcessStatement(step, { elevate: false })),
      { windowsHide: true }
    )

    expect(res.code).toBe(0)
    const recorded = JSON.parse(readFileSync(out, 'utf8')) as {
      args: string[]
      cwd: string
    }
    expect(recorded.args).toEqual(probeArgs)
    expect(recorded.cwd).toBe(folder)
    expect(existsSync(marker)).toBe(false)
  })
})

/** Records whether argv[3] existed on entry, then writes argv (after the output path) there. */
const ORDER_PROBE = `
const fs = require('fs')
fs.writeFileSync(process.argv[2], JSON.stringify({ args: process.argv.slice(4), sawBefore: fs.existsSync(process.argv[3]) }))
`

winDescribe('261120-uzn batch round trip (not elevated)', () => {
  jest.setTimeout(60_000)
  const harness = createRealRunner()
  const spawnAsync = createSpawnAsync({ runner: harness.runner })
  const folder = mkdtempSync(join(tmpdir(), "gl o'brien [b] "))

  afterAll(() => {
    harness.dispose()
    rmSync(folder, { recursive: true, force: true })
  })

  it('runs the steps in order, waits for each, and a missing executable does not stop the next', async () => {
    const probe = join(folder, 'probe.js')
    writeFileSync(probe, ORDER_PROBE)
    const out1 = join(folder, 'out1.json')
    const out2 = join(folder, 'out2.json')
    const step1: ElevatedStep = {
      filePath: process.execPath,
      args: [probe, out1, join(folder, 'does-not-exist'), 'one $env:USERNAME'],
      workingDirectory: folder
    }
    const missing: ElevatedStep = {
      filePath: join(folder, 'missing.exe'),
      args: ['/x']
    }
    const step2: ElevatedStep = {
      filePath: process.execPath,
      args: [probe, out2, out1, "two it's"],
      workingDirectory: folder
    }

    await spawnAsync(
      'powershell',
      powershellCommandArgs(
        batchStatement([step1, missing, step2], { elevate: false })
      ),
      { windowsHide: true }
    )

    const first = JSON.parse(readFileSync(out1, 'utf8')) as {
      args: string[]
      sawBefore: boolean
    }
    const second = JSON.parse(readFileSync(out2, 'utf8')) as {
      args: string[]
      sawBefore: boolean
    }
    expect(first).toEqual({ args: ['one $env:USERNAME'], sawBefore: false })
    expect(second).toEqual({ args: ["two it's"], sawBefore: true })
  })
})
