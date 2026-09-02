/**
 * Static zero-match completeness gate for the `getLoginWindowSeam()` dead-seam predicate
 * collapse (Phase 39 Plans 02-06, REQ-39-03).
 *
 * WHY THIS GATE IS LOAD-BEARING, AND WHY IT IS KEYED ON THE PREDICATE, NOT ON A FILE LIST:
 * WR-01's own original census named 7 sites by reading 6 files it happened to open. Re-deriving
 * from the PREDICATE itself (every `seam === null`/`!== null`/`!seam`/ternary form, across the
 * whole tree) found 12 production sites, not 7 -- and a 13th, inside a nested closure sharing an
 * outer site's local, that RESEARCH.md's own 12-site table still missed (see
 * `39-SEAM-DISPOSITIONS.md`). A gate keyed on "the 6 files WR-01 read" would have missed the same
 * 6 additional sites the original census did. This gate is keyed on the predicate family across
 * two whole directories instead, so a future reintroduction cannot hide by landing in a file
 * nobody thought to check.
 *
 * SCOPE -- exactly two directories plus one single file, and why:
 * `src/backend/humble` and `src/backend/storeManagers` are swept in full. `src/backend/sidecar`
 * is DELIBERATELY NOT swept as a whole directory: it is where
 * `src/backend/sidecar/humbleLoginFlowRegistration.ts:457` lives --
 *   `const seam = getLoginWindowSeam(); if (!seam) { smokeLog('no seam installed — aborting ' +
 *   '(this is a FAIL, not a skip)', ...) }`
 * -- a defensive null-check inside a block gated by `process.env.GAMELIB_LOGIN_SEAM_SMOKE === '1'`
 * (a diagnostic smoke-test harness, not a dual-build discriminator). It was FOUND, CONSIDERED and
 * DELIBERATELY KEPT during this phase's collapse (see `39-SEAM-DISPOSITIONS.md` for the full
 * reasoning) -- sweeping `src/backend/sidecar` as a whole would make this gate permanently red
 * against code the phase chose to keep, and the "fix" available to a future editor under
 * pressure would be to weaken the pattern, not to re-read the guard's own comment. Widening this
 * scope to include that directory is therefore NOT a safe drive-by change.
 *
 * Plan 39-02 collapsed a DIFFERENT file inside that same directory --
 * `src/backend/sidecar/oauthLoginCapture.ts:195` -- which would otherwise have zero gate coverage
 * at all if the directory sweep is correctly excluded. `OAUTH_LOGIN_CAPTURE_FILE` below is a
 * single-file assertion covering exactly that one file, narrow enough that
 * `humbleLoginFlowRegistration.ts` is never touched by it.
 *
 * RELATIONSHIP TO `seamBranchParity.test.ts` (stated explicitly, not left implicit):
 * `src/backend/sidecar/__tests__/seamBranchParity.test.ts` guards a NARROWER, DEEPER invariant --
 * that the two specific `disconnect()`/`logout()` sites have not regrown a dual-branch
 * `if (seam === null) { ... } else { ... }` *wipeSteps* SHAPE, by parsing each function body and
 * comparing the surviving wipe-step categories against a fixed historical reference. THIS gate
 * guards a WIDER, SHALLOWER invariant -- that the raw predicate TEXT (any of its forms, at any
 * call site, in any function) does not survive anywhere under either scoped root, independent of
 * whether that site ever had a `wipeSteps` array at all. The two gates overlap only at the two
 * `wipeSteps` sites; neither is redundant with the other -- `seamBranchParity` would not notice a
 * reintroduced `if (seam === null)` guard at, say, `getLiveCsrfToken()` (no `wipeSteps` involved),
 * and this gate would not notice a `wipeSteps` array that quietly dropped a capability without
 * ever writing a null-check (a defect `seamBranchParity`'s category-parity check is built to
 * catch). They are complementary, not duplicate.
 *
 * RED BASELINE THIS WAS PROVEN AGAINST (`ed1fdf71d`, full per-pattern per-file table in
 * `39-SEAM-DISPOSITIONS.md`): the strict-equality forms (`===`/`!==`) matched 5x/5x in
 * `humble/user.ts`, 2x/1x in `storeManagers/legendary/user.ts`, and 1x in
 * `sidecar/oauthLoginCapture.ts`; the direct-call form matched once in `humble/library.ts`. Loose
 * equality (`==`/`!=`), bare negation (`!seam`) and same-line ternary/optional-chaining forms had
 * ZERO real occurrences anywhere in this codebase's history (matching RESEARCH.md's own finding)
 * -- their capability to match is instead proven by the synthetic checks in this file's own
 * "predicate pattern capability" describe below, and by the mutation-testing protocol recorded in
 * `39-07-SUMMARY.md` (a real `if (seam === null) { ... }` injected into a real file, caught, then
 * reverted).
 *
 * COMMENT-NOISE FALSE POSITIVE (discovered building this gate, filtered deliberately):
 * The equality-family pattern matches THREE lines in the current tree, all inside comments
 * documenting the collapse itself (e.g. `// \`if (seam === null)\` Electron branch Task 1 removed
 * from disconnect().`), never inside live code. `isCommentOnlyMention` below excludes any grep hit
 * whose trimmed line content starts with `//`, `*` or `/*` before the zero-match assertion is
 * evaluated, so the gate is not permanently red because of its own removal's documentation.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const REPO_ROOT = join(__dirname, '..', '..')
const HUMBLE_ROOT = join(REPO_ROOT, 'src/backend/humble')
const STORE_MANAGERS_ROOT = join(REPO_ROOT, 'src/backend/storeManagers')
const OAUTH_LOGIN_CAPTURE_FILE = join(
  REPO_ROOT,
  'src/backend/sidecar/oauthLoginCapture.ts'
)

interface PredicatePattern {
  name: string
  /** Extended regex (grep -E / BRE-compatible character classes, no lookaround). */
  regex: string
}

// Keyed on the PREDICATE, not on any single token -- see file header. `[A-Za-z_]*[Ss]eam` matches
// case-insensitively on the leading character so `seam`, `Seam`, `activeSeam`, `loginSeam` are all
// covered, per this plan's own predicate-family spec.
const PREDICATE_PATTERNS: PredicatePattern[] = [
  {
    name: 'equality-null-check (===, !==, ==, != -- all four operators, one regex)',
    regex: '[A-Za-z_]*[Ss]eam[[:space:]]*[!=]=[=]?[[:space:]]*null'
  },
  {
    name: 'bare negation (!seam, !activeSeam)',
    regex: '![A-Za-z_]*[Ss]eam\\b'
  },
  {
    name: 'direct-call comparison (getLoginWindowSeam() === / !== null)',
    regex: 'getLoginWindowSeam\\(\\)[[:space:]]*[!=]==[[:space:]]*null'
  },
  {
    name: 'same-line ternary / optional-chaining on the identifier (seam?.x, seam ? x : y), excluding the seam?: type-annotation position',
    regex: '[A-Za-z_]*[Ss]eam[[:space:]]*\\?[^:]'
  }
]

interface GrepMatch {
  file: string
  line: number
  content: string
}

function parseGrepStdout(stdout: string): GrepMatch[] {
  return stdout
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const firstColon = line.indexOf(':')
      const secondColon = line.indexOf(':', firstColon + 1)
      return {
        file: line.slice(0, firstColon),
        line: Number(line.slice(firstColon + 1, secondColon)),
        content: line.slice(secondColon + 1)
      }
    })
}

/**
 * A grep hit is a comment-only MENTION of the predicate (documenting a past removal), not a live
 * predicate, if its trimmed content opens with a line-comment or block-comment-continuation
 * marker. This is the filter `39-SEAM-DISPOSITIONS.md` section 1c documents finding necessary.
 */
function isCommentOnlyMention(content: string): boolean {
  const trimmed = content.trim()
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*')
  )
}

function realMatches(matches: GrepMatch[]): GrepMatch[] {
  return matches.filter((m) => !isCommentOnlyMention(m.content))
}

function runGrep(
  regex: string,
  targets: string[]
): { status: number | null; matches: GrepMatch[] } {
  const result = spawnSync(
    'grep',
    ['-rnE', regex, ...targets, '--include=*.ts', '--include=*.tsx'],
    { encoding: 'utf8' }
  )
  return { status: result.status, matches: parseGrepStdout(result.stdout ?? '') }
}

function sweepForOffenders(targets: string[]): string[] {
  const offenders: string[] = []
  for (const { name, regex } of PREDICATE_PATTERNS) {
    const { matches } = runGrep(regex, targets)
    for (const m of realMatches(matches)) {
      offenders.push(`[${name}] ${m.file}:${m.line}: ${m.content.trim()}`)
    }
  }
  return offenders
}

describe('REQ-39-03: getLoginWindowSeam() predicate-family static zero-match completeness gate', () => {
  describe.each([
    ['src/backend/humble', HUMBLE_ROOT],
    ['src/backend/storeManagers', STORE_MANAGERS_ROOT]
  ])('scoped root: %s', (rootLabel, rootPath) => {
    it(`has zero surviving getLoginWindowSeam() predicate matches (every form in the family, unioned) under ${rootLabel}`, () => {
      const offenders = sweepForOffenders([rootPath])
      if (offenders.length > 0) {
        throw new Error(
          `getLoginWindowSeam() predicate survives under ${rootLabel} -- expected zero matches ` +
            `across every form in the predicate family, got:\n${offenders.join('\n')}`
        )
      }
      expect(offenders).toEqual([])
    })

    it(`vacuity control: "getLoginWindowSeam" (a token that MUST survive, via getLoginWindowSeamOrThrow) is still found under ${rootLabel}`, () => {
      // Without a control for EACH root separately, a broken path for the SECOND root would
      // report "zero matches" for the wrong reason (grep walking nothing) and this gate would
      // stay permanently, silently green for that root's half of the sweep.
      const result = spawnSync(
        'grep',
        [
          '-rn',
          'getLoginWindowSeam',
          rootPath,
          '--include=*.ts',
          '--include=*.tsx'
        ],
        { encoding: 'utf8' }
      )
      expect(result.status).toBe(0)
      expect(result.stdout.trim().length).toBeGreaterThan(0)
    })
  })

  it(
    'src/backend/sidecar/oauthLoginCapture.ts (OUTSIDE both scoped roots) has zero surviving ' +
      'predicate matches -- a deliberately narrow single-file assertion, NOT a widened sweep of ' +
      'src/backend/sidecar (see file header: humbleLoginFlowRegistration.ts:457 keeps a ' +
      'deliberate !seam guard in that same directory and must never be swept)',
    () => {
      const offenders = sweepForOffenders([OAUTH_LOGIN_CAPTURE_FILE])
      if (offenders.length > 0) {
        throw new Error(
          `getLoginWindowSeam() predicate survives in oauthLoginCapture.ts -- expected zero, ` +
            `got:\n${offenders.join('\n')}`
        )
      }
      expect(offenders).toEqual([])
    }
  )

  describe('internal helper: comment-mention filter (proves the filter neither over- nor under-excludes)', () => {
    it('does NOT filter a real code line -- a live predicate must still be reported', () => {
      expect(isCommentOnlyMention('  if (seam === null) {')).toBe(false)
      expect(isCommentOnlyMention('const x = seam === null')).toBe(false)
    })

    it('filters a line-comment mention of a removed predicate', () => {
      expect(
        isCommentOnlyMention(
          "  // `if (seam === null)` Electron branch Task 1 removed from disconnect()."
        )
      ).toBe(true)
    })

    it('filters a block-comment continuation-line mention of a removed predicate', () => {
      expect(
        isCommentOnlyMention(
          " * Phase 39 Plan 04 Task 1 collapsed logout()'s `if (seam === null) { ...5-step"
        )
      ).toBe(true)
    })
  })

  describe('predicate pattern capability (synthetic proof for forms with zero real-world occurrences -- see 39-SEAM-DISPOSITIONS.md section 1b)', () => {
    it('the equality-family regex matches ALL FOUR operator variants, not just the two actually used in history', () => {
      for (const line of [
        'if (seam === null)',
        'if (seam !== null)',
        'if (seam == null)',
        'if (seam != null)',
        'if (activeSeam === null)'
      ]) {
        expect(
          new RegExp(PREDICATE_PATTERNS[0].regex.replace(/\[\[:space:\]\]/g, '\\s')).test(
            line
          )
        ).toBe(true)
      }
    })

    it('the bare-negation regex matches !seam and !activeSeam-style identifiers', () => {
      const re = new RegExp(PREDICATE_PATTERNS[1].regex)
      expect(re.test('if (!seam) {')).toBe(true)
      expect(re.test('if (!activeSeam) {')).toBe(true)
    })

    it('the ternary/optional-chaining regex matches same-line forms but NOT the seam?: type-annotation position', () => {
      const re = new RegExp(PREDICATE_PATTERNS[3].regex.replace(/\[\[:space:\]\]/g, '\\s'))
      expect(re.test('seam ? seamLabel : null')).toBe(true)
      expect(re.test('seam?.close()')).toBe(true)
      expect(re.test('function f(seam?: LoginWindowSeam) {}')).toBe(false)
    })
  })
})
