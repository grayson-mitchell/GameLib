import type { SteamOptInDlcEntry } from 'common/types/steam'
import {
  optInDlcSizeLabel,
  pruneOptInChoice,
  shownOptInDlc,
  toggleOptInChoice
} from '../optInDlc'

const entry = (
  appId: string,
  owned: boolean | null,
  bytes = 1024
): SteamOptInDlcEntry => ({
  appId,
  name: `DLC ${appId}`,
  bytes,
  owned,
  installed: false
})

describe('SteamDialog opt-in DLC helpers (quick 261122-rgi)', () => {
  it('261122-rgi: shownOptInDlc keeps owned true and null, drops owned false, tolerates no answer', () => {
    const info = {
      manage: 'not-installed' as const,
      entries: [entry('1', true), entry('2', null), entry('3', false)]
    }
    expect(shownOptInDlc(info).map((e) => e.appId)).toEqual(['1', '2'])
    expect(shownOptInDlc(null)).toEqual([])
    expect(shownOptInDlc(undefined)).toEqual([])
  })

  it('261122-rgi: toggleOptInChoice adds a missing id, removes a present one, returns a new array', () => {
    const start = ['1']
    const added = toggleOptInChoice(start, '2')
    expect(added).toEqual(['1', '2'])
    expect(added).not.toBe(start)
    expect(toggleOptInChoice(added, '1')).toEqual(['2'])
    expect(toggleOptInChoice(toggleOptInChoice([], '5'), '5')).toEqual([])
    expect(start).toEqual(['1'])
  })

  it('261122-rgi: pruneOptInChoice drops ids no longer offered', () => {
    expect(pruneOptInChoice(['1', '9'], [entry('1', true)])).toEqual(['1'])
    const same = ['1']
    expect(pruneOptInChoice(same, [entry('1', true)])).toBe(same)
  })

  it('261122-rgi: optInDlcSizeLabel formats a positive size base-2 and hides 0 or non-finite', () => {
    expect(optInDlcSizeLabel(5918914121)).toMatch(/GiB|GB/)
    expect(optInDlcSizeLabel(0)).toBeUndefined()
    expect(optInDlcSizeLabel(Number.NaN)).toBeUndefined()
    expect(optInDlcSizeLabel(Number.POSITIVE_INFINITY)).toBeUndefined()
  })
})
