import {
  OVERLAY_STEPS,
  OVERLAY_STEP_TEXT,
  formatOverlayExitNoticeLine,
  formatOverlayNoticeLine,
  overlayStepError
} from '../overlayNotice'

describe('overlayNotice', () => {
  test('notice line is a single injection-free line', () => {
    const line = formatOverlayNoticeLine(
      '620',
      'clone',
      'cp failed: no space\nINJECT'
    )
    expect(
      line.startsWith('[bridge-notice] appId=620 reason=overlay-clone cause=')
    ).toBe(true)
    expect(line).not.toMatch(/\n/)
    expect(line.split('cause=')[1]).not.toMatch(/\s/)
  })
  test('bad appId is invalid', () => {
    expect(formatOverlayNoticeLine('bad id', 'shim', 'x')).toContain(
      'appId=invalid'
    )
  })
  test('cause is capped and empty becomes unknown', () => {
    expect(
      overlayStepError('env', new Error('a'.repeat(500))).cause.length
    ).toBeLessThanOrEqual(160)
    expect(overlayStepError('env', '').cause).toBe('unknown')
  })
  test('steps and text', () => {
    expect([...OVERLAY_STEPS]).toEqual([
      'steam-dylibs',
      'shim',
      'crossover-detect',
      'clone',
      'resign',
      'env'
    ])
    for (const s of OVERLAY_STEPS) {
      expect(OVERLAY_STEP_TEXT[s].key).toMatch(/^steam\.overlay\.step\./)
      expect(OVERLAY_STEP_TEXT[s].en).not.toBe('')
    }
  })
  test('exit notice', () => {
    expect(formatOverlayExitNoticeLine('620')).toBe(
      '[bridge-notice] appId=620 reason=overlay-exit-abnormal'
    )
  })
})
