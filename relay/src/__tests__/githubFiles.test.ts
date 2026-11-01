import { createRepoClient } from '../githubFiles'
import { GitHubUnavailableError } from '../githubApp'
import { encodeGitHubContent } from '../fileEdit'
import { createFakeFetch } from './helpers/fakeFetch'

const BASE = 'https://api.github.com/repos/grayson-mitchell/known-fixes'

function client(routes: Parameters<typeof createFakeFetch>[0]) {
  const fake = createFakeFetch(routes)
  const repo = createRepoClient({
    fetch: fake.fetch,
    token: 'tok',
    owner: 'grayson-mitchell',
    repo: 'known-fixes'
  })
  return { fake, repo }
}

describe('githubFiles', () => {
  test('getFile decodes newline-split base64 content', async () => {
    const text = '{"a":1}\n'
    const b64 = encodeGitHubContent(text).replace(/(.{4})/g, '$1\n')
    const { repo } = client({
      [`GET ${BASE}/contents/steam/1-steam.json?ref=main`]: {
        status: 200,
        json: { sha: 'abc', content: b64, encoding: 'base64' }
      }
    })
    expect(await repo.getFile('steam/1-steam.json', 'main')).toEqual({
      sha: 'abc',
      text
    })
  })

  test('getFile returns null on 404', async () => {
    const { repo } = client({})
    expect(await repo.getFile('steam/1-steam.json', 'main')).toBeNull()
  })

  test('findPulls encodes head and maps merged_at', async () => {
    const head = encodeURIComponent('grayson-mitchell:report/steam-1')
    const { repo, fake } = client({
      [`GET ${BASE}/pulls?head=${head}&state=closed&per_page=10`]: {
        status: 200,
        json: [
          { number: 4, state: 'closed', merged_at: null, body: 'b' },
          { number: 5, state: 'closed', merged_at: '2026-01-01T00:00:00Z' }
        ]
      }
    })
    const res = await repo.findPulls('report/steam-1', 'closed')
    expect(res).toEqual([
      { number: 4, mergedAt: null, body: 'b' },
      { number: 5, mergedAt: '2026-01-01T00:00:00Z', body: '' }
    ])
    expect(fake.calls[0].url).toContain(head)
  })

  test('getBranchSha returns object.sha', async () => {
    const { repo } = client({
      [`GET ${BASE}/git/ref/heads/main`]: {
        status: 200,
        json: { object: { sha: 'deadbeef' } }
      }
    })
    expect(await repo.getBranchSha('main')).toBe('deadbeef')
  })

  test('createBranch created on 201', async () => {
    const { repo, fake } = client({
      [`POST ${BASE}/git/refs`]: { status: 201, json: {} }
    })
    expect(await repo.createBranch('report/steam-1', 's1')).toBe('created')
    expect(fake.calls[0].body).toEqual({
      ref: 'refs/heads/report/steam-1',
      sha: 's1'
    })
  })

  test('createBranch exists on 422 Reference already exists', async () => {
    const { repo } = client({
      [`POST ${BASE}/git/refs`]: {
        status: 422,
        json: { message: 'Reference already exists' }
      }
    })
    expect(await repo.createBranch('report/steam-1', 's1')).toBe('exists')
  })

  test('forceBranch sends sha and force', async () => {
    const { repo, fake } = client({
      [`PATCH ${BASE}/git/refs/heads/report/steam-1`]: {
        status: 200,
        json: {}
      }
    })
    await repo.forceBranch('report/steam-1', 's2')
    expect(fake.calls[0].body).toEqual({ sha: 's2', force: true })
  })

  test('putFile sends base64 content, sha only when given', async () => {
    const { repo, fake } = client({
      [`PUT ${BASE}/contents/steam/1-steam.json`]: {
        status: 201,
        json: { content: { sha: 'newsha' } }
      }
    })
    const text = '{"x":"é"}\n'
    const sha = await repo.putFile({
      path: 'steam/1-steam.json',
      branch: 'report/steam-1',
      text,
      message: 'm'
    })
    expect(sha).toBe('newsha')
    expect(fake.calls[0].body).toEqual({
      message: 'm',
      content: encodeGitHubContent(text),
      branch: 'report/steam-1'
    })
    await repo.putFile({
      path: 'steam/1-steam.json',
      branch: 'report/steam-1',
      text,
      message: 'm',
      sha: 'old'
    })
    expect((fake.calls[1].body as { sha: string }).sha).toBe('old')
  })

  test('deleteFile sends DELETE body', async () => {
    const { repo, fake } = client({
      [`DELETE ${BASE}/contents/steam/1-steam.json`]: {
        status: 200,
        json: {}
      }
    })
    await repo.deleteFile({
      path: 'steam/1-steam.json',
      branch: 'b',
      sha: 's',
      message: 'm'
    })
    expect(fake.calls[0].body).toEqual({ message: 'm', sha: 's', branch: 'b' })
  })

  test('createPull returns number; updatePullBody patches body', async () => {
    const { repo, fake } = client({
      [`POST ${BASE}/pulls`]: { status: 201, json: { number: 12 } },
      [`PATCH ${BASE}/pulls/12`]: { status: 200, json: {} }
    })
    expect(
      await repo.createPull({ title: 't', head: 'h', base: 'main', body: 'b' })
    ).toBe(12)
    await repo.updatePullBody(12, 'new')
    expect(fake.calls[1].body).toEqual({ body: 'new' })
  })

  test('findIssueByTitle ignores PRs and matches exact title', async () => {
    const { repo } = client({
      [`GET ${BASE}/issues?labels=bundled-removal&state=all&per_page=100`]: {
        status: 200,
        json: [
          { number: 1, title: 'T', pull_request: {} },
          { number: 2, title: 'T extra' },
          { number: 3, title: 'T' }
        ]
      }
    })
    expect(await repo.findIssueByTitle('bundled-removal', 'T')).toBe(3)
    expect(await repo.findIssueByTitle('bundled-removal', 'none')).toBeNull()
  })

  test('createIssue sends labels', async () => {
    const { repo, fake } = client({
      [`POST ${BASE}/issues`]: { status: 201, json: { number: 9 } }
    })
    expect(
      await repo.createIssue({
        title: 't',
        body: 'b',
        labels: ['bundled-removal']
      })
    ).toBe(9)
    expect((fake.calls[0].body as { labels: string[] }).labels).toEqual([
      'bundled-removal'
    ])
  })

  test('requests carry GitHub headers and no redirects', async () => {
    const { repo, fake } = client({
      [`GET ${BASE}/git/ref/heads/main`]: {
        status: 200,
        json: { object: { sha: 'x' } }
      }
    })
    await repo.getBranchSha('main')
    expect(fake.calls[0].headers).toMatchObject({
      authorization: 'Bearer tok',
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'gamelib-fix-relay'
    })
  })

  test.each([409, 422, 403, 429, 500, 502])(
    'status %i maps to GitHubUnavailableError without the token',
    async (status) => {
      const { repo } = client({
        [`POST ${BASE}/pulls`]: { status, json: { message: 'nope' } }
      })
      const err = await repo
        .createPull({ title: 't', head: 'h', base: 'main', body: 'b' })
        .catch((e) => e)
      expect(err).toBeInstanceOf(GitHubUnavailableError)
      expect(err.message).toContain('POST')
      expect(err.message).toContain('/pulls')
      expect(err.message).toContain(String(status))
      expect(err.message).not.toContain('tok')
    }
  )

  test('rejected fetch maps to GitHubUnavailableError', async () => {
    const { repo } = client({
      [`GET ${BASE}/git/ref/heads/main`]: new Error('boom tok')
    })
    const err = await repo.getBranchSha('main').catch((e) => e)
    expect(err).toBeInstanceOf(GitHubUnavailableError)
    expect(err.message).not.toContain('tok')
  })

  test('back-to-back calls stay serial', async () => {
    const head = encodeURIComponent('grayson-mitchell:b')
    const { repo, fake } = client({
      [`GET ${BASE}/contents/a.json?ref=main`]: { status: 404 },
      [`GET ${BASE}/pulls?head=${head}&state=open&per_page=10`]: {
        status: 200,
        json: []
      },
      [`PUT ${BASE}/contents/a.json`]: {
        status: 201,
        json: { content: { sha: 's' } }
      }
    })
    await repo.getFile('a.json', 'main')
    await repo.findPulls('b', 'open')
    await repo.putFile({ path: 'a.json', branch: 'b', text: 't', message: 'm' })
    expect(fake.maxConcurrent()).toBe(1)
  })
})
