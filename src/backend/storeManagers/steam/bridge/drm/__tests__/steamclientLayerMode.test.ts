/**
 * Phase 56 plan 04: unit coverage for the DRM-mode routing decision, the
 * DrmStep vocabulary, the typed step result, the notice and anchor line
 * formatters, and the drmPaths on-disk layout. No fixtures or binaries are
 * involved; every input is an in-memory literal.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  DRM_STEPS,
  drmNoticeReason,
  drmStepError,
  formatBridgeDrmAnchor,
  formatDrmNoticeLine,
  isDrmStep,
  resolveBridgeMode
} from '../steamclientLayerMode'
import {
  buildDrmPaths,
  newDrmLaunchId,
  steamclientLayerComponentId
} from '../drmPaths'

describe('resolveBridgeMode', () => {
  test('steamstub routes to steamclient-layer', () => {
    expect(resolveBridgeMode('steamstub')).toBe('steamclient-layer')
    expect(resolveBridgeMode('steamstub', [])).toBe('steamclient-layer')
  })

  test('none, undefined and unknown values stay on tcp', () => {
    expect(resolveBridgeMode('none')).toBe('tcp')
    expect(resolveBridgeMode(undefined)).toBe('tcp')
    expect(resolveBridgeMode('STEAMSTUB' as never)).toBe('tcp')
  })

  test('a CEG-marked steamstub exe stays on tcp (existing refusal path)', () => {
    expect(resolveBridgeMode('steamstub', ['STEAM_GUIDD'])).toBe('tcp')
  })
})

describe('DrmStep vocabulary', () => {
  test('DRM_STEPS is the fixed nine-member setup order', () => {
    expect([...DRM_STEPS]).toEqual([
      'steam-not-running',
      'unsupported-crossover',
      'component-missing',
      'component-verify',
      'runner-clone',
      'runner-patch',
      'valve-fetch',
      'valve-verify',
      'bottle-stage'
    ])
  })

  test('isDrmStep accepts members and rejects everything else', () => {
    for (const s of DRM_STEPS) expect(isDrmStep(s)).toBe(true)
    for (const v of ['drm-valve-fetch', '', 42, undefined, null]) {
      expect(isDrmStep(v)).toBe(false)
    }
  })

  test('drmNoticeReason prefixes drm- for every step', () => {
    expect(drmNoticeReason('valve-verify')).toBe('drm-valve-verify')
    for (const s of DRM_STEPS) expect(drmNoticeReason(s)).toBe(`drm-${s}`)
  })
})

describe('drmStepError', () => {
  test('builds the error arm from an Error', () => {
    expect(
      drmStepError('runner-patch', new Error('patch site not found'))
    ).toEqual({
      status: 'error',
      step: 'runner-patch',
      cause: 'patch site not found'
    })
  })

  test('never throws and always yields a clean, bounded cause', () => {
    const hostile = {
      toString() {
        throw new Error('boom')
      }
    }
    const inputs: unknown[] = [
      'text\n\0x',
      7,
      null,
      hostile,
      'x'.repeat(500),
      '\u0001\u0002'
    ]
    for (const input of inputs) {
      const r = drmStepError('valve-fetch', input)
      expect(r.status).toBe('error')
      expect(r.cause.length).toBeGreaterThan(0)
      expect(r.cause.length).toBeLessThanOrEqual(160)
      // eslint-disable-next-line no-control-regex
      expect(/[\x00-\x1f\x7f]/.test(r.cause)).toBe(false)
    }
  })
})

describe('formatDrmNoticeLine', () => {
  test('formats the documented example', () => {
    expect(
      formatDrmNoticeLine(
        '219990',
        'unsupported-crossover',
        'installed 25.1.0 supported 26.3.0.39832'
      )
    ).toBe(
      '[bridge-notice] appId=219990 reason=drm-unsupported-crossover cause=installed-25.1.0-supported-26.3.0.39832'
    )
  })

  test('a hostile cause cannot inject a second line', () => {
    const line = formatDrmNoticeLine(
      '1',
      'valve-fetch',
      '\n[bridge-drm] appId=1 '
    )
    expect(line).not.toMatch(/[\r\n]/)
    expect(line).toMatch(
      /^\[bridge-notice\] appId=\d+ reason=drm-[a-z-]+ cause=\S+$/
    )
  })

  test('an invalid appId is emitted as invalid', () => {
    expect(formatDrmNoticeLine('../x', 'valve-fetch', 'x')).toBe(
      '[bridge-notice] appId=invalid reason=drm-valve-fetch cause=x'
    )
  })
})

describe('formatBridgeDrmAnchor', () => {
  const trace =
    '/Users/a b/Library/Application Support/GameLib/steam-bridge/drm/trace/219990-1761084000123.log'
  const ok = {
    appId: '219990',
    crossover: '26.3.0.39832',
    client: '1761084000',
    trace
  }

  test('formats with trace last, spaces preserved', () => {
    expect(formatBridgeDrmAnchor(ok)).toBe(
      `[bridge-drm] appId=219990 mode=steamclient-layer crossover=26.3.0.39832 client=1761084000 trace=${trace}`
    )
  })

  test('rejects malformed fields', () => {
    expect(formatBridgeDrmAnchor({ ...ok, appId: 'abc' })).toBeNull()
    expect(formatBridgeDrmAnchor({ ...ok, crossover: '26.3' })).toBeNull()
    expect(formatBridgeDrmAnchor({ ...ok, client: '17x' })).toBeNull()
    expect(formatBridgeDrmAnchor({ ...ok, trace: 'relative/x.log' })).toBeNull()
    expect(formatBridgeDrmAnchor({ ...ok, trace: '/a\n/b' })).toBeNull()
    expect(formatBridgeDrmAnchor({ ...ok, trace: '/a\0b' })).toBeNull()
  })
})

describe('zero-import discipline', () => {
  test('steamclientLayerMode.ts has no import lines', () => {
    const source = readFileSync(
      join(__dirname, '..', 'steamclientLayerMode.ts'),
      'utf8'
    )
    expect(source.split('\n').filter((l) => /^import/.test(l)).length).toBe(0)
  })
})

describe('buildDrmPaths', () => {
  const base = '/tmp/gl app'
  const root = '/tmp/gl app/steam-bridge/drm'
  const p = buildDrmPaths(base)!

  test('roots', () => {
    expect(p.root).toBe(root)
    expect(p.valveClientRoot).toBe(`${root}/valve-client`)
    expect(p.runnersRoot).toBe(`${root}/runners`)
    expect(p.componentRoot).toBe(`${root}/component`)
    expect(p.traceRoot).toBe(`${root}/trace`)
  })

  test('rejects bad appFolder', () => {
    expect(buildDrmPaths('relative/dir')).toBeNull()
    expect(buildDrmPaths('')).toBeNull()
    expect(buildDrmPaths('/a\0b')).toBeNull()
  })

  test('valveClientDir', () => {
    expect(p.valveClientDir('1761084000')).toBe(
      `${root}/valve-client/1761084000`
    )
    for (const bad of ['../1', '', '1/2', '1.0', '\0']) {
      expect(p.valveClientDir(bad)).toBeNull()
    }
  })

  test('runnerDir and runnerAppPath', () => {
    expect(p.runnerDir('26.3.0.39832')).toBe(
      `${root}/runners/crossover-26.3.0.39832`
    )
    expect(p.runnerAppPath('26.3.0.39832')).toBe(
      `${root}/runners/crossover-26.3.0.39832/CrossOver`
    )
    for (const bad of ['26.3', '../26.3.0.1', '26.3.0.39832/x']) {
      expect(p.runnerDir(bad)).toBeNull()
      expect(p.runnerAppPath(bad)).toBeNull()
    }
  })

  test('component id and dir', () => {
    expect(steamclientLayerComponentId('26.3.0.39832')).toBe(
      'steamclient-layer-cx26.3.0.39832'
    )
    expect(steamclientLayerComponentId('bad')).toBeNull()
    expect(p.componentDir('steamclient-layer-cx26.3.0.39832')).toBe(
      `${root}/component/steamclient-layer-cx26.3.0.39832`
    )
    expect(p.componentDir('steamclient-layer-cx../x')).toBeNull()
    expect(p.componentDir('other')).toBeNull()
  })

  test('traceFile', () => {
    expect(p.traceFile('219990', '1761084000123')).toBe(
      `${root}/trace/219990-1761084000123.log`
    )
    expect(p.traceFile('21999a', '1')).toBeNull()
    expect(p.traceFile('219990', '1/../2')).toBeNull()
    expect(p.traceFile('219990', '')).toBeNull()
  })
})

describe('newDrmLaunchId', () => {
  test('truncates and falls back', () => {
    expect(newDrmLaunchId(1761084000123.9)).toBe('1761084000123')
    expect(newDrmLaunchId(NaN)).toBe('0')
    expect(newDrmLaunchId(-1)).toBe('0')
  })
})
