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
jest.mock('steam-session', () => ({
  LoginSession: jest.fn(),
  EAuthTokenPlatformType: { SteamClient: 1 }
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
    tokenStore: { current: () => ({ setToken }) },
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
    configStore,
    noteSignInSucceeded,
    acquireAuthenticatedWithToken,
    client
  }
}

describe('userSignIn on the rust engine', () => {
  const prev = process.env.GAMELIB_STEAMCM_SIGNIN
  beforeEach(() => {
    process.env.GAMELIB_STEAMCM_SIGNIN = 'rust'
    jest.clearAllMocks()
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
    if (prev === undefined) delete process.env.GAMELIB_STEAMCM_SIGNIN
    else process.env.GAMELIB_STEAMCM_SIGNIN = prev
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
    const r = await pollQRLogin(t.deps)
    expect(r).toEqual({ status: 'done', username: 'Persona' })
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
    expect(await a).toEqual({ status: 'done', username: 'Persona' })
    expect(await b).toEqual({ status: 'done', username: 'Persona' })
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
      status: 'error'
    })
    const p = submitSteamGuardCode(t.deps, 'RIGHT')
    await jest.advanceTimersByTimeAsync(1000)
    expect(await p).toEqual({ status: 'done', username: 'Persona' } as never)
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
})

describe('userSignIn ts engine selection', () => {
  it('the default engine does not call Rust', async () => {
    delete process.env.GAMELIB_STEAMCM_SIGNIN
    const t = build({})
    // poll on the ts engine reads the state leaf only
    expect(await pollQRLogin(t.deps)).toEqual({ status: 'waiting' })
    expect(t.requestRustInvoke).not.toHaveBeenCalled()
  })
})
