import {
  GitHubUnavailableError,
  PrivateKeyFormatError,
  getInstallationToken,
  mintAppJwt,
  resetTokenCacheForTests
} from '../githubApp'
import { createFakeFetch } from './helpers/fakeFetch'
import { generateTestKeys } from './helpers/testKeys'

const TOKEN_URL = 'https://api.github.com/app/installations/42/access_tokens'

function b64urlToBytes(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64url'))
}

describe('jwt', () => {
  beforeEach(() => resetTokenCacheForTests())

  it('mints a well-formed RS256 JWT with the right claims', async () => {
    const { pkcs8Pem } = await generateTestKeys()
    const jwt = await mintAppJwt('123', pkcs8Pem, 1_000_000)
    const parts = jwt.split('.')
    expect(parts).toHaveLength(3)
    for (const p of parts) expect(p).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(JSON.parse(Buffer.from(parts[0], 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT'
    })
    expect(JSON.parse(Buffer.from(parts[1], 'base64url').toString())).toEqual({
      iat: 999_940,
      exp: 1_000_540,
      iss: '123'
    })
  })

  it('produces a signature that verifies with the public key', async () => {
    const { pkcs8Pem, publicKey } = await generateTestKeys()
    const jwt = await mintAppJwt('123', pkcs8Pem, 1_000_000)
    const [h, p, s] = jwt.split('.')
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      b64urlToBytes(s),
      new TextEncoder().encode(`${h}.${p}`)
    )
    expect(ok).toBe(true)
  })

  it('accepts literal \\n escapes and CRLF line endings', async () => {
    const { pkcs8Pem } = await generateTestKeys()
    const escaped = pkcs8Pem.trim().replace(/\n/g, '\\n')
    const crlf = pkcs8Pem.replace(/\n/g, '\r\n')
    await expect(mintAppJwt('1', escaped, 1_000_000)).resolves.toBeTruthy()
    await expect(mintAppJwt('1', crlf, 1_000_000)).resolves.toBeTruthy()
  })

  it('rejects a PKCS#1 key without leaking key material', async () => {
    const { pkcs1Pem } = await generateTestKeys()
    let err: unknown
    try {
      await mintAppJwt('1', pkcs1Pem, 1_000_000)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(PrivateKeyFormatError)
    const msg = (err as Error).message
    expect(msg).toContain('openssl pkcs8 -topk8')
    for (const line of pkcs1Pem.split('\n').filter((l) => l.length > 20)) {
      expect(msg).not.toContain(line)
    }
  })

  it('rejects garbage key material with PrivateKeyFormatError', async () => {
    await expect(
      mintAppJwt(
        '1',
        '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----'
      )
    ).rejects.toBeInstanceOf(PrivateKeyFormatError)
  })

  describe('installation token', () => {
    async function envFor() {
      const { pkcs8Pem } = await generateTestKeys()
      return {
        GITHUB_APP_ID: '123',
        GITHUB_INSTALLATION_ID: '42',
        GITHUB_APP_PRIVATE_KEY: pkcs8Pem,
        REPO_NAME: 'known-fixes'
      }
    }
    const NOW = 1_700_000_000_000
    const reply = (expiresAtMs: number, token = 'ghs_abc') => ({
      status: 201,
      json: { token, expires_at: new Date(expiresAtMs).toISOString() }
    })

    it('POSTs a repo-scoped request with the right headers', async () => {
      const env = await envFor()
      const f = createFakeFetch({
        [`POST ${TOKEN_URL}`]: reply(NOW + 3_600_000)
      })
      const token = await getInstallationToken(env, f.fetch, NOW)
      expect(token).toBe('ghs_abc')
      expect(f.calls).toHaveLength(1)
      const c = f.calls[0]
      expect(c.headers['authorization']).toMatch(
        /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/
      )
      expect(c.headers['accept']).toBe('application/vnd.github+json')
      expect(c.headers['x-github-api-version']).toBe('2022-11-28')
      expect(c.headers['user-agent']).toBe('gamelib-fix-relay')
      expect(c.body).toEqual({
        repositories: ['known-fixes'],
        permissions: {
          contents: 'write',
          pull_requests: 'write',
          issues: 'write'
        }
      })
    })

    it('reuses the cached token, then refreshes within 5 minutes of expiry', async () => {
      const env = await envFor()
      const f = createFakeFetch({
        [`POST ${TOKEN_URL}`]: reply(NOW + 3_600_000)
      })
      await getInstallationToken(env, f.fetch, NOW)
      await getInstallationToken(env, f.fetch, NOW + 60_000)
      expect(f.calls).toHaveLength(1)
      await getInstallationToken(env, f.fetch, NOW + 3_600_000 - 4 * 60_000)
      expect(f.calls).toHaveLength(2)
    })

    it.each([401, 403, 500, 503])(
      'maps HTTP %i to GitHubUnavailableError',
      async (status) => {
        const env = await envFor()
        const f = createFakeFetch({ [`POST ${TOKEN_URL}`]: { status } })
        let err: unknown
        try {
          await getInstallationToken(env, f.fetch, NOW)
        } catch (e) {
          err = e
        }
        expect(err).toBeInstanceOf(GitHubUnavailableError)
        expect((err as Error).message).not.toContain('PRIVATE KEY')
      }
    )

    it('maps a rejected fetch to GitHubUnavailableError', async () => {
      const env = await envFor()
      const f = createFakeFetch({
        [`POST ${TOKEN_URL}`]: new Error('network down')
      })
      await expect(
        getInstallationToken(env, f.fetch, NOW)
      ).rejects.toBeInstanceOf(GitHubUnavailableError)
    })
  })
})
