import { publishReport, type PublishInput } from '../publish'
import type { RepoClient } from '../githubFiles'
import { GitHubUnavailableError } from '../githubApp'
import { issueTitle, type BodyEntry } from '../prBody'
import { reportNote } from '../fileEdit'

type Pull = { number: number; mergedAt: string | null; body: string }
type Script = {
  files?: Record<string, { sha: string; text: string } | null> // "ref:path"
  open?: Pull[]
  closed?: Pull[]
  branchExists?: boolean
  issue?: number | null
}

function fakeGh(s: Script = {}) {
  const calls: string[] = []
  const args: Record<string, unknown[]> = {}
  let inFlight = 0
  let max = 0
  const rec =
    <A extends unknown[], R>(name: string, fn: (...a: A) => R) =>
    async (...a: A): Promise<Awaited<R>> => {
      inFlight++
      max = Math.max(max, inFlight)
      calls.push(name)
      ;(args[name] ??= []).push(a)
      await Promise.resolve()
      try {
        return await fn(...a)
      } finally {
        inFlight--
      }
    }
  const gh: RepoClient = {
    getFile: rec('getFile', (path: string, ref: string) =>
      Promise.resolve(s.files?.[`${ref}:${path}`] ?? null)
    ),
    findPulls: rec('findPulls', (_b: string, st: 'open' | 'closed') =>
      Promise.resolve((st === 'open' ? s.open : s.closed) ?? [])
    ),
    getBranchSha: rec('getBranchSha', () => Promise.resolve('basesha')),
    createBranch: rec('createBranch', () =>
      Promise.resolve(
        s.branchExists ? ('exists' as const) : ('created' as const)
      )
    ),
    forceBranch: rec('forceBranch', () => Promise.resolve()),
    putFile: rec('putFile', () => Promise.resolve('newsha')),
    deleteFile: rec('deleteFile', () => Promise.resolve()),
    createPull: rec('createPull', () => Promise.resolve(77)),
    updatePullBody: rec('updatePullBody', () => Promise.resolve()),
    findIssueByTitle: rec('findIssueByTitle', () =>
      Promise.resolve(s.issue ?? null)
    ),
    createIssue: rec('createIssue', () => Promise.resolve(9))
  }
  return { gh, calls, args, maxConcurrent: () => max }
}

const entry = (over: Partial<BodyEntry> = {}): BodyEntry => ({
  key: 'macArch',
  op: 'add',
  detector: 'macho',
  count: 1,
  firstSeen: 0,
  lastSeen: 0,
  lastVersion: '0.8.0',
  ...over
})

function input(
  gh: RepoClient,
  over: {
    key?: 'macArch' | 'drm'
    op?: 'add' | 'remove'
    reserve?: boolean
  } = {}
): PublishInput & { reserved: { n: number } } {
  const key = over.key ?? 'macArch'
  const op = over.op ?? 'add'
  const reserved = { n: 0 }
  return {
    report: {
      v: 1,
      store: 'steam',
      appId: '123',
      key,
      value: key === 'macArch' ? '32' : 'ceg',
      op,
      gamelibVersion: '0.8.0'
    },
    title: 'Half-Life 2',
    detector: key === 'drm' ? 'ceg' : 'macho',
    gh,
    baseBranch: 'main',
    entries: [entry({ key, op })],
    reserveCreation: () => {
      reserved.n++
      return Promise.resolve(over.reserve ?? true)
    },
    reserved
  }
}

const P = 'steam/123-steam.json'
const WRITES = [
  'createBranch',
  'forceBranch',
  'putFile',
  'deleteFile',
  'createPull',
  'createIssue',
  'updatePullBody'
]

describe('pr', () => {
  test('new add creates branch, file and PR', async () => {
    const f = fakeGh()
    const res = await publishReport(input(f.gh))
    expect(res).toEqual({ status: 'created', prNumber: 77 })
    expect(f.calls).toEqual([
      'getFile',
      'findPulls',
      'findPulls',
      'getBranchSha',
      'createBranch',
      'putFile',
      'createPull'
    ])
    const put = f.args.putFile[0][0] as Record<string, unknown>
    expect(put.sha).toBeUndefined()
    expect(put.branch).toBe('report/steam-123')
    expect(JSON.parse(put.text as string)).toEqual({
      title: 'Half-Life 2',
      macArch: '32',
      notes: {
        macArch: reportNote('macArch', {
          gamelibVersion: '0.8.0',
          firstSeen: 0
        })
      }
    })
    expect(f.args.createPull[0][0]).toMatchObject({
      base: 'main',
      head: 'report/steam-123',
      title: 'steam 123: add macArch "32"'
    })
    expect(f.maxConcurrent()).toBe(1)
  })

  test('existing file without the key is merged using main sha', async () => {
    const f = fakeGh({
      files: {
        [`main:${P}`]: { sha: 'ms', text: '{"title":"X","notes":"n"}' }
      }
    })
    await publishReport(input(f.gh))
    const put = f.args.putFile[0][0] as Record<string, unknown>
    expect(put.sha).toBe('ms')
    expect(JSON.parse(put.text as string)).toEqual({
      title: 'X',
      notes: 'n',
      macArch: '32'
    })
  })

  test('stale branch is forced to main before continuing', async () => {
    const f = fakeGh({ branchExists: true })
    const res = await publishReport(input(f.gh))
    expect(res.status).toBe('created')
    expect(f.calls).toContain('forceBranch')
    expect(f.args.forceBranch[0]).toEqual(['report/steam-123', 'basesha'])
  })

  test('open PR with a new key commits onto its branch and updates body', async () => {
    const f = fakeGh({
      files: {
        [`main:${P}`]: { sha: 'ms', text: '{"title":"X"}' },
        [`report/steam-123:${P}`]: {
          sha: 'bs',
          text: '{"title":"X","macArch":"32"}'
        }
      },
      open: [{ number: 5, mergedAt: null, body: '' }]
    })
    const inp = input(f.gh, { key: 'drm' })
    const res = await publishReport(inp)
    expect(res).toEqual({ status: 'updated', prNumber: 5 })
    expect(f.calls).not.toContain('createPull')
    expect(inp.reserved.n).toBe(0)
    const put = f.args.putFile[0][0] as Record<string, unknown>
    expect(put.sha).toBe('bs')
    expect(put.branch).toBe('report/steam-123')
    expect(JSON.parse(put.text as string)).toEqual({
      title: 'X',
      macArch: '32',
      drm: 'ceg',
      notes: {
        drm: reportNote('drm', { gamelibVersion: '0.8.0', firstSeen: 0 })
      }
    })
    expect(f.args.updatePullBody[0][0]).toBe(5)
  })

  test('open PR whose branch already has the key only updates the body', async () => {
    const f = fakeGh({
      files: {
        [`main:${P}`]: { sha: 'ms', text: '{"title":"X"}' },
        [`report/steam-123:${P}`]: {
          sha: 'bs',
          text: '{"title":"X","macArch":"32"}'
        }
      },
      open: [{ number: 5, mergedAt: null, body: '' }]
    })
    const res = await publishReport(input(f.gh))
    expect(res).toEqual({ status: 'updated', prNumber: 5 })
    expect(f.calls).not.toContain('putFile')
    expect(f.calls).toContain('updatePullBody')
  })

  test('removal deletes the file when only metadata remains', async () => {
    const f = fakeGh({
      files: {
        [`main:${P}`]: { sha: 'ms', text: '{"title":"X","macArch":"32"}' }
      }
    })
    const res = await publishReport(input(f.gh, { op: 'remove' }))
    expect(res.status).toBe('created')
    expect(f.args.deleteFile[0][0]).toMatchObject({ sha: 'ms' })
    expect(f.calls).not.toContain('putFile')
    expect(f.args.createPull[0][0]).toMatchObject({
      title: 'steam 123: remove macArch'
    })
  })

  test('removal keeps other keys', async () => {
    const f = fakeGh({
      files: {
        [`main:${P}`]: {
          sha: 'ms',
          text: '{"title":"X","macArch":"32","drm":"ceg"}'
        }
      }
    })
    await publishReport(input(f.gh, { op: 'remove' }))
    const put = f.args.putFile[0][0] as Record<string, unknown>
    expect(JSON.parse(put.text as string)).toEqual({ title: 'X', drm: 'ceg' })
    expect(put.sha).toBe('ms')
  })

  test('rate-limited when the daily cap refuses and nothing is written', async () => {
    const f = fakeGh()
    const res = await publishReport(input(f.gh, { reserve: false }))
    expect(res).toEqual({ status: 'rate-limited' })
    for (const w of WRITES) expect(f.calls).not.toContain(w)
  })

  test('non-object JSON on main is skipped without writes', async () => {
    const f = fakeGh({ files: { [`main:${P}`]: { sha: 's', text: '[1]' } } })
    const res = await publishReport(input(f.gh))
    expect(res.status).toBe('skipped')
    for (const w of WRITES) expect(f.calls).not.toContain(w)
  })
})

describe('closed', () => {
  const marker = (k: string) => `<!-- gamelib-report: ${k} -->`

  test('closed unmerged PR with the same key suppresses', async () => {
    const f = fakeGh({
      closed: [{ number: 3, mergedAt: null, body: marker('macArch:add') }]
    })
    const inp = input(f.gh)
    const res = await publishReport(inp)
    expect(res).toEqual({ status: 'suppressed' })
    for (const w of WRITES) expect(f.calls).not.toContain(w)
    expect(inp.reserved.n).toBe(0)
  })

  test('closed unmerged PR for a different key does not suppress', async () => {
    const f = fakeGh({
      closed: [{ number: 3, mergedAt: null, body: marker('drm:add') }]
    })
    expect((await publishReport(input(f.gh))).status).toBe('created')
  })

  test('closed merged PR does not suppress', async () => {
    const f = fakeGh({
      closed: [
        { number: 3, mergedAt: '2026-01-01', body: marker('macArch:add') }
      ]
    })
    expect((await publishReport(input(f.gh))).status).toBe('created')
  })
})

describe('bundled', () => {
  test('removal with no file on main opens one labelled issue', async () => {
    const f = fakeGh()
    const res = await publishReport(input(f.gh, { op: 'remove' }))
    expect(res).toEqual({ status: 'created', issueNumber: 9 })
    expect(f.args.createIssue[0][0]).toMatchObject({
      title: issueTitle('123'),
      labels: ['bundled-removal']
    })
    expect(f.calls).not.toContain('createPull')
  })

  test('file without macArch 32 also takes the issue path', async () => {
    const f = fakeGh({
      files: { [`main:${P}`]: { sha: 's', text: '{"title":"X"}' } }
    })
    const res = await publishReport(input(f.gh, { op: 'remove' }))
    expect(res.status).toBe('created')
  })

  test('existing issue is counted and not recreated', async () => {
    const f = fakeGh({ issue: 4 })
    const res = await publishReport(input(f.gh, { op: 'remove' }))
    expect(res).toEqual({ status: 'counted', issueNumber: 4 })
    expect(f.calls).not.toContain('createIssue')
  })

  test('issue creation respects the daily cap', async () => {
    const f = fakeGh()
    const res = await publishReport(
      input(f.gh, { op: 'remove', reserve: false })
    )
    expect(res).toEqual({ status: 'rate-limited' })
    expect(f.calls).not.toContain('createIssue')
  })
})

describe('already-known', () => {
  test('value already on main makes no further calls', async () => {
    const f = fakeGh({
      files: {
        [`main:${P}`]: { sha: 's', text: '{"title":"X","macArch":"32"}' }
      }
    })
    const res = await publishReport(input(f.gh))
    expect(res).toEqual({ status: 'already-known' })
    expect(f.calls).toEqual(['getFile'])
  })

  test('GitHub failures propagate', async () => {
    const f = fakeGh()
    f.gh.getFile = () => Promise.reject(new GitHubUnavailableError('down'))
    await expect(publishReport(input(f.gh))).rejects.toBeInstanceOf(
      GitHubUnavailableError
    )
  })
})
