/**
 * The SINGLE dev-vs-packaged derivation, and its three callers (Phase 35 plan 04, D-14 /
 * D-19 half (b), REQ-35-10).
 *
 * Two things are proven here and they are not the same thing:
 *
 *   1. `isPackagedSidecar()` still answers correctly in BOTH directions and still FAILS
 *      CLOSED when it cannot answer at all. This is a security property, not a
 *      convenience: `devSecretVault.ts`'s guardrail (c) reads this value to decide whether
 *      a plaintext on-disk secret vault may install itself. A regression that made the
 *      `catch` return `false` would unlock that vault inside a shipped binary and every
 *      other test in the repo would stay green.
 *
 *   2. `bootstrap.ts`'s `resolveAppPaths` (which picks `build` vs `public` for `publicDir`)
 *      CONSUMES it rather than re-deriving it: each direction is exercised against a freshly
 *      loaded `resolveAppPaths`, and the source gate pins that no second derivation exists.
 *
 * No file-wide `jest.mock` here on purpose. `isPackagedSidecar()` performs its
 * `node:sea` require at CALL time, so `jest.doMock` inside a test body reaches it, and
 * each test can script a different runtime without the mock leaking sideways.
 */

import { readFileSync } from 'fs'
import { basename, join } from 'path'

import { stripSourceComments } from '../../testUtils/stripSourceComments'

describe('isPackagedSidecar() — the one derivation', () => {
  afterEach(() => {
    jest.dontMock('node:sea')
    jest.dontMock('../isPackagedSidecar')
    jest.resetModules()
  })

  it('returns true when node:sea reports this IS a packaged SEA build', () => {
    jest.resetModules()
    jest.doMock('node:sea', () => ({ isSea: () => true }))

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isPackagedSidecar } = require('../isPackagedSidecar')
    expect(isPackagedSidecar()).toBe(true)
  })

  it('returns false when node:sea reports this is NOT a packaged SEA build', () => {
    jest.resetModules()
    jest.doMock('node:sea', () => ({ isSea: () => false }))

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isPackagedSidecar } = require('../isPackagedSidecar')
    expect(isPackagedSidecar()).toBe(false)
  })

  it('fail closed: returns TRUE when require("node:sea") throws', () => {
    // DO NOT "fix" this to false. `true` means "assume packaged", which is the SAFE
    // direction for every one of this function's three callers:
    //   - devSecretVault.ts guardrail (c) REFUSES to install the plaintext dev secret
    //     vault. Flipping this to false silently installs a plaintext credential store
    //     in a packaged build (T-35-12).
    //   - humbleFlowRegistration.ts does NOT register the dev-only humbleRunValidation
    //     channel.
    //   - paths.ts consults it, so a packaged answer resolves
    //     publicDir to `build` — the bundled layout — rather than the source `public/`.
    // The unsafe direction is the one that looks harmless.
    jest.resetModules()
    jest.doMock('node:sea', () => {
      throw new Error('node:sea unavailable on this runtime (simulated)')
    })
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => {})

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isPackagedSidecar } = require('../isPackagedSidecar')
    expect(isPackagedSidecar()).toBe(true)
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('node:sea unavailable'),
      expect.any(Error)
    )
    consoleWarnSpy.mockRestore()
  })
})

describe('resolveAppPaths publicDir consumes the derivation (no second derivation)', () => {
  afterEach(() => {
    jest.dontMock('node:sea')
    jest.dontMock('../isPackagedSidecar')
    jest.resetModules()
  })

  const publicDirBase = (): string => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { publicDir } = require('../bootstrap').resolveAppPaths() as {
      publicDir: string
    }
    return basename(publicDir)
  }

  it('reflects the derivation in BOTH directions (a packaged answer resolves `build`, a dev answer `public`)', () => {
    const savedCi = process.env.CI
    delete process.env.CI
    try {
      jest.resetModules()
      const scripted = jest.fn<boolean, []>()
      jest.doMock('../isPackagedSidecar', () => ({
        isPackagedSidecar: () => scripted()
      }))

      scripted.mockReturnValue(true)
      expect(publicDirBase()).toBe('build')

      jest.resetModules()
      scripted.mockReturnValue(false)
      expect(publicDirBase()).toBe('public')
    } finally {
      if (savedCi === undefined) delete process.env.CI
      else process.env.CI = savedCi
    }
  })

  it('inherits the fail-closed direction end to end: a throwing node:sea makes publicDir resolve the packaged `build` layout', () => {
    const savedCi = process.env.CI
    delete process.env.CI
    jest.resetModules()
    jest.doMock('node:sea', () => {
      throw new Error('node:sea unavailable on this runtime (simulated)')
    })
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => {})
    try {
      expect(publicDirBase()).toBe('build')
    } finally {
      consoleWarnSpy.mockRestore()
      if (savedCi === undefined) delete process.env.CI
      else process.env.CI = savedCi
    }
  })
})

describe('T-35-11 source gate: exactly ONE derivation exists in the sidecar tree', () => {
  const sidecarDir = join(__dirname, '..')
  const read = (f: string) =>
    stripSourceComments(readFileSync(join(sidecarDir, f), 'utf8'))
  // Raw text, not comment-stripped: the path derivation holds `'file://'`, which the line-comment
  // stripper would mistake for a comment start and truncate the rest of its line.
  const readPaths = () => readFileSync(join(sidecarDir, 'bootstrap.ts'), 'utf8')

  it('non-vacuity: the gate can see real code in each file it inspects', () => {
    // Proves the stripper did not eat everything it is about to assert over. Without
    // this, all three assertions below pass against an empty string.
    expect(read('isPackagedSidecar.ts')).toContain("require('node:sea')")
    expect(readPaths()).toContain('isPackagedSidecar()')
    expect(read('humbleFlowRegistration.ts')).toContain('isPackagedSidecar()')
    expect(read('devSecretVault.ts')).toContain('isPackagedSidecar()')
  })

  it('bootstrap.ts consumes the shared derivation and never re-derives it', () => {
    const src = readPaths()
    expect(src).not.toContain("require('node:sea')")
    expect(src).toContain('import { isPackagedSidecar } from')
  })

  it('humbleFlowRegistration.ts re-exports rather than keeping a copy', () => {
    const src = read('humbleFlowRegistration.ts')
    expect(src).not.toContain("require('node:sea')")
    expect(src).toContain("from './isPackagedSidecar'")
  })

  it('devSecretVault.ts guardrail (c) imports the shared derivation', () => {
    const src = read('devSecretVault.ts')
    expect(src).not.toContain("require('node:sea')")
    expect(src).toContain(
      "import { isPackagedSidecar } from './isPackagedSidecar'"
    )
  })
})
