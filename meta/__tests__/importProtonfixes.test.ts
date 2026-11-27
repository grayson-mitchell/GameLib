import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  PythonParseError,
  parseArgs,
  runImport,
  tokenizePython,
  translateFixSource,
  type Attribution
} from '../importProtonfixes'

const SHA = '0123456789abcdef0123456789abcdef01234567'
const BSD2 = `BSD 2-Clause License

Copyright (c) 2018, Chris Simons

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
`
const BSD3 = `${BSD2}
3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products.
`

const ATTRIBUTION: Attribution = {
  url: 'https://example.test/umu-protonfixes',
  rev: SHA,
  copyrightLines: ['Copyright (c) 2018, Chris Simons'],
  licenseText: BSD2
}

const POSTAL = `"""Postal III"""

from protonfixes import util


# Missing fonts for console and various UI
def main() -> None:
    util.protontricks('lucida')
    util.protontricks('courier')
    util.protontricks('lucida')
`

let root: string
const dirs: string[] = []

function makeCheckout(
  files: Record<string, string>,
  license: string | null = BSD2
): string {
  const source = join(root, `src-${dirs.length}`)
  dirs.push(source)
  mkdirSync(join(source, 'gamefixes-steam'), { recursive: true })
  mkdirSync(join(source, '.git', 'refs', 'heads'), { recursive: true })
  writeFileSync(join(source, '.git', 'HEAD'), 'ref: refs/heads/master\n')
  writeFileSync(join(source, '.git', 'refs', 'heads', 'master'), `${SHA}\n`)
  if (license !== null) writeFileSync(join(source, 'LICENSE'), license)
  for (const [name, text] of Object.entries(files))
    writeFileSync(join(source, 'gamefixes-steam', name), text)
  return source
}

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pf-import-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  dirs.length = 0
})

describe('tokenizePython', () => {
  it('joins bracketed and backslash continuations into one logical line', () => {
    const lines = tokenizePython('x = foo(1,\n    2)\ny = 3 + \\\n  4\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]?.tokens.map((t) => t.text)).toEqual([
      'x',
      '=',
      'foo',
      '(',
      '1',
      ',',
      '2',
      ')'
    ])
  })

  it('decodes escapes as Python 3 does and keeps unknown escapes', () => {
    const [line] = tokenizePython(
      String.raw`a = 'HKCU\Software' 'A\\B' "\x41\u00e9\101" r'C:\x' 'q\'q'`
    )
    const values = line?.tokens
      .filter((t) => t.kind === 'string')
      .map((t) => t.value)
    expect(values).toEqual([
      'HKCU\\Software',
      'A\\B',
      'Aé' + 'A',
      'C:\\x',
      "q'q"
    ])
  })

  it('treats f-strings, byte strings and \\N escapes as non-literal', () => {
    const [line] = tokenizePython(
      String.raw`a = f'{x}' b'x' '\N{DASH}' 'plain'`
    )
    const flags = line?.tokens
      .filter((t) => t.kind === 'string')
      .map((t) => t.literal)
    expect(flags).toEqual([false, false, false, true])
  })

  it('throws on an unterminated string and on unbalanced brackets', () => {
    expect(() => tokenizePython('x = """abc\n')).toThrow(PythonParseError)
    expect(() => tokenizePython("x = 'abc\n")).toThrow(PythonParseError)
    expect(() => tokenizePython('x = foo(1\n')).toThrow(PythonParseError)
    expect(() => tokenizePython('x = 1)\n')).toThrow(PythonParseError)
  })

  it('reads number forms and a leading BOM', () => {
    const [line] = tokenizePython('\ufeffx = 0x10 + 1_000 + 0b11 + 1.5\n')
    const ints = line?.tokens
      .filter((t) => t.kind === 'number')
      .map((t) => t.int)
    expect(ints).toEqual([16, 1000, 3, null])
  })
})

describe('translateFixSource (protontricks tracer)', () => {
  it('translates a 10220-shaped file with ordered, deduplicated verbs', () => {
    const result = translateFixSource(POSTAL, '10220', ATTRIBUTION)
    expect(result.status).toBe('translated')
    expect(result.tier1?.winetricks).toEqual(['lucida', 'courier'])
    expect(result.tier1?.title).toBe('Postal III')
    expect(result.tier1?.notes?.['upstream-comment']).toContain(
      'Missing fonts for console'
    )
    expect(result.tier2).toBeUndefined()
  })

  it('carries the BSD-2-Clause attribution in both notes', () => {
    const notes = translateFixSource(POSTAL, '10220', ATTRIBUTION).tier1?.notes
    expect(notes?.['umu-protonfixes']).toContain('BSD-2-Clause')
    expect(notes?.['umu-protonfixes']).toContain(SHA)
    expect(notes?.['umu-protonfixes']).toContain('gamefixes-steam/10220.py')
    expect(notes?.['umu-protonfixes']).toContain(
      'Copyright (c) 2018, Chris Simons'
    )
    expect(notes?.['umu-protonfixes-license']).toBe(BSD2.trim())
  })

  it('never extracts a call inside an if, loop, try or with block', () => {
    const inIf = `from protonfixes import util

def main():
    if True:
        util.protontricks('vcrun2019')
`
    const skipped = translateFixSource(inIf, '1', ATTRIBUTION)
    expect(skipped.status).toBe('skipped')
    expect(skipped.skipReason).toBe('nothing-mapped')
    expect(skipped.unmapped[0]?.reason).toBe('non-declarative-statement')

    const mixed = `from protonfixes import util

def main():
    util.protontricks('corefonts')
    for v in ['a']:
        util.protontricks('vcrun2019')
    try:
        util.protontricks('dotnet48')
    except Exception:
        pass
`
    const partial = translateFixSource(mixed, '2', ATTRIBUTION)
    expect(partial.status).toBe('partial')
    expect(partial.tier1?.winetricks).toEqual(['corefonts'])
    expect(partial.unmapped).toHaveLength(2)
    expect(partial.tier1?.notes?.['protonfixes-unmapped']).toContain(
      '(non-declarative-statement)'
    )
  })

  it('decodes a raw-string verb and adjacent-literal concatenation', () => {
    const src = `from protonfixes import util

def main():
    util.protontricks(r'vcrun2019')
    util.protontricks('dot' 'net' "48")
`
    expect(translateFixSource(src, '3', ATTRIBUTION).tier1?.winetricks).toEqual(
      ['vcrun2019', 'dotnet48']
    )
  })

  it('marks other helpers unsupported-helper in the tracer slice', () => {
    const src = `from protonfixes import util

def main():
    util.protontricks('corefonts')
    util.protonprefix()
    log.info('x')
    x = 1
`
    const result = translateFixSource(src, '4', ATTRIBUTION)
    expect(result.status).toBe('partial')
    expect(result.unmapped.map((u) => u.reason)).toEqual([
      'unsupported-helper:protonprefix',
      'unsupported-call',
      'non-declarative-statement'
    ])
  })

  it('rejects a bad verb and a non-literal argument', () => {
    const src = `from protonfixes import util

def main():
    util.protontricks('ok')
    util.protontricks('bad verb!')
    util.protontricks(os.getenv('X'))
    util.protontricks('a', 'b')
`
    const result = translateFixSource(src, '5', ATTRIBUTION)
    expect(result.unmapped.map((u) => u.reason)).toEqual([
      'invalid-value',
      'non-literal-argument',
      'bad-arguments'
    ])
  })

  it('skips an unterminated triple-quoted string as parse-error', () => {
    const result = translateFixSource(
      '"""Broken\n\ndef main():\n    pass\n',
      '6',
      ATTRIBUTION
    )
    expect(result.status).toBe('skipped')
    expect(result.skipReason).toBe('parse-error')
  })

  it('skips a file without main and a main with nothing in it', () => {
    expect(translateFixSource('x = 1\n', '7', ATTRIBUTION).skipReason).toBe(
      'no-main'
    )
    expect(
      translateFixSource('def main():\n    pass\n', '8', ATTRIBUTION).skipReason
    ).toBe('empty-main')
  })

  it('reports module-level statements as unmapped', () => {
    const src = `from protonfixes import util
import os

DEBUG = True

def main():
    util.protontricks('corefonts')
`
    const result = translateFixSource(src, '9', ATTRIBUTION)
    expect(result.status).toBe('partial')
    expect(result.unmapped).toEqual([
      { line: 4, text: 'DEBUG = True', reason: 'module-level-statement' }
    ])
  })

  it('falls back to a generic title', () => {
    const src = `def main():\n    util.protontricks('corefonts')\n`
    expect(translateFixSource(src, '77', ATTRIBUTION).tier1?.title).toBe(
      'Steam app 77'
    )
  })
})

describe('runImport', () => {
  it('writes attributed candidates and a report, counting every entry', () => {
    const source = makeCheckout({
      '10220.py': POSTAL,
      '20.py': `def main():\n    util.protontricks('corefonts')\n`,
      '30.py': 'def main():\n    pass\n',
      'default.py': 'x = 1\n',
      '__init__.py': ''
    })
    const out = join(root, 'out')
    const { report } = runImport({ source, out })
    expect(report.counts).toEqual({
      total: 5,
      translated: 2,
      partial: 0,
      skipped: 3
    })
    expect(report.source.rev).toBe(SHA)
    expect(report.skipReasons).toEqual({
      'empty-main': 1,
      'not-an-appid-file': 2
    })
    expect(report.files.map((f) => f.file)).toEqual([
      '20.py',
      '30.py',
      '10220.py',
      '__init__.py',
      'default.py'
    ])
    const written = readdirSync(join(out, 'fixes')).sort()
    expect(written).toEqual(['10220-steam.json', '20-steam.json'])
    for (const name of written) {
      expect(readFileSync(join(out, 'fixes', name), 'utf8')).toContain(
        'BSD-2-Clause'
      )
    }
    expect(readJson(join(out, 'report.json')).tool).toBe('importProtonfixes')
  })

  it('counts a symlink escaping the checkout as unsafe-file and never reads it', () => {
    const outside = join(root, 'outside.py')
    writeFileSync(outside, `def main():\n    util.protontricks('SECRETVERB')\n`)
    const source = makeCheckout({})
    symlinkSync(outside, join(source, 'gamefixes-steam', '55.py'))
    const out = join(root, 'out')
    const { report } = runImport({ source, out })
    expect(report.files[0]?.skipReason).toBe('unsafe-file')
    expect(readdirSync(join(out, 'fixes'))).toEqual([])
    expect(readFileSync(join(out, 'report.json'), 'utf8')).not.toContain(
      'SECRETVERB'
    )
  })

  it('follows a symlink that stays inside the checkout', () => {
    const source = makeCheckout({ '10.py': POSTAL })
    symlinkSync('10.py', join(source, 'gamefixes-steam', '11.py'))
    const out = join(root, 'out')
    const { report } = runImport({ source, out })
    expect(report.counts.translated).toBe(2)
    expect(existsSync(join(out, 'fixes', '11-steam.json'))).toBe(true)
  })

  it('refuses a missing LICENSE and a BSD-3 LICENSE, writing nothing', () => {
    const out = join(root, 'out')
    expect(() =>
      runImport({ source: makeCheckout({ '1.py': POSTAL }, null), out })
    ).toThrow(/LICENSE/)
    expect(() =>
      runImport({ source: makeCheckout({ '1.py': POSTAL }, BSD3), out })
    ).toThrow(/BSD-2-Clause/)
    expect(existsSync(out)).toBe(false)
  })

  it('refuses an --out inside the bundled public/fixes layer', () => {
    const source = makeCheckout({ '1.py': POSTAL })
    const out = join(root, 'public', 'fixes', 'x')
    expect(() => runImport({ source, out })).toThrow(/bundled/)
    expect(existsSync(out)).toBe(false)
  })

  it('refuses a non-empty --out unless it is this tool own output and --overwrite is given', () => {
    const source = makeCheckout({ '1.py': POSTAL })
    const stranger = join(root, 'stranger')
    mkdirSync(stranger)
    writeFileSync(join(stranger, 'keep.txt'), 'x')
    expect(() => runImport({ source, out: stranger })).toThrow(/not empty/)
    expect(() => runImport({ source, out: stranger, overwrite: true })).toThrow(
      /not empty/
    )
    expect(existsSync(join(stranger, 'keep.txt'))).toBe(true)

    const out = join(root, 'mine')
    runImport({ source, out })
    expect(() => runImport({ source, out })).toThrow(/--overwrite/)
    expect(() => runImport({ source, out, overwrite: true })).not.toThrow()
  })

  it('is byte-identical across two runs', () => {
    const source = makeCheckout({
      '10220.py': POSTAL,
      '5.py': `def main():\n    util.protontricks('x')\n    util.protonprefix()\n`
    })
    const a = join(root, 'a')
    const b = join(root, 'b')
    runImport({ source, out: a })
    runImport({ source, out: b })
    const files = [
      'report.json',
      ...readdirSync(join(a, 'fixes')).map((n) => `fixes/${n}`)
    ]
    for (const f of files)
      expect(readFileSync(join(a, f), 'utf8')).toBe(
        readFileSync(join(b, f), 'utf8')
      )
  })

  it('honours --only and still counts every entry in the total', () => {
    const source = makeCheckout({
      '1.py': POSTAL,
      '2.py': POSTAL,
      '3.py': POSTAL
    })
    const out = join(root, 'out')
    const { report } = runImport({ source, out, only: ['2'] })
    expect(report.counts).toEqual({
      total: 3,
      translated: 1,
      partial: 0,
      skipped: 0,
      notSelected: 2
    })
    expect(readdirSync(join(out, 'fixes'))).toEqual(['2-steam.json'])
  })

  it('resolves a revision from packed-refs and rejects a malformed one', () => {
    const source = makeCheckout({ '1.py': POSTAL })
    rmSync(join(source, '.git', 'refs'), { recursive: true })
    writeFileSync(
      join(source, '.git', 'packed-refs'),
      `${SHA} refs/heads/master\n`
    )
    expect(runImport({ source, out: join(root, 'o1') }).report.source.rev).toBe(
      SHA
    )
    expect(() =>
      runImport({ source, out: join(root, 'o2'), sourceRev: 'main' })
    ).toThrow(/40 lowercase hex/)
  })
})

describe('parseArgs', () => {
  it('parses flags and requires --source and --out', () => {
    expect(
      parseArgs(['--source', 'a', '--out=b', '--only', '1, 2', '--overwrite'])
    ).toMatchObject({
      source: 'a',
      out: 'b',
      only: ['1', '2'],
      overwrite: true
    })
    expect(() => parseArgs(['--source', 'a'])).toThrow(/required/)
    expect(() => parseArgs(['--source', 'a', '--out', 'b', '--x'])).toThrow(
      /unknown flag/
    )
  })
})

const call = (body: string): string =>
  `from protonfixes import util\n\ndef main():\n${body
    .split('\n')
    .map((l) => `    ${l}`)
    .join('\n')}\n`

const translate = (body: string, appId = '1') =>
  translateFixSource(call(body), appId, ATTRIBUTION)

const reasons = (body: string): string[] =>
  translate(body).unmapped.map((u) => u.reason)

describe('set_environment', () => {
  it('maps to envVariables, last value wins, and validates keys and values', () => {
    const result = translate(
      "util.set_environment('DXVK_ASYNC', '1')\nutil.set_environment('A', 'x')\nutil.set_environment('DXVK_ASYNC', '2')"
    )
    expect(result.tier1?.envVariables).toEqual({ DXVK_ASYNC: '2', A: 'x' })
    expect(
      reasons(
        "util.set_environment('bad-key', '1')\nutil.set_environment('K', 'a\\0b')"
      )
    ).toEqual(['invalid-value', 'invalid-value'])
  })

  it('leaves PROTON_ variables unmapped', () => {
    const result = translate("util.set_environment('PROTON_USE_WINED3D', '1')")
    expect(result.status).toBe('skipped')
    expect(result.unmapped[0]?.reason).toBe('proton-launcher-env')
  })

  it('routes WINEDLLOVERRIDES to dllOverrides, never envVariables', () => {
    const src = `util.replace_command('Launcher.exe', 'Game.exe')\nutil.set_environment('WINEDLLOVERRIDES', 'xaudio2_7=n;d3d9,d3d10=n,b')`
    const result = translate(src)
    expect(result.tier1?.envVariables).toBeUndefined()
    expect(result.tier2?.dllOverrides).toEqual([
      {
        exe: 'Game.exe',
        dlls: {
          xaudio2_7: 'native',
          d3d9: 'native,builtin',
          d3d10: 'native,builtin'
        }
      }
    ])
    expect(
      reasons("util.set_environment('WINEDLLOVERRIDES', 'd3d9=x')")
    ).toEqual(['invalid-value'])
    expect(reasons("util.set_environment('WINEDLLOVERRIDES', 'd3d9')")).toEqual(
      ['invalid-value']
    )
  })
})

describe('append_argument', () => {
  it('maps to launchArgs keeping order and duplicates', () => {
    const result = translate(
      "util.append_argument('-dx11')\nutil.append_argument('-a b')\nutil.append_argument('-dx11')"
    )
    expect(result.tier1?.launchArgs).toEqual(['-dx11', '-a b', '-dx11'])
    expect(reasons('util.append_argument(5)')).toEqual(['non-literal-argument'])
    expect(reasons('util.append_argument()')).toEqual(['bad-arguments'])
  })
})

describe('replace_command', () => {
  it('maps an exe replacement to exeOverride with a caveat note', () => {
    const result = translate("util.replace_command('Launcher.exe', 'Game.exe')")
    expect(result.tier1?.exeOverride).toBe('Game.exe')
    expect(result.tier1?.notes?.exeOverride).toContain('Launcher.exe')
    expect(result.tier1?.notes?.exeOverride).toContain('Game.exe')
  })

  it('accepts regex escapes in the original and a subfolder target', () => {
    const result = translate(
      "util.replace_command('launcher\\\\.exe$', 'bin\\\\xblades.exe')"
    )
    expect(result.tier1?.exeOverride).toBe('bin/xblades.exe')
  })

  it('rejects non-exe replacements, unsafe paths and repeats', () => {
    expect(reasons("util.replace_command('-issteam', '')")).toEqual([
      'replace-command-not-exe'
    ])
    expect(
      reasons("util.replace_command('Launcher.exe', '-nolauncher')")
    ).toEqual(['replace-command-not-exe'])
    expect(
      reasons("util.replace_command('eg2.exe', '../bin/evil.exe')")
    ).toEqual(['invalid-value'])
    expect(reasons("util.replace_command('a.exe', '/abs/b.exe')")).toEqual([
      'invalid-value'
    ])
    expect(reasons("util.replace_command('a.exe', 'C:/b.exe')")).toEqual([
      'invalid-value'
    ])
    expect(
      reasons(
        "util.replace_command('a.exe', 'b.exe')\nutil.replace_command('c.exe', 'd.exe')"
      )
    ).toEqual(['multiple-exe-overrides'])
    expect(
      reasons("util.replace_command('a.exe', 'b.exe', re.NOFLAG)")
    ).toEqual(['bad-arguments'])
    expect(
      reasons("util.replace_command('a.exe', 'b.exe', match_flags=0)")
    ).toEqual(['bad-arguments'])
  })
})

describe('winedll_override', () => {
  it('never invents an exe: without one it is dll-override-exe-unknown', () => {
    const result = translate(
      "util.winedll_override('d3d11', util.OverrideOrder.NATIVE)"
    )
    expect(result.status).toBe('skipped')
    expect(result.tier2).toBeUndefined()
    expect(result.unmapped[0]?.reason).toBe('dll-override-exe-unknown')
  })

  it('uses the basename of a mapped exeOverride', () => {
    const result = translate(
      "util.replace_command('Launcher.exe', 'bin/Game.exe')\nutil.winedll_override('d3d11', util.OverrideOrder.NATIVE)"
    )
    expect(result.status).toBe('translated')
    expect(result.tier2?.dllOverrides).toEqual([
      { exe: 'Game.exe', dlls: { d3d11: 'native' } }
    ])
    expect(result.tier2?.evidence).toBe(
      `${ATTRIBUTION.url}/blob/${SHA}/gamefixes-steam/1.py`
    )
    expect(Object.keys(result.tier2 ?? {})).toEqual([
      'title',
      'evidence',
      'notes',
      'dllOverrides'
    ])
  })

  it('maps every mode spelling and strips a .dll suffix', () => {
    const modes: Array<[string, string]> = [
      ["'n'", 'native'],
      ["'b'", 'builtin'],
      ["'n,b'", 'native,builtin'],
      ["'b,n'", 'builtin,native'],
      ["''", 'disabled'],
      ['OverrideOrder.NATIVE', 'native'],
      ['util.OverrideOrder.BUILTIN', 'builtin'],
      ['util.OverrideOrder.NATIVE_BUILTIN', 'native,builtin'],
      ['util.OverrideOrder.BUILTIN_NATIVE', 'builtin,native'],
      ['util.OverrideOrder.DISABLED', 'disabled']
    ]
    for (const [literal, mode] of modes) {
      const result = translate(
        `util.replace_command('a.exe', 'G.exe')\nutil.winedll_override('d3d9.DLL', ${literal})`
      )
      expect(result.tier2?.dllOverrides?.[0]?.dlls).toEqual({ d3d9: mode })
    }
    expect(
      reasons("util.winedll_override('bad name', util.OverrideOrder.NATIVE)")
    ).toEqual(['invalid-value'])
  })

  it('drops overrides when the exe fails the dllOverrides exe rule', () => {
    const result = translate(
      "util.replace_command('a.exe', 'bin/we$ird.exe')\nutil.winedll_override('d3d9', util.OverrideOrder.NATIVE)"
    )
    expect(result.unmapped.map((u) => u.reason)).toContain(
      'dll-override-exe-unknown'
    )
    expect(result.tier2).toBeUndefined()
  })
})

describe('regedit_add', () => {
  it('maps a DWORD from hex, with no views by default', () => {
    const result = translate(
      "util.regedit_add('HKCU\\\\Software\\\\Game', 'Opt', 'REG_DWORD', '0x10')"
    )
    expect(result.tier2?.registry).toEqual([
      { key: 'HKCU\\Software\\Game', name: 'Opt', type: 'REG_DWORD', value: 16 }
    ])
    expect(result.tier1).toBeUndefined()
  })

  it('maps arch=True to views [64], REG_SZ verbatim, canonical root and type', () => {
    const result = translate(
      "util.regedit_add('hkcu\\\\Software\\\\Game', 'Path', 'reg_sz', 'C:\\\\x', arch=True)\nutil.regedit_add('HKEY_LOCAL_MACHINE\\\\Software\\\\G', 'N', 'REG_DWORD', 7)"
    )
    expect(result.tier2?.registry).toEqual([
      {
        key: 'HKCU\\Software\\Game',
        name: 'Path',
        type: 'REG_SZ',
        value: 'C:\\x',
        views: [64]
      },
      {
        key: 'HKEY_LOCAL_MACHINE\\Software\\G',
        name: 'N',
        type: 'REG_DWORD',
        value: 7
      }
    ])
  })

  it('classifies key-only, unsupported types and invalid values', () => {
    expect(
      reasons(
        "util.regedit_add('HKLM\\\\Software\\\\Ubisoft')\nutil.regedit_add('HKLM\\\\Software\\\\X', 'n')"
      )
    ).toEqual(['registry-key-only', 'registry-key-only'])
    expect(
      reasons(
        "util.regedit_add('HKLM\\\\Software\\\\X', 'n', 'REG_BINARY', '00')"
      )
    ).toEqual(['unsupported-registry-type'])
    expect(
      reasons(
        "util.regedit_add('HKLM\\\\Software\\\\X', 'n', 'REG_MULTI_SZ', 'a')\nutil.regedit_add('HKLM\\\\Software\\\\X', 'n', 'REG_EXPAND_SZ', 'a')"
      )
    ).toEqual(['unsupported-registry-type', 'unsupported-registry-type'])
    expect(
      reasons(
        [
          "util.regedit_add('HKCR\\\\X', 'n', 'REG_SZ', 'v')",
          "util.regedit_add('HKCU\\\\\\\\X', 'n', 'REG_SZ', 'v')",
          "util.regedit_add('HKCU\\\\X\\\\', 'n', 'REG_SZ', 'v')",
          "util.regedit_add('HKCU\\\\X', 'n', 'REG_SZ', 'a\"b')",
          "util.regedit_add('HKCU\\\\X', '/n', 'REG_SZ', 'v')",
          "util.regedit_add('HKCU\\\\X', 'n', 'REG_DWORD', '0x100000000')",
          "util.regedit_add('HKCU\\\\X', 'n', 'REG_DWORD', 'abc')",
          "util.regedit_add('HKCU\\\\X', 'n', 'REG_SZ', '" +
            'x'.repeat(1025) +
            "')"
        ].join('\n')
      )
    ).toEqual(Array(8).fill('invalid-value'))
  })

  it('routes the Wine DllOverrides key to dllOverrides, not registry', () => {
    const result = translate(
      "util.replace_command('a.exe', 'G.exe')\nutil.regedit_add('HKCU\\\\Software\\\\Wine\\\\DllOverrides', 'd3d9', 'REG_SZ', 'native')"
    )
    expect(result.tier2?.registry).toBeUndefined()
    expect(result.tier2?.dllOverrides).toEqual([
      { exe: 'G.exe', dlls: { d3d9: 'native' } }
    ])
  })
})

describe('not applicable and other helpers', () => {
  it('records esync/fsync/nvapi without affecting classification', () => {
    const result = translate(
      "util.protontricks('corefonts')\nutil.disable_esync()\nutil.disable_fsync()\nutil.disable_nvapi()"
    )
    expect(result.status).toBe('translated')
    expect(result.notApplicable.map((n) => n.helper)).toEqual([
      'disable_esync',
      'disable_fsync',
      'disable_nvapi'
    ])
  })

  it('skips a file with only not-applicable helpers', () => {
    const result = translate('util.disable_esync()\nutil.disable_fsync()')
    expect(result.status).toBe('skipped')
    expect(result.skipReason).toBe('only-not-applicable')
  })

  it('marks other util helpers unsupported-helper', () => {
    expect(
      reasons(
        "util.protonprefix()\nutil.set_cpu_topology_limit(4)\nutil.del_environment('X')\nutil.get_game_install_path()"
      )
    ).toEqual([
      'unsupported-helper:protonprefix',
      'unsupported-helper:set_cpu_topology_limit',
      'unsupported-helper:del_environment',
      'unsupported-helper:get_game_install_path'
    ])
  })

  it('honours bare helpers imported from a util module', () => {
    const src = `from protonfixes.util import protontricks, set_environment as senv\n\ndef main():\n    protontricks('corefonts')\n    senv('A', 'b')\n`
    const result = translateFixSource(src, '1', ATTRIBUTION)
    expect(result.tier1?.winetricks).toEqual(['corefonts'])
    expect(result.tier1?.envVariables).toEqual({ A: 'b' })
  })
})

describe('profile and tier-1 file emission', () => {
  it('writes both files for a mixed fix, each attributed', () => {
    const result = translate(
      "util.protontricks('corefonts')\nutil.regedit_add('HKCU\\\\Software\\\\G', 'A', 'REG_DWORD', '1')"
    )
    expect(result.emitted).toEqual({
      tier1: ['winetricks'],
      tier2: ['registry']
    })
    expect(result.tier1?.notes?.['umu-protonfixes']).toContain('BSD-2-Clause')
    expect(result.tier2?.notes?.['umu-protonfixes']).toContain('BSD-2-Clause')
    expect(result.tier2?.notes?.exeOverride).toBeUndefined()
  })

  it('writes only the profile when no tier-1 key exists', () => {
    const result = translate(
      "util.regedit_add('HKCU\\\\Software\\\\G', 'A', 'REG_DWORD', '1')"
    )
    expect(result.tier1).toBeUndefined()
    expect(result.tier2).toBeDefined()
  })

  it('writes .profile.json files through runImport', () => {
    const source = makeCheckout({
      '1.py': call(
        "util.regedit_add('HKCU\\\\Software\\\\G', 'A', 'REG_DWORD', '1')"
      )
    })
    const out = join(root, 'out')
    const { tier1Files, tier2Files } = runImport({ source, out })
    expect([tier1Files, tier2Files]).toEqual([0, 1])
    expect(readdirSync(join(out, 'fixes'))).toEqual(['1-steam.profile.json'])
  })
})

describe('allow-list drift against gamelib-knownfix types.rs', () => {
  const rust = readFileSync(
    join(
      __dirname,
      '..',
      '..',
      'src-tauri',
      'crates',
      'gamelib-knownfix',
      'src',
      'types.rs'
    ),
    'utf8'
  )
  const list = (name: string): string[] => {
    const match = new RegExp(
      `${name}: \\[&str; \\d+\\] = \\[([^\\]]*)\\]`
    ).exec(rust)
    expect(match).not.toBeNull()
    return [...(match?.[1] ?? '').matchAll(/"([A-Za-z]+)"/g)].map(
      (m) => m[1] ?? ''
    )
  }

  it('lists every key the importer emits in the matching tier', () => {
    const tier1 = list('TIER1_KNOWN_FIX_KEYS')
    const tier2 = list('TIER2_PROFILE_KEYS')
    const mixed = translate(
      [
        "util.protontricks('a')",
        "util.set_environment('A', 'b')",
        "util.append_argument('-x')",
        "util.replace_command('a.exe', 'b.exe')",
        "util.winedll_override('d3d9', util.OverrideOrder.NATIVE)",
        "util.regedit_add('HKCU\\\\Software\\\\G', 'A', 'REG_DWORD', '1')",
        'util.unknown()'
      ].join('\n')
    )
    for (const key of Object.keys(mixed.tier1 ?? {}))
      expect(tier1).toContain(key)
    for (const key of Object.keys(mixed.tier2 ?? {}))
      expect(tier2).toContain(key)
    for (const fix of ['registry', 'dllOverrides'])
      expect(tier1).not.toContain(fix)
    expect(Object.keys(mixed.tier1 ?? {})).toEqual([
      'title',
      'notes',
      'winetricks',
      'envVariables',
      'launchArgs',
      'exeOverride'
    ])
  })
})
