/**
 * Phase 79 (D-05..D-08, CF-08): sign-in on the Rust Web API flows. A mocked requestRustInvoke
 * stands in for the shell; fake timers drive the unref'd wait loop.
 */
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))

import * as logger from 'backend/logger'
import { createSteamSignInState } from '../userSignInState'
import {
  pollCredentialLogin,
  pollQRLogin,
  startCredentialLogin,
  startQRLogin,
  submitSteamGuardCode
} from '../userSignIn'
import type { UserSignInDeps } from '../userSignIn'

const SECRET_PASSWORD = 'hunter2-pass'
const SECRET_CODE = 'KQM4F'
const SECRET_TOKEN = 'refresh-token-secret'
const DONE = {
  status: 'done',
  refreshToken: SECRET_TOKEN,
  accountName: 'acct',
  steamId: '76561190000000001'
}

type Handler = (args: unknown[]) => unknown

function build(handlers: Record<string, Handler | Handler[]>) {
  const calls: string[] = []
  const order: string[] = []
  const requestRustInvoke = jest.fn(
    async (channel: string, args: unknown[]) => {
      calls.push(channel)
      order.push(channel)
      const h = handlers[channel]
      if (Array.isArray(h)) {
        const next = h.length > 1 ? h.shift() : h[0]
        return await next?.(args)
      }
      return await h?.(args)
    }
  )
  const setToken = jest.fn(() => {
    order.push('setToken')
    return Promise.resolve()
  })
  const clearToken = jest.fn(() => {
    order.push('clearToken')
    return Promise.resolve()
  })
  const configStore = { set: jest.fn(), delete: jest.fn() }
  const noteSignInSucceeded = jest.fn()
  const client = {
    steamID: { getSteamID64: () => '76561190000000001' },
    getPersonas: jest.fn(() =>
      Promise.resolve({
        personas: { '76561190000000001': { player_name: 'Persona' } }
      })
    )
  }
  const acquireAuthenticatedWithToken = jest.fn(() => {
    order.push('acquire')
    return Promise.resolve({ ok: true, client, release: jest.fn() })
  })
  const deps = {
    requestRustInvoke,
    stores: { steam: { configStore } },
    tokenStore: { current: () => ({ setToken, clearToken }) },
    signIn: { outcomes: { noteSignInSucceeded } },
    steamSession: { signIn: createSteamSignInState() },
    steamUser: { acquireAuthenticatedWithToken }
  } as unknown as UserSignInDeps
  return {
    deps,
    requestRustInvoke,
    calls,
    order,
    setToken,
    clearToken,
    configStore,
    noteSignInSucceeded,
    acquireAuthenticatedWithToken,
    client
  }
}

describe('userSignIn on the rust engine', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  function loggedText(): string {
    const all = [
      ...(logger.logInfo as jest.Mock).mock.calls,
      ...(logger.logError as jest.Mock).mock.calls,
      ...(logger.logWarning as jest.Mock).mock.calls,
      ...(logger.logDebug as jest.Mock).mock.calls
    ]
    return JSON.stringify(all)
  }

  it('startQRLogin cancels a previous rust flow, starts one and returns the challenge', async () => {
    const t = build({
      steamcm_signin_qr_start: [
        () => ({ ok: true, flowId: 'f1', challengeUrl: 'A' }),
        () => ({ ok: true, flowId: 'f2', challengeUrl: 'B' })
      ],
      steamcm_signin_cancel: () => ({ ok: true })
    })
    expect(await startQRLogin(t.deps)).toEqual({
      status: 'done',
      challengeUrl: 'A'
    })
    expect(await startQRLogin(t.deps)).toEqual({
      status: 'done',
      challengeUrl: 'B'
    })
    expect(t.requestRustInvoke).toHaveBeenCalledWith('steamcm_signin_cancel', [
      { flowId: 'f1' }
    ])
  })

  it('pollQRLogin reports waiting and returns challengeUrl only when it changed', async () => {
    const t = build({
      steamcm_signin_qr_start: () => ({ flowId: 'f1', challengeUrl: 'A' }),
      steamcm_signin_status: [
        () => ({ status: 'waiting', challengeUrl: 'A' }),
        () => ({ status: 'waiting', challengeUrl: 'B' }),
        () => ({ status: 'waiting', challengeUrl: 'B' })
      ]
    })
    await startQRLogin(t.deps)
    expect(await pollQRLogin(t.deps)).toEqual({ status: 'waiting' })
    expect(await pollQRLogin(t.deps)).toEqual({
      status: 'waiting',
      challengeUrl: 'B'
    })
    expect(await pollQRLogin(t.deps)).toEqual({ status: 'waiting' })
  })

  it('pollQRLogin done stores the token before the persona logon and finishes sign-in', async () => {
    const t = build({
      steamcm_signin_qr_start: () => ({ flowId: 'f1', challengeUrl: 'A' }),
      steamcm_signin_status: () => DONE
    })
    await startQRLogin(t.deps)
    expect(await pollQRLogin(t.deps)).toEqual({ status: 'done' })
    await jest.advanceTimersByTimeAsync(0)
    expect(await pollQRLogin(t.deps)).toEqual({
      status: 'done',
      username: 'Persona'
    })
    expect(t.order.indexOf('setToken')).toBeLessThan(t.order.indexOf('acquire'))
    expect(t.configStore.set).toHaveBeenCalledWith('isLoggedIn', true)
    expect(t.configStore.delete).toHaveBeenCalledWith('credentialsMissing')
    expect(t.noteSignInSucceeded).toHaveBeenCalledWith('steam')
    // a second poll does not store the token again
    await pollQRLogin(t.deps)
    expect(t.setToken).toHaveBeenCalledTimes(1)
  })

  it('an overlapping poll that reads unknownFlow after done waits for the sign-in instead of failing it', async () => {
    // UAT 79-A item 5: poll A read done and began finalising; Rust dropped the flow, so poll B's
    // read came back unknownFlow and failed a sign-in that had just succeeded.
    const t = build({
      steamcm_signin_qr_start: () => ({ flowId: 'f1', challengeUrl: 'A' }),
      steamcm_signin_status: [
        () => DONE,
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ status: 'error', reason: 'unknownFlow' }),
              10
            )
          )
      ]
    })
    await startQRLogin(t.deps)
    const a = pollQRLogin(t.deps)
    const b = pollQRLogin(t.deps)
    await jest.advanceTimersByTimeAsync(20)
    expect(await a).toEqual({ status: 'done' })
    expect((await b).status).toBe('done')
    expect(await pollQRLogin(t.deps)).toEqual({
      status: 'done',
      username: 'Persona'
    })
    expect(t.setToken).toHaveBeenCalledTimes(1)
    expect(loggedText()).not.toContain('unknownFlow')
  })

  it('pollQRLogin error maps to error', async () => {
    const t = build({
      steamcm_signin_qr_start: () => ({ flowId: 'f1', challengeUrl: 'A' }),
      steamcm_signin_status: () => ({
        status: 'error',
        reason: 'x',
        eresult: 3
      })
    })
    await startQRLogin(t.deps)
    expect(await pollQRLogin(t.deps)).toEqual({ status: 'error' })
  })

  it('startCredentialLogin returns guard_required for guardRequired', async () => {
    const t = build({
      steamcm_signin_credentials_start: () => ({
        ok: true,
        flowId: 'c1',
        status: 'guardRequired',
        guardType: 'deviceCode'
      })
    })
    expect(await startCredentialLogin(t.deps, 'acct', SECRET_PASSWORD)).toEqual(
      { status: 'guard_required' }
    )
  })

  it('startCredentialLogin waiting polls every second on unref timers until done', async () => {
    const unref = jest.spyOn(global, 'setTimeout')
    const t = build({
      steamcm_signin_credentials_start: () => ({
        ok: true,
        flowId: 'c1',
        status: 'waiting'
      }),
      steamcm_signin_status: [
        () => ({ status: 'waiting' }),
        () => ({ status: 'waiting' }),
        () => DONE
      ]
    })
    const p = startCredentialLogin(t.deps, 'acct', SECRET_PASSWORD)
    await jest.advanceTimersByTimeAsync(3000)
    expect(await p).toEqual({ status: 'done', username: 'Persona' } as never)
    expect(unref).toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  })

  it('startCredentialLogin immediate eresult error logs the number only', async () => {
    const t = build({
      steamcm_signin_credentials_start: () => ({
        status: 'error',
        reason: 'eresult',
        eresult: 5
      })
    })
    expect(await startCredentialLogin(t.deps, 'acct', SECRET_PASSWORD)).toEqual(
      { status: 'error' }
    )
    expect(loggedText()).toContain('EResult=5')
  })

  it('submitSteamGuardCode normalises, submits and waits for done', async () => {
    const t = build({
      steamcm_signin_credentials_start: () => ({
        flowId: 'c1',
        status: 'guardRequired'
      }),
      steamcm_signin_guard_submit: () => ({ ok: true }),
      steamcm_signin_status: [() => ({ status: 'waiting' }), () => DONE]
    })
    await startCredentialLogin(t.deps, 'acct', SECRET_PASSWORD)
    const p = submitSteamGuardCode(t.deps, ' kqm4f ')
    await jest.advanceTimersByTimeAsync(2000)
    expect(await p).toEqual({ status: 'done', username: 'Persona' } as never)
    expect(t.requestRustInvoke).toHaveBeenCalledWith(
      'steamcm_signin_guard_submit',
      [{ flowId: 'c1', code: SECRET_CODE }]
    )
  })

  it('a wrong guard code (eresult 65) errors and a second submit can succeed', async () => {
    const t = build({
      steamcm_signin_credentials_start: () => ({
        flowId: 'c1',
        status: 'guardRequired'
      }),
      steamcm_signin_guard_submit: [
        () => ({ ok: false, kind: 'eresult', eresult: 65 }),
        () => ({ ok: true })
      ],
      steamcm_signin_status: () => DONE
    })
    await startCredentialLogin(t.deps, 'acct', SECRET_PASSWORD)
    expect(await submitSteamGuardCode(t.deps, 'WRONG')).toEqual({
      status: 'error',
      reason: 'wrongCode'
    })
    const p = submitSteamGuardCode(t.deps, 'RIGHT')
    await jest.advanceTimersByTimeAsync(1000)
    expect(await p).toEqual({ status: 'done', username: 'Persona' } as never)
  })

  describe('a guard failure says whether the flow is still alive (C2/WR-02)', () => {
    async function submitAfterGuardStart(
      handlers: Record<string, Handler | Handler[]>
    ) {
      const t = build({
        steamcm_signin_credentials_start: () => ({
          flowId: 'c1',
          status: 'guardRequired'
        }),
        ...handlers
      })
      await startCredentialLogin(t.deps, 'acct', SECRET_PASSWORD)
      const p = submitSteamGuardCode(t.deps, SECRET_CODE)
      await jest.advanceTimersByTimeAsync(2000)
      return await p
    }

    it('an authenticator mismatch (eresult 88) is a wrong code', async () => {
      expect(
        await submitAfterGuardStart({
          steamcm_signin_guard_submit: () => ({
            ok: false,
            kind: 'eresult',
            eresult: 88
          })
        })
      ).toEqual({ status: 'error', reason: 'wrongCode' })
    })

    it('a flow Rust no longer knows is expired', async () => {
      expect(
        await submitAfterGuardStart({
          steamcm_signin_guard_submit: () => ({
            ok: false,
            kind: 'unknownFlow'
          })
        })
      ).toEqual({ status: 'error', reason: 'expired' })
    })

    it('a network failure on the submit is retryable, not a wrong code', async () => {
      expect(
        await submitAfterGuardStart({
          steamcm_signin_guard_submit: () => ({ ok: false, kind: 'network' })
        })
      ).toEqual({ status: 'error', reason: 'failed' })
    })

    it('a rejected rustInvoke is retryable', async () => {
      expect(
        await submitAfterGuardStart({
          steamcm_signin_guard_submit: () => {
            throw new Error('shell gone')
          }
        })
      ).toEqual({ status: 'error', reason: 'failed' })
    })

    it('a flow that ends in error while settling is expired', async () => {
      expect(
        await submitAfterGuardStart({
          steamcm_signin_guard_submit: () => ({ ok: true }),
          steamcm_signin_status: () => ({ status: 'error', kind: 'timeout' })
        })
      ).toEqual({ status: 'error', reason: 'expired' })
    })

    it('no active session is expired', async () => {
      const t = build({})
      expect(await submitSteamGuardCode(t.deps, SECRET_CODE)).toEqual({
        status: 'error',
        reason: 'expired'
      })
    })
  })

  it('pollCredentialLogin sees an out-of-band approval', async () => {
    const t = build({
      steamcm_signin_credentials_start: () => ({
        flowId: 'c1',
        status: 'guardRequired'
      }),
      steamcm_signin_status: [() => ({ status: 'guardRequired' }), () => DONE]
    })
    await startCredentialLogin(t.deps, 'acct', SECRET_PASSWORD)
    expect(await pollCredentialLogin(t.deps)).toEqual({ status: 'waiting' })
    expect(await pollCredentialLogin(t.deps)).toEqual({ status: 'done' })
    await jest.advanceTimersByTimeAsync(0)
    expect(await pollCredentialLogin(t.deps)).toEqual({
      status: 'done',
      username: 'Persona'
    })
  })

  it('persona unsupported falls back to the account name', async () => {
    const t = build({
      steamcm_signin_qr_start: () => ({ flowId: 'f1', challengeUrl: 'A' }),
      steamcm_signin_status: () => DONE
    })
    t.client.getPersonas.mockRejectedValue(new Error('unsupported'))
    await startQRLogin(t.deps)
    await pollQRLogin(t.deps)
    await jest.advanceTimersByTimeAsync(0)
    expect(await pollQRLogin(t.deps)).toEqual({
      status: 'done',
      username: 'acct'
    })
    expect(t.configStore.set).toHaveBeenCalledWith('userData', {
      username: 'acct',
      steamId: '76561190000000001'
    })
  })

  it('never logs the password, code or token', async () => {
    const t = build({
      steamcm_signin_credentials_start: () => ({
        flowId: 'c1',
        status: 'guardRequired'
      }),
      steamcm_signin_guard_submit: () => ({
        ok: false,
        kind: 'eresult',
        eresult: 65
      })
    })
    await startCredentialLogin(t.deps, 'acct', SECRET_PASSWORD)
    await submitSteamGuardCode(t.deps, SECRET_CODE)
    const t2 = build({
      steamcm_signin_qr_start: () => ({ flowId: 'f1', challengeUrl: 'A' }),
      steamcm_signin_status: () => DONE
    })
    await startQRLogin(t2.deps)
    await pollQRLogin(t2.deps)
    const text = loggedText()
    expect(text).not.toContain(SECRET_PASSWORD)
    expect(text).not.toContain(SECRET_CODE)
    expect(text).not.toContain(SECRET_TOKEN)
  })

  describe('a sign-out during finalisation (C1/WR-02)', () => {
    function deferred() {
      let resolve: () => void = () => undefined
      const promise = new Promise<void>((r) => {
        resolve = r
      })
      return { promise, resolve }
    }
    const qrDone = () =>
      build({
        steamcm_signin_qr_start: () => ({ flowId: 'f1', challengeUrl: 'A' }),
        steamcm_signin_status: () => DONE
      })
    const userDataWrites = (t: ReturnType<typeof build>) =>
      t.configStore.set.mock.calls.filter((c) => c[0] === 'userData')

    it('a sign-out while the token is being stored clears it and never marks the account signed in', async () => {
      const t = qrDone()
      const tokenWrite = deferred()
      t.setToken.mockImplementation(() => tokenWrite.promise)
      await startQRLogin(t.deps)
      const poll = pollQRLogin(t.deps)
      await jest.advanceTimersByTimeAsync(0)
      // logout(): the sign-in reset runs synchronously before its own awaits.
      t.deps.steamSession.signIn.resetSignInState()
      tokenWrite.resolve()
      await jest.advanceTimersByTimeAsync(0)
      await poll

      expect(t.clearToken).toHaveBeenCalledTimes(1)
      expect(t.order.indexOf('clearToken')).toBeGreaterThan(
        t.order.indexOf('setToken')
      )
      expect(t.configStore.set).not.toHaveBeenCalledWith('isLoggedIn', true)
      expect(t.noteSignInSucceeded).not.toHaveBeenCalled()
      expect(t.acquireAuthenticatedWithToken).not.toHaveBeenCalled()
      expect(userDataWrites(t)).toEqual([])
    })

    it('a sign-out during the persona logon skips the userData write', async () => {
      const t = qrDone()
      const logon = deferred()
      t.acquireAuthenticatedWithToken.mockImplementation(async () => {
        await logon.promise
        return { ok: true, client: t.client, release: jest.fn() }
      })
      await startQRLogin(t.deps)
      const poll = pollQRLogin(t.deps)
      await jest.advanceTimersByTimeAsync(0)
      expect(t.acquireAuthenticatedWithToken).toHaveBeenCalled()
      t.deps.steamSession.signIn.resetSignInState()
      logon.resolve()
      await jest.advanceTimersByTimeAsync(0)
      await poll

      expect(userDataWrites(t)).toEqual([])
    })

    it('a newer sign-in attempt after the commit still records the signed-in account', async () => {
      const t = qrDone()
      const logon = deferred()
      t.acquireAuthenticatedWithToken.mockImplementation(async () => {
        await logon.promise
        return { ok: true, client: t.client, release: jest.fn() }
      })
      await startQRLogin(t.deps)
      const poll = pollQRLogin(t.deps)
      await jest.advanceTimersByTimeAsync(0)
      // The window's own QR restart drops the slot without signing out.
      t.deps.steamSession.signIn.setSession(null)
      logon.resolve()
      await jest.advanceTimersByTimeAsync(0)
      await poll

      expect(t.clearToken).not.toHaveBeenCalled()
      expect(userDataWrites(t)).toEqual([
        ['userData', { username: 'Persona', steamId: '76561190000000001' }]
      ])
    })
  })

  describe('a failed status read (C1/WR-03)', () => {
    const reject = () => Promise.reject(new Error('rustInvoke timed out'))

    it('pollQRLogin reads one failure as waiting and finishes when the next read is done', async () => {
      const t = build({
        steamcm_signin_qr_start: () => ({ flowId: 'f1', challengeUrl: 'A' }),
        steamcm_signin_status: [reject, () => DONE],
        steamcm_signin_cancel: () => ({ ok: true })
      })
      await startQRLogin(t.deps)
      expect(await pollQRLogin(t.deps)).toEqual({ status: 'waiting' })
      expect(t.deps.steamSession.signIn.getQrSessionState().status).toBe(
        'waiting'
      )
      await pollQRLogin(t.deps)
      await jest.advanceTimersByTimeAsync(0)
      expect(t.setToken).toHaveBeenCalledWith(SECRET_TOKEN)
      expect(t.requestRustInvoke).not.toHaveBeenCalledWith(
        'steamcm_signin_cancel',
        expect.anything()
      )
    })

    it('a success resets the count, so only consecutive failures give up', async () => {
      const t = build({
        steamcm_signin_qr_start: () => ({ flowId: 'f1', challengeUrl: 'A' }),
        steamcm_signin_status: [
          reject,
          reject,
          () => ({ status: 'waiting' }),
          reject,
          reject,
          () => ({ status: 'waiting' })
        ]
      })
      await startQRLogin(t.deps)
      for (let i = 0; i < 6; i++) {
        expect(await pollQRLogin(t.deps)).toEqual({ status: 'waiting' })
      }
    })

    it('pollCredentialLogin gives up after three failures in a row and cancels the Rust flow', async () => {
      const t = build({
        steamcm_signin_credentials_start: () => ({
          flowId: 'c1',
          status: 'guardRequired'
        }),
        steamcm_signin_status: reject,
        steamcm_signin_cancel: () => ({ ok: true })
      })
      await startCredentialLogin(t.deps, 'acct', SECRET_PASSWORD)
      expect(await pollCredentialLogin(t.deps)).toEqual({ status: 'waiting' })
      expect(await pollCredentialLogin(t.deps)).toEqual({ status: 'waiting' })
      expect(await pollCredentialLogin(t.deps)).toEqual({ status: 'error' })
      expect(t.requestRustInvoke).toHaveBeenCalledWith(
        'steamcm_signin_cancel',
        [{ flowId: 'c1' }]
      )
    })

    it('the guard-submit wait rides out one failed read', async () => {
      const t = build({
        steamcm_signin_credentials_start: () => ({
          flowId: 'c1',
          status: 'guardRequired'
        }),
        steamcm_signin_guard_submit: () => ({ ok: true }),
        steamcm_signin_status: [reject, () => DONE]
      })
      await startCredentialLogin(t.deps, 'acct', SECRET_PASSWORD)
      const p = submitSteamGuardCode(t.deps, SECRET_CODE)
      await jest.advanceTimersByTimeAsync(2000)
      expect(await p).toEqual({ status: 'done', username: 'Persona' } as never)
    })
  })

  describe('polls do not block on finalisation (C1/WR-06)', () => {
    function pendingLogon(t: ReturnType<typeof build>) {
      let resolve: () => void = () => undefined
      const gate = new Promise<void>((r) => {
        resolve = r
      })
      t.acquireAuthenticatedWithToken.mockImplementation(async () => {
        await gate
        return { ok: true, client: t.client, release: jest.fn() }
      })
      return resolve
    }

    it('overlapping QR polls during the persona logon return done without a username, and one later poll carries it', async () => {
      const t = build({
        steamcm_signin_qr_start: () => ({ flowId: 'f1', challengeUrl: 'A' }),
        steamcm_signin_status: () => DONE
      })
      const release = pendingLogon(t)
      await startQRLogin(t.deps)

      // The window's 2 s interval does not wait for the previous call.
      const polls = [
        pollQRLogin(t.deps),
        pollQRLogin(t.deps),
        pollQRLogin(t.deps)
      ]
      await jest.advanceTimersByTimeAsync(0)
      // Under the old contract these were still pending here, then all resolved with the username.
      for (const p of polls) expect(await p).toEqual({ status: 'done' })
      expect(t.acquireAuthenticatedWithToken).toHaveBeenCalledTimes(1)

      release()
      await jest.advanceTimersByTimeAsync(0)
      expect(await pollQRLogin(t.deps)).toEqual({
        status: 'done',
        username: 'Persona'
      })
      expect(t.setToken).toHaveBeenCalledTimes(1)
    })

    it('a credential poll during the persona logon returns done without a username', async () => {
      const t = build({
        steamcm_signin_credentials_start: () => ({
          flowId: 'c1',
          status: 'guardRequired'
        }),
        steamcm_signin_status: () => DONE
      })
      const release = pendingLogon(t)
      await startCredentialLogin(t.deps, 'acct', SECRET_PASSWORD)

      const first = pollCredentialLogin(t.deps)
      await jest.advanceTimersByTimeAsync(0)
      expect(await first).toEqual({ status: 'done' })
      expect(await pollCredentialLogin(t.deps)).toEqual({ status: 'done' })

      release()
      await jest.advanceTimersByTimeAsync(0)
      expect(await pollCredentialLogin(t.deps)).toEqual({
        status: 'done',
        username: 'Persona'
      })
    })

    it('a failed finalisation turns the next poll into error', async () => {
      const t = build({
        steamcm_signin_qr_start: () => ({ flowId: 'f1', challengeUrl: 'A' }),
        steamcm_signin_status: () => DONE
      })
      t.setToken.mockRejectedValue(new Error('keyring locked'))
      await startQRLogin(t.deps)
      expect(await pollQRLogin(t.deps)).toEqual({ status: 'done' })
      await jest.advanceTimersByTimeAsync(0)
      expect(await pollQRLogin(t.deps)).toEqual({ status: 'error' })
    })

    it('a finalisation that settles after a newer attempt started leaves its state alone', async () => {
      const t = build({
        steamcm_signin_qr_start: [
          () => ({ flowId: 'f1', challengeUrl: 'A' }),
          () => ({ flowId: 'f2', challengeUrl: 'B' })
        ],
        steamcm_signin_status: () => DONE,
        steamcm_signin_cancel: () => ({ ok: true })
      })
      const release = pendingLogon(t)
      await startQRLogin(t.deps)
      await pollQRLogin(t.deps)
      await startQRLogin(t.deps)
      release()
      await jest.advanceTimersByTimeAsync(0)
      expect(t.deps.steamSession.signIn.getQrSessionState()).toEqual({
        status: 'waiting'
      })
    })
  })
})
