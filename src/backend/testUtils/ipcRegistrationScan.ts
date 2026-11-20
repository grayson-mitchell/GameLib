/**
 * The one static matcher for IPC channel registrations in non-test `src/backend` (moved out of
 * ipcSchemaCoverage.test.ts in Phase 83 plan 05 so the ownership census reads the same copy).
 *
 * Lives outside `__tests__` so jest's `**\/__tests__/**\/*.test.ts` match never runs it.
 *
 * It sees `ipcMain.handle/on/once`, `ipc.handle/on`, `addHandler` and `addListener` calls whose
 * first argument is a string literal or an upper-case constant (exported from
 * `sidecarTransport.ts`, or a file-local `const NAME = 'channel'`). That catches bootstrap-time
 * registrations -- handleProtocolUrl, the online monitor -- which importing the handlers does not
 * populate. Comments are NOT stripped, as before the move.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { sharedConstants } from './ipcDomainParse'

const REGISTRATION =
  /\b(ipcMain\.handle|ipcMain\.on|ipcMain\.once|ipc\.handle|ipc\.on|addHandler|addListener)\(\s*(?:'([^']+)'|([A-Z][A-Z0-9_]*)\s*,)/g

/** Non-test .ts/.tsx files under `dir`, skipping `__tests__` and `node_modules`. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

export interface ScannedRegistrations {
  /** channels registered by a handle-style call (ipcMain.handle, ipc.handle, addHandler) */
  invoke: Set<string>
  /** channels registered by an on/once/addListener call */
  send: Set<string>
  /** channel -> the (distinct) files that register it, as paths relative to `dir` with `/` */
  byFile: Map<string, string[]>
  /** how many source files the walk read; a gate asserts this against a floor */
  scanned: number
}

/** Scans every non-test source file under `dir`. `dir` is a parameter so an empty tmp dir can drive it. */
export function scanRegistrations(dir: string): ScannedRegistrations {
  const constants = sharedConstants()
  const out: ScannedRegistrations = {
    invoke: new Set(),
    send: new Set(),
    byFile: new Map(),
    scanned: 0
  }
  const files = sourceFiles(dir)
  out.scanned = files.length
  for (const file of files) {
    const src = readFileSync(file, 'utf-8')
    const rel = file.slice(dir.length + 1).replace(/\\/g, '/')
    // A file-local `const NAME = 'channel'` (devEpicCookieSweepRegistration's, not exported).
    const local = new Map<string, string>()
    for (const c of src.matchAll(
      /\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*'([^']+)'/g
    )) {
      if (c[1] && c[2]) local.set(c[1], c[2])
    }
    for (const m of src.matchAll(REGISTRATION)) {
      const channel =
        m[2] ??
        (m[3] === undefined ? undefined : (constants[m[3]] ?? local.get(m[3])))
      if (!channel) continue
      if (
        m[1] === 'ipcMain.handle' ||
        m[1] === 'ipc.handle' ||
        m[1] === 'addHandler'
      )
        out.invoke.add(channel)
      else out.send.add(channel)
      const seen = out.byFile.get(channel) ?? []
      if (!seen.includes(rel)) seen.push(rel)
      out.byFile.set(channel, seen)
    }
  }
  return out
}
