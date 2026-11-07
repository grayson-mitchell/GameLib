import { defined } from '../../../__tests__/fixtures/indexed'
import { readFile, realpath } from 'fs/promises'
import { isContainedWithin } from '../../bridgeScan'

import type { ScanOp } from 'backend/scanners/scanTypes'

const CEG_MARKERS = ['STEAM_SPLIT_GUID', 'STEAM_GUIDD']

type Read = { text: string } | { error: string }

async function readText(path: string): Promise<Read> {
  try {
    return { text: (await readFile(path)).toString('latin1') }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ASCII or UTF-16LE substring: enough to tell the small fixture PEs apart.
const hasName = (hay: string, name: string): boolean =>
  hay.includes(name) ||
  hay.includes(Buffer.from(name, 'utf16le').toString('latin1'))

/**
 * Test double for the rustInvoke leaf. Real PE parsing lives in the Rust tests
 * and goldens (gamelib-scan); caller tests only need path containment to work
 * on real temp files and the fixture PEs to be told apart by substring.
 */
export async function stubRustScan(
  op: ScanOp,
  args: Record<string, string>
): Promise<unknown> {
  switch (op) {
    case 'scan_contained_real': {
      let rootReal: string
      try {
        rootReal = await realpath(defined(args.rootDir, 'rootDir arg'))
      } catch {
        return { real: null, reason: 'root-unresolvable' }
      }
      let real: string
      try {
        real = await realpath(defined(args.path, 'path arg'))
      } catch {
        return { real: null, reason: 'realpath-failed' }
      }
      return isContainedWithin(rootReal, real)
        ? { real, reason: null }
        : { real: null, reason: 'escapes' }
    }
    case 'scan_steamstub_section': {
      const f = await readText(defined(args.exePath, 'exePath arg'))
      if ('error' in f) return { drmWrapper: null, readError: f.error }
      return {
        drmWrapper: f.text.includes('.bind') ? 'steamstub' : 'none',
        readError: null
      }
    }
    case 'scan_steam_drm': {
      const f = await readText(defined(args.exePath, 'exePath arg'))
      if ('error' in f) {
        return {
          parsed: false,
          cegMarkers: [],
          hasBindSection: false,
          readError: f.error
        }
      }
      const isPe = f.text.startsWith('MZ')
      return {
        parsed: isPe,
        cegMarkers: isPe ? CEG_MARKERS.filter((m) => hasName(f.text, m)) : [],
        hasBindSection: isPe && f.text.includes('.bind'),
        readError: null
      }
    }
    case 'scan_pe_imported_dlls':
      return { names: [], readError: null }
    default:
      throw new Error(`stubRustScan: unsupported op ${op}`)
  }
}
