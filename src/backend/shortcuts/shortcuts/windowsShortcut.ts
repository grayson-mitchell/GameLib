/**
 * Writes a Windows `.lnk` through PowerShell's `WScript.Shell` COM object. This replaces
 * Electron's `shell.writeShortcutLink`, which the sidecar stubs to `false` (it has no Win32
 * shell-link API of its own).
 *
 * No shell string is ever built. `powershell.exe` is spawned with a fixed argv
 * (`-Command -` = read the script from stdin), the script itself is a CONSTANT, and every
 * caller-supplied value (the `.lnk` path, target, arguments, icon) reaches it only as an
 * environment variable it reads with `$env:`. A game title with quotes, `$(...)`, backticks or
 * non-ASCII characters is therefore data, never code, and needs no escaping at all. Windows
 * hands the environment to the child as UTF-16, so Unicode paths survive intact.
 */
import { spawn } from 'child_process'
import { existsSync } from 'graceful-fs'
import { win32 } from 'path'
import type { ShortcutDetails } from 'backend/platform'

export const POWERSHELL_ARGS = [
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy',
  'Bypass',
  '-Command',
  '-'
]

/**
 * Fed to `powershell.exe -Command -` on stdin. One statement per line: that mode parses stdin
 * line by line, so the whole try/catch stays on a single line. `exit 1` from the catch is what
 * reports failure; the caller also checks that the `.lnk` exists afterwards.
 */
export const WRITE_SHORTCUT_SCRIPT =
  [
    "$ErrorActionPreference = 'Stop'",
    "try { $lnk = (New-Object -ComObject WScript.Shell).CreateShortcut($env:GAMELIB_LNK_PATH); $lnk.TargetPath = $env:GAMELIB_LNK_TARGET; if ($env:GAMELIB_LNK_ARGS) { $lnk.Arguments = $env:GAMELIB_LNK_ARGS }; if ($env:GAMELIB_LNK_ICON) { $lnk.IconLocation = $env:GAMELIB_LNK_ICON + ',' + $env:GAMELIB_LNK_ICON_INDEX }; $lnk.Save() } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }",
    'exit 0'
  ].join('\r\n') + '\r\n'

const URL_SCHEME = /^[a-z][a-z0-9+.-]+:/i

/**
 * The environment the script reads. A URL target (`gamelib://launch?...`) is not a file a
 * `.lnk` can point at, so it becomes an argument to `explorer.exe`, which opens it through the
 * registered protocol handler -- the Windows counterpart of the Linux entry's `xdg-open`.
 * `URL_SCHEME` needs two scheme characters so a drive letter (`C:`) is never mistaken for one.
 */
export function buildShortcutEnv(
  lnkPath: string,
  details: ShortcutDetails,
  baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const isUrl = URL_SCHEME.test(details.target)
  const systemRoot = baseEnv.SystemRoot || baseEnv.SYSTEMROOT || 'C:\\Windows'
  return {
    ...baseEnv,
    GAMELIB_LNK_PATH: lnkPath,
    GAMELIB_LNK_TARGET: isUrl
      ? win32.join(systemRoot, 'explorer.exe')
      : details.target,
    GAMELIB_LNK_ARGS: isUrl
      ? [details.target, details.args].filter(Boolean).join(' ')
      : (details.args ?? ''),
    GAMELIB_LNK_ICON: details.icon ?? '',
    GAMELIB_LNK_ICON_INDEX: String(details.iconIndex ?? 0)
  }
}

/** Bounds the child: a PowerShell that never exits must not keep the sidecar alive. */
export const WRITE_SHORTCUT_TIMEOUT_MS = 30_000

/**
 * Writes `lnkPath`. Resolves `{ ok: true }` only when PowerShell exited 0 AND the file exists;
 * otherwise `{ ok: false, error }`. Never rejects.
 */
export function writeWindowsShortcut(
  lnkPath: string,
  details: ShortcutDetails
): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    let settled = false
    let stderr = ''
    const finish = (result: { ok: true } | { ok: false; error: string }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    let child: ReturnType<typeof spawn>
    try {
      child = spawn('powershell.exe', POWERSHELL_ARGS, {
        env: buildShortcutEnv(lnkPath, details),
        stdio: ['pipe', 'ignore', 'pipe'],
        windowsHide: true
      })
    } catch (error) {
      resolve({ ok: false, error: String(error) })
      return
    }

    const timer = setTimeout(() => {
      child.kill()
      finish({
        ok: false,
        error: `powershell did not exit within ${WRITE_SHORTCUT_TIMEOUT_MS}ms`
      })
    }, WRITE_SHORTCUT_TIMEOUT_MS)
    timer.unref?.()

    child.stderr?.on('data', (chunk: Buffer | string) => {
      if (stderr.length < 4096) stderr += chunk.toString()
    })
    child.on('error', (error) => finish({ ok: false, error: String(error) }))
    child.on('close', (code) => {
      if (code === 0 && existsSync(lnkPath)) {
        finish({ ok: true })
      } else {
        finish({
          ok: false,
          error: `powershell exited ${code}${stderr ? `: ${stderr.trim()}` : ''}`
        })
      }
    })

    child.stdin?.on('error', () => {
      // A child that died before reading stdin surfaces through 'close'/'error' above.
    })
    child.stdin?.write(WRITE_SHORTCUT_SCRIPT)
    child.stdin?.end()
  })
}
