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

    const lines = (err: string, re: RegExp): string[] =>
      err.split('\n').filter((l) => re.test(l))

    test('net-budget: a send burst cannot starve join or recv lines', () => {
      const { err } = runBoth('net-budget')
      expect(lines(err, /kind=send iface=Sockets cb=/)).toHaveLength(8)
      expect(
        lines(err, /NET {2,}cap kind=send iface=Sockets reached;/)
      ).toHaveLength(1)
      expect(lines(err, /kind=join iface=Sockets cb=1221/)).toHaveLength(1)
      expect(lines(err, /kind=recv iface=Sockets/)).toHaveLength(1)
    })

    test('net-join-budget: join lines are capped at 16 with one note', () => {
      const { err } = runBoth('net-join-budget')
      expect(lines(err, /kind=join iface=Sockets cb=/)).toHaveLength(16)
      expect(
        lines(err, /cap kind=join reached; later lines are not logged/)
      ).toHaveLength(1)
    })

    test('net-path-latch: path lines consume no send/recv budget', () => {
      const { err } = runBoth('net-path-latch')
      expect(lines(err, /kind=path/)).toHaveLength(2)
      expect(lines(err, /kind=recv iface=Sockets/)).toHaveLength(1)
      expect(lines(err, /kind=send iface=Sockets cb=/)).toHaveLength(8)
    })

    test('nets-evict: evicting a queue that holds records logs an oversize line with the count', () => {
      const { err } = runBoth('nets-evict')
      expect(lines(err, /kind=oversize iface=Sockets cb=0 n=1 /)).toHaveLength(
        1
      )
    })

    test('nets-close-clears: CloseConnection drops the handle queue and passes the result through', () => {
      const { out } = runBoth('nets-close-clears')
      expect(out).toContain('found=0 closes=1 ret=1 rl=4')
    })

    test('nets-destroy-pg-clears: DestroyPollGroup drops only the poll-group queue', () => {
      const { out } = runBoth('nets-destroy-pg-clears')
      expect(out).toContain('found=0 connfound=1 destroys=1 ret=1 rl=4')
    })
  }
)
