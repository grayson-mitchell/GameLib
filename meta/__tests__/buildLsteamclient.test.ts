import { existsSync, readdirSync, readFileSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'

import {
  LSTEAMCLIENT_BASES,
  LSTEAMCLIENT_PINS,
  buildUnixCompileArgv,
  buildUnixLinkArgv,
  checkLsteamclientOutputs,
  isAllowedSourceUrl,
  lsteamclientOutputDir,
  lsteamclientTreeDigest,
  registerLsteamclientInConfigure,
  stripGameLibTraceBlocks,
  unixSourcesFromMakefileIn,
  type OutputFacts
} from '../buildLsteamclient'

const OVERLAY = 'native/steam-bridge/steamclient-layer/lsteamclient'
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')
const enc = (s: string) => new TextEncoder().encode(s)

describe('lsteamclientTreeDigest', () => {
  // Expected value: in a scratch dir holding a/x="one", a-b/x="two", b="three"
  // run the NotProton fetch.sh one-liner through `python3 -I`
  // (sorted(q for q in root.rglob("*") if q.is_file()), update with
  // sha256(relpath).digest() then sha256(bytes).digest()).
  const EXPECTED =
    '397c1bd5aba52b681740ae11314afa21d413d464cab55936105c1cce5e99efd7'
  const files = [
    { relPath: 'b', bytes: enc('three') },
    { relPath: 'a-b/x', bytes: enc('two') },
    { relPath: 'a/x', bytes: enc('one') }
  ]
  it('sorts segment-wise like Python pathlib', () => {
    expect(lsteamclientTreeDigest(files)).toBe(EXPECTED)
  })
  it('changes when contents are swapped', () => {
    const swapped = [
      { relPath: 'b', bytes: enc('three') },
      { relPath: 'a-b/x', bytes: enc('one') },
      { relPath: 'a/x', bytes: enc('two') }
    ]
    expect(lsteamclientTreeDigest(swapped)).not.toBe(EXPECTED)
  })
})

describe('pins', () => {
  it('carries the Proton, overlay and base pins', () => {
    expect(LSTEAMCLIENT_PINS.protonCommit).toBe(
      '164e0ccd2ea2b1ec2e5d08dc97f65b184c2539ca'
    )
    expect(LSTEAMCLIENT_PINS.treeDigest).toBe(
      'b286df1df46a70d9e2cc674676afcc6e08b1a56ce472e5add0932b86940657bf'
    )
    expect(LSTEAMCLIENT_PINS.licenseSha256).toBe(
      '80fda9147f8ee707cd18d1d6d71b307063fa3a02057a7c789de47f7c003510f1'
    )
    expect(Object.keys(LSTEAMCLIENT_PINS.overlay).sort()).toEqual([
      'steamclient_main.c',
      'unix_steam_input_manual.cpp',
      'unixlib.cpp'
    ])
    const cx = LSTEAMCLIENT_BASES.crossover['26.3.0.39832']
    expect(cx.url).toBe(
      'https://media.codeweavers.com/pub/crossover/source/crossover-sources-26.3.0.tar.gz'
    )
    expect(cx.sha256).toBe(
      'ac99c8ca4b3848f3e81784135f023df266b61c2345726ea55a50b3e030dd6872'
    )
    expect(cx.size).toBe(149054023)
    expect(cx.wineDir).toBe('sources/wine')
    expect(LSTEAMCLIENT_BASES.wine.tag).toBe('wine-11.15')
    expect(LSTEAMCLIENT_BASES.wine.commit).toBe(
      '2df1ee28039cf84776eb1421ed90bd154cebb65f'
    )
  })
})

describe('stripGameLibTraceBlocks', () => {
  const B = '/* GAMELIB-DRM-TRACE BEGIN (Phase 56 D-15/D-16) */'
  const E = '/* GAMELIB-DRM-TRACE END */'
  it('strips the committed file back to the upstream sha', () => {
    const text = readFileSync(join(OVERLAY, 'steamclient_main.c'), 'utf8')
    const stripped = stripGameLibTraceBlocks(text)
    expect(stripped).not.toBeNull()
    expect(sha(stripped as string)).toBe(
      LSTEAMCLIENT_PINS.overlay['steamclient_main.c']
    )
  })
  it('removes a balanced block', () => {
    expect(stripGameLibTraceBlocks(`a\n  ${B}\nx\n  ${E}\nb\n`)).toBe('a\nb\n')
  })
  it('rejects malformed markers', () => {
    expect(stripGameLibTraceBlocks(`${B}\nx\n`)).toBeNull()
    expect(stripGameLibTraceBlocks(`${B}\n${B}\n${E}\n${E}\n`)).toBeNull()
    expect(stripGameLibTraceBlocks(`${E}\n`)).toBeNull()
    expect(stripGameLibTraceBlocks(`int x; ${B}\n${E}\n`)).toBeNull()
  })
})

describe('verbatim overlay', () => {
  it.each(['unixlib.cpp', 'unix_steam_input_manual.cpp'] as const)(
    '%s matches its pin',
    (name) => {
      expect(sha(readFileSync(join(OVERLAY, name)))).toBe(
        LSTEAMCLIENT_PINS.overlay[name]
      )
    }
  )
})

describe('registerLsteamclientInConfigure', () => {
  const fixture =
    'x\nenable_localui\ny\nwine_fn_config_makefile dlls/localui/tests enable_tests\nz\n'
  it('inserts after both anchors and is idempotent', () => {
    const out = registerLsteamclientInConfigure(fixture) as string
    expect(out).toContain('enable_localui\nenable_lsteamclient\ny')
    expect(out).toContain(
      'enable_tests\nwine_fn_config_makefile dlls/lsteamclient enable_lsteamclient\nz'
    )
    expect(out).not.toContain('steam_exe')
    expect(registerLsteamclientInConfigure(out)).toBe(out)
  })
  it('returns null when an anchor is missing', () => {
    expect(registerLsteamclientInConfigure('enable_localui\n')).toBeNull()
    expect(
      registerLsteamclientInConfigure(
        'wine_fn_config_makefile dlls/localui/tests enable_tests\n'
      )
    ).toBeNull()
  })
})

describe('unixSourcesFromMakefileIn', () => {
  it('returns .cpp entries in order', () => {
    const text = [
      '# comment foo.cpp',
      'MODULE = lsteamclient.dll',
      'SOURCES = \\',
      '\tsteamclient_main.c \\',
      '\tlsteamclient.spec',
      'UNIX_SOURCES = \\',
      '\tunixlib.cpp \\',
      '\tunix_steam_input_manual.cpp',
      ''
    ].join('\n')
    expect(unixSourcesFromMakefileIn(text)).toEqual([
      'unixlib.cpp',
      'unix_steam_input_manual.cpp'
    ])
  })
})

describe('unix argv', () => {
  it('compile argv', () => {
    const a = buildUnixCompileArgv({
      src: '/s',
      build: '/b',
      cpp: '/s/dlls/lsteamclient/unixlib.cpp',
      obj: '/b/u.o',
      prefixMap: '/work'
    })
    expect(a.command).toBe('/usr/bin/clang++')
    for (const f of [
      '-DWINE_UNIX_LIB',
      '-Dprivate=public',
      '-Dprotected=public',
      '-fPIC',
      '-mmacosx-version-min=15.0',
      '-ffile-prefix-map=/work=/gamelib-lsteamclient'
    ])
      expect(a.args).toContain(f)
    const i = a.args.indexOf('-arch')
    expect(a.args[i + 1]).toBe('x86_64')
    const c = a.args.indexOf('-c')
    expect(a.args[c + 1]).toBe('/s/dlls/lsteamclient/unixlib.cpp')
  })
  it('link argv', () => {
    const a = buildUnixLinkArgv({
      build: '/b',
      objs: ['/b/1.o', '/b/2.o'],
      out: '/b/lsteamclient.so'
    })
    expect(a.command).toBe('/usr/bin/clang')
    for (const f of [
      '-dynamiclib',
      '@rpath/lsteamclient.so',
      '-Wl,-rpath,@loader_path/',
      '/b/dlls/ntdll/ntdll.so',
      '-lc++',
      '-Wl,-undefined,dynamic_lookup'
    ])
      expect(a.args).toContain(f)
    expect(a.args.indexOf('/b/1.o')).toBeLessThan(a.args.indexOf('/b/2.o'))
    expect(a.args.join(' ')).not.toContain('native/steam-bridge/')
  })
})

describe('checkLsteamclientOutputs', () => {
  const pe = new Uint8Array(4096)
  pe[0x3c] = 0x80
  pe.set([0x50, 0x45, 0, 0, 0x64, 0x86], 0x80)
  const good = (): OutputFacts => ({
    peHead: pe,
    peSize: 2_000_000,
    soSize: 2_000_000,
    soArchs: 'x86_64\n',
    codesignText: 'lsteamclient.so: code object is not signed at all',
    objdumpExportsText: 'CreateInterface\nsteamclient_init_registry\n',
    otoolText: 'lsteamclient.so:\n\t@rpath/foo\n\t/usr/lib/libc++.1.dylib',
    workRoot: '/work',
    homeDir: '/Users/me',
    containsBytes: (file, needle) =>
      file === 'pe' && needle === '[drm-trace] appId='
  })
  it('passes when every gate holds', () => {
    expect(checkLsteamclientOutputs(good())).toEqual({ ok: true })
  })
  const cases: [string, (f: OutputFacts) => OutputFacts][] = [
    ['pe size', (f) => ({ ...f, peSize: 10 })],
    ['pe machine', (f) => ({ ...f, peHead: new Uint8Array(4096) })],
    ['so size', (f) => ({ ...f, soSize: 10 })],
    ['so arch', (f) => ({ ...f, soArchs: 'x86_64 arm64' })],
    ['so signed', (f) => ({ ...f, codesignText: 'Signature=adhoc' })],
    [
      'export CreateInterface',
      (f) => ({ ...f, objdumpExportsText: 'steamclient_init_registry' })
    ],
    [
      'export steamclient_init_registry',
      (f) => ({ ...f, objdumpExportsText: 'CreateInterface' })
    ],
    ['trace string', (f) => ({ ...f, containsBytes: () => false })],
    [
      'so work-dir dependency',
      (f) => ({ ...f, otoolText: 'x:\n\t/work/lib/x.dylib' })
    ],
    [
      'home path in pe',
      (f) => ({ ...f, containsBytes: (file) => file === 'pe' })
    ],
    [
      'home path in so',
      (f) => ({
        ...f,
        containsBytes: (file, n) =>
          n === '[drm-trace] appId=' ? true : file === 'so'
      })
    ]
  ]
  it.each(cases)('fails on %s', (name, mutate) => {
    const r = checkLsteamclientOutputs(mutate(good()))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failures).toContain(name)
  })
})

describe('isAllowedSourceUrl', () => {
  it('allows the three hosts over https only', () => {
    expect(isAllowedSourceUrl('https://codeload.github.com/x')).toBe(true)
    expect(isAllowedSourceUrl('https://media.codeweavers.com/x')).toBe(true)
    expect(isAllowedSourceUrl('https://gitlab.winehq.org/wine/wine.git')).toBe(
      true
    )
    expect(isAllowedSourceUrl('http://codeload.github.com/x')).toBe(false)
    expect(isAllowedSourceUrl('https://example.com/x')).toBe(false)
    expect(isAllowedSourceUrl('https://u:p@codeload.github.com/x')).toBe(false)
    expect(isAllowedSourceUrl('not a url')).toBe(false)
  })
})

describe('lsteamclientOutputDir', () => {
  it('maps a build to the component dir', () => {
    const d = lsteamclientOutputDir('26.3.0.39832')
    expect(d).toBe(
      join('build', 'steamclient-layer', 'steamclient-layer-cx26.3.0.39832')
    )
    expect(d).not.toContain(join('build', 'bin'))
    expect(d).not.toContain(join('public', 'bin'))
  })
  it('rejects invalid builds', () => {
    expect(() => lsteamclientOutputDir('26.3')).toThrow()
    expect(() => lsteamclientOutputDir('../x')).toThrow()
  })
})

describe('source gates', () => {
  const src = readFileSync('meta/buildLsteamclient.ts', 'utf8')
  it('uses fake-HOME spawns and the standard main shape', () => {
    expect(src).toContain('createFakeHomeProfile')
    expect(src).toContain('export async function main')
    expect(src).not.toContain("from './buildSteamBridgeShims'")
    expect(src).not.toContain("from './buildDrmNativeParts'")
  })
  it('is unreachable from the shim build and CI', () => {
    expect(readFileSync('meta/buildSteamBridgeShims.ts', 'utf8')).not.toContain(
      'buildLsteamclient'
    )
    const dir = '.github/workflows'
    if (existsSync(dir))
      for (const f of readdirSync(dir)) {
        const t = readFileSync(join(dir, f), 'utf8')
        expect(t).not.toContain('buildLsteamclient')
        expect(t).not.toContain('build:lsteamclient')
      }
  })
  it('has the package script', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(pkg.scripts['build:lsteamclient']).toBe(
      'node meta/runTs.cjs --bundle --platform=node --target=node22 meta/buildLsteamclient.ts'
    )
  })
})
