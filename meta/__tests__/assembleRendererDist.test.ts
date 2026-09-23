/**
 * Fixture-driven coverage for meta/assembleRendererDist.ts (quick task
 * 260901-b8z). Every fixture is a synthetic `outDir`/`rendererDir` pair
 * under a `fs.mkdtempSync` temp tree, torn down in `afterEach` -- nothing
 * here touches the real `build/` or `build/renderer` trees.
 *
 * BOTH copy directions are asserted (presence AND absence) -- a one-direction
 * check is how this repo has already produced false greens once. Every
 * fail-loud post-condition gets its own dedicated test, including the two
 * separately-tested shapes of "locales/ is unusable" (missing vs.
 * present-but-empty), because a post-condition that only checks for a
 * missing directory is the exact `collectEntries`-returns-empty-Map silent
 * no-op this repo already owns (meta/pruneStaleHelperBinaries.ts:404-421).
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  assembleRendererDist,
  assembleRendererDistPlugin,
  STATIC_RENDERER_DIRS,
  STATIC_RENDERER_FILES
} from '../assembleRendererDist'

let workDir: string

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'b8z-assemble-'))
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

function outDirPath(): string {
  return join(workDir, 'build')
}

function rendererDirPath(): string {
  return join(workDir, 'build', 'renderer')
}

function writeFile(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

/** Seeds a plausible, fully-valid outDir: index.html + assets/* + statics. */
function seedValidOutDir(
  outDir: string,
  { includeLocalesJson = true }: { includeLocalesJson?: boolean } = {}
): string[] {
  writeFile(join(outDir, 'index.html'), '<!doctype html>')
  writeFile(join(outDir, 'assets', 'index-abc123.js'), 'console.log(1)')
  writeFile(join(outDir, 'assets', 'index-abc123.css'), 'body{}')
  writeFile(join(outDir, 'icon.png'), 'PNGDATA')
  if (includeLocalesJson) {
    writeFile(
      join(outDir, 'locales', 'en', 'translation.json'),
      '{"key":"value"}'
    )
    writeFile(
      join(outDir, 'locales', 'fr', 'translation.json'),
      '{"key":"valeur"}'
    )
  }
  return ['index.html', 'assets/index-abc123.js', 'assets/index-abc123.css']
}

describe('assembleRendererDist -- copy correctness (both directions)', () => {
  test('Test 1: every captured bundle key lands at renderer/<key> with byte-identical content', () => {
    const outDir = outDirPath()
    const rendererDir = rendererDirPath()
    const bundleKeys = seedValidOutDir(outDir)

    assembleRendererDist(outDir, rendererDir, bundleKeys)

    for (const key of bundleKeys) {
      const destPath = join(rendererDir, key)
      expect(existsSync(destPath)).toBe(true)
      expect(readFileSync(destPath, 'utf-8')).toBe(
        readFileSync(join(outDir, key), 'utf-8')
      )
    }
  })

  test('Test 2: a stale outDir/assets/ file absent from the bundle-key list is ABSENT from renderer/assets/', () => {
    const outDir = outDirPath()
    const rendererDir = rendererDirPath()
    const bundleKeys = seedValidOutDir(outDir)
    // Simulates the 19,540,372 B of stale build/assets a directory glob
    // would wrongly pick up -- this file is real on disk but not in the
    // bundle-key list.
    writeFile(join(outDir, 'assets', 'stale-from-a-prior-build.js'), 'old')

    assembleRendererDist(outDir, rendererDir, bundleKeys)

    expect(
      existsSync(join(rendererDir, 'assets', 'stale-from-a-prior-build.js'))
    ).toBe(false)
    const assetFiles = readdirSync(join(rendererDir, 'assets'))
    expect(assetFiles.sort()).toEqual(
      ['index-abc123.js', 'index-abc123.css'].sort()
    )
  })

  test('Test 3: icon.png and locales/ are copied byte-for-byte though they appear in no bundle key', () => {
    const outDir = outDirPath()
    const rendererDir = rendererDirPath()
    const bundleKeys = seedValidOutDir(outDir)
    expect(bundleKeys).not.toContain('icon.png')
    expect(bundleKeys.some((k) => k.startsWith('locales/'))).toBe(false)

    assembleRendererDist(outDir, rendererDir, bundleKeys)

    expect(readFileSync(join(rendererDir, 'icon.png'), 'utf-8')).toBe(
      readFileSync(join(outDir, 'icon.png'), 'utf-8')
    )
    expect(
      readFileSync(
        join(rendererDir, 'locales', 'en', 'translation.json'),
        'utf-8'
      )
    ).toBe(
      readFileSync(join(outDir, 'locales', 'en', 'translation.json'), 'utf-8')
    )
    expect(
      readFileSync(
        join(rendererDir, 'locales', 'fr', 'translation.json'),
        'utf-8'
      )
    ).toBe(
      readFileSync(join(outDir, 'locales', 'fr', 'translation.json'), 'utf-8')
    )
  })

  test('Test 4: manifest.json and robots.txt seeded in outDir are ABSENT from renderer/ (proven vestigial)', () => {
    const outDir = outDirPath()
    const rendererDir = rendererDirPath()
    const bundleKeys = seedValidOutDir(outDir)
    writeFile(join(outDir, 'manifest.json'), '{}')
    writeFile(join(outDir, 'robots.txt'), 'User-agent: *')

    assembleRendererDist(outDir, rendererDir, bundleKeys)

    expect(existsSync(join(rendererDir, 'manifest.json'))).toBe(false)
    expect(existsSync(join(rendererDir, 'robots.txt'))).toBe(false)
  })

  test('Test 5: a pre-existing renderer/ containing a stale file is fully replaced', () => {
    const outDir = outDirPath()
    const rendererDir = rendererDirPath()
    const bundleKeys = seedValidOutDir(outDir)
    writeFile(join(rendererDir, 'from-a-previous-run.js'), 'stale')

    assembleRendererDist(outDir, rendererDir, bundleKeys)

    expect(existsSync(join(rendererDir, 'from-a-previous-run.js'))).toBe(false)
  })
})

describe('assembleRendererDist -- fail-loud post-conditions (each throws)', () => {
  test('Test 6: an empty bundle-key list throws', () => {
    const outDir = outDirPath()
    const rendererDir = rendererDirPath()
    seedValidOutDir(outDir)

    expect(() => assembleRendererDist(outDir, rendererDir, [])).toThrow(
      /bundleKeys is empty/
    )
  })

  test('Test 7: index.html missing from the assembled tree throws', () => {
    const outDir = outDirPath()
    const rendererDir = rendererDirPath()
    seedValidOutDir(outDir)
    // bundleKeys deliberately omits index.html.
    const bundleKeysWithoutIndex = ['assets/index-abc123.js']

    expect(() =>
      assembleRendererDist(outDir, rendererDir, bundleKeysWithoutIndex)
    ).toThrow(/missing index\.html/)
  })

  test('Test 8: renderer/assets has zero files throws', () => {
    const outDir = outDirPath()
    const rendererDir = rendererDirPath()
    // Seed only index.html + statics -- no assets/* bundle keys at all.
    writeFile(join(outDir, 'index.html'), '<!doctype html>')
    writeFile(join(outDir, 'icon.png'), 'PNGDATA')
    writeFile(join(outDir, 'locales', 'en', 'translation.json'), '{}')

    expect(() =>
      assembleRendererDist(outDir, rendererDir, ['index.html'])
    ).toThrow(/assets.*has zero files/)
  })

  test('Test 10: icon.png missing from outDir throws', () => {
    const outDir = outDirPath()
    const rendererDir = rendererDirPath()
    const bundleKeys = seedValidOutDir(outDir)
    rmSync(join(outDir, 'icon.png'))

    expect(() => assembleRendererDist(outDir, rendererDir, bundleKeys)).toThrow(
      /required static file 'icon\.png' is missing/
    )
  })

  test('Test 11a: locales/ absent from outDir throws', () => {
    const outDir = outDirPath()
    const rendererDir = rendererDirPath()
    const bundleKeys = seedValidOutDir(outDir, { includeLocalesJson: false })
    // seedValidOutDir with includeLocalesJson:false never creates
    // outDir/locales at all -- directory is genuinely absent, not empty.
    expect(existsSync(join(outDir, 'locales'))).toBe(false)

    expect(() => assembleRendererDist(outDir, rendererDir, bundleKeys)).toThrow(
      /required static directory 'locales' is missing/
    )
  })

  test('Test 11b: locales/ present but containing no *.json throws (distinct from 11a)', () => {
    const outDir = outDirPath()
    const rendererDir = rendererDirPath()
    const bundleKeys = seedValidOutDir(outDir, { includeLocalesJson: false })
    // Directory exists this time, but holds no JSON -- the
    // collectEntries-returns-empty-Map shape that a missing-directory-only
    // check would miss.
    writeFile(join(outDir, 'locales', 'en', 'README.md'), 'not json')
    expect(existsSync(join(outDir, 'locales'))).toBe(true)

    expect(() => assembleRendererDist(outDir, rendererDir, bundleKeys)).toThrow(
      /is missing, or contains no \*\.json files/
    )
  })
})

describe('assembleRendererDist -- exported constants', () => {
  test('STATIC_RENDERER_FILES and STATIC_RENDERER_DIRS match the design', () => {
    expect(STATIC_RENDERER_FILES).toEqual(['icon.png'])
    expect(STATIC_RENDERER_DIRS).toEqual(['locales'])
  })
})

describe('assembleRendererDistPlugin -- Layer 3 (quick 260923-tip): closeBundle rethrows an earlier build error instead of masking it', () => {
  function driveHooks(plugin: ReturnType<typeof assembleRendererDistPlugin>) {
    const generateBundle = plugin.generateBundle as unknown as (
      options: unknown,
      bundle: Record<string, unknown>
    ) => void
    const buildEnd = plugin.buildEnd as unknown as (err?: Error) => void
    const closeBundle = plugin.closeBundle as unknown as () => void
    return { generateBundle, buildEnd, closeBundle }
  }

  test("buildEnd(err) then closeBundle() throws the SAME error instance, not the plugin's own message", () => {
    const outDir = outDirPath()
    const rendererDir = rendererDirPath()
    // Deliberately an EMPTY outDir -- this would normally make the plugin's
    // own "bundleKeys is empty" throw fire, proving the recorded error wins
    // even when the plugin's own guard would otherwise have something to
    // say.
    const plugin = assembleRendererDistPlugin({ outDir, rendererDir })
    const { buildEnd, closeBundle } = driveHooks(plugin)
    const firstCause = new Error('first cause')

    buildEnd(firstCause)

    let thrown: unknown
    try {
      closeBundle()
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBe(firstCause)
  })

  test("in the errored case, assembleRendererDist performs NO work -- rendererDir is not rm -rf'd, a sentinel file survives", () => {
    const outDir = outDirPath()
    const rendererDir = rendererDirPath()
    const bundleKeys = seedValidOutDir(outDir)
    writeFile(join(rendererDir, 'sentinel.txt'), 'must-survive')

    const plugin = assembleRendererDistPlugin({ outDir, rendererDir })
    const { generateBundle, buildEnd, closeBundle } = driveHooks(plugin)
    generateBundle({}, Object.fromEntries(bundleKeys.map((key) => [key, {}])))
    buildEnd(new Error('first cause'))

    expect(() => closeBundle()).toThrow('first cause')
    expect(existsSync(join(rendererDir, 'sentinel.txt'))).toBe(true)
  })

  test("buildEnd() with NO argument leaves normal behaviour unchanged: closeBundle still throws the plugin's OWN error for an empty bundle-key list", () => {
    const outDir = outDirPath()
    const rendererDir = rendererDirPath()
    seedValidOutDir(outDir)

    const plugin = assembleRendererDistPlugin({ outDir, rendererDir })
    const { generateBundle, buildEnd, closeBundle } = driveHooks(plugin)
    generateBundle({}, {})
    buildEnd(undefined)

    expect(() => closeBundle()).toThrow(/bundleKeys is empty/)
  })

  test('buildEnd() with NO argument leaves normal behaviour unchanged: closeBundle still succeeds on a good tree', () => {
    const outDir = outDirPath()
    const rendererDir = rendererDirPath()
    const bundleKeys = seedValidOutDir(outDir)

    const plugin = assembleRendererDistPlugin({ outDir, rendererDir })
    const { generateBundle, buildEnd, closeBundle } = driveHooks(plugin)
    generateBundle({}, Object.fromEntries(bundleKeys.map((key) => [key, {}])))
    buildEnd(undefined)

    expect(() => closeBundle()).not.toThrow()
    expect(existsSync(join(rendererDir, 'index.html'))).toBe(true)
  })

  test('closeBundle() with buildEnd never called at all behaves like the success path (a plugin instance must not require the hook to have fired)', () => {
    const outDir = outDirPath()
    const rendererDir = rendererDirPath()
    const bundleKeys = seedValidOutDir(outDir)

    const plugin = assembleRendererDistPlugin({ outDir, rendererDir })
    const { generateBundle, closeBundle } = driveHooks(plugin)
    generateBundle({}, Object.fromEntries(bundleKeys.map((key) => [key, {}])))

    expect(() => closeBundle()).not.toThrow()
  })

  test('each plugin instance is independent: a recorded error on one instance does not leak into a second instance created in the same process', () => {
    const outDirA = join(workDir, 'a', 'build')
    const rendererDirA = join(workDir, 'a', 'build', 'renderer')
    seedValidOutDir(outDirA)
    const pluginA = assembleRendererDistPlugin({
      outDir: outDirA,
      rendererDir: rendererDirA
    })
    const hooksA = driveHooks(pluginA)
    hooksA.generateBundle({}, {})
    hooksA.buildEnd(new Error('first cause on instance A'))

    const outDirB = join(workDir, 'b', 'build')
    const rendererDirB = join(workDir, 'b', 'build', 'renderer')
    const bundleKeysB = seedValidOutDir(outDirB)
    const pluginB = assembleRendererDistPlugin({
      outDir: outDirB,
      rendererDir: rendererDirB
    })
    const hooksB = driveHooks(pluginB)
    hooksB.generateBundle(
      {},
      Object.fromEntries(bundleKeysB.map((key) => [key, {}]))
    )

    // Instance B never had buildEnd called with an error -- it must not see
    // instance A's recorded error.
    expect(() => hooksB.closeBundle()).not.toThrow()
    // Instance A still rethrows its own recorded error.
    expect(() => hooksA.closeBundle()).toThrow('first cause on instance A')
  })
})
