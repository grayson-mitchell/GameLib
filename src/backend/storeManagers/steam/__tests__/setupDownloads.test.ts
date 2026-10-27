import { downloadFile } from 'backend/utils'
import { sendFrontendMessage } from '../../../ipc'
import { downloadSetupPayload } from '../setupDownloads'

jest.mock('backend/utils', () => ({
  downloadFile: jest.fn()
}))

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

jest.mock('../../../ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

const mockedDownload = jest.mocked(downloadFile)
const mockedSend = jest.mocked(sendFrontendMessage)

const URL_ = 'https://cdn.example/SteamSetup.exe'
const DEST = '/home/someone/secret/SteamSetup.exe'

const emitted = () =>
  mockedSend.mock.calls
    .filter((c) => c[0] === 'steamSetupDownloadProgress')
    .map((c) => c[1])

describe('downloadSetupPayload', () => {
  it('emits running 0, per-progress running, then done once', async () => {
    mockedDownload.mockImplementation(async ({ progressCallback }) => {
      progressCallback?.(500, 10, 25, 10)
      progressCallback?.(1000, 10, 50.4, 10)
    })
    await downloadSetupPayload('steam-client', { url: URL_, dest: DEST })
    expect(emitted()).toEqual([
      { kind: 'steam-client', state: 'running', bytes: 0, percent: 0 },
      { kind: 'steam-client', state: 'running', bytes: 500, percent: 25 },
      { kind: 'steam-client', state: 'running', bytes: 1000, percent: 50 },
      { kind: 'steam-client', state: 'done', bytes: 1000, percent: 100 }
    ])
    expect(mockedDownload).toHaveBeenCalledWith(
      expect.objectContaining({ url: URL_, dest: DEST })
    )
  })

  it('clamps percent to 0..100', async () => {
    mockedDownload.mockImplementation(async ({ progressCallback }) => {
      progressCallback?.(1, 1, 140, 1)
      progressCallback?.(2, 1, -5, 1)
    })
    await downloadSetupPayload('steam-bottle', { url: URL_, dest: DEST })
    const pcts = (emitted() as { percent: number }[]).map((e) => e.percent)
    expect(pcts).toEqual([0, 100, 0, 100])
  })

  it('emits error once and rethrows the same error', async () => {
    const boom = new Error('network down')
    mockedDownload.mockRejectedValue(boom)
    await expect(
      downloadSetupPayload('steam-bottle', { url: URL_, dest: DEST })
    ).rejects.toBe(boom)
    const states = (emitted() as { state: string }[]).map((e) => e.state)
    expect(states).toEqual(['running', 'error'])
  })

  it('never emits the url or dest', async () => {
    mockedDownload.mockImplementation(async ({ progressCallback }) => {
      progressCallback?.(5, 1, 5, 1)
    })
    await downloadSetupPayload('steam-client', { url: URL_, dest: DEST })
    const blob = JSON.stringify(mockedSend.mock.calls)
    expect(blob).not.toContain('cdn.example')
    expect(blob).not.toContain('secret')
  })
})
