import type { FetchLike } from './env'
import { decodeGitHubContent, encodeGitHubContent } from './fileEdit'
import { GitHubUnavailableError, githubHeaders } from './githubApp'

// Thin, strictly serial GitHub REST client for the known-fixes repo.
// Every method awaits exactly one request; GitHub answers 409 to parallel
// content writes, so callers must never fan out.

export interface RepoClient {
  getFile(
    path: string,
    ref: string
  ): Promise<{ sha: string; text: string } | null>
  findPulls(
    branch: string,
    state: 'open' | 'closed'
  ): Promise<Array<{ number: number; mergedAt: string | null; body: string }>>
  getBranchSha(branch: string): Promise<string>
  createBranch(branch: string, sha: string): Promise<'created' | 'exists'>
  forceBranch(branch: string, sha: string): Promise<void>
  putFile(a: {
    path: string
    branch: string
    text: string
    message: string
    sha?: string
  }): Promise<string>
  deleteFile(a: {
    path: string
    branch: string
    sha: string
    message: string
  }): Promise<void>
  createPull(a: {
    title: string
    head: string
    base: string
    body: string
  }): Promise<number>
  /** CR-01: `open`, or `closed` for a closed or merged PR. */
  getPullState(n: number): Promise<'open' | 'closed'>
  updatePullBody(n: number, body: string): Promise<void>
  findIssueByTitle(label: string, title: string): Promise<number | null>
  createIssue(a: {
    title: string
    body: string
    labels: string[]
  }): Promise<number>
}

interface Reply {
  status: number
  json: unknown
}

export function createRepoClient(opts: {
  fetch: FetchLike
  token: string
  owner: string
  repo: string
  apiBase?: string
}): RepoClient {
  const base = `${opts.apiBase ?? 'https://api.github.com'}/repos/${opts.owner}/${opts.repo}`

  async function request(
    method: string,
    path: string,
    body?: unknown,
    accept: number[] = []
  ): Promise<Reply> {
    let res: Response
    try {
      res = await opts.fetch(`${base}${path}`, {
        method,
        headers: {
          ...githubHeaders(`Bearer ${opts.token}`),
          'Content-Type': 'application/json'
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual'
      })
    } catch {
      throw new GitHubUnavailableError(`${method} ${path} failed: network`)
    }
    let json: unknown = undefined
    try {
      json = await res.json()
    } catch {
      json = undefined
    }
    if (
      !(res.status >= 200 && res.status < 300) &&
      !accept.includes(res.status)
    ) {
      throw new GitHubUnavailableError(
        `${method} ${path} failed: HTTP ${res.status}`
      )
    }
    return { status: res.status, json }
  }

  const enc = encodeURIComponent
  const obj = (j: unknown): Record<string, unknown> =>
    j && typeof j === 'object' ? (j as Record<string, unknown>) : {}
  const arr = (j: unknown): Record<string, unknown>[] =>
    Array.isArray(j) ? (j as Record<string, unknown>[]) : []

  return {
    async getFile(path, ref) {
      const r = await request(
        'GET',
        `/contents/${path}?ref=${enc(ref)}`,
        undefined,
        [404]
      )
      if (r.status === 404) return null
      const j = obj(r.json)
      // WR-08: bad base64 or non-UTF-8 content must not throw out of the
      // publish flow (a retryable 503 the client would resend forever). An
      // empty text is unparsable, so planAdd/planRemove return `skipped`.
      let text: string
      try {
        text = decodeGitHubContent(String(j.content ?? ''))
      } catch {
        text = ''
      }
      return { sha: String(j.sha), text }
    },

    async findPulls(branch, state) {
      const head = enc(`${opts.owner}:${branch}`)
      const r = await request(
        'GET',
        `/pulls?head=${head}&state=${state}&per_page=10`
      )
      return arr(r.json).map((p) => ({
        number: Number(p.number),
        mergedAt: typeof p.merged_at === 'string' ? p.merged_at : null,
        body: typeof p.body === 'string' ? p.body : ''
      }))
    },

    async getBranchSha(branch) {
      const r = await request('GET', `/git/ref/heads/${branch}`)
      return String(obj(obj(r.json).object).sha)
    },

    async createBranch(branch, sha) {
      const r = await request(
        'POST',
        '/git/refs',
        { ref: `refs/heads/${branch}`, sha },
        [422]
      )
      if (r.status === 422) {
        const msg = String(obj(r.json).message ?? '')
        if (msg.includes('Reference already exists')) return 'exists'
        throw new GitHubUnavailableError(`POST /git/refs failed: HTTP 422`)
      }
      return 'created'
    },

    async forceBranch(branch, sha) {
      await request('PATCH', `/git/refs/heads/${branch}`, { sha, force: true })
    },

    async putFile(a) {
      const body: Record<string, unknown> = {
        message: a.message,
        content: encodeGitHubContent(a.text),
        branch: a.branch
      }
      if (a.sha !== undefined) body.sha = a.sha
      const r = await request('PUT', `/contents/${a.path}`, body)
      return String(obj(obj(r.json).content).sha)
    },

    async deleteFile(a) {
      await request('DELETE', `/contents/${a.path}`, {
        message: a.message,
        sha: a.sha,
        branch: a.branch
      })
    },

    async createPull(a) {
      const r = await request('POST', '/pulls', a)
      return Number(obj(r.json).number)
    },

    async getPullState(n) {
      const r = await request('GET', `/pulls/${n}`)
      return obj(r.json).state === 'open' ? 'open' : 'closed'
    },

    async updatePullBody(n, body) {
      await request('PATCH', `/pulls/${n}`, { body })
    },

    async findIssueByTitle(label, title) {
      const r = await request(
        'GET',
        `/issues?labels=${enc(label)}&state=all&per_page=100`
      )
      const hit = arr(r.json).find((i) => !i.pull_request && i.title === title)
      return hit ? Number(hit.number) : null
    },

    async createIssue(a) {
      const r = await request('POST', '/issues', a)
      return Number(obj(r.json).number)
    }
  }
}
