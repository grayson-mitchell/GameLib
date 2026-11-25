/**
 * The Humble pure-logic oracle (94-06 Task 2, D-05, D-06, Pitfall 6): classify and dedup recorded
 * from the TypeScript before any Rust for them exists.
 *
 * Every export of `classify.ts` (`classifyTpk`, `isTerminal`, `isServerTerminal`,
 * `isFreezeEligible`, `extractExpiration`, `classifyOrder`, `describeZeroKeyOrder`,
 * `describeSkippedEntitlements`, `describeMissingExpirationTpks`) and `dedup.ts`
 * (`recomputeOwnership`) is run over:
 *   - every order exported by `__tests__/fixtures/tpks.ts` (imported by namespace, so a fixture
 *     added later is recorded as soon as the golden is rewritten, and the manifest count fails
 *     until it is);
 *   - the Steam libraries of `__tests__/fixtures/steamGames.ts`;
 *   - the input tables of `classify.test.ts` and `dedup.test.ts`. Those tables are inline in the
 *     test files (a test file cannot be imported without running it), so the matrices below
 *     restate their shapes as data: every `classifyTpk` signal combination, every
 *     `extractExpiration` field and value, the `isFreezeEligible` grid, and the dedup tiers
 *     (appid, fuzzy, DLC guard, override, UNPICKED, empty library).
 *
 * Each case is a golden `{fn, input, output}` under
 * `src-tauri/crates/gamelib-humble/tests/fixtures/golden/{classify,dedup}/<case>.json`. Properties
 * the TS leaves `undefined` are absent from the JSON (a Rust replay treats absent as `None`); a
 * number JSON cannot carry (`NaN`, `Infinity`) is the marker `{"$num": "NaN"}`.
 *
 * Time. The classifier is time and zone dependent. Every `now` is an explicit input. A date-only
 * or zone-less value is anchored to the host's LOCAL zone (i31), so those cases are recorded in
 * three fixed-offset zones (UTC, America/Phoenix at -07:00, Asia/Kolkata at +05:30; none observes
 * daylight saving) and the zone is part of the input. the real `TZ` is switched per case (see `realProcess`) and
 * the switch is checked, so a host that ignored it fails the run instead of recording a lie.
 *
 * Secrets. A key value is never a golden: every non-empty string under `redeemed_key_val`,
 * `redeemed_key_value` (and the like) is replaced with `REDACTED` BEFORE the TS runs, so the
 * recorded input and output agree. The classifier only reads whether a value is present.
 *
 * `GAMELIB_WRITE_HUMBLE_GOLDEN=1` writes the goldens; the default compares.
 */
import { runInThisContext } from 'vm'
import {
  classifyOrder,
  classifyTpk,
  describeMissingExpirationTpks,
  describeSkippedEntitlements,
  describeZeroKeyOrder,
  extractExpiration,
  isFreezeEligible,
  isServerTerminal,
  isTerminal
} from '../../classify'
import { recomputeOwnership } from '../../dedup'
import type { OrderDetail } from '../../adapter'
import { HUMBLE_CLASSIFIER_VERSION } from '../../constants'
import type { HumbleKey, HumbleKeyState } from 'common/types/humble'
import type { GameInfo } from 'common/types'
import {
  PINNED_NOW_MS,
  assertManifest,
  expectEmptyCasesToFail,
  syncManifest,
  writeOrCompareGolden
} from 'backend/testUtils/humbleOracle/harness'
import * as tpkFixtures from '../fixtures/tpks'
import {
  ownedSteamLibrary,
  steamOwnedBatmanArkhamKnight,
  steamOwnedGameX
} from '../fixtures/steamGames'

// ---------------------------------------------------------------------------------------------
// Case plumbing
// ---------------------------------------------------------------------------------------------

interface OracleCase {
  id: string
  fn: string
  input: unknown
  /** Runs the TypeScript on the (revived) input. */
  run: () => unknown
}

const NOW_ISO = new Date(PINNED_NOW_MS).toISOString()
const LATE_NOW_ISO = '2099-06-01T00:00:00.000Z'
const TEST_FILE_NOW_ISO = '2026-07-06T00:00:00.000Z'

/** A recorded output: JSON round-trip (undefined dropped, NaN null) or the error the TS threw. */
function record(run: () => unknown): unknown {
  try {
    const out = run()
    return out === undefined ? null : JSON.parse(JSON.stringify(out))
  } catch (error) {
    if (error instanceof OracleHostError) throw error
    const e = error as Error
    return { threw: `${e.name}: ${e.message}` }
  }
}

/** A JSON-safe number: `NaN`, `Infinity` and `-Infinity` cannot be JSON. */
const num = (value: string): { $num: string } => ({ $num: value })

function revive(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(revive)
  if (node !== null && typeof node === 'object') {
    const entries = Object.entries(node as Record<string, unknown>)
    const marker = entries.length === 1 ? entries[0] : undefined
    if (marker && marker[0] === '$num' && typeof marker[1] === 'string') {
      return Number(marker[1])
    }
    return Object.fromEntries(entries.map(([k, v]) => [k, revive(v)]))
  }
  return node
}

const KEY_VALUE_FIELDS = new Set([
  'redeemed_key_val',
  'redeemed_key_value',
  'key_value',
  'keyvalue',
  'key'
])

/**
 * A deep copy of a fixture with every non-empty string key value replaced by `REDACTED`. An
 * empty string, an object, a boolean and `null` keep their shape (the classifier reads
 * presence, and some key types carry an object).
 */
function redactKeyValues<T>(node: T): T {
  const walk = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(walk)
    if (n !== null && typeof n === 'object') {
      return Object.fromEntries(
        Object.entries(n as Record<string, unknown>).map(([k, v]) => [
          k,
          KEY_VALUE_FIELDS.has(k.toLowerCase()) &&
          typeof v === 'string' &&
          v !== ''
            ? 'REDACTED'
            : walk(v)
        ])
      )
    }
    return n
  }
  return walk(node) as T
}

/** `someOrderName` -> `some-order-name`, lower case (case ids must be unique on a folding disk). */
const kebab = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .toLowerCase()

type Selector = { all: boolean } | { only: string[] }

const selects = (selector: Selector, value: string): boolean =>
  'all' in selector ? selector.all : selector.only.includes(value)

/** The zones the zone-dependent cases are recorded in, with the offset each must show. */
const ZONES = [
  { tz: 'UTC', offsetMinutes: 0 },
  { tz: 'America/Phoenix', offsetMinutes: 420 },
  { tz: 'Asia/Kolkata', offsetMinutes: -330 }
] as const

/**
 * Jest hands a test a COPY of `process.env`: assigning `TZ` to it never reaches the real
 * environment, so V8 keeps the host's zone. `vm.runInThisContext` evaluates in the worker's own
 * (outer) context, where `process` is the real one, and the real `TZ` setter tells V8 to drop its
 * zone cache.
 */
const realProcess = runInThisContext('process') as NodeJS.Process

/** An environment fault (not an output of the TypeScript): `record` must never swallow it. */
class OracleHostError extends Error {}

function withTimeZone<T>(tz: string, offsetMinutes: number, fn: () => T): T {
  const before = realProcess.env.TZ
  realProcess.env.TZ = tz
  try {
    const offset = new Date(2026, 0, 1).getTimezoneOffset()
    if (offset !== offsetMinutes) {
      throw new OracleHostError(
        `this host ignored TZ=${tz} (offset ${offset}, wanted ${offsetMinutes}): refusing to record a zone-dependent case`
      )
    }
    return fn()
  } finally {
    if (before === undefined) delete realProcess.env.TZ
    else realProcess.env.TZ = before
  }
}

// ---------------------------------------------------------------------------------------------
// The fixtures
// ---------------------------------------------------------------------------------------------

const ORDER_FIXTURES: [string, Record<string, unknown>][] = Object.entries(
  tpkFixtures as Record<string, Record<string, unknown>>
)
  .map(([name, order]): [string, Record<string, unknown>] => [
    kebab(name),
    redactKeyValues(order)
  ])
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

/** The first tpk that is an object with a string `machine_name`, or null. */
function firstMachineName(order: Record<string, unknown>): string | null {
  const dict = order.tpkd_dict as { all_tpks?: unknown } | null | undefined
  const tpks = Array.isArray(dict?.all_tpks) ? (dict.all_tpks as unknown[]) : []
  for (const tpk of tpks) {
    const name = (tpk as { machine_name?: unknown } | null)?.machine_name
    if (tpk && typeof tpk === 'object' && typeof name === 'string') return name
  }
  return null
}

// ---------------------------------------------------------------------------------------------
// classify cases
// ---------------------------------------------------------------------------------------------

function classifyCases(): OracleCase[] {
  const cases: OracleCase[] = []

  // classifyOrder over every fixture order, under the predicate and clock variants.
  for (const [name, order] of ORDER_FIXTURES) {
    const first = firstMachineName(order)
    const gamekey = (order.gamekey as string | undefined) ?? ''
    const variants: {
      id: string
      revealed: Selector
      redeemed: Selector
      now: string
    }[] = [
      {
        id: 'plain',
        revealed: { all: false },
        redeemed: { all: false },
        now: NOW_ISO
      },
      {
        id: 'revealed-all',
        revealed: { all: true },
        redeemed: { all: false },
        now: NOW_ISO
      },
      {
        id: 'redeemed-all',
        revealed: { all: false },
        redeemed: { all: true },
        now: NOW_ISO
      },
      {
        id: 'late',
        revealed: { all: false },
        redeemed: { all: false },
        now: LATE_NOW_ISO
      }
    ]
    if (first !== null) {
      variants.push(
        {
          id: 'revealed-first',
          revealed: { only: [first] },
          redeemed: { all: false },
          now: NOW_ISO
        },
        {
          id: 'redeemed-first',
          revealed: { all: false },
          redeemed: { only: [`${gamekey}:${first}`] },
          now: NOW_ISO
        }
      )
    }
    for (const v of variants) {
      const input = {
        order,
        revealed: v.revealed,
        redeemed: v.redeemed,
        now: v.now
      }
      cases.push({
        id: `classify-order-${name}-${v.id}`,
        fn: 'classifyOrder',
        input,
        run: () =>
          classifyOrder(
            order as unknown as OrderDetail,
            (machineName) => selects(v.revealed, machineName),
            new Date(v.now),
            (key, machineName) => selects(v.redeemed, `${key}:${machineName}`)
          )
      })
    }
    for (const [fn, run] of [
      [
        'describeZeroKeyOrder',
        () => describeZeroKeyOrder(order as unknown as OrderDetail)
      ],
      [
        'describeSkippedEntitlements',
        () => describeSkippedEntitlements(order as unknown as OrderDetail)
      ],
      [
        'describeMissingExpirationTpks',
        () =>
          describeMissingExpirationTpks(
            order as unknown as OrderDetail,
            new Date(NOW_ISO)
          )
      ]
    ] as const) {
      cases.push({
        id: `${kebab(fn)}-${name}`,
        fn,
        input:
          fn === 'describeMissingExpirationTpks'
            ? { order, now: NOW_ISO }
            : { order },
        run
      })
    }
  }

  // classifyTpk: every signal combination at the pinned clock (the precedence table of D-30).
  const expirations: [string, string | null][] = [
    ['none', null],
    ['past', '2020-01-01T00:00:00Z'],
    ['future', '2099-01-01T00:00:00Z'],
    ['at-now', NOW_ISO],
    ['unparseable', 'not a date'],
    ['non-iso-long', 'March 5, 2020']
  ]
  for (const [label, expiration] of expirations) {
    for (const present of [false, true]) {
      for (const expired of [undefined, true]) {
        for (const revealed of [false, true]) {
          for (const redeemed of [false, true]) {
            const tpk: Record<string, unknown> = {
              redeemedKeyValuePresent: present,
              expiration
            }
            if (expired !== undefined) tpk.isExpired = expired
            cases.push({
              id: `classify-tpk-exp-${label}-present-${present}-expired-${expired ?? 'absent'}-revealed-${revealed}-redeemed-${redeemed}`,
              fn: 'classifyTpk',
              input: {
                tpk,
                isLocallyRevealed: revealed,
                isLocallyRedeemed: redeemed,
                now: NOW_ISO
              },
              run: () =>
                classifyTpk(
                  tpk as Parameters<typeof classifyTpk>[0],
                  revealed,
                  redeemed,
                  new Date(NOW_ISO)
                )
            })
          }
        }
      }
    }
  }

  // The state predicates.
  const states: HumbleKeyState[] = [
    'UNPICKED',
    'UNREVEALED',
    'REVEALED',
    'REDEEMED',
    'UNREDEEMABLE'
  ]
  for (const state of states) {
    cases.push({
      id: `is-terminal-${state.toLowerCase()}`,
      fn: 'isTerminal',
      input: { state },
      run: () => isTerminal(state)
    })
    cases.push({
      id: `is-server-terminal-${state.toLowerCase()}`,
      fn: 'isServerTerminal',
      input: { state },
      run: () => isServerTerminal(state)
    })
    for (const expiration of [null, '2099-01-01T00:00:00.000Z']) {
      for (const present of [undefined, false, true]) {
        const key: {
          state: HumbleKeyState
          expiration: string | null
          revealedKeyValuePresent?: boolean
        } = {
          state,
          expiration
        }
        if (present !== undefined) key.revealedKeyValuePresent = present
        cases.push({
          id: `is-freeze-eligible-${state.toLowerCase()}-exp-${expiration === null ? 'none' : 'future'}-value-${present ?? 'absent'}`,
          fn: 'isFreezeEligible',
          input: { key },
          run: () => isFreezeEligible(key)
        })
      }
    }
  }

  // extractExpiration. A field name and a value, at the clock the classify tests use.
  const fields = [
    'expiry_date',
    'expiration_date',
    'expiration',
    'expires',
    'some_unknown_date_field'
  ]
  for (const field of fields) {
    const tpk = { [field]: '2026-08-03T00:00:00Z' }
    cases.push({
      id: `extract-expiration-field-${field.replace(/_/g, '-')}`,
      fn: 'extractExpiration',
      input: { tpk, now: TEST_FILE_NOW_ISO, tz: 'UTC' },
      run: () =>
        withTimeZone('UTC', 0, () =>
          extractExpiration(tpk, new Date(TEST_FILE_NOW_ISO))
        )
    })
  }
  const values: [string, unknown, boolean][] = [
    // [label, value, depends on the host zone]
    ['iso-z', '2026-08-03T00:00:00Z', false],
    ['iso-millis-z', '2026-08-01T12:34:56.000Z', false],
    ['iso-offset', '2026-08-01T12:34:56+05:30', false],
    ['iso-negative-offset', '2026-08-01T12:34:56-07:00', false],
    ['rfc-2822', 'Sat, 01 Aug 2026 12:34:56 GMT', false],
    ['rfc-2822-offset', 'Sat, 01 Aug 2026 12:34:56 +0200', false],
    ['date-only', '2026-08-01', true],
    ['date-only-leap-day', '2024-02-29', true],
    ['date-only-feb-30', '2026-02-30', false],
    ['date-only-month-13', '2026-13-45', false],
    ['date-only-padded', ' 2026-08-01 ', true],
    ['no-zone-time', '2026-08-01T12:34:56', true],
    ['space-time-no-zone', '2026-08-01 12:34', true],
    ['slash-date', '2026/08/01', true],
    ['us-slash-date', '08/01/2026', true],
    ['long-month', 'March 5, 2020', true],
    ['long-month-time', 'March 5, 2020 10:00:00', true],
    ['abbrev-month-time-zone', 'Mar 5 2020 10:00 UTC', false],
    ['year-only', '2026', false],
    ['year-month', '2026-08', false],
    ['two-digit-year', '8/1/26', true],
    ['not-a-date', 'not-a-date', false],
    ['empty', '', false],
    ['whitespace', '   ', false],
    ['digits-only', '1785000000', false],
    ['non-string-number', 1785000000, false],
    ['non-string-null', null, false],
    ['non-string-bool', true, false],
    ['non-string-object', { date: '2026-08-01' }, false]
  ]
  for (const [label, value, zoned] of values) {
    for (const zone of zoned ? ZONES : [ZONES[0]]) {
      const tpk = { expiry_date: value }
      cases.push({
        id: `extract-expiration-value-${label}-${zone.tz.toLowerCase().replace(/[^a-z]/g, '-')}`,
        fn: 'extractExpiration',
        input: { tpk, now: TEST_FILE_NOW_ISO, tz: zone.tz },
        run: () =>
          withTimeZone(zone.tz, zone.offsetMinutes, () =>
            extractExpiration(tpk, new Date(TEST_FILE_NOW_ISO))
          )
      })
    }
  }
  const days: [string, unknown][] = [
    ['30', 30],
    ['1', 1],
    ['0-5', 0.5],
    ['0', 0],
    ['negative', -5],
    ['overflow-1e12', 1e12],
    ['overflow-max', Number.MAX_VALUE],
    ['edge-1e8', 1e8],
    ['edge-1-0000001e8', 100000001],
    ['nan', num('NaN')],
    ['infinity', num('Infinity')],
    ['string', '30'],
    ['null', null]
  ]
  for (const [label, value] of days) {
    const tpk = { num_days_until_expired: value }
    cases.push({
      id: `extract-expiration-days-${label}`,
      fn: 'extractExpiration',
      input: { tpk, now: TEST_FILE_NOW_ISO, tz: 'UTC' },
      run: () =>
        withTimeZone('UTC', 0, () =>
          extractExpiration(
            revive(tpk) as Record<string, unknown>,
            new Date(TEST_FILE_NOW_ISO)
          )
        )
    })
  }
  // Field precedence: the first recognised field that parses wins; an unparseable first field
  // falls through to the next; the relative form is the last resort.
  const precedence: [string, Record<string, unknown>][] = [
    [
      'first-wins',
      {
        expiry_date: '2026-08-03T00:00:00Z',
        expiration: '2027-01-01T00:00:00Z'
      }
    ],
    [
      'unparseable-falls-through',
      { expiry_date: 'nope', expiration_date: '2026-09-01T00:00:00Z' }
    ],
    [
      'blank-falls-through',
      { expiry_date: '  ', expires: '2026-09-02T00:00:00Z' }
    ],
    [
      'absolute-beats-relative',
      { num_days_until_expired: 30, expiry_date: '2026-08-03T00:00:00Z' }
    ],
    [
      'relative-when-absolute-unparseable',
      { num_days_until_expired: 30, expiry_date: 'nope' }
    ]
  ]
  for (const [label, tpk] of precedence) {
    cases.push({
      id: `extract-expiration-precedence-${label}`,
      fn: 'extractExpiration',
      input: { tpk, now: TEST_FILE_NOW_ISO, tz: 'UTC' },
      run: () =>
        withTimeZone('UTC', 0, () =>
          extractExpiration(tpk, new Date(TEST_FILE_NOW_ISO))
        )
    })
  }

  // classifyOrder over the date strings V8 accepts (Pitfall 6), through a real order, so the
  // expiration reaches a state: the same order with each date.
  const dated = tpkFixtures.realWorldFutureExpiryDateOrder as unknown as Record<
    string,
    unknown
  >
  for (const [label, value, zoned] of values.filter(([l]) =>
    [
      'iso-z',
      'rfc-2822',
      'date-only',
      'long-month',
      'no-zone-time',
      'not-a-date',
      'slash-date'
    ].includes(l)
  )) {
    for (const zone of zoned ? ZONES : [ZONES[0]]) {
      const order = redactKeyValues(
        JSON.parse(
          JSON.stringify(dated).replace(
            /"expiry_date":"[^"]*"/,
            `"expiry_date":${JSON.stringify(value)}`
          )
        ) as Record<string, unknown>
      )
      cases.push({
        id: `classify-order-dated-${label}-${zone.tz.toLowerCase().replace(/[^a-z]/g, '-')}`,
        fn: 'classifyOrder',
        input: {
          order,
          revealed: { all: false },
          redeemed: { all: false },
          now: NOW_ISO,
          tz: zone.tz
        },
        run: () =>
          withTimeZone(zone.tz, zone.offsetMinutes, () =>
            classifyOrder(
              order as unknown as OrderDetail,
              () => false,
              new Date(NOW_ISO)
            )
          )
      })
    }
  }
  return cases
}

// ---------------------------------------------------------------------------------------------
// dedup cases
// ---------------------------------------------------------------------------------------------

/** What the matcher reads of a Steam library entry. */
type SteamEntry = { app_name: string; title: string }

const asGames = (entries: readonly SteamEntry[]): GameInfo[] =>
  entries.map(
    (e) =>
      ({
        runner: 'steam',
        app_name: e.app_name,
        title: e.title,
        art_cover: '',
        art_square: '',
        install: {},
        is_installed: false,
        canRunOffline: false
      }) as GameInfo
  )

const entriesOf = (games: readonly GameInfo[]): SteamEntry[] =>
  games.map((g) => ({ app_name: g.app_name, title: g.title }))

function makeKey(overrides: Partial<HumbleKey> = {}): HumbleKey {
  return {
    gamekey: 'order-1',
    machineName: 'somegame_steam',
    state: 'UNREVEALED',
    title: 'Some Game',
    platform: 'steam',
    expiration: null,
    origin: 'Some Bundle',
    ownedElsewhere: false,
    matchConfidence: 'none',
    ...overrides
  }
}

const FULL_LIBRARY = entriesOf(ownedSteamLibrary)
const VARIANTS_LIBRARY: SteamEntry[] = [
  { app_name: '1', title: 'Portal 2 Remastered' },
  { app_name: '2', title: 'Hades II DLC' },
  { app_name: '3', title: 'Pokémon Café' },
  { app_name: '4', title: '日本語のタイトル' },
  {
    app_name: '5',
    title: 'The Witcher 3: Wild Hunt - Game of the Year Edition'
  },
  { app_name: '6', title: 'DOOM™' },
  { app_name: '7', title: 'Remake Tactics' }
]
const LIBRARIES: [string, SteamEntry[]][] = [
  ['full', FULL_LIBRARY],
  ['empty', []],
  ['game-x-only', entriesOf([steamOwnedGameX])],
  ['batman-only', entriesOf([steamOwnedBatmanArkhamKnight])],
  ['variants', VARIANTS_LIBRARY]
]

function dedupCases(): OracleCase[] {
  const cases: OracleCase[] = []
  const add = (
    id: string,
    keys: HumbleKey[],
    library: SteamEntry[],
    overridden: string[] = []
  ): void => {
    const input = { keys, steamGames: library, overridden }
    cases.push({
      id: `dedup-${id}`,
      fn: 'recomputeOwnership',
      input,
      run: () =>
        recomputeOwnership(
          structuredClone(keys),
          asGames(library),
          (machineName) => overridden.includes(machineName)
        )
    })
  }

  // The classifier's own rows, for every fixture order, against the full library.
  for (const [name, order] of ORDER_FIXTURES) {
    const { keys } = classifyOrder(
      order as unknown as OrderDetail,
      () => false,
      new Date(NOW_ISO)
    )
    if (keys.length === 0) continue
    add(`fixture-${name}-full`, keys, FULL_LIBRARY)
  }

  // The tiers, from the dedup tests' shapes.
  add(
    'appid-exact',
    [makeKey({ steamAppId: '620', title: 'Portal 2' })],
    FULL_LIBRARY
  )
  add(
    'appid-miss-no-fuzzy-fallback',
    [makeKey({ steamAppId: '999999', title: 'Portal 2' })],
    FULL_LIBRARY
  )
  add(
    'appid-empty-string-falls-through',
    [makeKey({ steamAppId: '', title: 'Portal 2' })],
    FULL_LIBRARY
  )
  add(
    'appid-zero-string-falls-through',
    [makeKey({ steamAppId: '0', title: 'Portal 2' })],
    FULL_LIBRARY
  )
  add(
    'appid-resolved-hit-is-exact',
    [
      makeKey({
        steamAppId: '620',
        steamAppIdResolved: true,
        title: 'Anything'
      })
    ],
    FULL_LIBRARY
  )
  add(
    'appid-resolved-miss-falls-to-fuzzy',
    [
      makeKey({
        steamAppId: '999999',
        steamAppIdResolved: true,
        title: 'Portal 2'
      })
    ],
    FULL_LIBRARY
  )
  add(
    'appid-resolved-miss-no-fuzzy-match',
    [
      makeKey({
        steamAppId: '999999',
        steamAppIdResolved: true,
        title: 'Nothing Like It'
      })
    ],
    FULL_LIBRARY
  )
  for (const title of [
    'Assault Android Cactus+',
    'FRAMED Collection',
    'Into the Breach',
    'Stardew Valley',
    'Totally Different'
  ]) {
    add(`fuzzy-${kebab(title)}`, [makeKey({ title })], FULL_LIBRARY)
  }
  add(
    'fuzzy-gog-platform',
    [makeKey({ platform: 'gog', title: 'Stardew Valley' })],
    FULL_LIBRARY
  )
  add(
    'dlc-guard-season-pass',
    [makeKey({ title: 'Game X: Season Pass' })],
    FULL_LIBRARY
  )
  add('substring-is-not-a-match', [makeKey({ title: 'Batman' })], FULL_LIBRARY)
  add('remaster-guard', [makeKey({ title: 'Portal 2' })], VARIANTS_LIBRARY)
  add(
    'remaster-both-carry-keyword',
    [makeKey({ title: 'Portal 2 Remastered' })],
    VARIANTS_LIBRARY
  )
  add(
    'dlc-both-carry-keyword',
    [makeKey({ title: 'Hades II DLC' })],
    VARIANTS_LIBRARY
  )
  add(
    'non-ascii-accent',
    [makeKey({ title: 'Pokemon Cafe' })],
    VARIANTS_LIBRARY
  )
  add(
    'non-ascii-normalises-away',
    [makeKey({ title: '日本語のタイトル' })],
    VARIANTS_LIBRARY
  )
  add('trademark-symbol', [makeKey({ title: 'DOOM' })], VARIANTS_LIBRARY)
  add(
    'edition-suffix',
    [makeKey({ title: 'The Witcher 3 Wild Hunt' })],
    VARIANTS_LIBRARY
  )
  add(
    'override-clears-fuzzy',
    [makeKey({ title: 'Stardew Valley', machineName: 'stardew_steam' })],
    FULL_LIBRARY,
    ['stardew_steam']
  )
  add(
    'override-cannot-clear-exact',
    [makeKey({ steamAppId: '620', machineName: 'portal_steam' })],
    FULL_LIBRARY,
    ['portal_steam']
  )
  add(
    'override-other-machine-ignored',
    [makeKey({ title: 'Stardew Valley', machineName: 'stardew_steam' })],
    FULL_LIBRARY,
    ['other_steam']
  )
  add(
    'unpicked-is-excluded',
    [makeKey({ state: 'UNPICKED', title: 'Portal 2' })],
    FULL_LIBRARY
  )
  add(
    'empty-library-returns-keys-unchanged',
    [
      makeKey({
        title: 'Portal 2',
        ownedElsewhere: true,
        matchConfidence: 'exact'
      })
    ],
    []
  )
  add(
    'keeps-stale-flags-when-recomputed-to-none',
    [
      makeKey({
        title: 'Totally Different',
        ownedElsewhere: true,
        matchConfidence: 'fuzzy'
      })
    ],
    FULL_LIBRARY
  )
  add('no-keys', [], FULL_LIBRARY)
  add(
    'mixed-batch',
    [
      makeKey({ machineName: 'a', steamAppId: '620', title: 'Portal 2' }),
      makeKey({ machineName: 'b', title: 'Into the Breach' }),
      makeKey({ machineName: 'c', title: 'Unrelated' }),
      makeKey({ machineName: 'd', state: 'UNPICKED', title: 'Game X' }),
      makeKey({ machineName: 'e', title: 'Game X' })
    ],
    FULL_LIBRARY,
    ['b']
  )
  for (const [label, library] of LIBRARIES) {
    add(
      `library-${label}-portal`,
      [
        makeKey({ title: 'Portal 2' }),
        makeKey({ machineName: 'x', title: 'Batman Arkham Knight' })
      ],
      library
    )
  }
  return cases
}

// ---------------------------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------------------------

const CLASSIFY_FLOOR = 450
const DEDUP_FLOOR = 60

describe('Humble pure-logic oracle: classify', () => {
  const cases = classifyCases()

  it.each(cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    writeOrCompareGolden('classify', c.id, {
      fn: c.fn,
      input: c.input,
      output: record(c.run)
    })
  })

  it('covers every tpks fixture, with the version and the vacuous-pass guards', () => {
    expect(ORDER_FIXTURES.length).toBeGreaterThanOrEqual(30)
    for (const [name] of ORDER_FIXTURES) {
      expect(cases.some((c) => c.id === `classify-order-${name}-plain`)).toBe(
        true
      )
    }
    const ids = cases.map((c) => c.id)
    syncManifest('classify', ids, CLASSIFY_FLOOR, {
      classifierVersion: HUMBLE_CLASSIFIER_VERSION
    })
    const manifest = assertManifest('classify', ids, CLASSIFY_FLOOR)
    if (manifest)
      expect(manifest.classifierVersion).toBe(HUMBLE_CLASSIFIER_VERSION)
    expect(HUMBLE_CLASSIFIER_VERSION).toBe(7)
  })

  it('an empty case list fails the floor', () => {
    expectEmptyCasesToFail('classify', CLASSIFY_FLOOR)
  })

  it('every classifyOrder and describe golden carries only REDACTED key values', () => {
    for (const c of cases) {
      const text = JSON.stringify(c.input)
      expect(text).not.toMatch(/"redeemed_key_val(?:ue)?":"(?!REDACTED")[^"]+"/)
    }
  })

  it('the time-zone switch is real: a date-only value moves with the zone', () => {
    const zoned = ZONES.map((z) =>
      withTimeZone(z.tz, z.offsetMinutes, () =>
        extractExpiration(
          { expiry_date: '2026-08-01' },
          new Date(TEST_FILE_NOW_ISO)
        )
      )
    )
    expect(new Set(zoned).size).toBe(3)
  })
})

describe('Humble pure-logic oracle: dedup', () => {
  const cases = dedupCases()

  it.each(cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    writeOrCompareGolden('dedup', c.id, {
      fn: c.fn,
      input: c.input,
      output: record(c.run)
    })
  })

  it('has the vacuous-pass guards', () => {
    const ids = cases.map((c) => c.id)
    syncManifest('dedup', ids, DEDUP_FLOOR)
    assertManifest('dedup', ids, DEDUP_FLOOR)
  })

  it('an empty case list fails the floor', () => {
    expectEmptyCasesToFail('dedup', DEDUP_FLOOR)
  })

  it('the tiers disagree where the TS says they do (a sanity read of the recording)', () => {
    const exact = recomputeOwnership(
      [makeKey({ steamAppId: '620' })],
      ownedSteamLibrary,
      () => false
    )
    expect(exact[0]?.matchConfidence).toBe('exact')
    const miss = recomputeOwnership(
      [makeKey({ steamAppId: '999999', title: 'Portal 2' })],
      ownedSteamLibrary,
      () => false
    )
    expect(miss[0]?.matchConfidence).toBe('none')
  })
})
