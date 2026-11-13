import { RUST_STEAMFILES_READ_ACF } from 'common/types/sidecarTransport'
import * as logger from 'backend/logger'
import { invokeSteamFiles } from '../rustSteamFiles'
import {
  expectedFor,
  replayDeps,
  withFixtureCopy
} from './fixtures/replayParity'

describe('replay parity harness', () => {
  beforeEach(() => {
    jest.spyOn(logger, 'logDebug').mockImplementation(() => undefined)
  })

  afterEach(() => jest.restoreAllMocks())

  it('replays a recorded read_acf result with paths resolved', async () => {
    await withFixtureCopy('', async (root) => {
      const r = await invokeSteamFiles(
        replayDeps(root),
        RUST_STEAMFILES_READ_ACF,
        { path: `${root}/acf/installed.acf` }
      )
      expect(r.exists).toBe(true)
      expect(r.parsed).toBe(true)
      expect(r.record?.installdir).toBeTruthy()
    })
  })

  it('throws a re-record hint for an unknown invocation', async () => {
    await withFixtureCopy('', async (root) => {
      await expect(
        invokeSteamFiles(replayDeps(root), RUST_STEAMFILES_READ_ACF, {
          path: `${root}/acf/never-recorded.acf`
        })
      ).rejects.toThrow(/no recorded invocation for steamfiles_read_acf/)
    })
  })

  it('returns the oracle when no override exists', () => {
    expect(expectedFor('acfUpdate', 'readAcfBetaKey/big-ids', {})).toBeDefined()
  })

  it('returns an override that carries a note', () => {
    expect(
      expectedFor('x', 'y/z', {
        'x/y/z': { rustOverride: { a: 1 }, divergenceNote: 'because' }
      })
    ).toEqual({ a: 1 })
  })

  it('rejects an override without a note', () => {
    expect(() =>
      expectedFor('x', 'y/z', { 'x/y/z': { rustOverride: { a: 1 } } })
    ).toThrow(/without divergenceNote/)
  })

  it('reads the committed shortcuts override with its note', () => {
    expect(expectedFor('shortcuts', 'edit-add/sparse-indexes')).toBeDefined()
  })
})
