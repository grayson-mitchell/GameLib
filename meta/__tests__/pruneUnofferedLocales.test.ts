/**
 * Fixture-driven + live-pin coverage for meta/pruneUnofferedLocales.ts
 * (quick task 260922-hjb). Temp-dir fixtures are `fs.mkdtempSync`-created
 * under `os.tmpdir()` and torn down in `afterEach`, exactly as
 * `pruneStaleHelperBinaries.test.ts:46-51` does -- nothing here writes to,
 * deletes from, or otherwise mutates the real `public/locales`,
 * `build/locales` or `build/renderer`. The ONE exception is the live-pin
 * describe block below, which only ever READS the real `public/locales`.
 *
 * Exercises the guard's FAILING direction for each of its four conditions,
 * not just the passing one -- this repo has a standing lesson that a gate
 * whose failing direction is never exercised proves nothing.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { assembleRendererDist } from '../assembleRendererDist'
import {
  assessOfferedLocales,
  computeUnofferedLocaleDirs,
  pruneUnofferedLocales
} from '../pruneUnofferedLocales'
import { supportedLanguages } from '../../src/common/languages'

// Hand-written ON PURPOSE, only here: this is the test's expectation, and an
// expectation computed by the same code under test would assert nothing.
const UNREACHABLE_CODES = ['br', 'da', 'ka', 'sl', 'th', 'uz']

let workDir: string

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'hjb-locales-'))
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

function localesPath(): string {
  return join(workDir, 'locales')
}

function writeFile(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

function writeLocaleDir(localesDir: string, code: string): void {
  writeFile(join(localesDir, code, 'translation.json'), '{"key":"value"}')
}

function seedRealisticLocalesTree(localesDir: string): void {
  for (const code of supportedLanguages) {
    writeLocaleDir(localesDir, code)
  }
  for (const code of UNREACHABLE_CODES) {
    writeLocaleDir(localesDir, code)
  }
}

describe('computeUnofferedLocaleDirs -- LIVE PIN against the real repo tree', () => {
  const PUBLIC_LOCALES_DIR = join(__dirname, '..', '..', 'public', 'locales')

  it('the real public/locales tree has exactly the six known-unreachable codes unoffered', () => {
    expect(
      computeUnofferedLocaleDirs(PUBLIC_LOCALES_DIR, supportedLanguages)
    ).toEqual([...UNREACHABLE_CODES].sort())
  })

  it('every offered code in supportedLanguages has a matching directory under public/locales', () => {
    const presentDirs = readdirSync(PUBLIC_LOCALES_DIR, {
      withFileTypes: true
    })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)

    for (const code of supportedLanguages) {
      expect(presentDirs).toContain(code)
    }
  })
})

describe('computeUnofferedLocaleDirs -- temp-dir coverage', () => {
  it('ignores loose files -- only directories count', () => {
    writeLocaleDir(localesPath(), 'en')
    writeFile(join(localesPath(), 'README.md'), 'not a locale dir')

    expect(computeUnofferedLocaleDirs(localesPath(), ['en'])).toEqual([])
  })

  it('returns [] for a non-existent directory', () => {
    expect(
      computeUnofferedLocaleDirs(join(workDir, 'does-not-exist'), supportedLanguages)
    ).toEqual([])
  })

  it('returns [] when every present directory is offered', () => {
    writeLocaleDir(localesPath(), 'en')
    writeLocaleDir(localesPath(), 'fr')

    expect(computeUnofferedLocaleDirs(localesPath(), ['en', 'fr'])).toEqual([])
  })
})

describe('assessOfferedLocales -- each guard condition in isolation', () => {
  it('offered list below OFFERED_FLOOR (20) -> ok: false', () => {
    const result = assessOfferedLocales(['en'], ['en', 'xx'], ['xx'])

    expect(result.ok).toBe(false)
    expect(result.reasons.some((r) => r.includes('floor'))).toBe(true)
  })

  it("offered list without 'en' -> ok: false", () => {
    const offered = Array.from({ length: 25 }, (_, i) => `l${i}`)
    const result = assessOfferedLocales(offered, [...offered, 'xx'], ['xx'])

    expect(result.ok).toBe(false)
    expect(result.reasons.some((r) => r.includes("does not contain 'en'"))).toBe(
      true
    )
  })

  it("a prune set containing 'en' -> ok: false", () => {
    const offered = supportedLanguages
    const result = assessOfferedLocales(offered, [...offered, 'zz'], ['en'])

    expect(result.ok).toBe(false)
    expect(
      result.reasons.some((r) => r.includes("prune set contains 'en'"))
    ).toBe(true)
  })

  it('a prune set exceeding MAX_PRUNE_FRACTION (0.25) of present directories -> ok: false', () => {
    const offered = supportedLanguages
    const extra = Array.from({ length: 15 }, (_, i) => `zz${i}`)
    const present = [...offered, ...extra]
    const result = assessOfferedLocales(offered, present, extra)

    expect(result.ok).toBe(false)
    expect(result.reasons.some((r) => r.includes('wholesale wipe'))).toBe(true)
  })

  it('the realistic 43-offered / 6-unreachable shape -> ok: true, reasons: []', () => {
    const result = assessOfferedLocales(
      supportedLanguages,
      [...supportedLanguages, ...UNREACHABLE_CODES],
      UNREACHABLE_CODES
    )

    expect(result).toEqual({ ok: true, reasons: [] })
  })
})

describe('pruneUnofferedLocales -- guard FAILING directions throw and leave the tree untouched', () => {
  it('offered list below OFFERED_FLOOR: throws, the on-disk tree is unchanged', () => {
    writeLocaleDir(localesPath(), 'en')
    writeLocaleDir(localesPath(), 'xx')

    expect(() => pruneUnofferedLocales(localesPath(), ['en'])).toThrow(
      /floor/
    )
    expect(existsSync(join(localesPath(), 'xx'))).toBe(true)
    expect(existsSync(join(localesPath(), 'en'))).toBe(true)
  })

  it("offered list without 'en': throws, the on-disk tree is unchanged", () => {
    const offered = supportedLanguages.filter((c) => c !== 'en')
    for (const code of offered) {
      writeLocaleDir(localesPath(), code)
    }
    writeLocaleDir(localesPath(), 'zz')

    expect(() => pruneUnofferedLocales(localesPath(), offered)).toThrow(
      /does not contain 'en'/
    )
    expect(existsSync(join(localesPath(), 'zz'))).toBe(true)
  })

  it("a prune set containing 'en': throws, 'en' is never deleted", () => {
    const offered = supportedLanguages.filter((c) => c !== 'en')
    for (const code of offered) {
      writeLocaleDir(localesPath(), code)
    }
    writeLocaleDir(localesPath(), 'en')

    expect(() => pruneUnofferedLocales(localesPath(), offered)).toThrow(
      /prune set contains 'en'/
    )
    expect(existsSync(join(localesPath(), 'en'))).toBe(true)
  })

  it('a prune set exceeding MAX_PRUNE_FRACTION: throws, nothing is deleted', () => {
    const offered = supportedLanguages.slice(0, 20)
    expect(offered).toContain('en')
    for (const code of offered) {
      writeLocaleDir(localesPath(), code)
    }
    const extra = Array.from({ length: 7 }, (_, i) => `zz${i}`)
    for (const code of extra) {
      writeLocaleDir(localesPath(), code)
    }

    expect(() => pruneUnofferedLocales(localesPath(), offered)).toThrow(
      /wholesale wipe/
    )
    for (const code of extra) {
      expect(existsSync(join(localesPath(), code))).toBe(true)
    }
  })
})

describe('pruneUnofferedLocales -- guard PASSING direction and the empty-set no-op', () => {
  it('the realistic 49-dir / 43-offered shape prunes exactly the six unreachable codes, keeps 43', () => {
    seedRealisticLocalesTree(localesPath())

    const result = pruneUnofferedLocales(localesPath(), supportedLanguages)

    expect(result.guardEvaluated).toBe(true)
    expect(result.bytesFreed).toBeGreaterThan(0)
    expect(result.pruned.slice().sort()).toEqual([...UNREACHABLE_CODES].sort())

    const remaining = readdirSync(localesPath(), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
    expect(remaining.length).toBe(43)
    for (const code of UNREACHABLE_CODES) {
      expect(remaining).not.toContain(code)
    }
  })

  it('an empty prune set is a silent no-op -- guardEvaluated stays false even when the offered list would fail the guard', () => {
    writeLocaleDir(localesPath(), 'en')

    const result = pruneUnofferedLocales(localesPath(), ['en'])

    expect(result).toEqual({ pruned: [], bytesFreed: 0, guardEvaluated: false })
    expect(existsSync(join(localesPath(), 'en'))).toBe(true)
  })
})

describe('composition pin -- prune-then-assemble ordering (T-hjb-03)', () => {
  function seedOutDir(outDir: string): string[] {
    writeFile(join(outDir, 'index.html'), '<!doctype html>')
    writeFile(join(outDir, 'assets', 'index-abc.js'), 'console.log(1)')
    writeFile(join(outDir, 'icon.png'), 'PNGDATA')
    seedRealisticLocalesTree(join(outDir, 'locales'))
    return ['index.html', 'assets/index-abc.js']
  }

  it('prune BEFORE assemble: renderer/locales holds exactly 43 -- the fix', () => {
    const outDir = join(workDir, 'order1', 'build')
    const rendererDir = join(outDir, 'renderer')
    const bundleKeys = seedOutDir(outDir)

    pruneUnofferedLocales(join(outDir, 'locales'), supportedLanguages)
    assembleRendererDist(outDir, rendererDir, bundleKeys)

    expect(readdirSync(join(rendererDir, 'locales')).length).toBe(43)
  })

  it('assemble BEFORE prune: renderer/locales stays at 49 -- the failing direction this pin exists to catch', () => {
    const outDir = join(workDir, 'order2', 'build')
    const rendererDir = join(outDir, 'renderer')
    const bundleKeys = seedOutDir(outDir)

    assembleRendererDist(outDir, rendererDir, bundleKeys)
    pruneUnofferedLocales(join(outDir, 'locales'), supportedLanguages)

    expect(readdirSync(join(rendererDir, 'locales')).length).toBe(49)
  })
})
