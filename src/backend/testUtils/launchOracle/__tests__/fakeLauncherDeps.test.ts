/**
 * Self-test of the recording launcher deps (88.1-01): an unscripted channel rejects by name, the log
 * recorder keeps call order when a later promise settles first, and the deps never touch the real HOME.
 */
import { homedir } from 'os'
import { withEngineOracleProfile } from 'backend/testUtils/engineWineOracle/harness'
import {
  createFakeLauncherDeps,
  recordingLogWriter
} from 'backend/testUtils/launchOracle/fakeLauncherDeps'
import {
  injectExecutableOnPath,
  injectOnline
} from 'backend/testUtils/launchOracle/probes'
import { searchForExecutableOnPath } from 'backend/utils/os/path'

describe('createFakeLauncherDeps', () => {
  it('rejects an unscripted Rust channel by name and records the attempt', async () => {
    await withEngineOracleProfile(async (profile) => {
      const fake = createFakeLauncherDeps(profile, {
        rust: { known: (args: unknown[]) => ({ echoed: args }) }
      })
      await expect(
        fake.deps.requestRustInvoke('known' as never, [1] as never)
      ).resolves.toEqual({ echoed: [1] })
      await expect(
        fake.deps.requestRustInvoke('missing' as never, [] as never)
      ).rejects.toThrow('unscripted rust channel "missing"')
      expect(fake.requests.map((r) => r.channel)).toEqual(['known', 'missing'])
    })
  })

  it('fails by name on an unscripted dep, an unscripted game and an exhausted dialog list', async () => {
    await withEngineOracleProfile(async (profile) => {
      const fake = createFakeLauncherDeps(profile, { dialogAnswers: [1] })
      expect(() => fake.deps.config.getSettings()).toThrow(
        'unscripted dep "config.getSettings"'
      )
      expect(() => fake.deps.libraryManagers.gog.getGame('a')).toThrow(
        'unscripted game "gog:a"'
      )
      await expect(
        fake.deps.dialogs.showMessageBox({} as never)
      ).resolves.toEqual({ response: 1 })
      await expect(
        fake.deps.dialogs.showMessageBox({} as never)
      ).rejects.toThrow('unscripted dialog answer')
      expect(fake.dialogs.map((d) => d.answer)).toEqual([1, undefined])
    })
  })

  it('records the frontend push, event emits, hooks, notifications and online asks in order', async () => {
    await withEngineOracleProfile(async (profile) => {
      const fake = createFakeLauncherDeps(profile, {
        online: false,
        hooks: { 'gog.isOverlayEnabled': true },
        games: { 'gog:a': { native: true, info: { title: 'A' } } }
      })
      const bus = fake.deps.appRuntime.events as unknown as {
        emit: (...a: unknown[]) => void
      }
      const push = fake.deps.sendFrontendMessage as unknown as (
        ...a: unknown[]
      ) => void
      push('gameStatusUpdate', {})
      bus.emit('gameStatusUpdate', {})
      fake.deps.notifications.show({ title: 't' })
      await expect(
        fake.deps.launchHooks.gog.isOverlayEnabled?.('a')
      ).resolves.toBe(true)
      expect(fake.deps.onlineMonitor.isOnline()).toBe(false)
      const game = fake.deps.libraryManagers.gog.getGame('a')
      expect(game.isNative()).toBe(true)
      expect(game.getGameInfo().title).toBe('A')
      expect(fake.frontend.map((f) => f.kind)).toEqual(['send', 'emit'])
      expect(fake.notifications).toEqual([{ title: 't' }])
      expect(fake.hooks).toEqual([
        { runner: 'gog', member: 'isOverlayEnabled', args: ['a'] }
      ])
      expect(fake.onlineAsked()).toBe(1)
    })
  })

  it('never touches the real HOME: every path of the deps sits inside the fake profile', async () => {
    await withEngineOracleProfile((profile) => {
      const fake = createFakeLauncherDeps(profile)
      const real = homedir()
      const paths = Object.values(fake.deps.paths).filter(
        (v): v is string => typeof v === 'string' && v.startsWith('/')
      )
      expect(paths.length).toBeGreaterThan(5)
      for (const path of paths) {
        const inside = path.startsWith(profile.home)
        // The app root is the repo, which is not the operator's profile either way.
        const repo = path.startsWith(profile.paths.appRoot)
        expect(inside || repo).toBe(true)
        if (!repo) expect(path.startsWith(real)).toBe(false)
      }
    })
  })

  it('takes an override wholesale', async () => {
    await withEngineOracleProfile((profile) => {
      const fake = createFakeLauncherDeps(profile, {
        overrides: { appInfo: { version: '9.9.9' } }
      })
      expect(fake.deps.appInfo.version).toBe('9.9.9')
    })
  })
})

describe('recordingLogWriter', () => {
  it('keeps call order when a later promise settles first', async () => {
    const { writer, entries } = recordingLogWriter()
    let release!: (text: string) => void
    const slow = new Promise<string>((resolve) => {
      release = resolve
    })
    void writer.logInfo(slow)
    void writer.logWarning('second')
    void writer.writeString('raw text')
    release('slow settled last')
    expect(await entries()).toEqual([
      { level: 'info', parts: ['slow settled last'] },
      { level: 'warning', parts: ['second'] },
      { level: 'raw', parts: ['raw text'] }
    ])
  })
})

describe('recordingLogWriter nested promises', () => {
  it('settles a promise inside an array part, as the real writer does', async () => {
    const { writer, entries } = recordingLogWriter()
    void writer.logInfo(['System Info:', Promise.resolve('cpu text'), '\n\n'])
    void writer.logInfo([Promise.resolve('')])
    expect(await entries()).toEqual([
      { level: 'info', parts: [['System Info:', 'cpu text', '\n\n']] },
      { level: 'info', parts: [['']] }
    ])
  })
})

describe('probes', () => {
  it('injectExecutableOnPath answers from the map, null otherwise, and restores', async () => {
    const restore = injectExecutableOnPath({
      gamescope: '/usr/bin/gamescope',
      gamemoderun: null
    })
    await expect(searchForExecutableOnPath('gamescope')).resolves.toBe(
      '/usr/bin/gamescope'
    )
    await expect(searchForExecutableOnPath('gamemoderun')).resolves.toBeNull()
    await expect(searchForExecutableOnPath('absent')).resolves.toBeNull()
    restore()
    // Restored: the real scan runs again, and a name that cannot exist is not found.
    await expect(
      searchForExecutableOnPath('gamelib-no-such-binary-88')
    ).resolves.toBeNull()
  })

  it('injectOnline answers and counts', () => {
    const { monitor, asked } = injectOnline(false)
    expect(monitor.isOnline()).toBe(false)
    expect(monitor.isOnline()).toBe(false)
    expect(asked()).toBe(2)
  })
})
