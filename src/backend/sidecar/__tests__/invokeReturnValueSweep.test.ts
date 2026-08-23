/**
 * Anti-rot gate for the F-34.5-G6-08 / U-34.5-15 invoke-return-value sweep (Phase 34.5 gap cycle
 * 6, plan 34.5-45, Task 3). Reads the four `*FlowRegistration.ts` modules this slice owns
 * (`runnerAuthFlowRegistration.ts`, `wineToolsFlowRegistration.ts`,
 * `shortcutsFlowRegistration.ts`, `runnerMiscFlowRegistration.ts`) OFF DISK, extracts every
 * `ipcMain.handle` channel with a pattern that tolerates the multi-line registration form (14 of
 * the 40 put the channel name on the following line — a single-line-only regex finds fewer),
 * and asserts:
 *
 *   1. The extracted channel count is exactly 40, with the exact per-module tally 10/12/4/14.
 *   2. Every channel classified RETURNS (declared non-void in `AsyncIPCFunctions`, NOT on the
 *      explicit VOID-PARITY allow-list below) has a `return` statement inside its own handler
 *      body -- so a future edit that silently drops a `return` is caught here, not live.
 *
 * The VOID_PARITY_CHANNELS allow-list exists so this gate is a statement about INTENT, not a bare
 * count: each entry is annotated with why that channel is correctly declared `Promise<void>` (see
 * `34.5-JSON-TRANSPORT-SWEEP.md`'s `## Invoke-return-value sweep` section for the full per-channel
 * classification this test mechanizes).
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

interface ModuleSpec {
  name: string
  path: string
  expectedCount: number
}

const MODULES: ModuleSpec[] = [
  {
    name: 'runnerAuth',
    path: join(__dirname, '../runnerAuthFlowRegistration.ts'),
    expectedCount: 10
  },
  {
    name: 'wineTools',
    // Phase 34.6 Plan 07 (2026-08-24): 9 -> 12. Three INVOKE-kind channels were added to
    // wineToolsFlowRegistration.ts -- `winetricksAvailable`, `winetricksInstalled` and
    // `runWineCommandForGame`. The delta is 3 and NOT 4: the fourth channel that plan
    // registered, `winetricksInstall`, is SEND-kind (`ipcMain.on`), and this sweep extracts
    // `ipcMain.handle(...)` only. If `winetricksInstall` ever appears in this module's
    // extracted array, that is a real defect -- a send channel registered as invoke -- and
    // must NOT be absorbed by raising this number.
    path: join(__dirname, '../wineToolsFlowRegistration.ts'),
    expectedCount: 12
  },
  {
    name: 'shortcuts',
    path: join(__dirname, '../shortcutsFlowRegistration.ts'),
    expectedCount: 4
  },
  {
    name: 'runnerMisc',
    // Phase 34.6 Plan 10 (2026-08-24): 11 -> 14. Three INVOKE-kind late-discovered channels
    // were ported byte-equivalently from main.ts (D-14) -- `getAchievements`,
    // `getDefaultSavePath`, `getPlaytimeFromRunner`.
    path: join(__dirname, '../runnerMiscFlowRegistration.ts'),
    expectedCount: 14
  }
]

/**
 * Declared-void channels this sweep intentionally does NOT require a `return` from. Each entry's
 * value is the reason it is correctly `Promise<void>` -- see `34.5-JSON-TRANSPORT-SWEEP.md`'s
 * `## Invoke-return-value sweep` for the full classification these annotations summarize.
 */
const VOID_PARITY_CHANNELS: Record<string, string> = {
  logoutLegendary:
    'declared Promise<void>; delegates to LegendaryUser.logout() (a void-resolving promise)',
  logoutAmazon:
    'declared Promise<void>; delegates to NileUser.logout() (a void-resolving promise)',
  installWineVersion:
    'declared Promise<void>; ports wine/manager/ipc_handler.ts:14 verbatim, ends on the final onProgress push with no return value',
  refreshWineVersionInfo:
    'declared Promise<void>; inherited swallow-and-return-nothing shape on both the success and catch paths (wine/manager/ipc_handler.ts:46), documented in place',
  removeWineVersion:
    'declared Promise<void>; ports wine/manager/ipc_handler.ts:56 verbatim, conditionally notifies and returns nothing',
  removeFromSteam:
    'declared Promise<void>; awaits removeNonSteamGame(game) and returns nothing',
  callTool:
    'declared Promise<void>; dispatches to winetricks/winecfg/runExe plus a status push, returns nothing'
}

/** Multi-line-capable: tolerates the channel name landing on the line after `ipcMain.handle(`. */
const HANDLE_PATTERN = /ipcMain\.handle\(\s*'([^']+)'/g

interface ExtractedChannel {
  channel: string
  module: string
  /** The EXACT `ipcMain.handle(...)` call text, from its opening paren through the matching
   * balanced closing paren -- not an approximation via "next match start", since several
   * channels in this sweep are bare passthroughs (`ipcMain.handle('x', someNamedFunction)`) or
   * implicit-return arrow expressions (`async (...) => expr`, no braces), neither of which
   * contains a literal `return` keyword despite genuinely returning a value. */
  callText: string
}

/** Returns the substring from `source[openParenIndex]` through its balanced matching `)`. */
function extractBalancedParens(source: string, openParenIndex: number): string {
  let depth = 0
  for (let i = openParenIndex; i < source.length; i++) {
    if (source[i] === '(') depth++
    else if (source[i] === ')') {
      depth--
      if (depth === 0) return source.slice(openParenIndex, i + 1)
    }
  }
  return source.slice(openParenIndex)
}

function extractChannels(spec: ModuleSpec): ExtractedChannel[] {
  const source = readFileSync(spec.path, 'utf-8')
  const channels: ExtractedChannel[] = []
  let m: RegExpExecArray | null
  HANDLE_PATTERN.lastIndex = 0
  while ((m = HANDLE_PATTERN.exec(source))) {
    const openParenIndex = source.indexOf('(', m.index)
    channels.push({
      channel: m[1],
      module: spec.name,
      callText: extractBalancedParens(source, openParenIndex)
    })
  }
  return channels
}

/**
 * Whether `callText` (the exact `(...)` argument list of an `ipcMain.handle(...)` call) proves
 * its handler returns a value on every path, WITHOUT relying on a literal `return` keyword being
 * present -- which is not the case for two legitimate shapes in this codebase:
 *   - a bare passthrough (`ipcMain.handle('x', someNamedFunction)`) -- the return lives inside
 *     the referenced function, not in this call text at all.
 *   - an implicit-return arrow expression (`async (...) => expr`, no braces) -- the expression's
 *     value IS the return value; no `return` keyword is ever written for this shape.
 * Falls back to a literal `\breturn\b` search for the remaining (block-bodied) shape.
 */
function handlerProvesItReturns(callText: string): boolean {
  // Bare passthrough: `'channel', identifier)` with nothing else (no `function`/`=>`/`(`).
  const passthroughMatch = /,\s*([A-Za-z_$][\w$]*)\s*\)\s*$/.exec(callText)
  if (passthroughMatch && !/=>|function/.test(callText)) {
    return true
  }

  const arrowIndex = callText.indexOf('=>')
  if (arrowIndex !== -1) {
    // Find the first non-whitespace character after `=>`. If it's not `{`, this is an
    // implicit-return expression body -- the whole rest of the arrow IS the return value.
    let i = arrowIndex + 2
    while (i < callText.length && /\s/.test(callText[i])) i++
    if (callText[i] !== '{') {
      return true
    }
  }

  return /\breturn\b/.test(callText)
}

describe('invoke-return-value sweep anti-rot gate (F-34.5-G6-08 / U-34.5-15)', () => {
  const allChannels = MODULES.flatMap((spec) => extractChannels(spec))

  // Phase 34.6 Plan 07 (2026-08-24): 34 -> 37, the same +3 recorded on the `wineTools` module
  // spec above (`winetricksAvailable`, `winetricksInstalled`, `runWineCommandForGame`; send-kind
  // `winetricksInstall` is correctly excluded because this sweep extracts `ipcMain.handle` only).
  // Phase 34.6 Plan 10 (2026-08-24): 37 -> 40, the same +3 recorded on the `runnerMisc` module
  // spec above (`getAchievements`, `getDefaultSavePath`, `getPlaytimeFromRunner`; all three are
  // invoke-kind, D-14).
  // This total and the per-module counts must always move together -- if they ever disagree, the
  // extraction is wrong and neither number should be adjusted until that is understood.
  it('extracts exactly 40 channels total', () => {
    expect(allChannels).toHaveLength(40)
  })

  it.each(MODULES)('$name has exactly $expectedCount channels', (spec) => {
    const channels = extractChannels(spec)
    expect(channels).toHaveLength(spec.expectedCount)
  })

  it('every non-VOID-PARITY channel provably returns a value (explicit `return`, an implicit-return arrow expression, or a passthrough to a named function)', () => {
    const missing: string[] = []
    for (const { channel, module, callText } of allChannels) {
      if (channel in VOID_PARITY_CHANNELS) continue
      if (!handlerProvesItReturns(callText)) {
        missing.push(`${module}.${channel}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('the VOID_PARITY_CHANNELS allow-list itself matches exactly the 7 channels the sweep classified VOID-PARITY', () => {
    const allowListed = Object.keys(VOID_PARITY_CHANNELS).sort()
    expect(allowListed).toEqual(
      [
        'logoutLegendary',
        'logoutAmazon',
        'installWineVersion',
        'refreshWineVersionInfo',
        'removeWineVersion',
        'removeFromSteam',
        'callTool'
      ].sort()
    )
  })
})
