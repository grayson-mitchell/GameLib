import { execFile } from 'child_process'
import { chmodSync, existsSync, mkdirSync, copyFileSync } from 'fs'
import { join } from 'path'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'

const mockProfile = createFakeHomeProfile({ prefix: 'gamelib-pergame-' })

jest.mock('backend/constants/paths', () => ({
  get userHome() {
    return mockProfile.root
  },
  toolsPath: '/tmp/tools'
}))
jest.mock('backend/config', () => ({ GlobalConfig: { get: jest.fn() } }))
jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('backend/utils', () => ({ sendGameStatusUpdate: jest.fn() }))

import type { EngineServices } from '../engineServices'
import { createTestEngineServices } from 'backend/testUtils/testServices'
import {
  createCrossoverBottle,
  ensureGameBottle,
  perGameBottleName,
  PER_GAME_BOTTLE_NAME_MAX
} from '../perGameBottle'
import { getBottleDir, sanitizeBottleName } from '../bottlePrimitives'
import type { PerGameBottleDeps } from '../perGameBottle'

const services: EngineServices = createTestEngineServices({
  installRemove: jest.fn()
})

// Real child process under the fake HOME; a timeout resolves code null like the real helper.
const spawnAsync = (
  cmd: string,
  args: string[],
  opts: { timeout?: number } = {}
) =>
  new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve) => {
      execFile(
        cmd,
        args,
        { env: mockProfile.childEnv(), timeout: opts.timeout },
        (err, stdout, stderr) => {
          const e = err as (Error & { killed?: boolean; code?: number }) | null
          resolve({
            code: e?.killed ? null : e ? (e.code ?? 1) : 0,
            stdout,
            stderr
          })
        }
      )
    }
  )
const deps = { spawnAsync }

afterAll(() => mockProfile.dispose())

describe('perGameBottleName', () => {
  it('builds runner-qualified names', () => {
    expect(
      perGameBottleName('legendary', '0123456789abcdef0123456789abcdef')
    ).toBe('GameLib-legendary-0123456789abcdef0123456789abcdef')
    expect(perGameBottleName('gog', '1207658924')).toBe(
      'GameLib-gog-1207658924'
    )
  })

  it('is deterministic and round-trips sanitizeBottleName', () => {
    const a = perGameBottleName('nile', 'amzn1.adg.product.0b1c')
    expect(a).toBe(perGameBottleName('nile', 'amzn1.adg.product.0b1c'))
    expect(sanitizeBottleName(a)).toBe(a)
  })

  it('escapes injectively', () => {
    expect(perGameBottleName('sideload', 'My Game!')).toBe(
      'GameLib-sideload-My_20Game_21'
    )
    expect(perGameBottleName('sideload', 'a_b')).not.toBe(
      perGameBottleName('sideload', 'a b')
    )
    expect(perGameBottleName('sideload', 'a_b')).toBe('GameLib-sideload-a_5fb')
  })

  it('escapes non-ASCII bytes and never emits a path separator', () => {
    const n = perGameBottleName('sideload', 'Café\u0001x') as string
    expect(n).toBe('GameLib-sideload-Caf_c3_a9_01x')
  })

  it('truncates with a hash suffix that keeps long names distinct', () => {
    const base = 'x'.repeat(254)
    const a = perGameBottleName('sideload', `${base}a`) as string
    const b = perGameBottleName('sideload', `${base}b`) as string
    expect(a.length).toBeLessThanOrEqual(PER_GAME_BOTTLE_NAME_MAX)
    expect(a).toMatch(/-[0-9a-f]{10}$/)
    expect(a).not.toBe(b)
  })

  it('rejects unknown runners and unclean appNames', () => {
    expect(perGameBottleName('notarunner', 'x')).toBeNull()
    for (const bad of ['a/b', 'a\\b', '..', 'a..b', 'a\0b', '', ' x']) {
      expect(perGameBottleName('sideload', bad)).toBeNull()
    }
  })

  it('stays within the 64 cap for every produced name', () => {
    for (const app of ['x'.repeat(255), 'é'.repeat(100), '1.2.3']) {
      const n = perGameBottleName('gog', app) as string
      expect(n.length).toBeLessThanOrEqual(64)
      expect(sanitizeBottleName(n)).toBe(n)
    }
  })
})

describe('createCrossoverBottle (stub cxbottle under a fake HOME)', () => {
  const binDir = join(mockProfile.root, 'cx', 'bin')
  beforeAll(() => {
    mkdirSync(binDir, { recursive: true })
    const stub = join(binDir, 'cxbottle')
    copyFileSync(join(__dirname, 'fixtures', 'stub-cxbottle.sh'), stub)
    chmodSync(stub, 0o755)
    const ws = join(binDir, 'wineserver')
    copyFileSync(join(__dirname, 'fixtures', 'stub-wine.sh'), ws)
    chmodSync(ws, 0o755)
  })

  it('succeeds when cxbottle.conf appears', async () => {
    const r = await createCrossoverBottle(deps, 'GameLib-gog-ok', binDir)
    expect(r).toEqual({ status: 'done', createdHere: true })
    expect(
      existsSync(join(getBottleDir('GameLib-gog-ok'), 'cxbottle.conf'))
    ).toBe(true)
  })

  it('removes a created dir when no cxbottle.conf is produced', async () => {
    const r = await createCrossoverBottle(deps, 'GameLib-gog-noconf', binDir)
    expect(r).toMatchObject({
      status: 'error',
      errorCode: 'crossover-create-failed'
    })
    expect(existsSync(getBottleDir('GameLib-gog-noconf'))).toBe(false)
  })

  it('reports the cap and removes the created dir on a hang', async () => {
    const r = await createCrossoverBottle(deps, 'GameLib-gog-hang', binDir, {
      createTimeoutMs: 300
    })
    expect(r).toMatchObject({
      status: 'error',
      errorCode: 'crossover-create-timeout'
    })
    expect(existsSync(getBottleDir('GameLib-gog-hang'))).toBe(false)
  })

  it('never removes a pre-existing dir', async () => {
    const pre = getBottleDir('GameLib-gog-noconf')
    mkdirSync(pre, { recursive: true })
    const r = await createCrossoverBottle(deps, 'GameLib-gog-noconf', binDir)
    expect(r.status).toBe('error')
    expect(existsSync(pre)).toBe(true)
  })

  it('rejects an unsafe name before spawning', async () => {
    const r = await createCrossoverBottle(deps, '../evil', binDir)
    expect(r.status).toBe('error')
  })
})

describe('ensureGameBottle', () => {
  const pin = { id: 'pin' } as never
  const engine = { wineBin: '/w', wineserverBin: '/s', label: 'L' } as never
  const base = {
    key: 'gog:1',
    bottleName: 'GameLib-gog-1',
    appName: '1',
    runner: 'gog' as const
  }
  const mk = (over: Partial<PerGameBottleDeps> = {}) => {
    const d = {
      decide: jest.fn().mockResolvedValue({
        kind: 'crossover',
        createTimeoutMs: 1,
        probed: false,
        build: null
      }),
      resolveBinDir: jest.fn().mockResolvedValue('/cx/bin'),
      createCrossover: jest
        .fn()
        .mockResolvedValue({ status: 'done', createdHere: true }),
      createFallback: jest
        .fn()
        .mockResolvedValue({ status: 'done', createdHere: true }),
      ensurePin: jest.fn().mockResolvedValue({ ok: true, engine }),
      currentPin: () => pin,
      isProvisioned: jest.fn().mockReturnValue(false),
      ...over
    }
    return d
  }

  it('is a no-op when the bottle is already provisioned', async () => {
    const d = mk({ isProvisioned: jest.fn().mockReturnValue(true) })
    expect(await ensureGameBottle(services, base, d)).toEqual({
      status: 'done',
      createdHere: false,
      engine: 'existing'
    })
    expect(d.createCrossover).not.toHaveBeenCalled()
    expect(d.createFallback).not.toHaveBeenCalled()
  })

  it('creates with CrossOver once when present', async () => {
    const d = mk()
    const r = await ensureGameBottle(services, base, d)
    expect(r).toMatchObject({ status: 'done', engine: 'crossover' })
    expect(d.createCrossover).toHaveBeenCalledTimes(1)
    expect(d.createFallback).not.toHaveBeenCalled()
  })

  it('falls back to the pinned engine on a CrossOver failure', async () => {
    const d = mk({
      createCrossover: jest.fn().mockResolvedValue({
        status: 'error',
        errorCode: 'crossover-create-failed',
        error: 'x'
      })
    })
    const r = await ensureGameBottle(services, base, d)
    expect(r).toMatchObject({ status: 'done', engine: 'pinned' })
    expect(d.ensurePin).toHaveBeenCalledTimes(1)
    expect(d.createFallback).toHaveBeenCalledWith(
      'GameLib-gog-1',
      engine,
      undefined
    )
  })

  it('does not fall back on abort', async () => {
    const d = mk({
      createCrossover: jest.fn().mockResolvedValue({
        status: 'error',
        errorCode: 'provision-aborted',
        error: 'cancelled'
      })
    })
    const r = await ensureGameBottle(services, base, d)
    expect(r).toMatchObject({ status: 'error', errorCode: 'provision-aborted' })
    expect(d.createFallback).not.toHaveBeenCalled()
  })

  it('uses the pinned path when the decision is pinned', async () => {
    const d = mk({
      decide: jest
        .fn()
        .mockResolvedValue({ kind: 'pinned', reason: 'cx-missing', pin })
    })
    const signal = new AbortController().signal
    const r = await ensureGameBottle(services, { ...base, signal }, d)
    expect(r).toMatchObject({ status: 'done', engine: 'pinned' })
    expect(d.createCrossover).not.toHaveBeenCalled()
    expect(d.createFallback).toHaveBeenCalledWith(
      'GameLib-gog-1',
      engine,
      signal
    )
  })

  it('reports an engine download failure', async () => {
    const d = mk({
      decide: jest
        .fn()
        .mockResolvedValue({ kind: 'pinned', reason: 'cx-missing', pin }),
      ensurePin: jest.fn().mockResolvedValue({
        ok: false,
        aborted: false,
        reason: 'offline',
        error: 'offline x'
      })
    })
    expect(await ensureGameBottle(services, base, d)).toMatchObject({
      status: 'error',
      errorCode: 'engine-download-failed'
    })
  })

  it('shares one creation between concurrent callers', async () => {
    let release: (v: unknown) => void = () => undefined
    const gate = new Promise((r) => (release = r))
    const d = mk({
      decide: jest
        .fn()
        .mockResolvedValue({ kind: 'pinned', reason: 'cx-missing', pin }),
      createFallback: jest.fn().mockImplementation(async () => {
        await gate
        return { status: 'done', createdHere: true }
      })
    })
    const a = ensureGameBottle(services, base, d)
    const b = ensureGameBottle(services, base, d)
    release(undefined)
    await Promise.all([a, b])
    expect(d.createFallback).toHaveBeenCalledTimes(1)
  })

  it('rejects an unsafe bottle name', async () => {
    const d = mk()
    expect(
      await ensureGameBottle(services, { ...base, bottleName: '../x' }, d)
    ).toMatchObject({ status: 'error' })
  })
})
