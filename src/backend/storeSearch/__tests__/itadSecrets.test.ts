import { logWarning } from 'backend/logger'
import { createItadSecrets, type ItadKeyStore } from '../itadSecrets'

jest.mock('backend/logger')

function memoryStore(): ItadKeyStore & {
  set: jest.Mock
  cleared: jest.Mock
} {
  let held: string | undefined
  const set = jest.fn(async (value: string) => {
    held = value
  })
  const cleared = jest.fn(async () => {
    held = undefined
  })
  return {
    getApiKey: async () => held,
    setApiKey: set,
    clearApiKey: cleared,
    set,
    cleared
  }
}

function failingStore(): ItadKeyStore {
  const boom = async (): Promise<never> => {
    throw new Error('keyring unavailable')
  }
  return { getApiKey: boom, setApiKey: boom, clearApiKey: boom }
}

describe('createItadSecrets', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('has no key initially', async () => {
    const secrets = createItadSecrets({ store: memoryStore() })
    await expect(secrets.getApiKey()).resolves.toBeUndefined()
  })

  it('trims on set and reads the trimmed value back', async () => {
    const store = memoryStore()
    const secrets = createItadSecrets({ store })
    await secrets.setApiKey('  k1  ')
    expect(store.set).toHaveBeenCalledWith('k1')
    await expect(secrets.getApiKey()).resolves.toBe('k1')
  })

  it('clears on an empty or whitespace-only value', async () => {
    const store = memoryStore()
    const secrets = createItadSecrets({ store })
    await secrets.setApiKey('k1')
    await secrets.setApiKey('')
    await expect(secrets.getApiKey()).resolves.toBeUndefined()
    await secrets.setApiKey('k1')
    await secrets.setApiKey('   ')
    await expect(secrets.getApiKey()).resolves.toBeUndefined()
    expect(store.cleared).toHaveBeenCalledTimes(2)
  })

  it('tracks a session-only rejected flag that saving or clearing resets', async () => {
    const secrets = createItadSecrets({ store: memoryStore() })
    expect(secrets.isRejected()).toBe(false)
    secrets.markRejected()
    expect(secrets.isRejected()).toBe(true)
    await secrets.setApiKey('k2')
    expect(secrets.isRejected()).toBe(false)
    secrets.markRejected()
    await secrets.setApiKey('')
    expect(secrets.isRejected()).toBe(false)
  })

  it('keeps the rejected flag per instance, not module-wide', () => {
    const a = createItadSecrets({ store: memoryStore() })
    const b = createItadSecrets({ store: memoryStore() })
    a.markRejected()
    expect(b.isRejected()).toBe(false)
  })

  it('is total when the store fails and never logs the value', async () => {
    const secrets = createItadSecrets({ store: failingStore() })
    await expect(secrets.getApiKey()).resolves.toBeUndefined()
    await expect(
      secrets.setApiKey('super-secret-value')
    ).resolves.toBeUndefined()
    await expect(secrets.setApiKey('')).resolves.toBeUndefined()

    const warnings = (logWarning as jest.Mock).mock.calls.map((c) =>
      String(c[0])
    )
    expect(warnings).toHaveLength(3)
    expect(warnings[0]).toContain('[itad-secrets] get failed')
    expect(warnings[1]).toContain('[itad-secrets] set failed')
    expect(warnings[2]).toContain('[itad-secrets] clear failed')
    for (const line of warnings) {
      expect(line).not.toContain('super-secret-value')
    }
  })
})
