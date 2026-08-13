/**
 * Source-text evidence-line gate for the DXVK toggle (`DXVK.installRemove`, plan 34.5-54).
 *
 * WHY THIS GATE EXISTS
 *
 * The fourth blocking live gate's contract (`34.5-LIVE-GATE-RERUN-3.md`, plan 34.5-51) cited
 * `launcher.ts:1581`'s `Running Wine command: ...` as the "definitive" evidence line for the
 * DXVK-toggle-ON action item. That citation was wrong on two counts, discovered only when the
 * contract's own brief demanded re-verification during this plan's planning
 * (`F-34.5-G6-18`, corrected by `F-34.5-G6-19` -- see `deferred-items.md`):
 *
 * 1. The install/backup direction (toggle ON, the only direction the gate's own steps ever
 *    exercise) copies DLLs via Node's `copyFile`, NOT via `runWineCommand` -- so far the
 *    original finding was right. But it is WRONG that the install direction "never calls
 *    `runWineCommand` at all": immediately after the copy, the DLL-registration loops
 *    (`tools/index.ts:424-465`) call `runWineCommand` once per DLL with
 *    `reg add ... DllOverrides ... native,builtin`. `runWineCommand` genuinely IS reached on
 *    the ON direction, and can retire research Pitfall 2 ("non-Steam Wine has never executed
 *    under the sidecar") -- but only if the gate cites evidence that direction actually emits.
 * 2. The `Running Wine command:` emitter itself is at `launcher.ts:1520`, not `:1581`, and it
 *    is a `logDebug`, not a `logInfo`.
 *
 * This gate pins the corrected fact set so a fifth gate contract cannot repeat either error:
 * a source-text assertion that fails the moment any of these facts stops being true, rather
 * than a claim carried forward by transcription. It imports nothing from `tools/index.ts` --
 * that module reaches Electron transitively and must not be imported under the backend jest
 * project for this purpose (see `EosDeclineCallSiteGuard.test.ts`'s same documented
 * constraint) -- so it reads both files with `readFileSync` and asserts on collapsed source
 * text instead.
 *
 * Every positive assertion uses `toBe`/`toContain`/`toBeLessThan`/`toBeGreaterThan`. No negated
 * pattern-match shape is used anywhere in this file -- this project has shipped 7 vacuous
 * negative-regex assertions before (`threat-register-ranges-hide-uncovered-ids`), each passing
 * just as happily against a file that no longer contained the construct at all.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const toolsIndexPath = join(__dirname, '..', 'index.ts')
const launcherPath = join(__dirname, '..', '..', 'launcher.ts')

/** Collapses every run of whitespace to a single space -- a whitespace window, not a line. */
function collapse(source: string): string {
  return source.replace(/\s+/g, ' ')
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let fromIndex = 0
  while (true) {
    const foundAt = haystack.indexOf(needle, fromIndex)
    if (foundAt === -1) break
    count++
    fromIndex = foundAt + needle.length
  }
  return count
}

const INSTALL_DISPATCH_MARKER = 'installing ${tool} on...'
const ALREADY_INSTALLED_MARKER = '${tool} already installed!'
const REG_ADD_DLLOVERRIDES_LITERAL =
  "'reg', 'add', 'HKEY_CURRENT_USER\\\\Software\\\\Wine\\\\DllOverrides'"
const NATIVE_BUILTIN_LITERAL = "'native,builtin'"
const WINEBOOT_RESTORE_LITERAL = "'wineboot', '-u'"
const REG_DELETE_LITERAL = "'reg', 'delete'"
const MARKER_WRITE_LITERAL = 'writeFile(currentVersionCheck, globalVersion'
const RUNNING_WINE_COMMAND_LITERAL =
  "'Running Wine command:', commandParts.join(' ')"
const UNAWAITED_FOREACH_SHAPE = 'dlls32.forEach(async (dll) =>'

describe('DXVK install/restore evidence-line gate (F-34.5-G6-18 correction, F-34.5-G6-19)', () => {
  const toolsIndexSource = readFileSync(toolsIndexPath, 'utf-8')
  const toolsIndexCollapsed = collapse(toolsIndexSource)
  const launcherSource = readFileSync(launcherPath, 'utf-8')
  const launcherCollapsed = collapse(launcherSource)

  it('fact 1: the install dispatch marker exists exactly once (non-vacuity anchor)', () => {
    const count = countOccurrences(toolsIndexCollapsed, INSTALL_DISPATCH_MARKER)
    expect(count).toBeGreaterThan(0)
    expect(count).toBe(1)
  })

  it('fact 2: the dispatch marker precedes the already-installed early return', () => {
    const dispatchIndex = toolsIndexCollapsed.indexOf(INSTALL_DISPATCH_MARKER)
    const earlyReturnIndex = toolsIndexCollapsed.indexOf(ALREADY_INSTALLED_MARKER)
    expect(dispatchIndex).toBeGreaterThan(-1)
    expect(earlyReturnIndex).toBeGreaterThan(-1)
    // This ordering is what makes the marker a reliable "the guards were all passed and the
    // install direction was entered" signal even when the copy itself is skipped -- the
    // property a live-gate contract relies on when it cites this line.
    expect(dispatchIndex).toBeLessThan(earlyReturnIndex)
  })

  it('fact 3: the install direction reaches runWineCommand via the DLL-registration reg add loops', () => {
    const dispatchIndex = toolsIndexCollapsed.indexOf(INSTALL_DISPATCH_MARKER)
    const after = toolsIndexCollapsed.slice(dispatchIndex)
    // This is the assertion that keeps gate item 4 able to retire research Pitfall 2
    // ("runWineCommand has never executed for a non-Steam runner under the sidecar"): a
    // genuine DXVK-ON click on a storefront-authenticated runner reaches this code.
    const runWineCommandCount = countOccurrences(after, 'runWineCommand(')
    expect(runWineCommandCount).toBeGreaterThanOrEqual(2)
    expect(after).toContain(REG_ADD_DLLOVERRIDES_LITERAL)
    expect(after).toContain(NATIVE_BUILTIN_LITERAL)
  })

  it('fact 4: the restore direction is distinguishable -- its Wine commands precede the install marker', () => {
    const dispatchIndex = toolsIndexCollapsed.indexOf(INSTALL_DISPATCH_MARKER)
    const winebootIndex = toolsIndexCollapsed.indexOf(WINEBOOT_RESTORE_LITERAL)
    const regDeleteIndex = toolsIndexCollapsed.indexOf(REG_DELETE_LITERAL)
    expect(winebootIndex).toBeGreaterThan(-1)
    expect(regDeleteIndex).toBeGreaterThan(-1)
    // Lets a gate reader tell an OFF-click's Wine commands from an ON-click's: both restore-only
    // markers occur strictly before the install dispatch marker in source order.
    expect(winebootIndex).toBeLessThan(dispatchIndex)
    expect(regDeleteIndex).toBeLessThan(dispatchIndex)
  })

  it('fact 5: the version marker write exists and follows the install dispatch marker', () => {
    const dispatchIndex = toolsIndexCollapsed.indexOf(INSTALL_DISPATCH_MARKER)
    const writeIndex = toolsIndexCollapsed.indexOf(MARKER_WRITE_LITERAL)
    expect(writeIndex).toBeGreaterThan(-1)
    expect(writeIndex).toBeGreaterThan(dispatchIndex)
  })

  it('fact 6: the "Running Wine command:" emitter is a logDebug, exactly once, at the cited call site', () => {
    const count = countOccurrences(launcherCollapsed, RUNNING_WINE_COMMAND_LITERAL)
    expect(count).toBeGreaterThan(0)
    expect(count).toBe(1)

    const index = launcherCollapsed.indexOf(RUNNING_WINE_COMMAND_LITERAL)
    const windowStart = Math.max(0, index - 40)
    const preceding = launcherCollapsed.slice(windowStart, index)
    // F-34.5-G6-19's correction: this is a logDebug, not the logInfo the fourth contract
    // implied by omission -- logDebug DOES reach gamelib.log (F-34.5-G6-17 observed a DEBUG
    // line in this same file), so the corrected citation is still usable evidence.
    expect(preceding).toContain('logDebug(')
  })

  it('fact 7: the DLL-registration loops are un-awaited async callbacks inside a synchronous forEach', () => {
    // Pinned so that if a future edit makes these loops awaited, THIS test changes and the
    // settle-window requirement (F-34.5-G6-19) can be revisited deliberately, not silently.
    // installRemove's own resolution -- and the UI switch flipping ON -- can race ahead of
    // these reg add commands actually landing in the log.
    expect(toolsIndexCollapsed).toContain(UNAWAITED_FOREACH_SHAPE)
  })
})
