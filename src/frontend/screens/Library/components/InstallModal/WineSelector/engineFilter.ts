import { Runner, WineInstallation } from 'common/types'

// Phase 34.13-03 (D-16, D-05): the four pure decision functions behind
// WineSelector's CrossOver-only engine filter (D-16) and read-only
// bottle-name state (D-05), extracted out of `index.tsx` into this
// standalone module.
//
// `WineSelector/index.tsx` imports several shared UI field components,
// one of which transitively pulls in a stylesheet asset at import time.
// This project's jsdom-less jest config (see `src/frontend/jest.config.js`)
// has no stylesheet transform or moduleNameMapper, so any test importing
// anything from `index.tsx` fails with "Jest encountered an unexpected
// token" while evaluating that transitive stylesheet import, before any
// assertion runs -- the same posture already used for the sideload
// install dialog's own extracted filters module. Extracting these four
// pure functions into this standalone, dependency-free sibling module lets
// Jest exercise the decisions in isolation; the component wiring itself is
// proven by 34.13-13's manual gate.
//
// `resolveCrossoverOnly` defaults ON for `runner === 'steam'` specifically
// so the guided Steam bottle setup dialog -- which already passes
// `runner="steam"` and no new prop -- inherits the D-16 filter
// automatically, with zero edits to that file (RESEARCH.md Pitfall 3: a
// diff touching the install modal or a new dialog file but not this
// component's own module is the warning sign of getting this wrong).

export function resolveCrossoverOnly(
  runner: Runner | undefined,
  crossoverOnly: boolean | undefined
): boolean {
  return crossoverOnly ?? runner === 'steam'
}

export function filterWineEngines(
  wineVersionList: WineInstallation[],
  crossoverOnly: boolean
): WineInstallation[] {
  if (!crossoverOnly) return wineVersionList
  return wineVersionList.filter((version) => version.type === 'crossover')
}

export function selectDefaultEngine(
  wineVersionList: WineInstallation[],
  crossoverOnly: boolean
): WineInstallation | undefined {
  return filterWineEngines(wineVersionList, crossoverOnly).at(0)
}

export function resolveBottleNameState(
  useSharedPrefix: boolean,
  bottleNameReadOnly: boolean | undefined
): { disabled: boolean; showReadOnlyHelper: boolean } {
  return {
    disabled: useSharedPrefix || bottleNameReadOnly === true,
    showReadOnlyHelper: bottleNameReadOnly === true
  }
}
