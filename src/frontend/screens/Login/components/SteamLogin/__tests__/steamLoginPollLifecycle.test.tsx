/**
 * @jest-environment jsdom
 */
/**
 * Phase 79 review slice C2: the Steam sign-in window's poll lifecycle, driven through the real
 * component under jsdom with fake timers.
 *
 * - C2/WR-01: a credential or guard submit that resolves after the dialog closed, or after the user
 *   left the credentials step, must not start a credential poll (nothing would ever clear it).
 * - C2/WR-02: only a guard failure that leaves the flow waiting (`wrongCode`, `failed`) resumes the
 *   poll and keeps the code input; an `expired` flow, or a poll that reports `error`, sends the user
 *   back to the credentials form. This also replaces the old source gate
 *   `steamLoginGuardRetry.test.ts` (UAT 79-A item 7) with the behavioural case below.
 *
 * `Dialog` is replaced with a bare container (it pulls the settings store and the embed-suppression
 * context, neither of which this flow touches) and `react-qr-code` with a node that prints the drawn
 * challenge, so a test can read which code the user is shown.
 */
import 'frontend/testUtils/jsdomNoticeEnv'
import type { ReactNode } from 'react'

jest.mock('../index.scss', () => ({}))
jest.mock('frontend/components/UI/Dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <h1>{children}</h1>
}))
jest.mock('react-qr-code', () => ({
  __esModule: true,
  default: ({ value }: { value: string }) => <div data-testid="qr">{value}</div>
}))
const mockSteamLogin = jest.fn()
jest.mock('frontend/state/authState', () => ({
  __esModule: true,
  default: (select: (s: { steamLogin: typeof mockSteamLogin }) => unknown) =>
    select({ steamLogin: mockSteamLogin })
}))

// Imported after the mocks above.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import SteamLogin, { SIGN_IN_ENDED_MESSAGE } from '../index'

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

type Poll = { status: 'done' | 'waiting' | 'error'; username?: string }
type QrPoll = Poll & { challengeUrl?: string }

const api = {
  checkSteamInstalled: jest.fn(),
  steamStartQR: jest.fn(),
  steamPollQR: jest.fn(),
  steamPollCredential: jest.fn(),
  steamStartCredentials: jest.fn(),
  steamSubmitGuard: jest.fn(),
  getSteamUserInfo: jest.fn(),
  openExternalUrl: jest.fn()
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms)
  })
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  jest.useFakeTimers()
  Object.assign(window, { api })
  api.checkSteamInstalled.mockResolvedValue(true)
  api.steamStartQR.mockResolvedValue({ status: 'done', challengeUrl: 'qr-A' })
  api.steamPollQR.mockResolvedValue({ status: 'waiting' } as QrPoll)
  api.steamPollCredential.mockResolvedValue({ status: 'waiting' } as Poll)
  api.steamStartCredentials.mockResolvedValue({ status: 'guard_required' })
  api.getSteamUserInfo.mockResolvedValue({ username: 'gaben' })
  mockSteamLogin.mockResolvedValue('done')
})

afterEach(() => {
  cleanup()
  jest.useRealTimers()
})

async function mountOnGuardStep() {
  const view = render(<SteamLogin dismiss={() => undefined} />)
  await flush()
  fireEvent.click(screen.getByRole('tab', { name: 'Username & Password' }))
  fireEvent.change(screen.getByLabelText('Username'), {
    target: { value: 'gaben' }
  })
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'hunter2' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Sign In to Steam' }))
  await flush()
  fireEvent.change(
    screen.getByLabelText('Steam Guard code (letters or digits)'),
    {
      target: { value: 'ABCDE' }
    }
  )
  return view
}

describe('C2/WR-01: a submit that resolves after its attempt ended starts no poll', () => {
  it('a rejected guard code after the dialog closed does not leak a credential poll', async () => {
    const view = await mountOnGuardStep()
    const submit = deferred<{ status: 'done' | 'error'; reason?: string }>()
    api.steamSubmitGuard.mockReturnValueOnce(submit.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Verify Code' }))
    await flush()

    view.unmount()
    submit.resolve({ status: 'error', reason: 'wrongCode' })
    await flush()
    api.steamPollCredential.mockClear()
    await advance(10_000)

    expect(api.steamPollCredential).not.toHaveBeenCalled()
  })

  it('a rejected guard code after switching to the QR tab does not start a credential poll', async () => {
    await mountOnGuardStep()
    const submit = deferred<{ status: 'done' | 'error'; reason?: string }>()
    api.steamSubmitGuard.mockReturnValueOnce(submit.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Verify Code' }))
    await flush()

    fireEvent.click(screen.getByRole('tab', { name: 'QR Code' }))
    submit.resolve({ status: 'error', reason: 'wrongCode' })
    await flush()
    api.steamPollCredential.mockClear()
    await advance(10_000)

    expect(api.steamPollCredential).not.toHaveBeenCalled()
  })

  it('a guard_required start after the dialog closed does not start a credential poll', async () => {
    render(<SteamLogin dismiss={() => undefined} />)
    await flush()
    fireEvent.click(screen.getByRole('tab', { name: 'Username & Password' }))
    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'gaben' }
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'hunter2' }
    })
    const start = deferred<{ status: 'guard_required' }>()
    api.steamStartCredentials.mockReturnValueOnce(start.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Sign In to Steam' }))
    await flush()

    cleanup()
    start.resolve({ status: 'guard_required' })
    await flush()
    await advance(10_000)

    expect(api.steamPollCredential).not.toHaveBeenCalled()
  })

  it('a rejected guard code while the dialog stays open still resumes the poll (UAT 79-A item 7)', async () => {
    await mountOnGuardStep()
    api.steamSubmitGuard.mockResolvedValueOnce({
      status: 'error',
      reason: 'wrongCode'
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verify Code' }))
    await flush()
    api.steamPollCredential.mockClear()
    await advance(2_000)

    expect(api.steamPollCredential).toHaveBeenCalledTimes(1)
  })

  it('overlapping credential ticks that both see the username sign in once', async () => {
    await mountOnGuardStep()
    const first = deferred<Poll>()
    const second = deferred<Poll>()
    api.steamPollCredential
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    await advance(4_000)
    expect(api.steamPollCredential).toHaveBeenCalledTimes(2)

    first.resolve({ status: 'done', username: 'gaben' })
    second.resolve({ status: 'done', username: 'gaben' })
    await flush()
    await flush()

    expect(mockSteamLogin).toHaveBeenCalledTimes(1)
  })
})

describe('C2/WR-02: a guard failure retries only while the flow is alive', () => {
  async function submitWith(result: { status: 'error'; reason: string }) {
    await mountOnGuardStep()
    api.steamSubmitGuard.mockResolvedValueOnce(result)
    fireEvent.click(screen.getByRole('button', { name: 'Verify Code' }))
    await flush()
    api.steamPollCredential.mockClear()
  }

  it('a wrong code keeps the code input, says so and resumes the poll', async () => {
    await submitWith({ status: 'error', reason: 'wrongCode' })
    expect(screen.getByRole('alert').textContent).toMatch(/Incorrect code/)
    expect(
      screen.getByLabelText('Steam Guard code (letters or digits)')
    ).toBeTruthy()
    await advance(2_000)
    expect(api.steamPollCredential).toHaveBeenCalledTimes(1)
  })

  it('a failed submit keeps the code input without calling the code wrong', async () => {
    await submitWith({ status: 'error', reason: 'failed' })
    expect(screen.getByRole('alert').textContent).not.toMatch(/Incorrect code/)
    expect(
      screen.getByLabelText('Steam Guard code (letters or digits)')
    ).toBeTruthy()
    await advance(2_000)
    expect(api.steamPollCredential).toHaveBeenCalledTimes(1)
  })

  it('an expired flow returns to the credentials form and stops polling', async () => {
    await submitWith({ status: 'error', reason: 'expired' })
    expect(screen.getByRole('alert').textContent).toBe(SIGN_IN_ENDED_MESSAGE)
    expect(
      screen.queryByLabelText('Steam Guard code (letters or digits)')
    ).toBeNull()
    expect(screen.getByLabelText('Username')).toBeTruthy()
    await advance(10_000)
    expect(api.steamPollCredential).not.toHaveBeenCalled()
  })

  it('a poll that reports error returns to the credentials form', async () => {
    await mountOnGuardStep()
    api.steamPollCredential.mockResolvedValueOnce({ status: 'error' })
    await advance(2_000)
    expect(screen.getByRole('alert').textContent).toBe(SIGN_IN_ENDED_MESSAGE)
    expect(
      screen.queryByLabelText('Steam Guard code (letters or digits)')
    ).toBeNull()
    api.steamPollCredential.mockClear()
    await advance(10_000)
    expect(api.steamPollCredential).not.toHaveBeenCalled()
  })
})
