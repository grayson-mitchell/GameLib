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

    // WR-07 legacy-P2P fallback (host harness only; no legacy-TCP-mode title is live-tested).
    const pfbBase = BigInt('76561198100000000')

    test('p2pfb-order: each report accepts the remote of the 1202 it reports', () => {
      const { out } = runBoth('p2pfb-order')
      expect(out).toContain('order accepts=2 idx=1,2,')
    })

    test('p2pfb-stranger: a never-sent-to, lobby-less remote is refused and never logged', () => {
      const { out, err } = runBoth('p2pfb-stranger')
      expect(out).toContain('stranger accepts=0')
      expect(err).toContain('p2p-accept src=helper action=refused')
      const x = pfbBase + BigInt(77)
      expect(err).not.toContain(x.toString())
      expect(err).not.toContain(x.toString(16))
    })

    test('p2pfb-lobby: lobby co-members are accepted; response!=1 and left lobbies are refused', () => {
      const { out } = runBoth('p2pfb-lobby')
      expect(out).toContain('member accepts=1 idx=5,')
      expect(out).toContain('response2 accepts=1 idx=5,')
      expect(out).toContain('left accepts=1 idx=5,')
    })

    test('p2pfb-listener: the report that reached a listener consumes its own 1202', () => {
      const { out } = runBoth('p2pfb-listener')
      expect(out).toContain('listener accepts=1 idx=2,')
    })

    test('p2pfb-empty: a report with nothing served accepts nothing', () => {
      const { out } = runBoth('p2pfb-empty')
      expect(out).toContain('empty accepts=0')
    })

    test('p2pfb-reaccept: no accept-once table, a reconnecting peer is accepted again', () => {
      const { out } = runBoth('p2pfb-reaccept')
      expect(out).toContain('reaccept accepts=2 idx=1,1,')
    })

    test('p2pfb-sent-evict: the sent-to ring evicts oldest and fails closed', () => {
      const { out } = runBoth('p2pfb-sent-evict')
      expect(out).toContain('evicted accepts=0')
      expect(out).toContain('newest accepts=1 idx=1064,')
    })

    test('p2pfb-overflow: served-FIFO overflow is skipped in step so pairing stays exact', () => {
      const { out } = runBoth('p2pfb-overflow')
      expect(out).toContain('skipped accepts=0')
      expect(out).toContain('ninth accepts=1')
    })

    test('p2pfb-strangers-flood: 40 strangers never reopen accept-all', () => {
      const { out } = runBoth('p2pfb-strangers-flood')
      expect(out).toContain('flood accepts=0')
    })

    test("p2pfb-many: every 1202 report pairs past the shim's old cap of four; CBDISP log stays capped", () => {
      const { out, err } = runBoth('p2pfb-many')
      expect(out).toContain(
        'many accepts=8 idx=4001,4002,4003,4004,4005,4006,4007,4008,'
      )
      const lines = err.split('\n')
      expect(
        lines.filter((l) =>
          l.includes('CBDISP iCallback=1202 targets=0 held=0')
        )
      ).toHaveLength(4)
      expect(
        lines.filter((l) => l.includes('CBDISP cap reached iCallback=1202'))
      ).toHaveLength(1)
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

    test('invite-dialog: forwards once, logs one INVITE dialog line with no id', () => {
      const { out, err } = runBoth('invite-dialog')
      expect(out).toContain('dialog calls=1 match=1 rl=0 bad=1')
      expect(lines(err, /INVITE +dialog appid=3205720$/)).toHaveLength(1)
      expect(err).not.toMatch(/[0-9]{17}/)
    })

    // 58 WR-01: the line is the backend's picker trigger, so it has no
    // per-process count cap -- only the 2 s gap. 1 for the burst + 40 spaced.
    test('invite-dialog-ratelimit: a burst logs once, every gap-separated call logs (no count cap)', () => {
      const { out, err } = runBoth('invite-dialog-ratelimit')
      expect(out).toContain('dialog calls=60')
      expect(lines(err, /INVITE +dialog appid=/)).toHaveLength(41)
    })

    test('mms-lobby-args: integer lobby shape only, 4 lines per op', () => {
      const { err } = runBoth('mms-lobby-args')
      expect(lines(err, /MMS {2,}lobby op=create type=1 max=4$/)).toHaveLength(
        4
      )
      expect(lines(err, /MMS {2,}lobby op=set-joinable value=1$/)).toHaveLength(
        1
      )
      expect(lines(err, /MMS {2,}lobby op=set-type type=1$/)).toHaveLength(1)
      expect(err).not.toMatch(/[0-9]{17}/)
    })

    test('mms-pool-full: a full pool refuses the new query and never recycles', () => {
      const { out } = runBoth('mms-pool-full')
      expect(out).toContain('pool=64 ok=1 extra=-1 calls=64 bound=64')
    })

    test('mms-cancel-releases: cancel forwards to Mac and frees the slot', () => {
      const { out } = runBoth('mms-cancel-releases')
      expect(out).toContain('full-refused=1')
      expect(out).toContain('cancel calls=1 last=105 bound=63')
      expect(out).toContain('again=164 bound=64 slot5=164')
    })

    test('mms-cancel-unknown: an unbound handle forwards and changes no binding', () => {
      const { out } = runBoth('mms-cancel-unknown')
      expect(out).toContain('cancel calls=1 last=9999 bound=2 h0=100 h1=101')
    })

    test('mms-issued-full: a full issued set refuses and releases, evicting nothing', () => {
      const { out } = runBoth('mms-issued-full')
      expect(out).toContain('kept=1 releases=0')
      expect(out).toContain('extra=0 releases=1')
      expect(out).toContain('all-issued=1')
    })

    test('mms-release-frees: ReleaseRequest forgets the handle', () => {
      const { out } = runBoth('mms-release-frees')
      expect(out).toContain('issue=1 is=1')
      expect(out).toContain('release calls=1 is=0')
      expect(out).toContain('reissue=1')
    })

    test('mms-collision: a live low-32 collision still refuses', () => {
      const { out } = runBoth('mms-collision')
      expect(out).toContain('first=1 same=1 collide=0 is2=0')
    })

    test('list-friends: ordinals, flags and names, never a SteamID', () => {
      const { out, err } = runBoth('list-friends')
      expect(out).toContain('rc=0')
      expect(out).toContain('leak=0')
      expect(out).toContain('count=3')
      expect(out).toContain('f idx=0 gen=1 online=1 playing=0 name=Alice')
      expect(out).toContain('f idx=1 gen=1 online=0 playing=0 name=Bob')
      expect(out).toContain('f idx=2 gen=1 online=1 playing=1 name=Cara')
      expect(lines(err, /INVITE +friends n=3$/)).toHaveLength(1)
      expect(err).not.toMatch(/[0-9]{17}/)
    })

    test('invite-ok: invites the snapshot friend to the game-set lobby', () => {
      const { out, err } = runBoth('invite-ok')
      expect(out).toContain('r=1 calls=1 lobbyok=1 targetok=1')
      expect(lines(err, /INVITE +sent ok=1$/)).toHaveLength(1)
    })

    test('invite-refusals: no-pending, expired, bad-ordinal, stale snapshot token, bad length', () => {
      const { out, err } = runBoth('invite-refusals')
      // 58 WR-04: a token from an earlier list and a bare index are refused.
      expect(out).toContain('stale=-3 bare=-3 current=1 target0=1')
      expect(out).toContain(
        'nopending=-1 expired=-2 nosnap=-3 badord=-3 calls=1'
      )
      expect(out).toContain('badlen status=1')
      expect(lines(err, /reason=no-pending$/)).toHaveLength(1)
      expect(lines(err, /reason=expired$/)).toHaveLength(1)
      expect(lines(err, /reason=bad-ordinal$/)).toHaveLength(4)
    })

    test('control-unauth: slots 13 and 14 refuse an unauthenticated connection', () => {
      const { out } = runBoth('control-unauth')
      expect(out).toContain('unauth13 status=1 n=0')
      expect(out).toContain('unauth14 status=1 n=0')
      expect(out).toContain('auth13 status=0')
      expect(out).toContain('auth14 status=0 n=4')
    })
  }
)
