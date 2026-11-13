import { readFileSync } from 'fs'
import { isDeepStrictEqual } from 'util'
import { join } from 'path'
import {
  FIXTURES_SRC,
  FIXTURES_TOKEN,
  normalizeForGolden,
  withFixtureCopy
} from './fixtureCopy'

export { withFixtureCopy, normalizeForGolden }

interface Invocation {
  id: string
  op: string
  args: unknown
}

type Overrides = Record<
  string,
  { rustOverride?: unknown; divergenceNote?: string }
>

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(join(FIXTURES_SRC, rel), 'utf8')) as T
}

/**
 * Replays the recorded Rust results (`rust-results.json`) as the rustInvoke leaf, so a caller
 * plan can prove TS-wrapper(Rust) == oracle in Jest without cargo (P75-E). Args are normalised
 * (temp root -> `${FIXTURES}`, `/` separators), matched against `invocations.json`, and the
 * recorded result is returned with the token resolved back to the temp root.
 */
export function replayDeps(tempRoot: string) {
  const invocations = readJson<{ invocations: Invocation[] }>(
    'invocations.json'
  ).invocations
  const results = readJson<{ results: Record<string, unknown> }>(
    'rust-results.json'
  ).results
  const rootJson = JSON.stringify(tempRoot).slice(1, -1)

  const requestRustInvoke = (
    channel: string,
    argv: readonly unknown[]
  ): Promise<unknown> => {
    const args = normalizeForGolden(argv[0], tempRoot)
    const hit = invocations.find(
      (i) => i.op === channel && isDeepStrictEqual(i.args, args)
    )
    if (!hit || !(hit.id in results)) {
      return Promise.reject(
        new Error(
          `no recorded invocation for ${channel} ${JSON.stringify(args)}; add it to invocations.json and re-record (GAMELIB_WRITE_STEAMFILES_RUST=1 cargo test -p gamelib-steamfiles --test golden)`
        )
      )
    }
    const text = JSON.stringify(results[hit.id])
      .split(FIXTURES_TOKEN)
      .join(rootJson)
    return Promise.resolve(JSON.parse(text))
  }
  return { requestRustInvoke }
}

/**
 * The expected value for `<area>/<caseKey>`: the per-area `rustOverride` when present (its
 * `divergenceNote` must be non-empty), else the captured TS oracle.
 */
export function expectedFor(
  area: string,
  caseKey: string,
  overrides: Overrides = readJson<Overrides>(`overrides/${area}.json`)
): unknown {
  const key = `${area}/${caseKey}`
  const o = overrides[key]
  if (o?.rustOverride !== undefined) {
    if (!o.divergenceNote) {
      throw new Error(`${key}: override without divergenceNote`)
    }
    return o.rustOverride
  }
  const cases = readJson<{ cases: Record<string, { oracle: unknown }> }>(
    'expected.json'
  ).cases
  const c = cases[key]
  if (!c) throw new Error(`no oracle case ${key}`)
  return c.oracle
}
