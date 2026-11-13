import 'frontend/testUtils/tauriWindow'
import gamelib from '../../../../public/locales/en/gamelib.json'
import { confirmSteamUpdate } from '../steamUpdateConfirm'
import type { SteamUpdateInfo } from 'common/types/steam'

const GB = 1024 ** 3

// Resolves gamelib:gamepage.update.* against the real catalog with {{x}} interpolation.
const t = ((key: string, opts: Record<string, string> = {}) => {
  const path = key.replace('gamelib:', '').split('.')
  let node: unknown = gamelib
  for (const p of path) node = (node as Record<string, unknown>)?.[p]
  const text = typeof node === 'string' ? node : (opts.defaultValue ?? key)
  return text.replace(/{{(\w+)}}/g, (_m, k: string) => String(opts[k]))
}) as unknown as Parameters<typeof confirmSteamUpdate>[0]['t']

type Req = {
  message?: unknown
  buttons?: Array<{ text: string; onClick?: () => void }>
  showDialog?: boolean
}

function setup(result: SteamUpdateInfo | Error) {
  const getSteamUpdateInfo = jest.fn(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
  )
  ;(window as unknown as { api: object }).api = { getSteamUpdateInfo }
  const dialogs: Req[] = []
  const showDialogModal = jest.fn((r: Req) => void dialogs.push(r))
  const onConfirm = jest.fn()
  const run = () =>
    confirmSteamUpdate({
      appName: '123',
      title: 'Game',
      showDialogModal: showDialogModal as never,
      t,
      onConfirm
    })
  const last = (): Req => dialogs[dialogs.length - 1] ?? {}
  return { getSteamUpdateInfo, dialogs, onConfirm, run, last }
}

const base: SteamUpdateInfo = {
  kind: 'bridge',
  state: 'stale',
  installedBuild: '1',
  branch: 'public'
}

describe('confirmSteamUpdate', () => {
  it('shows checking, then sizes with Update/Cancel; Update confirms once', async () => {
    const s = setup({
      ...base,
      estimate: {
        downloadBytes: 960495616,
        peakBytes: 13 * GB,
        oldManifestAvailable: true,
        isEstimate: true,
        freeBytes: 100 * GB
      }
    })
    await s.run()
    expect(s.getSteamUpdateInfo).toHaveBeenCalledWith('123', {
      computeSize: true
    })
    expect(s.dialogs[0]?.message).toBe('Checking update size…')
    const last = s.last()
    expect(String(last.message)).toContain('Download about 916 MiB')
    expect(last.buttons?.map((b) => b.text)).toEqual(['Update', 'Cancel'])
    last.buttons?.[0]?.onClick?.()
    expect(s.onConfirm).toHaveBeenCalledTimes(1)
  })

  it('shows the fallback sentence when the old manifest is gone', async () => {
    const s = setup({
      ...base,
      estimate: {
        downloadBytes: 5 * GB,
        peakBytes: 13 * GB,
        oldManifestAvailable: false,
        isEstimate: true
      }
    })
    await s.run()
    expect(String(s.last().message)).toContain(
      "can't get the previous build's file list"
    )
    expect(String(s.last().message)).toContain('download up to')
  })

  it('offers Update anyway on sizeError', async () => {
    const s = setup({ ...base, sizeError: 'boom' })
    await s.run()
    const last = s.last()
    expect(last.message).toBe('boom')
    expect(last.buttons?.map((b) => b.text)).toEqual([
      'Update anyway',
      'Cancel'
    ])
  })

  it('refuses up front when free space is below the peak', async () => {
    const s = setup({
      ...base,
      estimate: {
        downloadBytes: GB,
        peakBytes: 13 * GB,
        oldManifestAvailable: true,
        isEstimate: true,
        freeBytes: 4 * GB
      }
    })
    await s.run()
    const last = s.last()
    expect(last.message).toBe('Needs 13 GiB free, 4 GiB available.')
    expect(last.buttons).toHaveLength(1)
    expect(s.onConfirm).not.toHaveBeenCalled()
  })

  it('passes a registered game straight through', async () => {
    const s = setup({ ...base, kind: 'registered' })
    await s.run()
    expect(s.onConfirm).toHaveBeenCalledTimes(1)
    expect(s.last().showDialog).toBe(false)
  })

  it('shows an error dialog and does not confirm when the lookup rejects', async () => {
    const s = setup(new Error('offline'))
    await s.run()
    expect(s.last().message).toBe('offline')
    expect(s.onConfirm).not.toHaveBeenCalled()
  })
})
