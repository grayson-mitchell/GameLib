/**
 * Writes a Windows `.lnk` through an `IShellLinkW` + `IPersistFile` helper that PowerShell
 * compiles at run time with `Add-Type`. This replaces Electron's `shell.writeShortcutLink`,
 * which the sidecar stubs to `false` (it has no Win32 shell-link API of its own).
 *
 * No shell string is ever built. `powershell.exe` is spawned with a fixed argv
 * (`-Command -` = read the script from stdin), the script itself is a CONSTANT, and every
 * caller-supplied value (the `.lnk` path, target, arguments, icon) reaches it only as an
 * environment variable it reads with `$env:`. A game title with quotes, `$(...)`, backticks or
 * non-ASCII characters is therefore data, never code, and needs no escaping at all. The
 * environment is UTF-16 from Node up to the COM boundary.
 *
 * `WScript.Shell` was the ANSI bottleneck: its `CreateShortcut`, `TargetPath`, `Arguments` and
 * `IconLocation` go through the ANSI code page, which rejected or `??`-mangled `幻想` on a
 * code-page-1252 box (measured in quick 261012-9aa). The `LPWStr` marshalling of the
 * `IShellLinkW` helper keeps the whole path UTF-16 end to end.
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

const SHELL_LINK_CSHARP_SOURCE = `
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
namespace GameLibLnk {
  [ComImport, Guid("00021401-0000-0000-C000-000000000046")] public class ShellLink {}
  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")]
  public interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile, int cch, IntPtr pfd, int fFlags);
    void GetIDList(out IntPtr ppidl);
    void SetIDList(IntPtr pidl);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cch);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cch);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cch);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
    void GetHotkey(out short pwHotkey);
    void SetHotkey(short wHotkey);
    void GetShowCmd(out int piShowCmd);
    void SetShowCmd(int iShowCmd);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cch, out int piIcon);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, int dwReserved);
    void Resolve(IntPtr hwnd, int fFlags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
  }
  public static class Writer {
    public static void Write(string lnk, string target, string args, string icon, int iconIndex) {
      IShellLinkW link = (IShellLinkW)new ShellLink();
      link.SetPath(target);
      if (!string.IsNullOrEmpty(args)) link.SetArguments(args);
      if (!string.IsNullOrEmpty(icon)) link.SetIconLocation(icon, iconIndex);
      ((IPersistFile)link).Save(lnk, true);
    }
  }
}
`

/**
 * The C# helper, collapsed to ONE line. `powershell.exe -Command -` parses stdin line by line
 * and silently stops (exit 0, nothing on stderr) at a here-string opener, so a multi-line
 * here-string cannot carry it; it travels as a single-line, single-quoted PowerShell string.
 *
 * It must therefore never contain a single quote (it would end that string) nor a `//` line
 * comment (once collapsed it would swallow the rest of the source). The `IShellLinkW` member
 * order is the COM vtable order: do not "tidy" or sort it.
 */
export const SHELL_LINK_CSHARP = SHELL_LINK_CSHARP_SOURCE.split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .join(' ')

/**
 * Fed to `powershell.exe -Command -` on stdin. One statement per line: that mode parses stdin
 * line by line and silently stops at a here-string, so the C# is a single-quoted one-line string
 * and the whole try/catch stays on a single line. `-EncodedCommand` was rejected because it puts
 * CLIXML progress noise (`Preparing modules for first use`) on stderr, which would pollute the
 * error reported. Every value still arrives only through `$env:`. `exit 1` from the catch is what
 * reports failure; the caller also checks that the `.lnk` exists afterwards.
 */
export const WRITE_SHORTCUT_SCRIPT =
  [
    "$ErrorActionPreference = 'Stop'",
    `$src = '${SHELL_LINK_CSHARP}'`,
    'try { Add-Type -TypeDefinition $src; [GameLibLnk.Writer]::Write($env:GAMELIB_LNK_PATH, $env:GAMELIB_LNK_TARGET, $env:GAMELIB_LNK_ARGS, $env:GAMELIB_LNK_ICON, [int]$env:GAMELIB_LNK_ICON_INDEX) } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }',
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
