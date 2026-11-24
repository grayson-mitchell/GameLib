/**
 * The case lists of the known-fix network oracle (88-07, D-03, D-11, D-14, D-25). Not a test:
 * `knownFixFetch.oracle.test.ts` builds each slice's `cases.json` from this module in write mode and compares the
 * committed file against it in compare mode, so the lists the Rust replay (88-11) reads and the lists that were
 * recorded cannot drift.
 *
 * Fetcher (`fetchRemoteKnownFixes`): a case is an id and a list of steps run in order on one fresh fake HOME. A
 * step first seeds files, then calls the fetcher with a scripted answer per URL; an unlisted URL answers 404 with
 * an empty body, as the TS test's `makeGet` does. `via: 'default'` passes no `get`, so the fetcher's own axios
 * client runs with `axios.get` answered from the same table (no case touches the network).
 *
 * Report (`runKnownFixReport` and `reportDetectedFix`): every dependency but the clock is the real one from
 * `knownFixReportDeps` (the real reader over seeded layers, the real setting read, the real post with its headers,
 * 8 000 ms timeout and no redirects), over an in-memory sent store and the real abort registry; `axios.post` is
 * answered from the step's scripted answer.
 */
import type { Runner } from 'common/types'
import type { SeedEntry } from 'backend/testUtils/engineWineOracle/harness'
import { slug } from 'backend/testUtils/launchOracle/census'
import {
  GAMELIB_KNOWN_FIXES_BASE,
  HEROIC_KNOWN_FIXES_BASE
} from 'backend/knownFixesFetcher'

// ---------------------------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------------------------

/** One scripted answer. `throws` is a transport failure (with an optional axios error `code`). */
export type Reply =
  | { status: number; data?: unknown }
  | { throws: string; code?: string }

export interface FetchStep {
  appName: string
  runner: Runner
  /** Answers by URL; an unlisted URL answers 404 with an empty body. */
  replies: Record<string, Reply>
  via?: 'injected' | 'default'
  seed?: SeedEntry[]
}

export interface FetchCase {
  id: string
  /** The test title a named case stands for, verbatim (describe titles joined with " > "). */
  title?: string
  steps: FetchStep[]
}

export const gl = (store: string, app: string): string =>
  `${GAMELIB_KNOWN_FIXES_BASE}/${store}/${app}-${store}.json`
export const he = (store: string, app: string): string =>
  `${HEROIC_KNOWN_FIXES_BASE}/${store}/${app}-${store}.json`

/** The remote layer file of an app, as a seed path. */
export const dest = (app: string, store: string): string =>
  `<APPFOLDER>/fixes/${app}-${store}.json`
export const seedFile = (
  app: string,
  store: string,
  text: string
): SeedEntry => ({
  path: dest(app, store),
  text
})

/** The fetcher tests' `beforeEach` creates the local layer folder inside the remote one. */
const LOCAL_DIR: SeedEntry = { path: '<APPFOLDER>/fixes/local', dir: true }

export const step = (
  appName: string,
  runner: Runner,
  replies: Record<string, Reply>,
  more: Partial<FetchStep> = {}
): FetchStep => ({ appName, runner, replies, ...more })

/** A case standing for a test title: its id is `knownFixesFetcher--<slug(title)>` and it starts with the local folder. */
export const named = (
  title: string,
  steps: FetchStep[],
  more: Partial<FetchCase> = {}
): FetchCase => {
  const [first, ...rest] = steps
  if (!first) throw new Error(`${title}: a case needs a step`)
  return {
    id: `knownFixesFetcher--${slug(title)}`,
    title,
    steps: [{ ...first, seed: [LOCAL_DIR, ...(first.seed ?? [])] }, ...rest],
    ...more
  }
}

export const rule = (
  id: string,
  steps: FetchStep[],
  more: Partial<FetchCase> = {}
): FetchCase => ({ id: `rule-${id}`, steps, ...more })

/** A body as the feed serves it: text. */
export const text = (body: unknown): string => JSON.stringify(body)
export const OLD = '{"title":"old"}'

/** Tracer: one valid tier-1 body for a gog game, with a key the allow-list drops. */
export const TRACER_BODY = text({
  title: 'Oracle Tracer',
  envVariables: { WINEDEBUG: '-all' },
  winetricks: ['vcrun2019'],
  extraKey: 1
})

export function fetcherTracer(): FetchCase {
  return {
    id: 'tracer-gamelib-feed-200-gog-written',
    steps: [
      step('1207658930', 'gog', {
        [gl('gog', '1207658930')]: { status: 200, data: TRACER_BODY }
      })
    ]
  }
}
