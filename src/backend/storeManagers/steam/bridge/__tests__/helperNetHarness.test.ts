import { execFileSync, spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'

import {
  createFakeHomeProfile,
  type FakeHomeProfile
} from 'backend/testUtils/fakeHomeProfile'

import { buildHelperCompileArgv } from '../../../../../../meta/buildSteamBridgeShims'

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..', '..')
const DRIVER = join(__dirname, 'fixtures', 'net_harness_driver.c')

// The harness #includes the Mach-O helper source and resolves fakes through
// dlsym(RTLD_DEFAULT), so it only builds and runs on a darwin host.
const describeDarwinOnly =
  process.platform === 'darwin' ? describe : describe.skip

describeDarwinOnly(
  'helper receive paths, host harness (darwin-only: compiles the Mach-O helper source)',
  () => {
    let profile: FakeHomeProfile
    let bin: string

    const runBoth = (name: string): { out: string; err: string } => {
      const r = spawnSync(bin, [name], {
        cwd: REPO_ROOT,
        env: profile.childEnv(),
        encoding: 'utf8'
      })
      expect(r.status).toBe(0)
      return { out: r.stdout, err: r.stderr }
    }

    beforeAll(() => {
      profile = createFakeHomeProfile({ prefix: 'gamelib-nethar-' })
      bin = join(profile.root, 'net_harness')
      const { command, args } = buildHelperCompileArgv()
      const oIdx = args.indexOf('-o')
      const flags = args.slice(0, oIdx)
      execFileSync(
        command,
        [
          ...flags,
          '-I',
          join('native', 'steam-bridge', 'helper'),
          '-o',
          bin,
          DRIVER
        ],
        { cwd: REPO_ROOT, env: profile.childEnv(), stdio: 'pipe' }
      )
    }, 60000)

    afterAll(() => {
      profile?.dispose()
    })

    test('sockets-conn: Sockets recv is labelled iface=Sockets', () => {
      const { out, err } = runBoth('sockets-conn')
      expect(err).toContain('role=game kind=recv iface=Sockets')
      expect(err).not.toContain('iface=Messages')
      expect(out).toContain('n=1')
    })

    test('sockets-poll: poll group is also iface=Sockets', () => {
      const { err } = runBoth('sockets-poll')
      expect(err).toContain('role=game kind=recv iface=Sockets')
      expect(err).not.toContain('iface=Messages')
    })

    test('messages: channel receive is iface=Messages', () => {
      const { err } = runBoth('messages')
      expect(err).toContain('role=game kind=recv iface=Messages')
      expect(err).not.toContain('iface=Sockets')
    })

    test('sockets-oversize: oversize NET line reads Sockets and the message is released once', () => {
      const { out, err } = runBoth('sockets-oversize')
      expect(err).toContain('kind=oversize iface=Sockets')
      expect(out).toContain('releases=1')
    })

    test('p2p-oversize-then-small: oversize packet is discarded, the next one is delivered', () => {
      const { out, err } = runBoth('p2p-oversize-then-small')
      const calls = out.trim().split('\n')
      expect(calls[0]).toContain('ret=0 len=0 remote=0 queue=1')
      expect(calls[1]).toContain('ret=1 len=10')
      expect(err).toContain('kind=oversize iface=Networking')
      expect(err).toContain('kind=recv iface=Networking')
    })

    test('p2p-huge: above 1 MiB nothing is allocated or read', () => {
      const { out, err } = runBoth('p2p-huge')
      expect(out).toContain('ret=0 len=0 remote=0 queue=1 reads=0')
      expect(err).toContain('kind=oversize iface=Networking')
    })

    test('p2p-normal: a 100-byte packet is read whole', () => {
      const { out } = runBoth('p2p-normal')
      expect(out).toContain('ret=1 len=100')
    })
  }
)
