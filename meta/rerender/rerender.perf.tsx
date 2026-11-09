/**
 * D-14 re-render harness: runs the four-step scenario against a ~2,000-game
 * synthetic library, counting React Profiler commits for Library and GameCard.
 * Run with `pnpm perf:rerender` (never part of test:ci). PERF_ERA names the
 * output file (default 'baseline').
 */
import React, { Profiler } from 'react'
import fs from 'fs'
import path from 'path'
import { act } from 'react-dom/test-utils'

import { generateSyntheticLibrary } from './syntheticLibrary'
import { installFakeApi } from './fakeApi'

jest.mock('../../src/preload/tauriAttach', () => ({}))

type Acc = { count: number; actualDuration: number }
type Counters = Record<'Library' | 'GameCard', Acc>
const fresh = (): Counters => ({
  Library: { count: 0, actualDuration: 0 },
  GameCard: { count: 0, actualDuration: 0 }
})
let counters: Counters = fresh()
const onRender = (id: string, _phase: string, actualDuration: number): void => {
  const c = counters[id as keyof Counters]
  if (!c) return
  c.count += 1
  c.actualDuration += actualDuration
}

// Wrap every GameCard instance in a Profiler.
jest.mock('frontend/screens/Library/components/GameCard', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const R = require('react')
  const actual = jest.requireActual(
    'frontend/screens/Library/components/GameCard'
  )
  const Inner = actual.default
  const Wrapped = (props: unknown) =>
    R.createElement(
      R.Profiler,
      { id: 'GameCard', onRender: (globalThis as any).__perfOnRender },
      R.createElement(Inner, props)
    )
  return { __esModule: true, ...actual, default: Wrapped }
})
;(globalThis as any).__perfOnRender = onRender

const STEP_NAMES = [
  'toggleAppearance',
  'gameStatusPush',
  'dialogOpenClose',
  'libraryRefreshPush'
] as const

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

test('D-14 re-render scenario', async () => {
  const fixture = generateSyntheticLibrary()
  installFakeApi(fixture)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const seam = require('./seam') as typeof import('./seam')
  const firstEpic = fixture.legendary[0].app_name

  const RUNS = 5
  const samples: Record<
    string,
    Record<string, { c: number[]; d: number[] }>
  > = {}
  for (const s of STEP_NAMES)
    samples[s] = {
      Library: { c: [], d: [] },
      GameCard: { c: [], d: [] }
    }

  for (let run = 0; run < RUNS; run++) {
    installFakeApi(fixture)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = await seam.mountApp(container, (_id, el) => (
      <Profiler id="Library" onRender={onRender}>
        {el}
      </Profiler>
    ))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    for (const name of STEP_NAMES) {
      counters = fresh()
      if (name === 'gameStatusPush') await seam.steps.gameStatusPush(firstEpic)
      else await seam.steps[name]()
      for (const id of ['Library', 'GameCard'] as const) {
        samples[name][id].c.push(counters[id].count)
        samples[name][id].d.push(counters[id].actualDuration)
      }
    }
    await act(async () => {
      root.unmount()
    })
    container.remove()
  }

  const era = process.env.PERF_ERA || 'baseline'
  const steps: Record<string, unknown> = {}
  for (const name of STEP_NAMES) {
    const out: Record<string, unknown> = {}
    for (const id of ['Library', 'GameCard'] as const) {
      out[id] = {
        count: median(samples[name][id].c),
        actualDurationMs: Math.round(median(samples[name][id].d) * 100) / 100
      }
    }
    steps[name] = out
  }
  const result = { era, runs: RUNS, steps }
  const json = JSON.stringify(result, null, 2)
  const dir = path.join(__dirname, 'results')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${era}.json`), json + '\n')
  process.stdout.write(json + '\n')
  expect(Object.keys(steps)).toHaveLength(4)
})
