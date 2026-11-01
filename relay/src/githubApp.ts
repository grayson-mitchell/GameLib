import type { FetchLike, RelayEnv } from './env'

export class PrivateKeyFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrivateKeyFormatError'
  }
}

export class GitHubUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GitHubUnavailableError'
  }
}

export function githubHeaders(auth: string): Record<string, string> {
  return {
    Authorization: auth,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'gamelib-fix-relay'
  }
}

function b64urlBytes(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlJson(value: unknown): string {
  return b64urlBytes(new TextEncoder().encode(JSON.stringify(value)))
}

const ALGO = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }

const PKCS1_MESSAGE =
  'GITHUB_APP_PRIVATE_KEY is PKCS#1; convert it with `openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in app.pem -out app-pkcs8.pem` and re-run wrangler secret put'

export async function mintAppJwt(
  appId: string,
  pem: string,
  nowSec = Math.floor(Date.now() / 1000)
): Promise<string> {
  const normalised = pem.replace(/\\n/g, '\n').replace(/\r/g, '')
  if (normalised.includes('BEGIN RSA PRIVATE KEY')) {
    throw new PrivateKeyFormatError(PKCS1_MESSAGE)
  }
  let key: CryptoKey
  try {
    const b64 = normalised.replace(/-----[^-]+-----|\s/g, '')
    const bin = atob(b64)
    const der = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i)
    key = await crypto.subtle.importKey('pkcs8', der, ALGO, false, ['sign'])
  } catch {
    throw new PrivateKeyFormatError(
      'GITHUB_APP_PRIVATE_KEY could not be imported as a PKCS#8 RSA key'
    )
  }
  const signingInput = `${b64urlJson({ alg: 'RS256', typ: 'JWT' })}.${b64urlJson(
    {
      iat: nowSec - 60,
      exp: nowSec + 540,
      iss: appId
    }
  )}`
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  )
  return `${signingInput}.${b64urlBytes(new Uint8Array(sig))}`
}

let cache: { token: string; expiresAtMs: number } | null = null

export function resetTokenCacheForTests(): void {
  cache = null
}

export async function getInstallationToken(
  env: Pick<
    RelayEnv,
    | 'GITHUB_APP_ID'
    | 'GITHUB_INSTALLATION_ID'
    | 'GITHUB_APP_PRIVATE_KEY'
    | 'REPO_NAME'
  >,
  fetch: FetchLike,
  nowMs: number
): Promise<string> {
  if (cache && nowMs < cache.expiresAtMs - 5 * 60_000) return cache.token
  const jwt = await mintAppJwt(
    env.GITHUB_APP_ID,
    env.GITHUB_APP_PRIVATE_KEY,
    Math.floor(nowMs / 1000)
  )
  let res: Response
  try {
    res = await fetch(
      `https://api.github.com/app/installations/${env.GITHUB_INSTALLATION_ID}/access_tokens`,
      {
        method: 'POST',
        headers: {
          ...githubHeaders(`Bearer ${jwt}`),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          repositories: [env.REPO_NAME],
          permissions: {
            contents: 'write',
            pull_requests: 'write',
            issues: 'write'
          }
        })
      }
    )
  } catch {
    throw new GitHubUnavailableError('installation token request failed')
  }
  let body: { token?: string; expires_at?: string } = {}
  if (res.status === 200 || res.status === 201) {
    try {
      body = (await res.json()) as typeof body
    } catch {
      body = {}
    }
  }
  if (!body.token) {
    throw new GitHubUnavailableError(
      `installation token request failed: HTTP ${res.status}`
    )
  }
  const exp = body.expires_at ? Date.parse(body.expires_at) : NaN
  cache = {
    token: body.token,
    expiresAtMs: Number.isNaN(exp) ? nowMs + 3_600_000 : exp
  }
  return body.token
}
