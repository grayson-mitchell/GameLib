import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Phase 49 Plan 10 (R7, T-49-29): the Manage Accounts tiles and the Library
 * sign-in notice are the two places a user reads sign-in state, and R7 says
 * they must never disagree. The control is that BOTH call the one selector
 * with the SAME inputs:
 *
 *   resolveSignInStates(collectSignInInputs({ <six source fields> }, outcomes))
 *
 * This is a SOURCE gate because it has to be: every jest project here is
 * `testEnvironment: 'node'` (no jsdom), so neither component can be rendered
 * and the invariant can only be read out of the text. Same technique, and the
 * same two recorded failure modes, as `connectedStoresParity.test.ts`:
 *
 *   - a matching PAIR of expressions can still diverge when one site adds a
 *     filter the text compare cannot see (quick/260924-g7r). That is why the
 *     function is pinned BY NAME (`resolveSignInStates`, `collectSignInInputs`
 *     imported from their canonical modules) and why a flag comparison written
 *     inline in either file is forbidden outright, not merely compared;
 *   - a comment claiming parity is what shipped the Amazon defect. Comments are
 *     stripped before matching, so prose can neither satisfy nor trip a gate.
 *
 * Every gate carries a RED specimen: a copy of the real source with one
 * property broken, run through the SAME checker, which must convict it.
 */

const LOGIN_INDEX = join(__dirname, '..', '..', 'Login', 'index.tsx')
const NOTICE_INDEX = join(
  __dirname,
  '..',
  'components',
  'LibrarySignInNotice',
  'index.tsx'
)

/** The six fields `collectSignInInputs` takes from the renderer's context. */
const SOURCE_FIELDS = [
  'epicUsername',
  'gogUsername',
  'amazonUserId',
  'humbleLoggedIn',
  'humbleExpired',
  'steamUsername'
]

/** Removes `//` and block comments so a gate can never match prose. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * The text of the balanced `{ ... }` that starts at `open` (which must index a
 * `{`), without the outer braces. Strings in this region contain no braces.
 */
function balancedObject(code: string, open: number): string {
  let depth = 0
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++
    if (code[i] === '}') {
      depth--
      if (depth === 0) return code.slice(open + 1, i)
    }
  }
  throw new Error('SETUP FAILED: unbalanced object literal')
}

/** Splits at commas that are not nested inside (), [] or {}. */
function topLevelSplit(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === '(' || ch === '[' || ch === '{') depth++
    if (ch === ')' || ch === ']' || ch === '}') depth--
    if (ch === ',' && depth === 0) {
      parts.push(body.slice(start, i))
      start = i + 1
    }
  }
  parts.push(body.slice(start))
  return parts.filter((part) => part.trim() !== '')
}

const normalise = (text: string): string => text.replace(/\s+/g, '')

interface SelectorCall {
  /** Whitespace-normalised `key:expression` pairs, in source order. */
  pairs: string[]
  /** Whitespace-normalised text right after the object literal. */
  trailing: string
}

/** Every `resolveSignInStates(collectSignInInputs({...}, ...))` call. */
function readSelectorCalls(source: string): SelectorCall[] {
  const code = stripComments(source)
  const pattern = /resolveSignInStates\(\s*collectSignInInputs\(\s*\{/g
  const calls: SelectorCall[] = []
  let match = pattern.exec(code)
  while (match !== null) {
    const open = match.index + match[0].length - 1
    const body = balancedObject(code, open)
    calls.push({
      pairs: topLevelSplit(body).map(normalise),
      trailing: normalise(
        code.slice(open + body.length + 2, open + body.length + 62)
      )
    })
    match = pattern.exec(code)
  }
  return calls
}

/** A flag comparison written inline instead of read through the selector. */
const LEGACY_HELPER = ['is', 'Steam', 'Connected'].join('')
const FORBIDDEN: Array<[string, RegExp]> = [
  ['inline expired read', /get_nodefault\(\s*['"]expired['"]\s*\)/],
  [
    'inline credentialsMissing read',
    /get_nodefault\(\s*['"]credentialsMissing['"]\s*\)/
  ],
  ['Steam-only helper', new RegExp(LEGACY_HELPER)],
  ['inline .expired &&', /\.expired\s*&&/],
  ['inline !x.expired', /!\s*\w+\??\.expired\b/]
]

function forbiddenHits(source: string): string[] {
  const code = stripComments(source)
  return FORBIDDEN.filter(([, pattern]) => pattern.test(code)).map(
    ([name]) => name
  )
}

function importsByName(source: string, name: string, from: string): boolean {
  const code = stripComments(source)
  const pattern = new RegExp(
    `import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'${from}'`
  )
  return pattern.test(code)
}

/**
 * Everything the gate asserts about one file, as a list of violation strings:
 * empty means the file is wired to the shared selector correctly.
 */
function wiringViolations(source: string): string[] {
  const violations: string[] = []
  if (!importsByName(source, 'resolveSignInStates', 'common/signInState')) {
    violations.push(
      'resolveSignInStates is not imported from common/signInState'
    )
  }
  if (
    !importsByName(
      source,
      'collectSignInInputs',
      'frontend/helpers/signInInputs'
    )
  ) {
    violations.push(
      'collectSignInInputs is not imported from frontend/helpers/signInInputs'
    )
  }
  const calls = readSelectorCalls(source)
  if (calls.length === 0) {
    violations.push('no resolveSignInStates(collectSignInInputs( call')
  }
  for (const call of calls) {
    const keys = call.pairs.map((pair) => pair.split(':')[0]).sort()
    if (JSON.stringify(keys) !== JSON.stringify([...SOURCE_FIELDS].sort())) {
      violations.push(`source fields are ${keys.join(',')}`)
    }
    if (!call.trailing.startsWith(',signInProbeOutcomes)')) {
      violations.push('outcomes argument is not signInProbeOutcomes')
    }
  }
  for (const hit of forbiddenHits(source)) {
    violations.push(`forbidden: ${hit}`)
  }
  return violations
}

/** The distinct pair sets across all of a file's selector calls. */
function pairSets(source: string): string[] {
  const sets = readSelectorCalls(source).map((call) =>
    [...call.pairs].sort().join('|')
  )
  return Array.from(new Set(sets))
}

describe('Manage Accounts tiles and the Library notice share one selector (R7, T-49-29)', () => {
  const login = readFileSync(LOGIN_INDEX, 'utf-8')
  const notice = readFileSync(NOTICE_INDEX, 'utf-8')

  it('parses six source fields from the notice and from every Login call -- the comparison is not empty-vs-empty', () => {
    // Without this, a parser that finds nothing in both files would make the
    // equality below pass trivially. Non-vacuity first.
    expect(SOURCE_FIELDS).toHaveLength(6)
    const noticeCalls = readSelectorCalls(notice)
    expect(noticeCalls).toHaveLength(1)
    expect(noticeCalls[0].pairs).toHaveLength(6)
    const loginCalls = readSelectorCalls(login)
    expect(loginCalls.length).toBeGreaterThanOrEqual(1)
    for (const call of loginCalls) {
      expect(call.pairs).toHaveLength(6)
    }
  })

  it('each file imports both functions from their canonical modules and calls the pair with the six fields', () => {
    expect(wiringViolations(login)).toEqual([])
    expect(wiringViolations(notice)).toEqual([])
  })

  it('both files pass the identical set of key: expression pairs', () => {
    const loginSets = pairSets(login)
    const noticeSets = pairSets(notice)
    // Login seeds the useState initialiser and refreshes in its effect with
    // the same literal, so it may repeat a call -- but never with a different
    // expression set.
    expect(loginSets).toHaveLength(1)
    expect(noticeSets).toHaveLength(1)
    expect(loginSets).toEqual(noticeSets)
  })

  it('neither file re-inlines a flag comparison or keeps the Steam-only helper', () => {
    expect(forbiddenHits(login)).toEqual([])
    expect(forbiddenHits(notice)).toEqual([])
  })

  describe('the checker convicts broken sources (red-proof)', () => {
    it('a notice with steamUsername dropped fails the field-set and the parity compare', () => {
      const specimen = notice.replace(
        /\n\s*steamUsername: steam\?\.username/,
        ''
      )
      expect(specimen).not.toBe(notice)
      expect(wiringViolations(specimen)).not.toEqual([])
      expect(readSelectorCalls(specimen)[0].pairs).toHaveLength(5)
      expect(pairSets(specimen)).not.toEqual(pairSets(login))
    })

    it('a notice whose expression diverges from the tile (amazon.username) fails the parity compare', () => {
      const specimen = notice.replace('amazon.user_id', 'amazon.username')
      expect(specimen).not.toBe(notice)
      // Still a well-formed call, so the wiring check alone would pass it: only
      // the pair-set compare against the tile can see this divergence.
      expect(wiringViolations(specimen)).toEqual([])
      expect(pairSets(specimen)).not.toEqual(pairSets(login))
    })

    it('a notice with an inline credentialsMissing read fails', () => {
      const specimen = `${notice}\nconst leak = steamConfigStore.get_nodefault('credentialsMissing')\n`
      expect(wiringViolations(specimen)).toContain(
        'forbidden: inline credentialsMissing read'
      )
    })

    it('a Login with an inline expired comparison fails', () => {
      const specimen = `${login}\nconst tileExpired = humble?.isLoggedIn && !humble?.expired\n`
      expect(forbiddenHits(specimen)).toEqual(
        expect.arrayContaining(['inline !x.expired'])
      )
    })

    it('a Login that reintroduces the Steam-only helper fails', () => {
      const specimen = `${login}\nconst legacy = ${LEGACY_HELPER}(steam?.username, false)\n`
      expect(forbiddenHits(specimen)).toContain('Steam-only helper')
    })

    it('a Login that no longer imports the selector fails', () => {
      const specimen = login.replace(
        "import { resolveSignInStates } from 'common/signInState'",
        ''
      )
      expect(specimen).not.toBe(login)
      expect(wiringViolations(specimen)).toContain(
        'resolveSignInStates is not imported from common/signInState'
      )
    })

    it('prose in a comment can neither satisfy nor trip a gate', () => {
      const prose = `// resolveSignInStates(collectSignInInputs({ x: 1 }, signInProbeOutcomes))\n// get_nodefault('expired') ${LEGACY_HELPER}\n`
      expect(readSelectorCalls(prose)).toEqual([])
      expect(forbiddenHits(`${login}\n${prose}`)).toEqual([])
    })
  })
})
