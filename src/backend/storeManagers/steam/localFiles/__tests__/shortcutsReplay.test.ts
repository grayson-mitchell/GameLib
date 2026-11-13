import { readFileSync } from 'fs'
import { isDeepStrictEqual } from 'util'
import { join } from 'path'
import * as logger from 'backend/logger'
import { RUST_STEAMFILES_SHORTCUTS_READ } from 'common/types/sidecarTransport'
import {
  shortcutsValidityFromSummary,
  titleIndexFromSummary
} from 'backend/shortcuts/nonesteamgame/nonesteamgame'
import { invokeSteamFiles } from '../rustSteamFiles'
import { FIXTURES_SRC } from './oracle/normalize'
import { replayDeps, withFixtureCopy } from './fixtures/replayParity'

/**
 * P75-E (D-10 part 2): the validity and title-lookup outcome the TS policy derives from the REPLAYED
 * Rust summary equals the one derived from the captured steam-shortcut-editor parse (the oracle),
 * or the case has an overrides/shortcuts.json entry keyed `shortcuts/validity/<case>` carrying a
 * divergenceNote. The oracle policy below re-implements today's private checkIfShortcutObjectIsValid
 * and title lookup over the oracle object.
 */
interface Outcome {
  corrupted: boolean
  success: boolean
  errors: string[]
  firstTitle: string | null
  firstTitleIndex: number
  absentTitleIndex: number
}

type Entry = Record<string, unknown>

const hasKey = (e: Entry, key: string) =>
  Object.keys(e).some((k) => k.toLowerCase() === key.toLowerCase())
const nameOf = (e: Entry): string | undefined =>
  Object.entries(e).find(([k]) => k.toLowerCase() === 'appname')?.[1] as
    | string
    | undefined

function oracleOutcome(parsed: Record<string, unknown>): Outcome {
  if ('throws' in parsed) {
    return {
      corrupted: true,
      success: false,
      errors: [],
      firstTitle: null,
      firstTitleIndex: -1,
      absentTitleIndex: -1
    }
  }
  const errors: string[] = []
  let success = false
  let entries: Entry[] = []
  if (!('shortcuts' in parsed)) {
    errors.push('Could not find entry "shortcuts"!')
  } else if (!Array.isArray(parsed.shortcuts)) {
    errors.push('Entry "shortcuts" is not an array!')
  } else {
    success = true
    // JSON renders the oracle's array holes (sparse keys) as null; forEach skips holes and the
    // Rust summary lists real entries only, so the comparison is over the compacted list.
    entries = (parsed.shortcuts as (Entry | null)[]).filter(
      (e): e is Entry => e !== null
    )
    for (const entry of entries) {
      for (const key of ['AppName', 'Exe', 'LaunchOptions']) {
        if (!hasKey(entry, key)) {
          errors.push(
            `One of the game entries is missing the ${key} parameter!`
          )
          success = false
        }
      }
    }
  }
  const firstTitle = entries.map(nameOf).find((t) => t !== undefined) ?? null
  return {
    corrupted: false,
    success,
    errors,
    firstTitle,
    firstTitleIndex:
      firstTitle === null
        ? -1
        : entries.findIndex((e) => nameOf(e) === firstTitle),
    absentTitleIndex: -1
  }
}

type Summary = Parameters<typeof shortcutsValidityFromSummary>[0]

function summaryOutcome(summary: Summary, firstTitle: string | null): Outcome {
  if (!summary.parsed) {
    return {
      corrupted: true,
      success: false,
      errors: [],
      firstTitle: null,
      firstTitleIndex: -1,
      absentTitleIndex: -1
    }
  }
  const v = shortcutsValidityFromSummary(summary)
  return {
    corrupted: false,
    success: v.success,
    errors: v.errors,
    firstTitle,
    firstTitleIndex:
      firstTitle === null ? -1 : titleIndexFromSummary(summary, firstTitle),
    absentTitleIndex: titleIndexFromSummary(summary, '\u0000absent\u0000')
  }
}

type Overrides = Record<
  string,
  { rustOverride?: unknown; divergenceNote?: string }
>

function expectedOutcome(caseKey: string, oracle: Outcome): Outcome {
  const overrides = JSON.parse(
    readFileSync(join(FIXTURES_SRC, 'overrides/shortcuts.json'), 'utf8')
  ) as Overrides
  const o = overrides[`shortcuts/validity/${caseKey}`]
  if (o?.rustOverride !== undefined) {
    if ((o.divergenceNote ?? '').length < 20) {
      throw new Error(`${caseKey}: override without a real divergenceNote`)
    }
    return o.rustOverride as Outcome
  }
  return oracle
}

describe('shortcuts replay parity (TS policy over recorded Rust summaries)', () => {
  beforeEach(() => {
    jest.spyOn(logger, 'logDebug').mockImplementation(() => undefined)
  })
  afterEach(() => jest.restoreAllMocks())

  it('summary-derived validity equals oracle-derived validity per fixture', async () => {
    const cases = (
      JSON.parse(readFileSync(join(FIXTURES_SRC, 'expected.json'), 'utf8')) as {
        cases: Record<string, { oracle: Record<string, unknown> }>
      }
    ).cases
    const keys = Object.keys(cases).filter((k) =>
      k.startsWith('shortcuts/parse/')
    )

    const mismatches: {
      caseKey: string
      actual: Outcome
      expected: Outcome
    }[] = []
    let replayed = 0
    await withFixtureCopy('', async (root) => {
      const deps = replayDeps(root)
      for (const key of keys) {
        const name = key.slice('shortcuts/parse/'.length)
        const oracle = oracleOutcome(cases[key]!.oracle)
        const summary = await invokeSteamFiles(
          deps,
          RUST_STEAMFILES_SHORTCUTS_READ,
          { path: join(root, 'shortcuts', `${name}.vdf`) }
        )
        const actual = summaryOutcome(summary, oracle.firstTitle)
        const expected = expectedOutcome(name, oracle)
        if (!isDeepStrictEqual(actual, expected)) {
          mismatches.push({ caseKey: name, actual, expected })
        }
        replayed++
      }
    })
    expect(mismatches).toEqual([])
    expect(replayed).toBeGreaterThanOrEqual(15)
  })
})
