// Phase 21 (21-01): Unit tests for the lifted depot primitive layers
// (crypto, decompress, select). Proves byte-fidelity, SHA1-verify-then-trust,
// and 64-bit-GID-as-string invariants asserted by tests, not just prose.

import { createCipheriv, randomBytes } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'
import * as lzma from 'lzma'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

import { logInfo } from 'backend/logger'

import { steamDecrypt, decryptFilename } from '../depot/crypto'
import { decompressChunk, sha1, fetchChunk } from '../depot/decompress'
import { HostHealthTracker } from '../depot/hostHealth'
import { CdnAuthTokenCache, type CDNAuthTokenClient } from '../depot/cdnAuth'
import { selectAllDepots, selectDepots, type OwnedSets } from '../depot/select'

// ── Test helpers ─────────────────────────────────────────────────────────

/** Steam's symmetric encrypt (inverse of steamDecrypt) — for round-trip fixtures. */
function steamEncrypt(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(16)
  const ivEnc = createCipheriv('aes-256-ecb', key, null)
  ivEnc.setAutoPadding(false)
  const encryptedIv = Buffer.concat([ivEnc.update(iv), ivEnc.final()])

  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])

  return Buffer.concat([encryptedIv, encrypted])
}

function compressAsync(data: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    lzma.compress(data, 1, (result, err) =>
      err ? reject(err) : resolve(Buffer.from(result))
    )
  )
}

/** Build a VZ-container chunk from raw data + its LZMA-compressed representation. */
function buildVZChunk(data: Buffer, compressed: Buffer): Buffer {
  const props = compressed.subarray(0, 5)
  const payload = compressed.subarray(13) // skip props(5) + alone-format size(8)

  const header = Buffer.concat([Buffer.from('VZa', 'latin1'), Buffer.alloc(4), props])
  const footer = Buffer.alloc(10)
  footer.writeUInt32LE(0, 0) // crc — unused/unchecked by decompressChunk
  footer.writeUInt32LE(data.length, 4) // outSize — read at buf.length-6
  footer.write('zv', 8, 'latin1')

  return Buffer.concat([header, payload, footer])
}

/** Build a PK/zlib-container chunk (local-file-header + raw deflate body). */
function buildPKChunk(data: Buffer): Buffer {
  const deflated = deflateRawSync(data)
  const nameLen = 4
  const extraLen = 0
  const filename = Buffer.from('test')
  const buf = Buffer.alloc(30 + nameLen + extraLen + deflated.length)
  buf.write('PK', 0, 'latin1')
  buf.writeUInt16LE(nameLen, 26)
  buf.writeUInt16LE(extraLen, 28)
  filename.copy(buf, 30)
  deflated.copy(buf, 30 + nameLen + extraLen)
  return buf
}

// ── crypto ────────────────────────────────────────────────────────────────

describe('crypto', () => {
  const key = randomBytes(32)

  it('steamDecrypt round-trips a known plaintext under a known key', () => {
    const plaintext = Buffer.from('some depot chunk plaintext bytes, arbitrary length!')
    const ciphertext = steamEncrypt(plaintext, key)
    expect(steamDecrypt(ciphertext, key)).toEqual(plaintext)
  })

  it('decryptFilename returns UTF-8 up to the first NUL, stripping trailing PKCS padding', () => {
    const filename = 'UnityEngine.SubstanceModule.dll'
    const plaintext = Buffer.concat([Buffer.from(filename, 'utf8'), Buffer.from([0])])
    const ciphertext = steamEncrypt(plaintext, key)
    expect(decryptFilename(ciphertext.toString('base64'), key)).toBe(filename)
  })

  it('a filename decrypting to bytes containing "../" is returned verbatim (no sanitization)', () => {
    const filename = '../../evil/traversal.txt'
    const plaintext = Buffer.concat([Buffer.from(filename, 'utf8'), Buffer.from([0])])
    const ciphertext = steamEncrypt(plaintext, key)
    expect(decryptFilename(ciphertext.toString('base64'), key)).toBe(filename)
  })
})

// ── decompress ───────────────────────────────────────────────────────────

describe('decompress', () => {
  it('decompressChunk on a VZ-container fixture returns the exact decompressed bytes', async () => {
    const data = Buffer.from('Steam depot chunk fixture data. '.repeat(20), 'utf8')
    const compressed = await compressAsync(data)
    const vzChunk = buildVZChunk(data, compressed)
    const out = await decompressChunk(vzChunk, lzma)
    expect(out.equals(data)).toBe(true)
  })

  it('decompressChunk on a PK fixture uses the zlib inflateRaw path', async () => {
    const data = Buffer.from('pk deflate fixture data', 'utf8')
    const pkChunk = buildPKChunk(data)
    const out = await decompressChunk(pkChunk, lzma)
    expect(out.equals(data)).toBe(true)
  })

  it('decompressChunk throws on an unknown container magic', async () => {
    const bogus = Buffer.from('XXsome-unknown-container-bytes', 'utf8')
    await expect(decompressChunk(bogus, lzma)).rejects.toThrow(/unknown chunk container/)
  })

  it('sha1 hashes bytes to the expected hex digest', () => {
    const data = Buffer.from('hello')
    // sha1('hello') = aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d
    expect(sha1(data)).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d')
  })

  describe('fetchChunk', () => {
    const key = randomBytes(32)
    const depotId = '12345'
    const hosts = ['host-a.example', 'host-b.example', 'host-c.example', 'host-d.example']

    async function buildEncryptedChunkResponse(data: Buffer) {
      const compressed = await compressAsync(data)
      const vzChunk = buildVZChunk(data, compressed)
      return steamEncrypt(vzChunk, key)
    }

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('retries on a SHA1 mismatch and rotates to a different host each attempt; throws after `attempts` and never returns unverified bytes', async () => {
      const data = Buffer.from('never verifies', 'utf8')
      const encrypted = await buildEncryptedChunkResponse(data)
      const requestedHosts: string[] = []

      global.fetch = jest.fn((url: unknown) => {
        const urlStr = String(url)
        const host = urlStr.split('/')[2]
        requestedHosts.push(host)
        return Promise.resolve({
          ok: true,
          arrayBuffer: () =>
            Promise.resolve(
              encrypted.buffer.slice(
                encrypted.byteOffset,
                encrypted.byteOffset + encrypted.byteLength
              )
            )
        } as Response)
      }) as unknown as typeof fetch

      const chunk = { sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', cb_original: data.length }

      await expect(
        fetchChunk(hosts, depotId, chunk, key, lzma, 4)
      ).rejects.toThrow(/failed after 4 attempts/)

      expect(requestedHosts).toHaveLength(4)
      // Hosts rotate — every attempt hits a distinct host (4 attempts, 4 distinct hosts).
      expect(new Set(requestedHosts).size).toBe(4)
    }, 15000)

    it('returns verified bytes when the SHA1 matches', async () => {
      const data = Buffer.from('verifies correctly', 'utf8')
      const encrypted = await buildEncryptedChunkResponse(data)
      const expectedSha = sha1(data)

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          arrayBuffer: () =>
            Promise.resolve(
              encrypted.buffer.slice(
                encrypted.byteOffset,
                encrypted.byteOffset + encrypted.byteLength
              )
            )
        } as Response)
      ) as unknown as typeof fetch

      const chunk = { sha: expectedSha, cb_original: data.length }
      const out = await fetchChunk(hosts, depotId, chunk, key, lzma, 4)
      expect(out.equals(data)).toBe(true)
    })

    // Debug/steam-install-slow-start (cycle 3): host-scoring / health-aware
    // selection. Omitting `hostHealth` (the two tests above, and every caller
    // that predates this cycle) leaves fetchChunk's plain round-robin
    // completely unchanged — these tests target the NEW behavior only
    // reachable when a HostHealthTracker is explicitly supplied.
    describe('with a HostHealthTracker (cycle 3)', () => {
      it('a persistently-failing host is skipped in favor of a healthy one, and the chunk succeeds instead of exhausting attempts', async () => {
        const data = Buffer.from('verifies correctly, from the good host', 'utf8')
        const encrypted = await buildEncryptedChunkResponse(data)
        const expectedSha = sha1(data)
        const badHost = hosts[0]
        const goodHost = hosts[1]

        global.fetch = jest.fn((url: unknown) => {
          const urlStr = String(url)
          const host = urlStr.split('/')[2]
          if (host === badHost) {
            return Promise.reject(new Error('ECONNRESET'))
          }
          return Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                encrypted.buffer.slice(
                  encrypted.byteOffset,
                  encrypted.byteOffset + encrypted.byteLength
                )
              )
          } as Response)
        }) as unknown as typeof fetch

        const hostHealth = new HostHealthTracker()
        // Pre-poison badHost with a consecutive-failure streak, exactly as a
        // real multi-chunk stream would accumulate it over many prior chunks
        // against the same host — this is the scenario the definitive
        // diagnosis captured (a 0%-success host still receiving an equal
        // share of attempts under plain round-robin).
        for (let i = 0; i < 5; i++) hostHealth.record(badHost, 'error', 50)

        const chunk = { sha: expectedSha, cb_original: data.length, attemptSeed: 0 }
        const out = await fetchChunk(
          hosts,
          depotId,
          chunk,
          key,
          lzma,
          4,
          undefined,
          undefined,
          undefined,
          hostHealth
        )

        expect(out.equals(data)).toBe(true)
        // badHost (seed=0 would normally be attempt 0's pick) must have been
        // skipped entirely in favor of the healthy goodHost.
        expect(global.fetch).toHaveBeenCalledTimes(1)
        const calledUrl = String((global.fetch as jest.Mock).mock.calls[0][0])
        expect(calledUrl).toContain(goodHost)
        expect(calledUrl).not.toContain(badHost)
      })

      it('records a success/error outcome for every attempt via hostHealth.record, matching what the tracker itself would report', async () => {
        const data = Buffer.from('never verifies, tracked attempts', 'utf8')
        const encrypted = await buildEncryptedChunkResponse(data)

        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                encrypted.buffer.slice(
                  encrypted.byteOffset,
                  encrypted.byteOffset + encrypted.byteLength
                )
              )
          } as Response)
        ) as unknown as typeof fetch

        const hostHealth = new HostHealthTracker()
        const chunk = {
          sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
          cb_original: data.length,
          attemptSeed: 0
        }

        await expect(
          fetchChunk(hosts, depotId, chunk, key, lzma, 4, undefined, undefined, undefined, hostHealth)
        ).rejects.toThrow(/failed after 4 attempts/)

        // Every one of the 4 attempts (SHA1 never matches -> always 'error')
        // must have been recorded against SOME host in the pool, attempts
        // summing to 4 across the tracker.
        const totalRecorded = hosts.reduce(
          (sum, host) => sum + hostHealth.snapshot(host).attempts,
          0
        )
        expect(totalRecorded).toBe(4)
      })
    })

    // Debug/steam-install-slow-start (cycle 6, gating REVERTED+FIXED cycle
    // 7): cycle 6 fetched a token whenever `cdnAuth` was merely supplied —
    // DISPROVEN by the cycle-6 hardware run (steam-user's own downloadChunk
    // only requests a token `if usetokenauth == 1`; every real host observed
    // never sets it, so the unconditional fetch blocked every chunk behind a
    // 10s CM timeout). Cycle 7: a token is fetched ONLY when a `hostMeta`
    // entry for that exact host explicitly marks `usetokenauth: true`.
    // Omitting `cdnAuth`/`hostMeta` entirely (every test above, and every
    // caller that predates cycle 6) leaves the request URL byte-for-byte
    // unchanged.
    describe('with a CdnAuthTokenCache (cycle 6, usetokenauth-gated — cycle 7)', () => {
      function makeFakeCdnClient(token = '?real-cdn-token'): {
        client: CDNAuthTokenClient
        calls: Array<{ depotId: number; hostname: string }>
      } {
        const calls: Array<{ depotId: number; hostname: string }> = []
        const client: CDNAuthTokenClient = {
          getCDNAuthToken: jest.fn((_appId, depotId, hostname, callback) => {
            calls.push({ depotId, hostname })
            callback(null, { token, expires: new Date(Date.now() + 60 * 60 * 1000) })
          })
        }
        return { client, calls }
      }

      it('appends the acquired token VERBATIM to the chunk URL when hostMeta marks that host usetokenauth:true', async () => {
        const data = Buffer.from('token-gated chunk', 'utf8')
        const encrypted = await buildEncryptedChunkResponse(data)
        const expectedSha = sha1(data)
        const { client } = makeFakeCdnClient('?token=abc123&expires=999')
        const cdnAuth = new CdnAuthTokenCache(client, 1091500)
        const hostMeta = new Map([[hosts[0], { httpsSupport: 'mandatory', usetokenauth: true }]])

        let requestedUrl = ''
        global.fetch = jest.fn((url: unknown) => {
          requestedUrl = String(url)
          return Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                encrypted.buffer.slice(
                  encrypted.byteOffset,
                  encrypted.byteOffset + encrypted.byteLength
                )
              )
          } as Response)
        }) as unknown as typeof fetch

        const chunk = { sha: expectedSha, cb_original: data.length }
        const out = await fetchChunk(
          hosts,
          depotId,
          chunk,
          key,
          lzma,
          4,
          undefined,
          undefined,
          undefined,
          undefined,
          cdnAuth,
          hostMeta
        )

        expect(out.equals(data)).toBe(true)
        expect(requestedUrl).toBe(
          `https://${hosts[0]}/depot/${depotId}/chunk/${expectedSha}?token=abc123&expires=999`
        )
      })

      it('debug/steam-install-slow-start (cycle 7, PART 1 REVERT REGRESSION GUARD): supplying cdnAuth ALONE, with NO hostMeta at all, never calls getCDNAuthToken and never appends a token — cycle 6\'s unconditional fetch must stay reverted', async () => {
        const data = Buffer.from('no hostMeta at all', 'utf8')
        const encrypted = await buildEncryptedChunkResponse(data)
        const expectedSha = sha1(data)
        const { client, calls } = makeFakeCdnClient()
        const cdnAuth = new CdnAuthTokenCache(client, 1091500)

        let requestedUrl = ''
        global.fetch = jest.fn((url: unknown) => {
          requestedUrl = String(url)
          return Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                encrypted.buffer.slice(
                  encrypted.byteOffset,
                  encrypted.byteOffset + encrypted.byteLength
                )
              )
          } as Response)
        }) as unknown as typeof fetch

        const chunk = { sha: expectedSha, cb_original: data.length }
        // cdnAuth supplied, hostMeta OMITTED entirely.
        await fetchChunk(hosts, depotId, chunk, key, lzma, 4, undefined, undefined, undefined, undefined, cdnAuth)

        expect(calls).toHaveLength(0)
        expect(requestedUrl).toBe(`https://${hosts[0]}/depot/${depotId}/chunk/${expectedSha}`)
      })

      it('debug/steam-install-slow-start (cycle 7, PART 1 REVERT REGRESSION GUARD): a hostMeta entry present but usetokenauth false/absent never calls getCDNAuthToken either', async () => {
        const data = Buffer.from('hostMeta present but not usetokenauth', 'utf8')
        const encrypted = await buildEncryptedChunkResponse(data)
        const expectedSha = sha1(data)
        const { client, calls } = makeFakeCdnClient()
        const cdnAuth = new CdnAuthTokenCache(client, 1091500)
        // Real-world shape: every SteamCache host reduceContentServers has
        // ever observed has a hostMeta entry (httpsSupport known) but
        // usetokenauth is absent/false.
        const hostMeta = new Map([[hosts[0], { httpsSupport: 'mandatory' }]])

        let requestedUrl = ''
        global.fetch = jest.fn((url: unknown) => {
          requestedUrl = String(url)
          return Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                encrypted.buffer.slice(
                  encrypted.byteOffset,
                  encrypted.byteOffset + encrypted.byteLength
                )
              )
          } as Response)
        }) as unknown as typeof fetch

        const chunk = { sha: expectedSha, cb_original: data.length }
        await fetchChunk(
          hosts,
          depotId,
          chunk,
          key,
          lzma,
          4,
          undefined,
          undefined,
          undefined,
          undefined,
          cdnAuth,
          hostMeta
        )

        expect(calls).toHaveLength(0)
        expect(requestedUrl).toBe(`https://${hosts[0]}/depot/${depotId}/chunk/${expectedSha}`)
      })

      it('fetches the token at most once per depot+host across multiple chunks — never once per chunk', async () => {
        const data1 = Buffer.from('chunk one', 'utf8')
        const data2 = Buffer.from('chunk two, a different one', 'utf8')
        const encrypted1 = await buildEncryptedChunkResponse(data1)
        const encrypted2 = await buildEncryptedChunkResponse(data2)
        const { client, calls } = makeFakeCdnClient()
        const cdnAuth = new CdnAuthTokenCache(client, 1091500)
        const hostMeta = new Map([[hosts[0], { usetokenauth: true }]])

        global.fetch = jest.fn((url: unknown) => {
          const urlStr = String(url)
          const encrypted = urlStr.includes(sha1(data1)) ? encrypted1 : encrypted2
          return Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                encrypted.buffer.slice(
                  encrypted.byteOffset,
                  encrypted.byteOffset + encrypted.byteLength
                )
              )
          } as Response)
        }) as unknown as typeof fetch

        // Both chunks share attemptSeed=0 -> both attempt hosts[0] first.
        await fetchChunk(
          hosts,
          depotId,
          { sha: sha1(data1), cb_original: data1.length, attemptSeed: 0 },
          key,
          lzma,
          4,
          undefined,
          undefined,
          undefined,
          undefined,
          cdnAuth,
          hostMeta
        )
        await fetchChunk(
          hosts,
          depotId,
          { sha: sha1(data2), cb_original: data2.length, attemptSeed: 0 },
          key,
          lzma,
          4,
          undefined,
          undefined,
          undefined,
          undefined,
          cdnAuth,
          hostMeta
        )

        // Same depotId + same first-attempt host across both chunks -> ONE
        // token fetch, reused for the second chunk's request.
        expect(calls).toHaveLength(1)
      })

      it('omitting cdnAuth leaves the URL with no token appended, exactly as every pre-cycle-6 call', async () => {
        const data = Buffer.from('no token here', 'utf8')
        const encrypted = await buildEncryptedChunkResponse(data)
        const expectedSha = sha1(data)

        let requestedUrl = ''
        global.fetch = jest.fn((url: unknown) => {
          requestedUrl = String(url)
          return Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                encrypted.buffer.slice(
                  encrypted.byteOffset,
                  encrypted.byteOffset + encrypted.byteLength
                )
              )
          } as Response)
        }) as unknown as typeof fetch

        const chunk = { sha: expectedSha, cb_original: data.length }
        await fetchChunk(hosts, depotId, chunk, key, lzma, 4)

        expect(requestedUrl).toBe(`https://${hosts[0]}/depot/${depotId}/chunk/${expectedSha}`)
      })

      it('a 401 response invalidates the cached token for that depot+host, so the retry re-fetches a fresh one instead of repeating the rejected token', async () => {
        const data = Buffer.from('recovers after a 401', 'utf8')
        const encrypted = await buildEncryptedChunkResponse(data)
        const expectedSha = sha1(data)
        let tokenCall = 0
        const client: CDNAuthTokenClient = {
          getCDNAuthToken: jest.fn((_appId, _depotId, _hostname, callback) => {
            tokenCall++
            callback(null, {
              token: `?token-${tokenCall}`,
              expires: new Date(Date.now() + 60 * 60 * 1000)
            })
          })
        }
        const cdnAuth = new CdnAuthTokenCache(client, 1091500)
        const badHost = hosts[0]
        const hostMeta = new Map([[badHost, { usetokenauth: true }]])
        const requestedUrls: string[] = []

        global.fetch = jest.fn((url: unknown) => {
          const urlStr = String(url)
          requestedUrls.push(urlStr)
          const host = urlStr.split('/')[2]
          if (host === badHost) {
            // The FIRST request against badHost (carrying token-1) is
            // rejected with 401; any LATER request against badHost (carrying
            // the re-fetched token-2) succeeds — proves invalidate()
            // actually triggered a re-fetch rather than the retry repeating
            // the same rejected token forever.
            if (urlStr.includes('token-1')) {
              return Promise.resolve({ ok: false, status: 401 } as Response)
            }
            return Promise.resolve({
              ok: true,
              arrayBuffer: () =>
                Promise.resolve(
                  encrypted.buffer.slice(
                    encrypted.byteOffset,
                    encrypted.byteOffset + encrypted.byteLength
                  )
                )
            } as Response)
          }
          // Every OTHER host always fails (plain network error, no token
          // involved) — forces the round-robin to wrap back around to
          // badHost within the attempt budget, so this test actually
          // exercises a SECOND visit to badHost rather than succeeding on
          // some other host first.
          return Promise.reject(new Error('CDN 500'))
        }) as unknown as typeof fetch

        // attemptSeed=0, 4 hosts, attempts=hosts.length+1=5: attempt 0 hits
        // hosts[0] (badHost, token-1, rejected+invalidated), attempts 1-3
        // hit hosts[1..3] (always fail), attempt 4 wraps back to hosts[0]
        // (badHost) — this time with a freshly-fetched token-2, which
        // succeeds.
        const chunk = { sha: expectedSha, cb_original: data.length, attemptSeed: 0 }
        const out = await fetchChunk(
          hosts,
          depotId,
          chunk,
          key,
          lzma,
          hosts.length + 1,
          undefined,
          undefined,
          undefined,
          undefined,
          cdnAuth,
          hostMeta
        )

        expect(out.equals(data)).toBe(true)
        // tokenCall is a single counter shared across every depot+host key
        // this test fetches (badHost twice, plus one each for hosts[1..3]),
        // so the badHost's SECOND token is not literally "token-2" — assert
        // on the property that actually matters: invalidate() forced a
        // DIFFERENT, freshly-fetched token for badHost's second visit,
        // rather than repeating the rejected token-1.
        const badHostRequests = requestedUrls.filter((u) => u.includes(badHost))
        expect(badHostRequests).toHaveLength(2)
        expect(badHostRequests[0]).toContain('token-1')
        expect(badHostRequests[1]).not.toContain('token-1')
        expect(badHostRequests[1]).not.toBe(badHostRequests[0])
      }, 15000)

      it('a token-fetch failure (for a usetokenauth host) degrades to a token-less request for that attempt, rather than aborting the chunk fetch', async () => {
        const data = Buffer.from('degrades gracefully', 'utf8')
        const encrypted = await buildEncryptedChunkResponse(data)
        const expectedSha = sha1(data)
        const client: CDNAuthTokenClient = {
          getCDNAuthToken: jest.fn((_appId, _depotId, _hostname, callback) => {
            callback(new Error('ClientGetCDNAuthToken: transient failure'))
          })
        }
        const cdnAuth = new CdnAuthTokenCache(client, 1091500)
        const hostMeta = new Map([[hosts[0], { httpsSupport: 'mandatory', usetokenauth: true }]])

        let requestedUrl = ''
        global.fetch = jest.fn((url: unknown) => {
          requestedUrl = String(url)
          return Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                encrypted.buffer.slice(
                  encrypted.byteOffset,
                  encrypted.byteOffset + encrypted.byteLength
                )
              )
          } as Response)
        }) as unknown as typeof fetch

        const chunk = { sha: expectedSha, cb_original: data.length }
        const out = await fetchChunk(
          hosts,
          depotId,
          chunk,
          key,
          lzma,
          4,
          undefined,
          undefined,
          undefined,
          undefined,
          cdnAuth,
          hostMeta
        )

        expect(out.equals(data)).toBe(true)
        expect(client.getCDNAuthToken).toHaveBeenCalled()
        // No token appended — the fetch still succeeded because this fixture
        // host doesn't actually require one, exactly like a real SteamCache
        // local edge would.
        expect(requestedUrl).toBe(`https://${hosts[0]}/depot/${depotId}/chunk/${expectedSha}`)
      })
    })

    // Debug/steam-install-slow-start (cycle 7): EXACT steam-user URL-scheme
    // parity (node_modules/steam-user/components/cdn.js's own downloadChunk)
    // -- only https_support === 'mandatory' selects https; everything else
    // (including 'unavailable', the real cycle-5 hardware diagnosis's
    // alibaba.cdn.steampipe.steamcontent.com) selects http. Omitting
    // hostMeta (every pre-cycle-7 caller/test above) keeps the original
    // hardcoded https://.
    describe('URL scheme parity via hostMeta (cycle 7)', () => {
      async function fetchOneChunkAndCaptureUrl(
        hostMeta?: ReadonlyMap<string, { httpsSupport?: string; usetokenauth?: boolean }>
      ): Promise<string> {
        const data = Buffer.from('scheme-parity chunk', 'utf8')
        const encrypted = await buildEncryptedChunkResponse(data)
        const expectedSha = sha1(data)

        let requestedUrl = ''
        global.fetch = jest.fn((url: unknown) => {
          requestedUrl = String(url)
          return Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                encrypted.buffer.slice(
                  encrypted.byteOffset,
                  encrypted.byteOffset + encrypted.byteLength
                )
              )
          } as Response)
        }) as unknown as typeof fetch

        const chunk = { sha: expectedSha, cb_original: data.length }
        await fetchChunk(
          hosts,
          depotId,
          chunk,
          key,
          lzma,
          4,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          hostMeta
        )
        return requestedUrl
      }

      it('https_support: "mandatory" selects https://', async () => {
        const hostMeta = new Map([[hosts[0], { httpsSupport: 'mandatory' }]])
        const url = await fetchOneChunkAndCaptureUrl(hostMeta)
        expect(url).toMatch(/^https:\/\//)
      })

      it('https_support: "unavailable" (the real alibaba.cdn.steampipe.steamcontent.com value) selects http:// — unlocking an HTTP-only content server the pre-cycle-7 hardcoded https:// call could never reach', async () => {
        const hostMeta = new Map([[hosts[0], { httpsSupport: 'unavailable' }]])
        const url = await fetchOneChunkAndCaptureUrl(hostMeta)
        expect(url).toMatch(/^http:\/\//)
      })

      it('a host with NO hostMeta entry at all (present in `hosts` but missing from the map) falls back to https:// — never silently downgrades transport for a host this cycle has no data for', async () => {
        const hostMeta = new Map([['some-other-host.example', { httpsSupport: 'unavailable' }]])
        const url = await fetchOneChunkAndCaptureUrl(hostMeta)
        expect(url).toMatch(/^https:\/\//)
      })

      it('omitting hostMeta entirely (every pre-cycle-7 caller/test) keeps the original hardcoded https:// — no regression', async () => {
        const url = await fetchOneChunkAndCaptureUrl(undefined)
        expect(url).toMatch(/^https:\/\//)
      })
    })
  })
})

// ── select ───────────────────────────────────────────────────────────────

describe('select', () => {
  function makeOwned(apps: number[], depots: number[]): OwnedSets {
    return { apps: new Set(apps), depots: new Set(depots) }
  }

  beforeEach(() => {
    ;(logInfo as jest.Mock).mockClear()
  })

  it('a depot appearing only in an owned package depotids is selected', () => {
    const appinfo = {
      depots: {
        '100': {
          manifests: { public: { gid: '111111111111111111', size: 1000 } },
          config: {}
        }
      }
    }
    const owned = makeOwned([], [100])
    const result = selectDepots(appinfo, owned, { os: 'windows' }, '12345')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('100')
  })

  it('D-UAT-08: stamps the caller-supplied ownerAppId onto every emitted descriptor', () => {
    const appinfo = {
      depots: {
        '100': {
          manifests: { public: { gid: '111111111111111111', size: 1000 } },
          config: {}
        }
      }
    }
    const owned = makeOwned([], [100])
    const result = selectDepots(appinfo, owned, { os: 'windows' }, '99999')
    expect(result).toHaveLength(1)
    expect(result[0].ownerAppId).toBe('99999')
  })

  it('a depot carrying an owned dlcappid is selected; an unowned dlcappid excludes it (two channels, neither alone sufficient)', () => {
    const appinfoOwnedDlc = {
      depots: {
        '200': {
          manifests: { public: { gid: '222222222222222222', size: 500 } },
          config: {},
          dlcappid: 999
        }
      }
    }
    const ownedApp999 = makeOwned([999], [])
    const selected = selectDepots(appinfoOwnedDlc, ownedApp999, { os: 'windows' }, '12345')
    expect(selected).toHaveLength(1)
    expect(selected[0].id).toBe('200')

    const appinfoUnownedDlc = {
      depots: {
        '201': {
          manifests: { public: { gid: '333333333333333333', size: 500 } },
          config: {},
          dlcappid: 555 // not owned, and depot not directly owned either
        }
      }
    }
    const ownedNothing = makeOwned([], [])
    const excluded = selectDepots(appinfoUnownedDlc, ownedNothing, { os: 'windows' }, '12345')
    expect(excluded).toHaveLength(0)
  })

  it('every returned depot manifest field is a string; a 19-digit GID survives with exact digits (never rounded)', () => {
    const nineteenDigitGid = '1234567890123456789' // > Number.MAX_SAFE_INTEGER
    const appinfo = {
      depots: {
        '300': {
          manifests: { public: { gid: nineteenDigitGid, size: 42 } },
          config: {}
        }
      }
    }
    const owned = makeOwned([], [300])
    const result = selectDepots(appinfo, owned, { os: 'windows' }, '12345')
    expect(result).toHaveLength(1)
    expect(typeof result[0].manifest).toBe('string')
    expect(result[0].manifest).toBe(nineteenDigitGid)
  })

  it('os is honoured as a parameter — { os: "windows" } vs { os: "linux" } filter os-specific depots accordingly', () => {
    const appinfo = {
      depots: {
        '400': {
          manifests: { public: { gid: '444444444444444444', size: 10 } },
          config: { oslist: 'windows' }
        }
      }
    }
    const owned = makeOwned([], [400])
    expect(selectDepots(appinfo, owned, { os: 'windows' }, '12345')).toHaveLength(1)
    expect(selectDepots(appinfo, owned, { os: 'linux' }, '12345')).toHaveLength(0)
  })

  it('selectAllDepots merges depots declared inside DLC app entries not present on the base app', () => {
    const baseAppinfo = {
      depots: {
        '500': {
          manifests: { public: { gid: '555555555555555555', size: 10 } },
          config: {}
        }
      },
      extended: { listofdlc: '600' }
    }
    const dlcInfos = {
      '600': {
        depots: {
          '601': {
            manifests: { public: { gid: '666666666666666666', size: 20 } },
            config: {}
          }
        }
      }
    }
    const owned = makeOwned([600], [500, 601])
    const result = selectAllDepots(baseAppinfo, dlcInfos, owned, { os: 'windows' }, '12345')
    const ids = result.map((d) => d.id).sort()
    expect(ids).toEqual(['500', '601'])
  })

  it('D-UAT-08: a base-app depot is stamped with the BASE appId; a DLC-enumerated depot is stamped with the DLC/sub-app appId, not the base appId', () => {
    const baseAppinfo = {
      depots: {
        '500': {
          manifests: { public: { gid: '555555555555555555', size: 10 } },
          config: {}
        }
      },
      extended: { listofdlc: '600' }
    }
    const dlcInfos = {
      '600': {
        depots: {
          '601': {
            manifests: { public: { gid: '666666666666666666', size: 20 } },
            config: {}
          }
        }
      }
    }
    const owned = makeOwned([600], [500, 601])
    const result = selectAllDepots(baseAppinfo, dlcInfos, owned, { os: 'windows' }, '12345')

    const baseDepot = result.find((d) => d.id === '500')
    const dlcDepot = result.find((d) => d.id === '601')
    expect(baseDepot?.ownerAppId).toBe('12345')
    // D-UAT-08 root cause: the DLC-enumerated depot must carry the DLC's OWN
    // appId (600), never the base game's appId (12345) — Cyberpunk 2077's
    // macOS depots were requested with the base appId and rejected with
    // FileNotFound because they belong to a sub-app.
    expect(dlcDepot?.ownerAppId).toBe('600')
  })

  it('D-UAT-08: a base-app depot gated by dlcappid (ownership via the DLC channel) is still stamped with the BASE appId — it was enumerated from the base appinfo, not the DLC appinfo', () => {
    const appinfoOwnedDlc = {
      depots: {
        '200': {
          manifests: { public: { gid: '222222222222222222', size: 500 } },
          config: {},
          dlcappid: 999
        }
      }
    }
    const ownedApp999 = makeOwned([999], [])
    const selected = selectDepots(appinfoOwnedDlc, ownedApp999, { os: 'windows' }, '12345')
    expect(selected).toHaveLength(1)
    expect(selected[0].ownerAppId).toBe('12345')
  })

  it('logs the chosen depot ids + os/arch/language decision, with no secrets in any logInfo argument (T-21-16-01)', () => {
    const appinfo = {
      depots: {
        '700': {
          manifests: { public: { gid: '777777777777777777', size: 999 } },
          config: {}
        }
      }
    }
    const owned = makeOwned([], [700])
    const result = selectDepots(appinfo, owned, { os: 'macos', arch: '64', language: 'english' }, '12345')

    // Regression guard: logging must not alter the returned descriptors.
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('700')

    expect(logInfo).toHaveBeenCalled()
    const calls = (logInfo as jest.Mock).mock.calls
    const selectionLog = calls.find(([msg]) =>
      String(msg).includes('700(gid=777777777777777777,size=999)')
    )
    expect(selectionLog).toBeDefined()
    expect(String(selectionLog![0])).toContain('os=macos')
    expect(String(selectionLog![0])).toContain('arch=64')
    expect(String(selectionLog![0])).toContain('language=english')

    for (const [message] of calls) {
      const text = String(message)
      expect(text).not.toMatch(/key|token|steamid|lastowner/i)
    }
  })

  it('logs a per-depot skip reason when a candidate is filtered out by oslist (T-21-16-01)', () => {
    const appinfo = {
      depots: {
        '800': {
          manifests: { public: { gid: '888888888888888888', size: 5 } },
          config: { oslist: 'windows' }
        }
      }
    }
    const owned = makeOwned([], [800])
    const result = selectDepots(appinfo, owned, { os: 'linux' }, '12345')

    expect(result).toHaveLength(0)

    const calls = (logInfo as jest.Mock).mock.calls
    const skipLog = calls.find(([msg]) => String(msg).includes('skipped depot 800'))
    expect(skipLog).toBeDefined()
    expect(String(skipLog![0])).toContain('oslist=windows')
  })

  it('selectAllDepots logs the final union count', () => {
    const baseAppinfo = {
      depots: {
        '900': {
          manifests: { public: { gid: '999999999999999999', size: 1 } },
          config: {}
        }
      }
    }
    const owned = makeOwned([], [900])
    selectAllDepots(baseAppinfo, undefined, owned, { os: 'windows' }, '12345')

    const calls = (logInfo as jest.Mock).mock.calls
    const unionLog = calls.find(([msg]) => String(msg).includes('selectAllDepots union'))
    expect(unionLog).toBeDefined()
    expect(String(unionLog![0])).toContain('1 depot(s)')
  })
})
