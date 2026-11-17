/**
 * Phase 81 D-01..D-03: the game page's pending-adoption read. Driven through an in-memory record
 * store, so the only code under test is this module and the record validation it reuses.
 */
import { initHeadless } from 'backend/logger'
import {
  answerSteamAdoptionStatus,
  getSteamAdoptionStatus
} from '../adoptionStatus'
import type { PendingAdoptionRecord } from '../macSteamAdoption'

beforeAll(() => initHeadless())

const APP_ID = '112100'

function record(): PendingAdoptionRecord {
  return {
    steamPid: 100,
    manifestPath: '/steam/steamapps/appmanifest_112100.acf',
    baseline: { mtimeMs: 1000, content: '"AppState" {}' },
    recordedAt: 1_700_000_000_000
  }
}

function depsWith(entries: Array<[string, unknown]>) {
  const store = new Map<string, unknown>(entries)
  return {
    stores: {
      steam: {
        steamPendingAdoptionStore: {
          get: (k: string) => store.get(k),
          set: (k: string, v: unknown) => store.set(k, v),
          delete: (k: string) => store.delete(k)
        }
      }
    }
  } as unknown as Parameters<typeof getSteamAdoptionStatus>[0]
}

describe('getSteamAdoptionStatus (D-01)', () => {
  test('a stored valid record is pending, signed-in unknown', () => {
    expect(
      getSteamAdoptionStatus(depsWith([[APP_ID, record()]]), APP_ID)
    ).toEqual({ pending: true, steamSignedIn: null })
  })

  test('no record is not pending', () => {
    expect(getSteamAdoptionStatus(depsWith([]), APP_ID)).toEqual({
      pending: false,
      steamSignedIn: null
    })
  })

  test('a malformed stored value is not pending', () => {
    expect(
      getSteamAdoptionStatus(depsWith([[APP_ID, { steamPid: 'x' }]]), APP_ID)
    ).toEqual({ pending: false, steamSignedIn: null })
  })

  test('only the asked appId counts', () => {
    expect(
      getSteamAdoptionStatus(depsWith([['999', record()]]), APP_ID).pending
    ).toBe(false)
  })
})

describe('answerSteamAdoptionStatus (T-81-27)', () => {
  const none = { pending: false, steamSignedIn: null }

  test.each([['abc'], ['12345678901'], [''], [570], [null], [undefined]])(
    'rejects %p with "not pending" and never throws',
    (bad) => {
      expect(
        answerSteamAdoptionStatus(depsWith([[APP_ID, record()]]), bad)
      ).toEqual(none)
    }
  )

  test('a valid appId answers the status', () => {
    expect(
      answerSteamAdoptionStatus(depsWith([[APP_ID, record()]]), APP_ID)
    ).toEqual({ pending: true, steamSignedIn: null })
  })

  test('a store that throws answers "not pending"', () => {
    const deps = {
      stores: {
        steam: {
          steamPendingAdoptionStore: {
            get: () => {
              throw new Error('boom')
            }
          }
        }
      }
    } as unknown as Parameters<typeof getSteamAdoptionStatus>[0]
    expect(answerSteamAdoptionStatus(deps, APP_ID)).toEqual(none)
  })
})
