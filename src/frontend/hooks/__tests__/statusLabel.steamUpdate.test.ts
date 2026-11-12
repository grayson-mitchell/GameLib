/** Phase 74 plan 11 (D-10): the updating status names its plan and commit stages. */
import { heroPhase } from 'frontend/screens/DownloadManager/components/DownloadHero/heroModel'

jest.mock('frontend/helpers', () => ({}))
;(globalThis as any).window = {
  localStorage: { getItem: () => null, setItem: () => undefined }
}
type ConstantsModule = typeof import('../constants')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const constants: ConstantsModule = require('../constants')
const { getStatusLabel } = constants

const t = ((key: string, def: string) => def ?? key) as any

describe('getStatusLabel steam update stages', () => {
  it('names the planning stage', () => {
    expect(
      getStatusLabel({
        status: 'updating',
        statusContext: 'steam-update-planning',
        t,
        runner: 'steam',
        percent: 40
      })
    ).toBe('Planning update…')
  })

  it('names the commit stage', () => {
    expect(
      getStatusLabel({
        status: 'updating',
        statusContext: 'steam-update-committing',
        t,
        runner: 'steam',
        percent: 40
      })
    ).toBe('Applying update…')
  })

  it('keeps the percent label without a context', () => {
    const label = getStatusLabel({
      status: 'updating',
      t: ((k: string) =>
        k === 'gamepage:status.updating' ? 'Updating' : k) as any,
      runner: 'steam',
      percent: 40
    })
    expect(label).toBe('Updating 40%')
  })
})

describe('heroPhase steam update stages', () => {
  it('maps the two contexts and nothing else', () => {
    expect(
      heroPhase({ status: 'updating', context: 'steam-update-planning' })
    ).toEqual({ kind: 'update-planning' })
    expect(
      heroPhase({ status: 'updating', context: 'steam-update-committing' })
    ).toEqual({ kind: 'update-committing' })
    expect(heroPhase({ status: 'updating' })).toBeNull()
  })
})
