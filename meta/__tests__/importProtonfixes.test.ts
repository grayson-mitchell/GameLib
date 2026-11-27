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
