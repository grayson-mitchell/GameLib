/**
 * Quick task 261113-8m6 (todo 2026-11-13-compact-steam-bridge-route-row):
 * pure helpers for the compact "Steam route" row. Decides which issue badge
 * (if any) a route verdict earns, and bounds the missing-symbol list so no
 * surface prints an unbounded dump. No React imports.
 */

export const SYMBOL_CAP = 10

export type BridgeRouteIssueKind =
  | 'notCovered'
  | 'scanMiss'
  | 'knownBad'
  | 'failedThisSession'
  | 'win64NoShim'

const REASON_ISSUE: Record<string, BridgeRouteIssueKind> = {
  'steam.bridge.route.reason.knownBad': 'knownBad',
  'steam.bridge.route.reason.failedThisSession': 'failedThisSession',
  'steam.bridge.route.reason.win64NoShim': 'win64NoShim',
  'steam.bridge.route.reason.scanMiss': 'scanMiss'
}

export function capSymbols(
  symbols: readonly string[],
  cap: number = SYMBOL_CAP
): { shown: string[]; hiddenCount: number } {
  return {
    shown: symbols.slice(0, cap),
    hiddenCount: Math.max(0, symbols.length - cap)
  }
}

export function resolveBridgeRouteIssue(input: {
  reasonKey: string | null
  missingSymbols: readonly string[]
}): { kind: BridgeRouteIssueKind; count: number } | null {
  if (input.missingSymbols.length > 0) {
    return { kind: 'notCovered', count: input.missingSymbols.length }
  }
  const kind = input.reasonKey ? REASON_ISSUE[input.reasonKey] : undefined
  return kind ? { kind, count: 0 } : null
}
