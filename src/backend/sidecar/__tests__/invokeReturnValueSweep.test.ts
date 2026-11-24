/**
 * Anti-rot gate for the F-34.5-G6-08 / U-34.5-15 invoke-return-value sweep (Phase 34.5 gap cycle
 * 6, plan 34.5-45, Task 3). Reads the four `*FlowRegistration.ts` modules this slice owns
 * (`runnerAuthFlowRegistration.ts`, `wineToolsFlowRegistration.ts` until Phase 87 Plan 36,
 * `shortcutsFlowRegistration.ts`, `runnerMiscFlowRegistration.ts`) OFF DISK, extracts every
 * `ipcMain.handle` channel with a pattern that tolerates the multi-line registration form (14 of
 * the 40 put the channel name on the following line — a single-line-only regex finds fewer),
 * and asserts:
 *
 *   1. The extracted channel count is exactly 27, with the exact per-module tally 10/6/11.
 *   2. Every channel classified RETURNS (declared non-void in `AsyncIPCFunctions`, NOT on the
 *      explicit VOID-PARITY allow-list below) has a `return` statement inside its own handler
 *      body -- so a future edit that silently drops a `return` is caught here, not live.
 *
 * The VOID_PARITY_CHANNELS allow-list exists so this gate is a statement about INTENT, not a bare
 * count: each entry is annotated with why that channel is correctly declared `Promise<void>` (see
 * `34.5-JSON-TRANSPORT-SWEEP.md`'s `## Invoke-return-value sweep` section for the full per-channel
 * classification this test mechanizes).
 */

import { defined } from 'backend/testUtils/indexed'
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
  // Phase 87 Plan 36 (D-23): the `wineTools` module (`wineToolsFlowRegistration.ts`) is deleted: its last channel,
  // `runWineCommand`, is a scheduled resolver (`engineWineResolvers.ts`), like every channel of the wine tools cluster.
  {
    name: 'shortcuts',
    // Quick 261012-ca6 (2026-10-12): 4 -> 6. `addShortcut` and `removeShortcut` moved from
    // send-kind to invoke-kind and now resolve whether shortcuts exist on disk.
    // Phase 94 Plan 11: 6 -> 5. `shortcutsExists` is the scheduled resolver `resolveShortcutsExists`
    // (`shortcutsResolvers.ts`), answered by Rust; it is no longer an `ipc.handle` of this module.
    path: join(__dirname, '../shortcutsFlowRegistration.ts'),
    // Phase 94 Plan 22: 5 -> 4. `addShortcut` is the scheduled resolver `resolveAddShortcut`
    // (`humbleshortcuts/shortcuts.ts`), answered by Rust.
    expectedCount: 4
  },
  {
    name: 'runnerMisc',
    // Phase 34.6 Plan 10 (2026-08-24): 11 -> 14. Three INVOKE-kind late-discovered channels
    // were ported byte-equivalently from main.ts (D-14) -- `getAchievements`,
    // `getDefaultSavePath`, `getPlaytimeFromRunner`.
    // Phase 87 Plan 17 (D-14): 14 -> 13. `isRuntimeInstalled` is a native `wine` channel.
    // Phase 87 Plan 18 (D-14): 13 -> 12. `downloadRuntime` is a native `wine` channel too.
    // Phase 87 Plan 36 (D-23): 12 -> 11. `callTool` is a scheduled resolver.
    path: join(__dirname, '../runnerMiscFlowRegistration.ts'),
    expectedCount: 11
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
  removeFromSteam:
    'declared Promise<void>; awaits removeNonSteamGame(game) and returns nothing'
}

/** Multi-line-capable: tolerates the channel name landing on the line after `ipcMain.handle(`. */
// 66.3-10: registrations moved from the shim's `ipcMain` to the injected `deps.ipc`; both spellings
// are matched while the wine-tools registration is converted in the same plan.
const HANDLE_PATTERN = /(?:ipcMain|deps\.ipc)\.handle\(\s*'([^']+)'/g

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
      channel: defined(m[1], 'channel name'),
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
    while (
      i < callText.length &&
      /\s/.test(defined(callText[i], 'call text char'))
    )
      i++
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
  // Phase 45 Plan 01 (2026-10-10): 40 -> 43, the same +3 recorded on the `wineTools` module spec
  // above (`winetricksApply`, `winetricksQueueState`, `winetricksCancelRemaining`; all three are
  // invoke-kind, D-11).
  // Quick 261012-ca6 (2026-10-12): 43 -> 45, the same +2 recorded on the `shortcuts` module spec
  // above (`addShortcut`, `removeShortcut`; both moved from send-kind to invoke-kind).
  // Phase 87 Plan 17 (D-14): 45 -> 44, the -1 recorded on the `runnerMisc` module spec above
  // (`isRuntimeInstalled` is a native `wine` channel).
  // This total and the per-module counts must always move together -- if they ever disagree, the
  // extraction is wrong and neither number should be adjusted until that is understood.
  // Phase 87 Plan 18 (D-14): 44 -> 43, `downloadRuntime` is a native `wine` channel too.
  // Phase 87 Plan 20 (D-14): 43 -> 40, the three wine-manager channels are native `wine` channels.
  // Phase 87 Plan 24 (D-14): 40 -> 39, `wine.isValidVersion` is a native `wine` channel.
  // Phase 87 Plan 26 (D-14): 39 -> 38, `getAlternativeWine` is a native `wine` channel.
  // Phase 87 Plan 34 (D-23): 38 -> 35, the three DXVK toggles are scheduled resolvers, not the modules' handles.
  // Phase 87 Plan 35 (D-23, D-14): 35 -> 30, the five Winetricks channels are resolvers or native channels.
  // Phase 87 Plan 36 (D-23): 30 -> 27, `runWineCommandForGame`, `runWineCommand` and `callTool` are scheduled resolvers.
  // Phase 94 Plan 11: 27 -> 26, the -1 recorded on the `shortcuts` module spec above (`shortcutsExists` is a
  // scheduled resolver).
  // Phase 94 Plan 22: 26 -> 25, the -1 recorded on the `shortcuts` module spec above (`addShortcut` is a
  // scheduled resolver).
  it('extracts exactly 25 channels total', () => {
    expect(allChannels).toHaveLength(25)
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

  it('the VOID_PARITY_CHANNELS allow-list itself matches exactly the 3 channels the sweep classified VOID-PARITY', () => {
    const allowListed = Object.keys(VOID_PARITY_CHANNELS).sort()
    expect(allowListed).toEqual(
      ['logoutLegendary', 'logoutAmazon', 'removeFromSteam'].sort()
    )
  })
})
