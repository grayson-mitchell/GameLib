/**
 * Self-test of the funnel recorder (88.3-01): an unscripted Rust channel rejects by name, the clock moves only by
 * `sessionMs`, the writer handed to `launch` records its rotation state, and nothing the recorder faked outlives a run.
 */
import * as logger from 'backend/logger'
import {
  PINNED_NOW,
  funnelScenario,
  recordFunnel,
  type FunnelEvent
} from 'backend/testUtils/launchOracle/funnelTrace'

const of = <K extends FunnelEvent['kind']>(
  events: FunnelEvent[],
  kind: K
): Extract<FunnelEvent, { kind: K }>[] =>
  events.filter((e): e is Extract<FunnelEvent, { kind: K }> => e.kind === kind)

describe('recordFunnel', () => {
  it('rejects an unscripted Rust channel by name and records the attempt and the rejection', async () => {
    const none = funnelScenario({})
    none.rust = {}
    const { result, events } = await recordFunnel(none)
    const message =
      'funnel trace: unscripted rust channel "engine_launch_select"'
    expect(result.plays).toEqual([{ rejected: message }])
    expect(of(events, 'rust')).toEqual([
      expect.objectContaining({
        channel: 'engine_launch_select',
        rejected: message
      })
    ])
  })

  it('moves the clock only by sessionMs, from the pinned start', async () => {
    const { events } = await recordFunnel(
      funnelScenario({ sessionMs: 120_000 })
    )
    const writes = Object.fromEntries(
      of(events, 'tsStore').map((e) => [e.key, e.value])
    )
    expect(writes).toEqual({
      'alpha.firstPlayed': new Date(PINNED_NOW).toISOString(),
      'alpha.lastPlayed': new Date(PINNED_NOW + 120_000).toISOString(),
      'alpha.totalPlayed': 2
    })
    const idle = await recordFunnel(funnelScenario({ sessionMs: 0 }))
    const idleWrites = Object.fromEntries(
      of(idle.events, 'tsStore').map((e) => [e.key, e.value])
    )
    expect(idleWrites['alpha.lastPlayed']).toBe(idleWrites['alpha.firstPlayed'])
    expect(idleWrites['alpha.totalPlayed']).toBe(0)
  })

  it('records whether the writer handed to launch had its rotation claimed already', async () => {
    const target = {
      kind: 'game',
      appName: 'alpha',
      runner: 'legendary',
      type: 'launch'
    }
    const plain = await recordFunnel(funnelScenario({}))
    expect(
      of(plain.events, 'hook').find((e) => e.hook === 'launch')?.writer
    ).toEqual({ target, rotationClaimed: false })
    // A before script writes its line first, so that line carries the rotation.
    const scripted = await recordFunnel(
      funnelScenario({
        gameSettings: { beforeLaunchScriptPath: '/pins/before.sh' }
      })
    )
    expect(
      of(scripted.events, 'hook').find((e) => e.hook === 'launch')?.writer
    ).toEqual({ target, rotationClaimed: true })
    const frames = of(scripted.events, 'gameLog')
    expect(frames.filter((f) => f.rotate)).toHaveLength(1)
    expect(frames[0]?.rotate).toBe(true)
  })

  it('injects the platform: the hide-window rule differs on macOS and on Linux without a tray', async () => {
    const hidden = (platform: 'mac' | 'linux', noTrayIcon: boolean) =>
      recordFunnel(
        funnelScenario({
          platform,
          globalSettings: { minimizeOnLaunch: true, noTrayIcon }
        })
      ).then((t) =>
        of(t.events, 'appState').some((e) => e.member === 'hideMainWindow')
      )
    await expect(hidden('mac', true)).resolves.toBe(true)
    await expect(hidden('linux', true)).resolves.toBe(false)
    await expect(hidden('linux', false)).resolves.toBe(true)
  })

  it('puts the real clock and the logger back when a run ends, also after a rejection', async () => {
    await recordFunnel({ ...funnelScenario({}), rust: {} })
    expect(jest.isMockFunction(logger.logInfo)).toBe(false)
    expect(jest.isMockFunction(logger.logLine)).toBe(false)
    const before = Date.now()
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(Date.now()).toBeGreaterThan(before)
  })

  it('records the paths of the fake HOME as placeholders', async () => {
    const { events } = await recordFunnel(
      funnelScenario({ installPath: 'present' })
    )
    const request = of(events, 'rust').find(
      (e) => e.channel === 'engine_launch_select'
    )
    expect(JSON.stringify(request?.args)).toContain('<HOME>/Games/alpha')
  })
})
