/**
 * Quick task 260913-arr, item 6 -- the enforceable half of CLAUDE.md's
 * two-profile rule ("Fake-HOME isolation for direct binary runs").
 *
 * D2 drew the line this file sits on: gate the IN-REPO spawn sites, because a
 * test can actually observe those, and state the ad-hoc/scratchpad half as a
 * rule that admits it rests on discipline. Extending this gate to cover a
 * command typed into a scratchpad was explicitly REJECTED -- nothing can
 * observe that, and a gate which appeared to cover it would be the
 * green-check-proving-nothing pattern this project keeps stamping out. So the
 * scope here is deliberately narrower than the convention, and the convention
 * says so in its own text.
 *
 * What it forbids: any file under `src/` or `meta/` that spawns a child
 * process AND hand-rolls its own home/config/state env block, instead of
 * going through `createFakeHomeProfile()`. That shape is what leaked real GOG
 * session data to disk twice (260912-e6k, 260913-901), and what left the four
 * converted call sites setting only four of the eight variables.
 *
 * Every match runs against COMMENT-STRIPPED source, following the established
 * repo-source-gate idiom (`quitTeardownWiring.test.ts`,
 * `tauriShellSource.test.ts`). Matching raw source is the recorded failure
 * mode here: a gate is satisfied by the prose that names it, and a raw grep
 * counts the very docstring that explains the rule. The ONE deliberate
 * exception is the exemption-anchor assertion below, whose target IS a
 * comment -- stripping there would make it trivially vacuous instead.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { FAKE_HOME_ENV_KEYS } from '../testUtils/fakeHomeProfile'
import { stripSourceComments } from '../testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..')
const SCAN_ROOTS = ['src', 'meta']
const PRUNED_DIRS = new Set([
  'node_modules',
  'build',
  'dist',
  '.git',
  'coverage'
])
const SCANNED_EXT = /\.(ts|tsx|cjs|js)$/

/**
 * Anti-vacuity floor. Measured at implementation time: 1204 files across
 * `src/` and `meta/`. Set near half that, the same reasoning
 * `meta/lintScoped.cjs`'s `SRC_MIN_FILES`/`TESTS_MIN_FILES` floors use -- a
 * rename, a bad prune, or a broken walk that hollows this gate must turn it
 * RED rather than passing by scanning nothing.
 */
const MIN_FILES_SCANNED = 600

/** The helper itself must be among the scanned set, or the walk missed its own subject. */
const HELPER_REL_PATH = 'src/backend/testUtils/fakeHomeProfile.ts'

/**
 * Files permitted to assign the eight variables.
 *
 * Kept deliberately tiny. Both entries are reasoned, not convenience:
 *  - the helper IS the one place that must assign them; that is its whole job;
 *  - `jest.setupContainment.ts` assigns `process.env.<KEY> = ...` for the JEST
 *    PROCESS ITSELF, a different shape and a different purpose from building a
 *    child's env. It does not currently match the rule below at all (it never
 *    writes them as object-literal properties), so this entry documents intent
 *    rather than suppressing a live hit. Neither entry currently suppresses a
 *    live hit at all (quick 260926-c07 finding 3): neither file contains a
 *    spawn-family call, so this list's skip semantics are not exercised
 *    today either -- it is here for when one of them grows one.
 */
const ALLOWED_TO_ASSIGN: readonly string[] = [
  HELPER_REL_PATH,
  'src/backend/jest.setupContainment.ts'
]

/**
 * The reasoned exemption table -- designed in from the start, NOT patched on
 * after the gate fired at something. CLAUDE.md's own todo-triage rule states
 * the principle this follows: never widen a gate's vocabulary to admit the
 * value that failed.
 *
 * `reason` is prose naming the REASON, never just the filename. `anchor` is a
 * distinctive phrase read out of the exempt file's own header, so the
 * machine-readable exemption and the human-readable comment cannot drift
 * apart. Both anchors below were copied from the file on disk and verified to
 * sit entirely on ONE line -- an anchor that spans a comment's line wrap greps
 * zero, and an anchor retyped from a display copy silently no-ops.
 *
 * IMPORTANT, corrected by quick 260926-c07: an entry here is an exemption from
 * the CONVENTION (this file must inherit the operator's real, populated
 * profile), NOT an exemption from THIS DETECTOR. The detector flags a
 * hand-rolled home/config/state env block on a spawn call; an exempt file
 * that carried one would violate the very reason it is listed here for. So
 * exempt files are still scanned below -- this table used to also be
 * consulted as a skip list, which was dead on every OS (the exempt file below
 * passes no `env` key at all, so skipping it suppressed nothing) and, on
 * macOS/Linux, hid the exact regression its own header warns against: adding
 * an `env` key there would have stayed invisible to the enforcing test.
 */
interface Exemption {
  readonly file: string
  readonly reason: string
  readonly anchors: readonly string[]
}

const EXEMPTIONS: readonly Exemption[] = [
  {
    file: 'meta/sidecarStartupSmoke.cjs',
    reason:
      'Must inherit the operator real, populated profile: profile-dependent ' +
      'startup hangs cannot arm under an empty one. The major, PR-blocking ' +
      'defect 260913-901 fixed was an un-unref()-ed GOG presence interval ' +
      'created only behind a logged-in check, so isolating this gate would ' +
      'have made it permanently green against it.',
    anchors: [
      'DELIBERATELY EXEMPT from the fake-HOME two-profile rule',
      'reachable only behind `GOGUser.isLoggedIn()`'
    ]
  }
]

/** Spawn-family call sites. A file with none of these cannot leak a profile to a child. */
const SPAWN_CALL_RE =
  /\b(?:spawn|spawnSync|fork|exec|execSync|execFile|execFileSync)\s*\(/

/**
 * An object-literal property assignment of one of the eight keys, e.g.
 * `HOME: fakeHome`. Anchored on a preceding delimiter so a longer identifier
 * ending in the key name (or a type member of an unrelated interface reached
 * through a dotted path) cannot masquerade as one.
 */
function keyAssignmentRe(key: string): RegExp {
  return new RegExp(`(?:^|[{,(\\s])${key}\\s*:`, 'm')
}

/**
 * `path.relative()` emits `\`-separated paths on Windows, but every literal
 * compared against its output in this file (`HELPER_REL_PATH`,
 * `ALLOWED_TO_ASSIGN`, `EXEMPTIONS[].file`, the two inline literals below) is
 * `/`-separated. This is the ONLY permitted caller of `relative()` in this
 * file -- normalize once, at the source, rather than at every comparison
 * site (260926-c07).
 */
function toRepoRel(abs: string): string {
  return relative(REPO_ROOT, abs).split(sep).join('/')
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (PRUNED_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (SCANNED_EXT.test(entry.name)) {
      out.push(full)
    }
  }
}

function collectScannedFiles(): string[] {
  const found: string[] = []
  for (const root of SCAN_ROOTS) {
    walk(join(REPO_ROOT, root), found)
  }
  return found
}

const scannedFiles = collectScannedFiles()
const scannedRelPaths = scannedFiles.map((f) => toRepoRel(f))

describe('fake-HOME isolation (quick-260913-arr item 6, CLAUDE.md two-profile rule)', () => {
  it('no in-repo file spawns a child with a hand-rolled home/config/state env block', () => {
    const offenders: string[] = []

    for (const absolute of scannedFiles) {
      const rel = toRepoRel(absolute)
      if (ALLOWED_TO_ASSIGN.includes(rel)) continue

      const source = stripSourceComments(readFileSync(absolute, 'utf-8'))
      if (!SPAWN_CALL_RE.test(source)) continue

      const assigned = FAKE_HOME_ENV_KEYS.filter((key) =>
        keyAssignmentRe(key).test(source)
      )
      if (assigned.length > 0) {
        offenders.push(`${rel} (assigns ${assigned.join(', ')})`)
      }
    }

    expect(offenders).toEqual([])
  })

  it('every declared exemption still exists on disk', () => {
    // A deleted exempt file must turn this RED, not silently pass. A stale
    // exemption is exactly how a gate rots into a free pass.
    const missing = EXEMPTIONS.filter(
      (e) => !existsSync(join(REPO_ROOT, e.file))
    ).map((e) => e.file)

    expect(missing).toEqual([])
  })

  it('every exemption reason is still written in the exempt file itself', () => {
    // RAW source on purpose: the anchor IS a comment, so stripping would make
    // this assertion vacuous rather than strict. This is the one place in this
    // file that deliberately does not strip.
    const drifted: string[] = []

    for (const exemption of EXEMPTIONS) {
      const path = join(REPO_ROOT, exemption.file)
      if (!existsSync(path)) continue
      const raw = readFileSync(path, 'utf-8')
      for (const anchor of exemption.anchors) {
        if (!raw.includes(anchor)) {
          drifted.push(`${exemption.file} no longer contains: ${anchor}`)
        }
      }
    }

    expect(drifted).toEqual([])
  })

  it('exempt file honours its contract: spawns, but assigns none of the eight keys', () => {
    // the smoke gate's header promises NO env key; this makes that executable
    const violations: string[] = []

    for (const exemption of EXEMPTIONS) {
      const path = join(REPO_ROOT, exemption.file)
      if (!existsSync(path)) continue
      const source = stripSourceComments(readFileSync(path, 'utf-8'))

      if (!SPAWN_CALL_RE.test(source)) {
        violations.push(`${exemption.file}: no spawn-family call found`)
        continue
      }

      const assigned = FAKE_HOME_ENV_KEYS.filter((key) =>
        keyAssignmentRe(key).test(source)
      )
      if (assigned.length > 0) {
        violations.push(`${exemption.file} (assigns ${assigned.join(', ')})`)
      }
    }

    expect(violations).toEqual([])
  })

  it('scanned a real population, including the helper it exists to enforce', () => {
    expect(scannedFiles.length).toBeGreaterThanOrEqual(MIN_FILES_SCANNED)
    expect(scannedRelPaths).toContain(HELPER_REL_PATH)
    expect(scannedRelPaths).toContain('meta/sidecarStartupSmoke.cjs')
  })

  it('skip list is reachable: every allowed and exempt path can match', () => {
    // a skip or exempt path written in a form the walk can never produce (the
    // Windows separator bug that 260926-c07 fixed) silently stops matching;
    // this catches it on every OS
    const expectedPaths = [
      ...ALLOWED_TO_ASSIGN,
      ...EXEMPTIONS.map((e) => e.file)
    ]
    const unreachable = expectedPaths.filter(
      (p) => !scannedRelPaths.includes(p)
    )

    expect(unreachable).toEqual([])
  })

  it('imports its key list from the helper, so the two cannot disagree', () => {
    // Non-vacuity of the main rule: if the imported list were ever emptied,
    // the offender scan above would pass by checking nothing at all.
    expect(FAKE_HOME_ENV_KEYS.length).toBe(8)
  })
})
