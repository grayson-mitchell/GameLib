import { createTestD1 } from './helpers/d1Sqlite'
import {
  entriesForApp,
  setOutcome,
  shouldRefreshBody,
  upsertReport
} from '../reportsTable'

describe('repeat', () => {
  const r = { appId: '1', key: 'macArch' as const, op: 'add' as const }

  it('counts repeats and keeps first_seen', async () => {
    const db = createTestD1()
    const a = await upsertReport(db, { ...r, version: '0.8.0' }, 100)
    expect(a).toMatchObject({
      count: 1,
      outcome: null,
      title: null,
      pr_number: null
    })
    const b = await upsertReport(db, { ...r, version: '0.9.0' }, 200)
    expect(b.count).toBe(2)
    expect(b.first_seen).toBe(100)
    expect(b.last_seen).toBe(200)
    const e = await entriesForApp(db, '1')
    expect(e[0].lastVersion).toBe('0.9.0')
  })

  it('persists outcome, pr number and title', async () => {
    const db = createTestD1()
    await upsertReport(db, { ...r, version: '0.8.0' }, 100)
    await setOutcome(db, r, { outcome: 'pr', prNumber: 7, title: 'T' })
    const n = await upsertReport(db, { ...r, version: '0.8.0' }, 101)
    expect(n).toMatchObject({ outcome: 'pr', pr_number: 7, title: 'T' })
  })

  it('lists entries for an app with derived detector', async () => {
    const db = createTestD1()
    await upsertReport(db, { ...r, version: '1' }, 1)
    await upsertReport(
      db,
      { appId: '1', key: 'drm', op: 'add', version: '1' },
      2
    )
    await upsertReport(
      db,
      { appId: '2', key: 'drm', op: 'add', version: '1' },
      2
    )
    const e = await entriesForApp(db, '1')
    expect(e).toHaveLength(2)
    expect(e.find((x) => x.key === 'macArch')?.detector).toBe('macho')
    expect(e.find((x) => x.key === 'drm')?.detector).toBe('ceg')
  })

  it('throttles body refreshes', () => {
    for (const n of [2, 3, 5, 10, 25, 50, 100, 200, 300]) {
      expect(shouldRefreshBody(n)).toBe(true)
    }
    for (const n of [1, 4, 6, 11, 99, 101, 150]) {
      expect(shouldRefreshBody(n)).toBe(false)
    }
  })
})
