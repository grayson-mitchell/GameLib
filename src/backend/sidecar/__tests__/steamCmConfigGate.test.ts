/**
 * Phase 79 review C2/WR-04: a failed or slow boot `steamcm_configure` must not disable every
 * signed-in Steam op for the whole app session. Session-dependent steamcm ops wait for configure,
 * and a failed configure is retried by the next one.
 */
import {
  createSteamCmConfigGate,
  needsSteamCmConfigure
} from '../steamCmConfigGate'
import type { RequestRustInvoke } from 'backend/host'
import { bootFresh } from './helpers/sidecarHarness'

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

function build(attempts: Array<Promise<boolean> | boolean>) {
  const order: string[] = []
  const configure = jest.fn(() => {
    order.push('configure')
    const next = attempts.length > 1 ? attempts.shift() : attempts[0]
    return Promise.resolve(next ?? true)
  })
  const invoke = jest.fn((channel: string) => {
    order.push(channel)
    return Promise.resolve({ ok: true })
  })
  const gate = createSteamCmConfigGate({
    configure,
    requestRustInvoke: invoke as unknown as RequestRustInvoke
  })
  const send = (channel: string) =>
    (gate.requestRustInvoke as unknown as (c: string, a: unknown[]) => unknown)(
      channel,
      []
    )
  return { gate, configure, invoke, order, send }
}

describe('steamcm configure gate (C2/WR-04)', () => {
  it('a session op sent before configure answered waits for it', async () => {
    const answer = deferred<boolean>()
    const t = build([answer.promise])
    void t.gate.ensure()
    const op = t.send('steamcm_session_acquire')
    await tick()
    expect(t.invoke).not.toHaveBeenCalled()
    answer.resolve(true)
    await op
    expect(t.order).toEqual(['configure', 'steamcm_session_acquire'])
    expect(t.configure).toHaveBeenCalledTimes(1)
  })

  it('a failed configure is retried by the next session op, not left failed for the boot', async () => {
    const t = build([false, true])
    expect(await t.gate.ensure()).toBe(false)
    await t.send('steamcm_depot_key')
    expect(t.order).toEqual(['configure', 'configure', 'steamcm_depot_key'])
    expect(await t.gate.ensure()).toBe(true)
  })

  it('the owed go-online restore after a failed boot configure retries it first', async () => {
    const t = build([false, true])
    await t.gate.ensure()
    await t.send('steamcm_wrap_restore_if_owed')
    expect(t.order).toEqual([
      'configure',
      'configure',
      'steamcm_wrap_restore_if_owed'
    ])
  })

  it('concurrent callers share one attempt, and a success is not repeated', async () => {
    const answer = deferred<boolean>()
    const t = build([answer.promise, true])
    const a = t.send('steamcm_refresh')
    const b = t.send('steamcm_licenses')
    answer.resolve(true)
    await Promise.all([a, b])
    await t.send('steamcm_personas')
    expect(t.configure).toHaveBeenCalledTimes(1)
  })

  it('a configure that rejects despite its contract reads as a failed attempt', async () => {
    const t = build([true])
    t.configure.mockImplementationOnce(() => Promise.reject(new Error('x')))
    expect(await t.gate.ensure()).toBe(false)
    expect(await t.gate.ensure()).toBe(true)
  })

  it('a session op is still sent when the retry fails too, so Rust answers it', async () => {
    const t = build([false])
    await t.send('steamcm_session_acquire')
    expect(t.order).toEqual(['configure', 'steamcm_session_acquire'])
  })

  it('sign-in, store, anonymous and non-steamcm channels never wait for configure', async () => {
    const never = new Promise<boolean>(() => undefined)
    const t = build([never])
    void t.gate.ensure()
    for (const channel of [
      'steamcm_signin_qr_start',
      'steamcm_signin_status',
      'steamcm_store_enrich',
      'steamcm_anon_product_info',
      'steamcm_configure',
      'keyring_get'
    ]) {
      await t.send(channel)
    }
    expect(t.invoke).toHaveBeenCalledTimes(6)
  })

  it('classifies the session-dependent channels', () => {
    expect(needsSteamCmConfigure('steamcm_session_acquire')).toBe(true)
    expect(needsSteamCmConfigure('steamcm_wrap_restore_if_owed')).toBe(true)
    expect(needsSteamCmConfigure('steamcm_manifest_request_code')).toBe(true)
    expect(needsSteamCmConfigure('steamcm_configure')).toBe(false)
    expect(needsSteamCmConfigure('steamcm_signin_guard_submit')).toBe(false)
    expect(needsSteamCmConfigure('steampoll_status')).toBe(false)
  })
})

describe('the boot wires the gate into the host transport (C2/WR-04)', () => {
  const flushTurns = async () => {
    for (let i = 0; i < 5; i++) await tick()
  }

  it('a boot whose configure failed retries it before the next session op', async () => {
    const { input, frames, services } = bootFresh({
      answerSteamCmConfigure: false
    })
    const answer = (channel: string, reply: Record<string, unknown>) => {
      for (const f of frames) {
        if (f.kind === 'rustInvoke' && f.channel === channel && !f.answered) {
          f.answered = true
          input.write(`${JSON.stringify({ id: f.id, ...reply })}\n`)
        }
      }
    }
    const sent = () =>
      frames
        .filter(
          (f) =>
            f.kind === 'rustInvoke' &&
            typeof f.channel === 'string' &&
            f.channel.startsWith('steamcm_')
        )
        .map((f) => f.channel)

    await flushTurns()
    expect(sent()).toEqual(['steamcm_configure'])
    answer('steamcm_configure', {
      ok: false,
      error: 'steamcm:wrap-host-missing'
    })
    await flushTurns()
    // The boot restore after the failed attempt retries configure first.
    expect(sent()).toEqual(['steamcm_configure', 'steamcm_configure'])
    answer('steamcm_configure', { ok: true, result: {} })
    await flushTurns()
    expect(sent()).toEqual([
      'steamcm_configure',
      'steamcm_configure',
      'steamcm_wrap_restore_if_owed'
    ])
    answer('steamcm_wrap_restore_if_owed', {
      ok: true,
      result: { outcome: 'notOwed' }
    })

    const status = services.host.requestRustInvoke('steamcm_session_status', [])
    await flushTurns()
    // Configured now: a later op goes straight out, with no further configure.
    expect(sent()).toEqual([
      'steamcm_configure',
      'steamcm_configure',
      'steamcm_wrap_restore_if_owed',
      'steamcm_session_status'
    ])
    answer('steamcm_session_status', { ok: true, result: {} })
    await status
  })
})
