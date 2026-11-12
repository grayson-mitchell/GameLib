import { buildUpdateQueueElement } from '../updateElement'
import type { GameInfo } from 'common/types'

const gameInfo = {
  app_name: 'g1',
  runner: 'steam',
  install: { install_path: '/p', platform: 'Windows' }
} as unknown as GameInfo

describe('buildUpdateQueueElement', () => {
  it('has no unattended key without opts (user and launch-prompt paths)', () => {
    const el = buildUpdateQueueElement(gameInfo, 'g1')
    expect('unattended' in el.params).toBe(false)
  })

  it('sets params.unattended only when asked', () => {
    expect(
      buildUpdateQueueElement(gameInfo, 'g1', { unattended: true }).params
        .unattended
    ).toBe(true)
    expect(
      'unattended' in
        buildUpdateQueueElement(gameInfo, 'g1', { unattended: false }).params
    ).toBe(false)
  })
})
