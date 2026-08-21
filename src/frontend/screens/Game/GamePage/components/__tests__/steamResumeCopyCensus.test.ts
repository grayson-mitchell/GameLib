/**
 * quick-260819-ch5 — a repo-wide CENSUS gate for the retired
 * "Finish in Steam" copy.
 *
 * WHY THIS GATE EXISTS
 *
 * The reported surface was the big GamePage primary button, but the same
 * stale copy lived at three independent render call sites across three
 * directories (MainButton.tsx, hooks/constants.ts, GameStatus.tsx), fed by
 * one dead-by-design catalog key (gamepage.json's status.steamFinishInSteam)
 * and quoted in three backend comment locations. This repo's dominant defect
 * shape is "fix the reported file, miss the sibling", and an audit coarser
 * than the defect's unit cannot find it (see labelSuiteI18nCensus.test.ts,
 * which set this precedent for the suites' `t` mock). A per-file assertion
 * cannot see a residual site; only a filesystem-enumerated census can.
 *
 * This file is NOT a `.tsx` and does not contain both
 * `jest.mock('react-i18next'` and `from '../MainButton'`, so it is not
 * picked up by `labelSuiteI18nCensus`'s own census of MainButton label
 * suites — it measures a different property (residual stale copy in
 * non-comment source), not the `t` mock shape.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import gamepage from '../../../../../../../public/locales/en/gamepage.json'
import gamelib from '../../../../../../../public/locales/en/gamelib.json'

// __dirname: src/frontend/screens/Game/GamePage/components/__tests__
const REPO_ROOT = join(__dirname, '../../../../../../..')
const SRC_ROOT = join(REPO_ROOT, 'src')
const SELF = __filename

/** Walk `src/` recursively for .ts/.tsx files, skipping node_modules and self. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (entry === 'node_modules') continue
    const stat = statSync(full)
    if (stat.isDirectory()) {
      walk(full, out)
    } else if (/\.(ts|tsx)$/.test(entry) && full !== SELF) {
      out.push(full)
    }
  }
  return out
}

const files = walk(SRC_ROOT)

interface ScannedFile {
  path: string
  stripped: string
}

const scanned: ScannedFile[] = files.map((path) => ({
  path,
  stripped: stripSourceComments(readFileSync(path, 'utf-8'))
}))

function offendersFor(predicate: (stripped: string) => boolean): string[] {
  return scanned.filter((f) => predicate(f.stripped)).map((f) => f.path)
}

/**
 * MainButton.steamIncomplete.test.tsx (Task 2, quick-260819-ch5) carries a
 * DELIBERATE standing regression pin —
 * `expect(text).not.toContain('Finish in Steam')` — that must keep
 * containing the literal string forever, or the pin guards nothing. Strip
 * that one known-safe negated-assertion shape before matching so the census
 * measures live/positive occurrences (a real render call site, a copy-pasted
 * mock, a resurrected default) and not its own regression guard.
 */
const SAFE_NEGATED_PIN = /\.not\.toContain\((['"])Finish in Steam\1\)/g
function stripSafePins(stripped: string): string {
  return stripped.replace(SAFE_NEGATED_PIN, '')
}

describe('steamResumeCopyCensus (quick-260819-ch5): zero residual "Finish in Steam" call sites', () => {
  it('the scan is non-vacuous', () => {
    // If this ever collapses to near-zero the obligations below guard
    // nothing — the repo has ~970 .ts/.tsx files under src/ today.
    expect(files.length).toBeGreaterThan(200)
  })

  it('the scan finds the three expected new-key sites', () => {
    const paths = scanned.map((f) => f.path)
    const mainButton = scanned.find((f) => f.path.endsWith('MainButton.tsx'))
    const constants = scanned.find((f) =>
      f.path.endsWith(join('hooks', 'constants.ts'))
    )
    const gameStatus = scanned.find((f) => f.path.endsWith('GameStatus.tsx'))

    expect(paths.some((p) => p.endsWith('MainButton.tsx'))).toBe(true)
    expect(paths.some((p) => p.endsWith(join('hooks', 'constants.ts')))).toBe(
      true
    )
    expect(paths.some((p) => p.endsWith('GameStatus.tsx'))).toBe(true)

    expect(mainButton?.stripped).toContain('gamelib:steam.status.resumeInstall')
    expect(constants?.stripped).toContain('gamelib:steam.status.resumeInstall')
    expect(gameStatus?.stripped).toContain(
      'gamelib:steam.status.resumeInstallHint'
    )
  })

  it('zero non-comment occurrences of the key "steamFinishInSteam" remain under src/', () => {
    const offenders = offendersFor((s) => s.includes('steamFinishInSteam'))
    expect(offenders).toEqual([])
  })

  it('zero non-comment, non-pin occurrences of the literal "Finish in Steam" remain under src/', () => {
    const offenders = offendersFor((s) =>
      stripSafePins(s).includes('Finish in Steam')
    )
    expect(offenders).toEqual([])
  })

  it('the safe-pin exemption is narrow: it does not blind the gate to a real positive occurrence', () => {
    // Sentinel proving stripSafePins only removes the exact negated shape —
    // a POSITIVE (non-negated) occurrence in the same string still trips it.
    const withRealOffense = "t('status.steamFinishInSteam', 'Finish in Steam')"
    expect(stripSafePins(withRealOffense).includes('Finish in Steam')).toBe(
      true
    )
  })

  it("RED: injecting the real pre-fix line into MainButton.tsx trips the gate's own predicate", () => {
    const mainButtonPath = join(__dirname, '..', 'MainButton.tsx')
    const realSource = readFileSync(mainButtonPath, 'utf-8')
    const knownBad = realSource.replace(
      "t('gamelib:steam.status.resumeInstall', 'Resume Install')",
      "t('status.steamFinishInSteam', 'Finish in Steam')"
    )
    expect(knownBad).not.toBe(realSource)

    const strippedBad = stripSourceComments(knownBad)
    expect(strippedBad.includes('steamFinishInSteam')).toBe(true)
    expect(strippedBad.includes('Finish in Steam')).toBe(true)
  })

  it('comment prose that merely discusses the old label does not trip the gate', () => {
    // The backend steam library manager legitimately quotes the OLD label
    // in explanatory comment prose (WR-01, 21-17) — a naive text match would
    // report the documentation itself as the defect. stripSourceComments
    // removes it before matching, so these files are not offenders even
    // though they mention "Resume Install"/history of the retired string in
    // comments elsewhere in the repo.
    const libraryTs = scanned.find((f) =>
      f.path.endsWith(join('storeManagers', 'steam', 'library.ts'))
    )
    expect(libraryTs).toBeDefined()
    expect(libraryTs?.stripped.includes('Finish in Steam')).toBe(false)
    expect(libraryTs?.stripped.includes('steamFinishInSteam')).toBe(false)
  })
})

describe('steamResumeCopyCensus (quick-260819-ch5): catalog pins hard constraint 2', () => {
  it('gamelib.json holds both approved resume-install values', () => {
    expect(gamelib.steam.status.resumeInstall).toBe('Resume Install')
    expect(gamelib.steam.status.resumeInstallHint).toBe(
      'Install incomplete — resume the download in GameLib'
    )
  })

  it('gamepage.json STILL holds the dead status.steamFinishInSteam key — proves the churn guard was respected, not dodged by deletion', () => {
    expect(
      (gamepage as { status: Record<string, string> }).status.steamFinishInSteam
    ).toBe('Finish in Steam')
  })
})
