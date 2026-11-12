/**
 * Phase 65 plan 17: loader entitlements and ad hoc re-signing, split out of
 * runnerClone.ts. `resignCounter` lives in the
 * createRunnerEntitlementSigner closure beside `resignLoader`, its only user (D-10, D-05). Imports runnerCrossover only.
 */
import { constants as fsConstants, promises as fsp } from 'fs'
import { basename, join } from 'path'

import type { RunTool } from 'backend/engine/runTool'
import {
  DLL_REL,
  LOADER_REL,
  NTDLL_REL,
  SO_REL,
  WINELOADER_REL,
  errText,
  removeInside
} from './runnerCrossover'

export const DYLD_ENTITLEMENT =
  'com.apple.security.cs.allow-dyld-environment-variables'
export const STOCK_LOADER_ENTITLEMENTS: readonly string[] = [
  'com.apple.security.cs.allow-unsigned-executable-memory',
  'com.apple.security.cs.disable-executable-page-protection',
  'com.apple.security.cs.disable-library-validation',
  'com.apple.security.device.audio-input',
  'com.apple.security.device.camera'
]

export function parseEntitlementKeys(stdout: string): string[] | null {
  const start = stdout.search(/<\?xml|<plist/)
  if (start < 0) return null
  const text = stdout.slice(start)
  const open = text.indexOf('<dict>')
  const close = text.lastIndexOf('</dict>')
  if (open < 0 || close < open) return null
  const inner = text.slice(open + '<dict>'.length, close)
  const keys: string[] = []
  const rest = inner.replace(
    /<key>([^<]{1,200})<\/key>\s*<true\/>/g,
    (_m, k: string) => {
      keys.push(k)
      return ''
    }
  )
  if (rest.trim() !== '') return null
  return keys
}

export async function dumpLoaderEntitlements(
  run: RunTool,
  loader: string,
  timeoutMs: number
): Promise<string[] | null> {
  const r = await run(
    '/usr/bin/codesign',
    ['-d', '--entitlements', '-', '--xml', loader],
    { timeoutMs }
  )
  if (r.code !== 0 || r.timedOut || r.aborted) return null
  return parseEntitlementKeys(r.stdout)
}

function entitlementsPlist(): string {
  return entitlementsPlistFor([...STOCK_LOADER_ENTITLEMENTS, DYLD_ENTITLEMENT])
}

function entitlementsPlistFor(keysIn: string[]): string {
  const keys = [...keysIn].sort()
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    '<plist version="1.0">\n<dict>\n' +
    keys.map((k) => `\t<key>${k}</key>\n\t<true/>\n`).join('') +
    '</dict>\n</plist>\n'
  )
}

/**
 * Re-signs a Mach-O loader ad hoc with hardened runtime plus the dyld
 * environment entitlement. 'strict' accepts only the 5 stock keys (or the 6
 * with dyld) and signs exactly the 6; 'derived' keeps whatever boolean
 * entitlements the loader has and adds the dyld one. The stock binary is kept
 * next to it as <loader>.gamelib-orig.
 */
async function resignLoaderWith(
  nextSeq: () => number,
  run: RunTool,
  loader: string,
  partial: string,
  timeoutMs: number,
  mode: 'strict' | 'derived'
): Promise<{ ok: true; keys: string[] } | { ok: false; cause: string }> {
  try {
    await fsp.copyFile(
      loader,
      loader + '.gamelib-orig',
      fsConstants.COPYFILE_EXCL
    )
    const stock = await dumpLoaderEntitlements(run, loader, timeoutMs)
    if (!stock) return { ok: false, cause: 'loader entitlements unreadable' }
    let keys: string[]
    if (mode === 'strict') {
      const sorted = [...stock].sort().join('\n')
      const stockSet = [...STOCK_LOADER_ENTITLEMENTS].sort()
      const sixSet = [...stockSet, DYLD_ENTITLEMENT].sort()
      if (sorted !== stockSet.join('\n') && sorted !== sixSet.join('\n')) {
        return { ok: false, cause: 'unexpected loader entitlements' }
      }
      keys = sixSet
    } else {
      keys = Array.from(new Set([...stock, DYLD_ENTITLEMENT])).sort()
    }
    const plist = join(
      partial,
      `entitlements-${basename(loader)}-${nextSeq()}.plist`
    )
    await fsp.writeFile(
      plist,
      mode === 'strict' ? entitlementsPlist() : entitlementsPlistFor(keys),
      { flag: 'wx', mode: 0o600 }
    )
    const sign = await run(
      '/usr/bin/codesign',
      [
        '--force',
        '--sign',
        '-',
        '--options',
        'runtime',
        '--entitlements',
        plist,
        loader
      ],
      { timeoutMs }
    )
    if (sign.code !== 0) {
      await removeInside(partial, plist)
      return {
        ok: false,
        cause: `loader re-sign failed (${sign.code}): ${sign.stderr.slice(0, 80)}`
      }
    }
    const after = await dumpLoaderEntitlements(run, loader, timeoutMs)
    await removeInside(partial, plist)
    if (!after || !keys.every((k) => after.includes(k))) {
      return {
        ok: false,
        cause: 'loader lacks the dyld entitlement after re-sign'
      }
    }
    return { ok: true, keys }
  } catch (e) {
    return { ok: false, cause: errText(e) }
  }
}

export type ResignLoader = (
  run: RunTool,
  loader: string,
  partial: string,
  timeoutMs: number,
  mode: 'strict' | 'derived'
) => Promise<{ ok: true; keys: string[] } | { ok: false; cause: string }>

export interface RunnerEntitlementSigner {
  resignLoader: ResignLoader
}

/**
 * One signer per boot (D-05, 66.4-08): the entitlement plist sequence number is a closure counter, so
 * plist names stay unique within a boot and a fresh instance starts over. Construction allocates a
 * counter and nothing else.
 */
export function createRunnerEntitlementSigner(): RunnerEntitlementSigner {
  let resignCounter = 0
  return {
    resignLoader: (run, loader, partial, timeoutMs, mode) =>
      resignLoaderWith(
        () => ++resignCounter,
        run,
        loader,
        partial,
        timeoutMs,
        mode
      )
  }
}

/**
 * Targeted xattr scrub of a clone. Never `xattr -c`: it would strip the
 * com.apple.cs.* signature xattrs from stock-signed files.
 */
export async function scrubCloneXattrs(
  run: RunTool,
  dest: string,
  timeoutMs: number
): Promise<
  { ok: true; provenanceRemaining: boolean } | { ok: false; cause: string }
> {
  for (const attr of ['com.apple.quarantine', 'com.apple.provenance']) {
    const r = await run('/usr/bin/xattr', ['-r', '-d', attr, dest], {
      timeoutMs
    })
    if (r.timedOut || r.aborted) {
      return { ok: false, cause: `xattr ${attr} scrub timed out` }
    }
  }
  let provenanceRemaining = false
  for (const rel of [LOADER_REL, NTDLL_REL, SO_REL, DLL_REL, WINELOADER_REL]) {
    const r = await run('/usr/bin/xattr', [join(dest, rel)], { timeoutMs })
    const lines = r.stdout.split('\n').map((l) => l.trim())
    if (lines.includes('com.apple.quarantine')) {
      return { ok: false, cause: `quarantine xattr remains on ${rel}` }
    }
    if (lines.includes('com.apple.provenance')) provenanceRemaining = true
  }
  return { ok: true, provenanceRemaining }
}
