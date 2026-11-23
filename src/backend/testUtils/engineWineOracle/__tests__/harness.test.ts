/**
 * Self-tests for the Phase 87 oracle harness (87-05): the behaviours every later golden plan relies
 * on, and the vacuous-pass negatives that keep a golden suite from going green over nothing.
 *
 * Fixtures are written to a throwaway directory (`overrideFixturesRoot`) inside a fake HOME
 * profile, never to a committed crate. No test here reads the real HOME or touches the network.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import axios from 'axios'
import {
  assertLiveRecorded,
  assertManifest,
  expandPlaceholders,
  expectEmptyCasesToFail,
  goldenDir,
  loadDeltas,
  normalisePaths,
  syncManifest,
  withEngineOracleProfile,
  writeOrCompareGolden,
  type EngineOracleProfile
} from '../harness'
import {
  installRecorder,
  overrideFixturesRoot,
  recordedCaseDir,
  redactHeaders,
  redactUrl,
  stubDownloadFile
} from '../recorder'
import { createSpawnTracer } from '../spawnTrace'
import { snapshotTree } from '../treeSnapshot'
import {
  createFakeHomeProfile,
  FAKE_HOME_ENV_KEYS
} from 'backend/testUtils/fakeHomeProfile'

const CRATE = 'gamelib-selftest'
const SLICE = 'slice'

/** Runs `fn` with fixtures pointed at a fresh temp directory. */
async function withScratchFixtures<T>(
  fn: (root: string) => Promise<T> | T
): Promise<T> {
  const scratch = createFakeHomeProfile({ prefix: 'gamelib-harness-test-' })
  const restore = overrideFixturesRoot(join(scratch.root, 'fixtures'))
  try {
    return await fn(join(scratch.root, 'fixtures'))
  } finally {
    restore()
    scratch.dispose()
  }
}

describe('withEngineOracleProfile', () => {
  it('mints a fresh profile per call and disposes it, even when the case throws', async () => {
    let first = ''
    await withEngineOracleProfile((profile) => {
      first = profile.home
      expect(existsSync(first)).toBe(true)
    })
    expect(existsSync(first)).toBe(false)

    let second = ''
    await expect(
      withEngineOracleProfile((profile) => {
        second = profile.home
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
    expect(second).not.toBe(first)
    expect(existsSync(second)).toBe(false)
  })

  it('keeps every root inside the fake HOME and userData apart from appFolder', async () => {
    await withEngineOracleProfile((profile) => {
      for (const root of [
        profile.userData,
        profile.appFolder,
        profile.toolsPath,
        profile.runtimePath,
        profile.tmp
      ]) {
        expect(root.startsWith(`${profile.home}/`)).toBe(true)
      }
      expect(profile.userData).not.toBe(profile.appFolder)
      expect(profile.runtimePath).toBe(join(profile.toolsPath, 'runtimes'))
      for (const key of FAKE_HOME_ENV_KEYS) {
        expect(profile.fake.env[key].startsWith(profile.home)).toBe(true)
      }
    })
  })

  it('seeds files, directories, modes and links from placeholder paths', async () => {
    await withEngineOracleProfile(
      (profile) => {
        const tree = snapshotTree(profile.home)
        const byPath = Object.fromEntries(tree.map((e) => [e.path, e]))
        const tools = '.config/GameLib/tools'
        expect(byPath[`${tools}/a.txt`]?.kind).toBe('file')
        expect(byPath[`${tools}/run.sh`]?.mode).toBe('0755')
        expect(byPath[`${tools}/empty`]?.kind).toBe('dir')
        expect(byPath[`${tools}/link`]).toMatchObject({
          kind: 'symlink',
          symlink: join(profile.toolsPath, 'a.txt')
        })
      },
      {
        seed: [
          { path: '<TOOLS>/a.txt', text: 'a' },
          { path: '<TOOLS>/run.sh', text: '#!/bin/sh', mode: '0755' },
          { path: '<TOOLS>/empty', dir: true },
          { path: '<TOOLS>/link', symlink: '<TOOLS>/a.txt' }
        ]
      }
    )
  })

  it('refuses a seed path outside the profile', async () => {
    await expect(
      withEngineOracleProfile(() => undefined, {
        seed: [{ path: '/etc/gamelib-selftest', text: 'x' }]
      })
    ).rejects.toThrow(/outside the profile/)
  })
})

describe('normalisePaths', () => {
  it('replaces every profile root and leaves unrelated absolute paths alone', async () => {
    await withEngineOracleProfile((profile) => {
      const input = {
        tools: join(profile.toolsPath, 'runtimes', 'x'),
        app: profile.appFolder,
        data: join(profile.userData, 'store.json'),
        tmp: join(profile.tmp, 't'),
        home: join(profile.home, 'Games'),
        list: [`tar -C ${profile.runtimePath} -x`, 7, null],
        nested: { deeper: `${profile.home}/.cache` },
        unrelated: '/usr/bin/tar',
        [profile.home]: 'a key is never rewritten'
      }
      expect(normalisePaths(input, profile)).toEqual({
        tools: '<TOOLS>/runtimes/x',
        app: '<APPFOLDER>',
        data: '<USERDATA>/store.json',
        tmp: '<TMP>/t',
        home: '<HOME>/Games',
        list: ['tar -C <TOOLS>/runtimes -x', 7, null],
        nested: { deeper: '<HOME>/.cache' },
        unrelated: '/usr/bin/tar',
        [profile.home]: 'a key is never rewritten'
      })
    })
  })

  it('round-trips through expandPlaceholders', async () => {
    await withEngineOracleProfile((profile: EngineOracleProfile) => {
      const real = join(profile.toolsPath, 'runtimes', 'eac_runtime')
      const placeholder = normalisePaths(real, profile)
      expect(placeholder).toBe('<TOOLS>/runtimes/eac_runtime')
      expect(expandPlaceholders(placeholder, profile)).toBe(real)
    })
  })
})

describe('snapshotTree', () => {
  it('records kind, umask-independent mode, sha256 and symlink targets, sorted, without following links', async () => {
    await withEngineOracleProfile((profile) => {
      const dir = join(profile.home, 'd')
      mkdirSync(dir)
      writeFileSync(join(dir, 'b.txt'), 'b')
      writeFileSync(join(dir, 'a.txt'), '')
      chmodSync(join(dir, 'b.txt'), 0o666)
      symlinkSync('/nonexistent/target', join(dir, 'z-link'))
      const tree = snapshotTree(profile.home)
      expect(tree.map((e) => e.path)).toEqual([
        'd',
        'd/a.txt',
        'd/b.txt',
        'd/z-link'
      ])
      const b = tree.find((e) => e.path === 'd/b.txt')
      // 0666 with the group and other write bits cleared.
      expect(b?.mode).toBe('0644')
      expect(b?.sha256).toBe(
        '3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d'
      )
      expect(tree.find((e) => e.path === 'd/a.txt')?.sha256).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      )
      expect(tree.find((e) => e.path === 'd/z-link')).toEqual({
        path: 'd/z-link',
        kind: 'symlink',
        mode: expect.stringMatching(/^[0-7]{4}$/),
        symlink: '/nonexistent/target'
      })
    })
  })
})

describe('writeOrCompareGolden', () => {
  const capture = {
    result: { ok: true },
    events: [],
    after: [{ path: 'a', kind: 'file' }],
    spawns: [],
    requests: ['GET https://x.invalid/']
  }

  it('writes five files in write mode and passes in compare mode on the same capture', async () => {
    await withScratchFixtures(() => {
      writeOrCompareGolden(CRATE, SLICE, 'c1', capture, 'write')
      const dir = join(goldenDir(CRATE, SLICE), 'expected', 'c1')
      expect(readdirSync(dir).sort()).toEqual([
        'events.json',
        'requests.json',
        'result.json',
        'spawns.json',
        'tree.json'
      ])
      expect(() =>
        writeOrCompareGolden(CRATE, SLICE, 'c1', capture, 'compare')
      ).not.toThrow()
    })
  })

  it('fails in compare mode when an expected file differs', async () => {
    await withScratchFixtures(() => {
      writeOrCompareGolden(CRATE, SLICE, 'c1', capture, 'write')
      expect(() =>
        writeOrCompareGolden(
          CRATE,
          SLICE,
          'c1',
          { ...capture, result: { ok: false } },
          'compare'
        )
      ).toThrow()
    })
  })

  it('fails in compare mode when there is no committed golden for the case', async () => {
    await withScratchFixtures(() => {
      expect(() =>
        writeOrCompareGolden(CRATE, SLICE, 'never-written', capture, 'compare')
      ).toThrow()
    })
  })

  it('writes nothing in record mode', async () => {
    await withScratchFixtures(() => {
      writeOrCompareGolden(CRATE, SLICE, 'c1', capture, 'record')
      expect(existsSync(goldenDir(CRATE, SLICE))).toBe(false)
    })
  })
})

describe('MANIFEST guard', () => {
  const cases = [{ id: 'a' }, { id: 'b' }]

  it('an empty case list fails', () => {
    expectEmptyCasesToFail(CRATE, SLICE, 2)
    expect(() => assertManifest(CRATE, SLICE, [], 2, 'write')).toThrow(
      /below the floor/
    )
  })

  it('a zero floor is itself refused', () => {
    expect(() => assertManifest(CRATE, SLICE, cases, 0, 'write')).toThrow(
      /floor must be a positive integer/
    )
  })

  it('passes when the manifest, the cases and the expected folders agree', async () => {
    await withScratchFixtures(() => {
      for (const c of cases) {
        writeOrCompareGolden(CRATE, SLICE, c.id, { result: 1 }, 'write')
      }
      syncManifest(CRATE, SLICE, cases, 2, 'write')
      expect(() =>
        assertManifest(CRATE, SLICE, cases, 2, 'compare')
      ).not.toThrow()
    })
  })

  it('fails when the manifest is missing, the count is stale, a folder is extra or the floor is lowered', async () => {
    await withScratchFixtures(() => {
      for (const c of cases) {
        writeOrCompareGolden(CRATE, SLICE, c.id, { result: 1 }, 'write')
      }
      expect(() => assertManifest(CRATE, SLICE, cases, 2, 'compare')).toThrow(
        /MANIFEST.json is missing/
      )

      syncManifest(CRATE, SLICE, cases, 2, 'write')
      expect(() =>
        assertManifest(CRATE, SLICE, [...cases, { id: 'c' }], 2, 'compare')
      ).toThrow()

      writeOrCompareGolden(CRATE, SLICE, 'extra', { result: 1 }, 'write')
      expect(() => assertManifest(CRATE, SLICE, cases, 2, 'compare')).toThrow()

      // A rewrite never lowers the floor already committed.
      syncManifest(CRATE, SLICE, cases, 1, 'write')
      const manifest = JSON.parse(
        readFileSync(join(goldenDir(CRATE, SLICE), 'MANIFEST.json'), 'utf8')
      ) as { count: number; floor: number }
      expect(manifest).toEqual({ count: 2, floor: 2 })
      // A test floor above the committed JSON still wins.
      expect(() => assertManifest(CRATE, SLICE, cases, 3, 'compare')).toThrow(
        /below the floor/
      )
    })
  })

  it('reads deltas.json and never writes it', async () => {
    await withScratchFixtures((root) => {
      expect(loadDeltas(CRATE, SLICE)).toEqual({})
      const dir = goldenDir(CRATE, SLICE)
      mkdirSync(dir, { recursive: true })
      writeFileSync(
        join(dir, 'deltas.json'),
        '{"c1":"Rust refuses the delete"}'
      )
      syncManifest(CRATE, SLICE, [{ id: 'c1' }], 1, 'write')
      expect(loadDeltas(CRATE, SLICE)).toEqual({
        c1: 'Rust refuses the delete'
      })
      expect(existsSync(root)).toBe(true)
    })
  })

  it('a live case with no recording fails outside record mode', async () => {
    await withScratchFixtures(() => {
      expect(() =>
        assertLiveRecorded(CRATE, SLICE, { id: 'l', live: true }, 'compare')
      ).toThrow(/live case not recorded/)
      expect(() =>
        assertLiveRecorded(CRATE, SLICE, { id: 'l', live: true }, 'record')
      ).not.toThrow()
      expect(() =>
        assertLiveRecorded(CRATE, SLICE, { id: 'l' }, 'compare')
      ).not.toThrow()
    })
  })
})

describe('spawn tracer', () => {
  it('records a scripted call with its env diff against the fake-HOME base and serves its output', async () => {
    const fake = createFakeHomeProfile({ prefix: 'gamelib-tracer-test-' })
    try {
      const base = fake.childEnv({})
      const tracer = createSpawnTracer({
        baseEnv: base,
        scripted: [
          { program: 'wineserver', argv: ['-k'], code: 1, stderr: 'no' }
        ]
      })
      const chunks: string[] = []
      const result = await tracer.runner.run('wineserver', ['-k'], {
        env: { ...base, WINEPREFIX: '/p' },
        cwd: '/work',
        stdin: 'in',
        onStderr: (c) => chunks.push(c),
        timeoutMs: 1000
      })
      expect(result.code).toBe(1)
      expect(chunks).toEqual(['no'])
      expect(tracer.records).toEqual([
        {
          program: 'wineserver',
          argv: ['-k'],
          envDiff: { set: { WINEPREFIX: '/p' }, unset: [] },
          cwd: '/work',
          stdin: 'in',
          via: 'run',
          result: { code: 1, stdout: '', stderr: 'no' }
        }
      ])
    } finally {
      fake.dispose()
    }
  })

  it('traces the spawnAsync seam and reports a dropped home variable under replaceEnv', async () => {
    const fake = createFakeHomeProfile({ prefix: 'gamelib-tracer-test-' })
    try {
      const base = fake.childEnv({})
      const kept = Object.fromEntries(
        Object.entries(fake.env).filter(([key]) => key !== 'XDG_DATA_HOME')
      )
      const tracer = createSpawnTracer({
        baseEnv: base,
        scripted: [
          { program: 'which', argv: ['wine'], stdout: '/usr/bin/wine\n' }
        ]
      })
      const out = await tracer.spawnAsync('which', ['wine'], {
        env: { ...kept, LANG: 'C' }
      })
      expect(out.stdout).toBe('/usr/bin/wine\n')
      expect(tracer.records[0]?.envDiff).toEqual({
        set: { LANG: 'C' },
        unset: ['XDG_DATA_HOME']
      })
    } finally {
      fake.dispose()
    }
  })

  it('fails an unscripted call by name and a never-used script on expectAllConsumed', async () => {
    const tracer = createSpawnTracer({
      baseEnv: {},
      scripted: [{ program: 'never', argv: [] }]
    })
    await expect(tracer.runner.run('tar', ['-x'])).rejects.toThrow(
      /unscripted process call: tar/
    )
    expect(() => tracer.expectAllConsumed()).toThrow(/unconsumed scripted/)
    expect(tracer.records).toEqual([])
  })

  it('consumes a non-repeating script once', async () => {
    const tracer = createSpawnTracer({
      baseEnv: {},
      scripted: [{ program: 'ps', argv: [] }]
    })
    await tracer.runner.run('ps', [])
    await expect(tracer.runner.run('ps', [])).rejects.toThrow(/unscripted/)
  })
})

describe('stubDownloadFile', () => {
  it('serves a body by URL with its progress, once, and names an unrecorded URL', async () => {
    await withEngineOracleProfile(async (profile) => {
      const stub = stubDownloadFile([
        {
          url: 'https://x.invalid/a.tar.xz',
          body: 'bytes',
          progress: [{ transferred: 5, total: 5 }]
        }
      ])
      const seen: number[] = []
      const dest = join(profile.tmp, 'a.tar.xz')
      await stub.download('https://x.invalid/a.tar.xz', dest, (p) =>
        seen.push(p.transferred)
      )
      expect(readFileSync(dest, 'utf8')).toBe('bytes')
      expect(seen).toEqual([5])
      stub.expectAllServed()
      await expect(
        stub.download('https://x.invalid/a.tar.xz', dest)
      ).rejects.toThrow(/no download recorded/)
      await expect(
        stub.download('https://x.invalid/other', dest)
      ).rejects.toThrow(/no download recorded for https:\/\/x.invalid\/other/)
    })
  })

  it('fails a recording marked as failing and reports a recording nobody asked for', async () => {
    const stub = stubDownloadFile([
      {
        url: 'https://x.invalid/f',
        body: '',
        fail: 'Download stopped or paused'
      },
      { url: 'https://x.invalid/unused', body: '' }
    ])
    await expect(
      stub.download('https://x.invalid/f', '/unused')
    ).rejects.toThrow('Download stopped or paused')
    expect(() => stub.expectAllServed()).toThrow(/never requested/)
  })
})

describe('recorder', () => {
  it('redacts the key query value and every secret header', () => {
    expect(redactUrl('https://x.invalid/a?b=1&key=sekret&c=2')).toBe(
      'https://x.invalid/a?b=1&key=REDACTED&c=2'
    )
    expect(
      redactHeaders({
        Authorization: 'Bearer abc',
        'X-Auth-Token': 't',
        'Set-Cookie': 'c=1',
        Accept: 'application/json'
      })
    ).toEqual({
      authorization: 'REDACTED',
      'x-auth-token': 'REDACTED',
      'set-cookie': 'REDACTED',
      accept: 'application/json'
    })
  })

  it('records a synthetic exchange with its secret redacted, then replays it and no more', async () => {
    await withScratchFixtures(async () => {
      const options = {
        crate: CRATE,
        slice: SLICE,
        caseId: 'rt',
        synthetic: [
          {
            method: 'GET',
            path: '/x',
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: '{"a":1}'
          }
        ]
      }
      const record = installRecorder({ ...options, mode: 'record' })
      const live = await axios.get('https://x.invalid/x', {
        headers: { Authorization: 'Bearer abc' }
      })
      expect(live.data).toEqual({ a: 1 })
      await record.finish()
      const file = join(recordedCaseDir(CRATE, SLICE, 'rt'), 'exchanges.json')
      expect(readFileSync(file, 'utf8')).not.toContain('abc')

      const replay = installRecorder({ ...options, mode: 'compare' })
      expect((await axios.get('https://x.invalid/x')).data).toEqual({ a: 1 })
      await expect(axios.get('https://x.invalid/y')).rejects.toThrow(
        /no recorded exchange for GET https:\/\/x.invalid\/y/
      )
      await expect(replay.finish()).rejects.toThrow(/unmatched requests/)
    })
  })

  it('refuses a live request the case did not allow, so a binary is never downloaded', async () => {
    await withScratchFixtures(async () => {
      const record = installRecorder({
        crate: CRATE,
        slice: SLICE,
        caseId: 'refuse',
        mode: 'record',
        allowLive: (url) => url.startsWith('https://allowed.invalid/')
      })
      await expect(
        axios.get('https://blocked.invalid/a.tar.xz')
      ).rejects.toThrow(
        /refusing a live request to https:\/\/blocked.invalid\/a.tar.xz/
      )
      await record.finish()
    })
  })
})
