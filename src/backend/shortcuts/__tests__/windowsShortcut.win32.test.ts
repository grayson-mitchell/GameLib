/**
 * The real Windows `.lnk` writer, checked against real Windows (G-66.4-W2).
 *
 * Windows only: every describe is skipped elsewhere, so the ubuntu CI never runs this file.
 * The unit suite (windowsShortcut.test.ts) scripts the runner and cannot see explorer.exe's
 * argument parsing; that blind spot is how an unquoted `gamelib://launch?...` argument shipped
 * and opened Documents instead of the game.
 *
 *  - describe A runs on every Windows jest run. It writes one `.lnk` with the real writer and
 *    reads it back; it touches no registry and opens nothing.
 *  - describe B is an opt-in live probe (GAMELIB_LNK_DISPATCH_PROBE=1). It registers ONE
 *    throwaway `HKCU\Software\Classes\gamelibprobe<hex>` protocol (a random scheme that can never
 *    shadow `gamelib://`), opens `.lnk` files through ShellExecute as a double-click does, and
 *    opens Explorer windows in the operator's session. The key is always removed afterwards.
 *
 * Every value reaches PowerShell only through environment variables, never interpolated into
 * script text, as in windowsShortcut.ts. Every spawn goes through `createRealRunner()`, which is
 * isolated by default (a fresh fake-HOME profile); this file builds no `env` of its own for the
 * home/config variables and imports no child_process.
 */
import { randomBytes } from 'crypto'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { createRealRunner } from '../../testUtils/realRunner'
import { windowsSystem32Path } from '../../storeManagers/steam/runningFromFolder'
import {
  POWERSHELL_ARGS,
  WRITE_SHORTCUT_SCRIPT,
  WRITE_SHORTCUT_TIMEOUT_MS,
  buildShortcutEnv,
  writeWindowsShortcut
} from '../shortcuts/windowsShortcut'

const isWindows = process.platform === 'win32'
const winDescribe = isWindows ? describe : describe.skip
const probeDescribe =
  isWindows && process.env.GAMELIB_LNK_DISPATCH_PROBE === '1'
    ? describe
    : describe.skip

const POWERSHELL_EXE = windowsSystem32Path(
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe'
)
const ICON = windowsSystem32Path('notepad.exe')

/**
 * One PowerShell script for `-Command -` (stdin). That mode parses stdin line by line and
 * carries on after an error, so the statements share ONE `try` on ONE line and the catch exits 1.
 */
function psScript(statements: string[]): string {
  return (
    [
      "$ErrorActionPreference = 'Stop'",
      `try { ${statements.join('; ')} } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`,
      'exit 0'
    ].join('\r\n') + '\r\n'
  )
}

type Real = ReturnType<typeof createRealRunner>

async function runPs(
  real: Real,
  statements: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  const result = await real.runner.run(POWERSHELL_EXE, POWERSHELL_ARGS, {
    env,
    stdin: psScript(statements),
    timeoutMs,
    windowsHide: true
  })
  if (result.timedOut || result.code !== 0) {
    throw new Error(
      `powershell exited ${result.code}${result.timedOut ? ' (timed out)' : ''}: ${result.stderr.trim()}`
    )
  }
  return { stdout: result.stdout, stderr: result.stderr }
}

function lastJsonLine(stdout: string): unknown {
  const line = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{'))
    .pop()
  if (!line) throw new Error(`no JSON line in PowerShell output: ${stdout}`)
  return JSON.parse(line)
}

function rmDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

winDescribe("the real writer's .lnk on disk", () => {
  let dir: string
  let real: Real

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-lnk-readback-'))
    real = createRealRunner()
  })
  afterAll(() => {
    real.dispose()
    rmDir(dir)
  })

  it('persists explorer.exe, the quoted gamelib:// URL and the icon', async () => {
    const lnk = join(dir, 'readback.lnk')
    const url = 'gamelib://launch?appName=2951630&runner=steam'

    await expect(
      writeWindowsShortcut({ runner: real.runner }, lnk, {
        target: url,
        icon: ICON
      })
    ).resolves.toEqual({ ok: true })

    const { stdout } = await runPs(
      real,
      [
        '$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:GAMELIB_PROBE_LNK)',
        'ConvertTo-Json -InputObject @{ target = [string]$s.TargetPath; args = [string]$s.Arguments; icon = [string]$s.IconLocation } -Compress'
      ],
      { GAMELIB_PROBE_LNK: lnk },
      30_000
    )
    const back = lastJsonLine(stdout) as {
      target: string
      args: string
      icon: string
    }

    expect(back.target.toLowerCase().endsWith('\\explorer.exe')).toBe(true)
    expect(back.args).toBe(`"${url}"`)
    // Windows paths compare case-insensitively; the shell may normalise the case on read-back.
    expect(back.icon.toLowerCase()).toBe(`${ICON},0`.toLowerCase())
  }, 60_000)
})

probeDescribe('opening the .lnk dispatches to the protocol handler', () => {
  const scheme = `gamelibprobe${randomBytes(4).toString('hex')}`
  const regKey = `HKCU:\\Software\\Classes\\${scheme}`
  let dir: string
  let real: Real
  const openedHwnds = new Set<string>()

  /** Points the throwaway protocol at handler.ps1 with this test's own hit file. */
  async function registerProtocol(hitFile: string): Promise<void> {
    const command = `"${POWERSHELL_EXE}" -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${join(dir, 'handler.ps1')}" "${hitFile}" "%1"`
    await runPs(
      real,
      [
        '$k = "HKCU:\\Software\\Classes\\$env:GAMELIB_PROBE_SCHEME"',
        'New-Item -Path $k -Force | Out-Null',
        "Set-ItemProperty -Path $k -Name '(default)' -Value 'URL:GameLib lnk dispatch probe'",
        "New-ItemProperty -Path $k -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null",
        'New-Item -Path "$k\\shell\\open\\command" -Force | Out-Null',
        'Set-ItemProperty -Path "$k\\shell\\open\\command" -Name \'(default)\' -Value $env:GAMELIB_PROBE_COMMAND'
      ],
      { GAMELIB_PROBE_SCHEME: scheme, GAMELIB_PROBE_COMMAND: command },
      30_000
    )
  }

  /**
   * Opens one .lnk the way a double-click does (ShellExecute) and reports what happened: the
   * lines the handler received, and the LocationURL of every Explorer window that was not open
   * before (each is closed again).
   */
  async function openLnk(
    lnk: string,
    hitFile: string,
    deadlineMs: number
  ): Promise<{ hits: string[]; closed: { hwnd: string; url: string }[] }> {
    const { stdout } = await runPs(
      real,
      [
        '$sh = New-Object -ComObject Shell.Application',
        '$before = @($sh.Windows() | ForEach-Object { [string]$_.HWND })',
        'Start-Process -FilePath $env:GAMELIB_PROBE_LNK',
        '$deadline = (Get-Date).AddMilliseconds([int]$env:GAMELIB_PROBE_DEADLINE_MS)',
        'while ((Get-Date) -lt $deadline) { if (Test-Path -LiteralPath $env:GAMELIB_PROBE_HIT) { break }; Start-Sleep -Milliseconds 250 }',
        'Start-Sleep -Milliseconds 2000',
        '$hits = @(); if (Test-Path -LiteralPath $env:GAMELIB_PROBE_HIT) { $hits = @(Get-Content -LiteralPath $env:GAMELIB_PROBE_HIT | ForEach-Object { [string]$_ }) }',
        '$closed = @()',
        'foreach ($w in @($sh.Windows())) { if ($before -notcontains [string]$w.HWND) { $closed += [pscustomobject]@{ hwnd = [string]$w.HWND; url = [string]$w.LocationURL }; try { $w.Quit() } catch {} } }',
        'ConvertTo-Json -InputObject @{ hits = @($hits); closed = @($closed) } -Depth 4 -Compress'
      ],
      {
        GAMELIB_PROBE_LNK: lnk,
        GAMELIB_PROBE_HIT: hitFile,
        GAMELIB_PROBE_DEADLINE_MS: String(deadlineMs)
      },
      deadlineMs + 30_000
    )
    const out = lastJsonLine(stdout) as {
      hits: string[]
      closed: { hwnd: string; url: string }[]
    }
    for (const w of out.closed) openedHwnds.add(w.hwnd)
    return out
  }

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-lnk-probe-'))
    real = createRealRunner()
    writeFileSync(
      join(dir, 'handler.ps1'),
      'param([string]$HitFile, [string]$Url)\r\nAdd-Content -LiteralPath $HitFile -Value $Url\r\n'
    )
    await registerProtocol(join(dir, 'hits-setup.txt'))
    console.info(`[lnk probe] throwaway scheme: ${scheme}`)
  }, 60_000)

  afterAll(async () => {
    try {
      const { stdout } = await runPs(
        real,
        [
          '$k = "HKCU:\\Software\\Classes\\$env:GAMELIB_PROBE_SCHEME"',
          'if (Test-Path -LiteralPath $k) { Remove-Item -LiteralPath $k -Recurse -Force }',
          '$sh = New-Object -ComObject Shell.Application',
          '$mine = @($env:GAMELIB_PROBE_HWNDS -split ",")',
          'foreach ($w in @($sh.Windows())) { if ($mine -contains [string]$w.HWND) { try { $w.Quit() } catch {} } }',
          'ConvertTo-Json -InputObject @{ keyPresent = [bool](Test-Path -LiteralPath $k) } -Compress'
        ],
        {
          GAMELIB_PROBE_SCHEME: scheme,
          GAMELIB_PROBE_HWNDS: [...openedHwnds].join(',')
        },
        30_000
      )
      const state = lastJsonLine(stdout) as { keyPresent: boolean }
      console.info(
        `[lnk probe] registry key ${regKey} present after cleanup: ${state.keyPresent}`
      )
      expect(state.keyPresent).toBe(false)
    } finally {
      real.dispose()
      rmDir(dir)
    }
  }, 60_000)

  it('the quoted (fixed) .lnk reaches the handler', async () => {
    const lnk = join(dir, 'quoted.lnk')
    const hitFile = join(dir, 'hits-quoted.txt')
    await registerProtocol(hitFile)
    await expect(
      writeWindowsShortcut({ runner: real.runner }, lnk, {
        target: `${scheme}://launch?appName=2951630&runner=steam`,
        icon: ICON
      })
    ).resolves.toEqual({ ok: true })

    const out = await openLnk(lnk, hitFile, 15_000)
    console.info(
      `[lnk probe] quoted .lnk: hits=${JSON.stringify(out.hits)} closedWindows=${JSON.stringify(out.closed.map((w) => w.url))}`
    )

    expect(out.hits).toHaveLength(1)
    const hit = out.hits[0] ?? ''
    expect(hit.startsWith(`${scheme}://launch`)).toBe(true)
    expect(hit).toContain('appName=2951630&runner=steam')
    expect(out.closed.filter((w) => w.url.startsWith('file:'))).toEqual([])
  }, 60_000)

  it('the unquoted (pre-fix) .lnk does not, so the probe can see the defect', async () => {
    const lnk = join(dir, 'unquoted.lnk')
    const hitFile = join(dir, 'hits-unquoted.txt')
    const url = `${scheme}://launch?appName=2951630&runner=steam`
    await registerProtocol(hitFile)

    const env = buildShortcutEnv(lnk, { target: url, icon: ICON })
    env.GAMELIB_LNK_ARGS = url
    const written = await real.runner.run('powershell.exe', POWERSHELL_ARGS, {
      env,
      replaceEnv: true,
      stdin: WRITE_SHORTCUT_SCRIPT,
      timeoutMs: WRITE_SHORTCUT_TIMEOUT_MS,
      windowsHide: true
    })
    expect(written.code).toBe(0)
    expect(existsSync(lnk)).toBe(true)

    const out = await openLnk(lnk, hitFile, 8_000)
    console.info(
      `[lnk probe] unquoted control: hits=${JSON.stringify(out.hits)} openedAndClosedWindows=${JSON.stringify(out.closed.map((w) => w.url))}`
    )

    if (out.hits.length > 0) {
      throw new Error(
        'the unquoted control reached the handler: the probe can no longer tell a quoted .lnk from an unquoted one on this Windows build, so the quoted test passing proves nothing'
      )
    }
    expect(out.hits).toEqual([])
  }, 60_000)
})
