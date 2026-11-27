/**
 * Phase 61-14 (T-61-43), 87-52: source census of the settings reads on the shared launcher's launch path.
 * A read that skips the overlay would launch the wrong Wine; this fails the build instead.
 *
 * The census of the TS tools' own settings reads (T-61-63, `tools/index.ts`) went with the TS tools in
 * Phase 87 Plan 37 (D-08): a wine command on a game now takes its settings through
 * `services/gameCommandFacts.ts`, whose order and `ensureBottle` choice `gameCommandFacts.test.ts` pins.
 *
 * 87-56c: moved here unchanged in what it asserts from `src/backend/engine/__tests__` when that directory was
 * deleted; only the path root of `read` changed (it still reads the same files).
 *
 * 88.3-17: `launcher.ts` (the TS funnel) is deleted, so the census of its `runLaunchEventCallback` body went with it: the
 * engine step's order, the overlay, the Wine check's guard and the release are Rust's now, pinned by `golden/funnel`
 * (`launcher.engineStep--*`), which `gamelib-launch/tests/funnel.rs` replays. What stays is the `prepareWineLaunch`
 * adapter's one stored-settings read, and the deadline arming position (`launcher deadline arming position (61-16)`,
 * moved here from `launcher.engineStep.test.ts`; its `launcher.ts` half is the slice `funnelPortComplete`'s deletion).
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

/** Text from `startMarker` to the next column-0 closing brace. */
function bodyOf(source: string, startMarker: string): string {
  const start = source.indexOf(startMarker)
  if (start < 0) throw new Error(`marker not found: ${startMarker}`)
  const end = source.indexOf('\n}\n', start)
  if (end < 0) throw new Error(`no end for: ${startMarker}`)
  return source.slice(start, end + 3)
}

describe('launch adapters overlay census', () => {
  const adapters = read('launchAdapters.ts')

  it('prepareWineLaunch is the interim adapter: one stored-settings read handed to Rust, which overlays the engine itself', () => {
    // 88.1-15: the body left launcher.ts; the engine overlay (`launchSettingsFor`) is Rust's, read through the engine
    // registry inside `launch_prepare_wine_begin` (88.1-12), so the adapter passes the game's own stored settings.
    expect(adapters).not.toContain('launchSettingsFor(')
    const body = bodyOf(adapters, 'export async function prepareWineLaunch(')
    const gameReads = body.match(/game\.getSettings\(\)/g) ?? []
    expect(gameReads).toHaveLength(1)
    expect(body).toMatch(/storedSettings/)
  })

  it('the deadline arm moved into Rust with the wine prepare step: the adapter holds no arm call and ends with one finish call', () => {
    // 88.1-13 and 88.1-15: `launch_prepare_wine_finish` arms the deadline after the known-fix overlay env (its replay
    // pins the order), so the adapter never calls `armEngineLaunchDeadline`.
    expect(adapters).not.toContain('armEngineLaunchDeadline(')
    expect(adapters.split('prepareWineLaunchFinish(').length - 1).toBe(1)
  })
})
