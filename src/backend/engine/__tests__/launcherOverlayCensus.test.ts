/**
 * Phase 61-14 (T-61-43): source census of the settings reads on the shared launcher's launch path.
 * A read that skips the overlay would launch the wrong Wine; this fails the build instead.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const read = (rel: string) =>
  readFileSync(join(__dirname, '..', '..', rel), 'utf8')

/** Text from `startMarker` to the next column-0 closing brace. */
function bodyOf(source: string, startMarker: string): string {
  const start = source.indexOf(startMarker)
  if (start < 0) throw new Error(`marker not found: ${startMarker}`)
  const end = source.indexOf('\n}\n', start)
  if (end < 0) throw new Error(`no end for: ${startMarker}`)
  return source.slice(start, end + 3)
}

describe('launcher.ts overlay census', () => {
  const launcher = read('launcher.ts')

  it('prepareWineLaunch reads settings only through getLaunchSettings(', () => {
    const body = bodyOf(launcher, 'async function prepareWineLaunch(')
    const reads = body.match(/\.getSettings\(\)/g) ?? []
    // The GlobalConfig reads are not game settings; the game read is the only game.getSettings().
    const gameReads = body.match(/game\.getSettings\(\)/g) ?? []
    expect(gameReads).toHaveLength(1)
    expect(reads.length).toBeGreaterThanOrEqual(1)
    expect(body).toMatch(
      /getLaunchSettings\(\s*engineKeyFor\([^)]*\),\s*await game\.getSettings\(\)\s*\)/
    )
  })

  it('runLaunchEventCallback reads game settings once, before the engine step, and overlays after it', () => {
    const body = bodyOf(
      launcher,
      'const runLaunchEventCallback: (args: LaunchParams) => StatusPromise'
    )
    const gameReads = body.match(/game\.getSettings\(\)/g) ?? []
    expect(gameReads).toHaveLength(1)
    const stepAt = body.indexOf('selectEngineForLaunch(')
    expect(stepAt).toBeGreaterThan(body.indexOf('game.getSettings()'))
    const overlayAt = body.indexOf('getLaunchSettings(')
    expect(overlayAt).toBeGreaterThan(stepAt)
    // every consumer of the settings follows the overlay
    expect(body.indexOf('runBeforeLaunchScript(')).toBeGreaterThan(overlayAt)
    expect(body.indexOf('runAfterLaunchScript(')).toBeGreaterThan(overlayAt)
  })

  it('the engine step follows the log writer and precedes the Wine check', () => {
    const body = bodyOf(
      launcher,
      'const runLaunchEventCallback: (args: LaunchParams) => StatusPromise'
    )
    const logAt = body.indexOf('createGameLogWriter(')
    const stepAt = body.indexOf('selectEngineForLaunch(')
    const checkAt = body.indexOf('checkWineBeforeLaunch(')
    expect(logAt).toBeGreaterThan(-1)
    expect(stepAt).toBeGreaterThan(logAt)
    expect(checkAt).toBeGreaterThan(stepAt)
  })

  it('checkWineBeforeLaunch sits in a branch that excludes an engine-controlled launch', () => {
    const body = bodyOf(
      launcher,
      'const runLaunchEventCallback: (args: LaunchParams) => StatusPromise'
    )
    const checkAt = body.indexOf('checkWineBeforeLaunch(')
    const guardAt = body.lastIndexOf('if (', checkAt)
    const guard = body.slice(guardAt, body.indexOf('{', guardAt))
    expect(guard).toContain('!engineControlled')
    expect(body).toContain("const engineControlled = engineStep.kind === 'use'")
  })

  it('the selection is released in the launch finally and on a failed start', () => {
    const body = bodyOf(
      launcher,
      'const runLaunchEventCallback: (args: LaunchParams) => StatusPromise'
    )
    expect(body).toMatch(/\.finally\(async \(\) => \{[\s\S]*releaseEngine\(\)/)
    expect(body).toMatch(/catch \(error\) \{[\s\S]*releaseEngine\(\)/)
    expect(body).toContain('endEngineLaunch(engineKey)')
  })

  it('imports engine modules only (no store manager reach beyond the index)', () => {
    expect(launcher).toMatch(/from '\.\/engine\/launchEngine'/)
    expect(launcher).not.toMatch(/from '\.\/storeManagers\/(?!index)/)
  })
})
