import { safeStorage } from 'electron'
import { existsSync } from 'graceful-fs'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { configStore } from './electronStores'
import { STEAM_INSTALL_PATHS, TOKEN_PREFIX, TOKEN_STORE_KEY } from './constants'
import { platform } from 'process'
import type { SteamUserData } from 'common/types/steam'
import { LoginSession, EAuthTokenPlatformType } from 'steam-session'
import SteamUserLib from 'steam-user'

// ── Encryption helpers ────────────────────────────────────────────────────────

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function encryptToken(plain: string): string {
  if (!plain) return ''
  if (!encryptionAvailable()) {
    logWarning(
      'safeStorage unavailable — storing Steam refresh token in plaintext',
      LogPrefix.Steam
    )
    return plain
  }
  const ciphertext = safeStorage.encryptString(plain).toString('base64')
  return `${TOKEN_PREFIX}${ciphertext}`
}

function decryptToken(stored: string): string {
  if (!stored) return ''
  if (!stored.startsWith(TOKEN_PREFIX)) {
    // Legacy plaintext fallback
    return stored
  }
  if (!encryptionAvailable()) return ''
  try {
    const buf = Buffer.from(stored.slice(TOKEN_PREFIX.length), 'base64')
    return safeStorage.decryptString(buf)
  } catch (err) {
    logWarning(['Failed to decrypt Steam refresh token:', err], LogPrefix.Steam)
    return ''
  }
}

// ── SteamUser static class ────────────────────────────────────────────────────

export class SteamUser {
  private static client: InstanceType<typeof SteamUserLib> | null = null
  private static session: InstanceType<typeof LoginSession> | null = null
  private static connectingPromise: Promise<string> | null = null
  private static qrSessionState: {
    status: 'waiting' | 'done' | 'error'
    username?: string
  } = { status: 'waiting' }

  // ── AUTH-05: Steam client detection ────────────────────────────────────────

  static isSteamClientInstalled(): boolean {
    const paths = STEAM_INSTALL_PATHS[platform] ?? []
    return paths.some((p) => existsSync(p))
  }

  // ── AUTH-03: Login state ───────────────────────────────────────────────────

  static isLoggedIn(): boolean {
    return Boolean(configStore.get_nodefault('isLoggedIn'))
  }

  // ── LIB-01: Authenticated client accessor ─────────────────────────────────

  static getClient(): InstanceType<typeof SteamUserLib> | null {
    return this.client
  }

  // ── LIB-01: Reconnect on startup ───────────────────────────────────────────

  /**
   * Ensure a live, authenticated steam-user client exists. The client is an
   * in-memory connection that does not survive an app restart, so on startup we
   * re-log-on using the persisted refresh token. Returns true only when the CM
   * connection is established (client.steamID populated). Concurrent callers
   * share a single in-flight connection attempt.
   */
  static async ensureConnected(): Promise<boolean> {
    if (this.client?.steamID) return true
    if (!this.isLoggedIn()) return false

    const creds = await this.getCredentials()
    if (!creds) {
      logWarning(
        'Steam: logged in but no stored refresh token — cannot reconnect',
        LogPrefix.Steam
      )
      return false
    }

    if (!this.connectingPromise) {
      this.connectingPromise = this.connectSteamUserClient(
        creds.refreshToken
      ).finally(() => {
        this.connectingPromise = null
      })
    }
    await this.connectingPromise

    return Boolean(this.client?.steamID)
  }

  // ── AUTH-04: Logout ────────────────────────────────────────────────────────

  static logout(): void {
    if (this.client) {
      try {
        this.client.logOff()
      } catch (err) {
        logWarning(['Steam client logOff error during logout:', err], LogPrefix.Steam)
      }
      this.client = null
    }
    this.session = null
    this.qrSessionState = { status: 'waiting' }
    configStore.clear()
    logInfo('Logging user out from Steam', LogPrefix.Steam)
  }

  // ── User details ───────────────────────────────────────────────────────────

  static async getUserDetails(): Promise<SteamUserData | undefined> {
    const userData = configStore.get_nodefault('userData')
    return userData as SteamUserData | undefined
  }

  // ── Credentials ────────────────────────────────────────────────────────────

  static async getCredentials(): Promise<{ refreshToken: string } | undefined> {
    const stored = configStore.get_nodefault(TOKEN_STORE_KEY)
    if (!stored || typeof stored !== 'string') return undefined

    const token = decryptToken(stored)
    if (!token) return undefined
    return { refreshToken: token }
  }

  // ── Shared auth success path ───────────────────────────────────────────────

  private static async finishAuth(refreshToken: string): Promise<string> {
    // Store credentials immediately — don't block on the steam-user CM connection.
    const encrypted = encryptToken(refreshToken)
    configStore.set(TOKEN_STORE_KEY, encrypted)
    configStore.set('isLoggedIn', true)

    // Connect steam-user to get the persona name. If this fails the user is still
    // logged in (credentials already stored above), so we fall back to a placeholder.
    const personaName = await this.connectSteamUserClient(refreshToken)
    configStore.set('userData', {
      username: personaName,
      steamId: this.client?.steamID?.getSteamID64() ?? ''
    })

    logInfo(`Steam auth complete — logged in as ${personaName}`, LogPrefix.Steam)
    return personaName
  }

  private static connectSteamUserClient(refreshToken: string): Promise<string> {
    if (this.client) {
      try {
        this.client.logOff()
      } catch {
        // ignore
      }
    }

    const client = new SteamUserLib({ enablePicsCache: false })
    this.client = client

    return new Promise<string>((resolve) => {
      const timeout = setTimeout(() => {
        logWarning(
          'Steam CM connection timed out after 15s, using fallback username',
          LogPrefix.Steam
        )
        resolve('Steam User')
      }, 15000)

      client.once('loggedOn', async () => {
        clearTimeout(timeout)
        try {
          if (!client.steamID) {
            resolve('Steam User')
            return
          }

          const steamId64 = client.steamID.getSteamID64()
          let personaName = 'Steam User'

          try {
            const result = await client.getPersonas([client.steamID])
            personaName = result.personas[steamId64]?.player_name ?? 'Steam User'
          } catch (err) {
            logWarning(['getPersonas failed, using fallback username:', err], LogPrefix.Steam)
          }

          resolve(personaName)
        } catch (err) {
          logWarning(['Steam loggedOn handler failed:', err], LogPrefix.Steam)
          resolve('Steam User')
        }
      })

      client.once('error', (err: Error) => {
        clearTimeout(timeout)
        logWarning(['Steam client error, username unavailable:', err], LogPrefix.Steam)
        resolve('Steam User')
      })

      client.logOn({ refreshToken })
    })
  }

  // ── AUTH-01: QR Login ──────────────────────────────────────────────────────

  static async startQRLogin(): Promise<{
    status: 'done' | 'error'
    challengeUrl?: string
  }> {
    try {
      // Tear down previous session before replacing it
      if (this.session) {
        this.session.cancelLoginAttempt()
        this.session = null
      }

      const session = new LoginSession(EAuthTokenPlatformType.SteamClient)
      // Give the user 2 minutes to scan and approve. The default 30 s kills the
      // session before the phone's approval round-trip completes.
      session.loginTimeout = 120000
      this.session = session
      this.qrSessionState = { status: 'waiting' }

      const response = await session.startWithQR()

      session.once('authenticated', () => {
        try {
          const encrypted = encryptToken(session.refreshToken)
          configStore.set(TOKEN_STORE_KEY, encrypted)
          configStore.set('isLoggedIn', true)

          // Mark done synchronously so pollQRLogin() returns 'done' as soon as
          // the user approves on their phone — don't block the UI on the CM
          // connection. The persona name (and client.steamID) are populated in
          // the background below and surface on a later poll.
          this.qrSessionState = { status: 'done' }

          void this.connectSteamUserClient(session.refreshToken)
            .then((personaName) => {
              configStore.set('userData', {
                username: personaName,
                steamId: this.client?.steamID?.getSteamID64() ?? ''
              })
              this.qrSessionState = { status: 'done', username: personaName }
            })
            .catch((err) => {
              logWarning(
                ['Steam QR background CM connect failed:', err],
                LogPrefix.Steam
              )
            })
        } catch (err) {
          logError(['Steam QR auth finalization failed:', err], LogPrefix.Steam)
          this.qrSessionState = { status: 'error' }
        }
      })

      session.once('timeout', () => {
        logWarning('Steam QR session timed out', LogPrefix.Steam)
        this.qrSessionState = { status: 'error' }
      })

      session.once('error', (err: Error) => {
        logError(['Steam QR session error:', err], LogPrefix.Steam)
        this.qrSessionState = { status: 'error' }
      })

      return { status: 'done', challengeUrl: response.qrChallengeUrl }
    } catch (err) {
      logError(['Steam startQRLogin failed:', err], LogPrefix.Steam)
      return { status: 'error' }
    }
  }

  // ── AUTH-01: QR Poll ───────────────────────────────────────────────────────

  static async pollQRLogin(): Promise<{
    status: 'done' | 'waiting' | 'error'
    username?: string
  }> {
    const state = this.qrSessionState
    if (state.status === 'done') {
      // username is undefined until the background CM connection resolves the
      // persona name (see the QR 'authenticated' handler). The frontend picks
      // up the real name on a subsequent poll once it's populated.
      return { status: 'done', username: state.username }
    }
    if (state.status === 'error') {
      return { status: 'error' }
    }
    return { status: 'waiting' }
  }

  // ── AUTH-02: Credential Login ──────────────────────────────────────────────

  static async startCredentialLogin(
    username: string,
    password: string
  ): Promise<{ status: 'done' | 'guard_required' | 'error' }> {
    try {
      // Tear down previous session before replacing it
      if (this.session) {
        this.session.cancelLoginAttempt()
        this.session = null
      }

      const session = new LoginSession(EAuthTokenPlatformType.SteamClient)
      this.session = session

      const response = await session.startWithCredentials({
        accountName: username,
        password
        // NOTE: password is passed to steam-session but never written to configStore
      })

      if (response.actionRequired) {
        // SteamGuard is required — UI will call submitSteamGuardCode next
        logInfo('Steam Guard required for credential login', LogPrefix.Steam)
        return { status: 'guard_required' }
      }

      // No guard required — wait for authenticated event (polling started internally)
      return new Promise<{ status: 'done' | 'error' }>((resolve) => {
        session.once('authenticated', async () => {
          try {
            await this.finishAuth(session.refreshToken)
            resolve({ status: 'done' })
          } catch (err) {
            logError(['Steam credential auth finalization failed:', err], LogPrefix.Steam)
            resolve({ status: 'error' })
          }
        })

        session.once('error', (err: Error) => {
          logError(['Steam credential session error:', err], LogPrefix.Steam)
          resolve({ status: 'error' })
        })

        session.once('timeout', () => {
          logWarning('Steam credential session timed out', LogPrefix.Steam)
          resolve({ status: 'error' })
        })
      })
    } catch (err) {
      logError(['Steam startCredentialLogin failed:', err], LogPrefix.Steam)
      return { status: 'error' }
    }
  }

  // ── AUTH-02: Submit SteamGuard code ───────────────────────────────────────

  static async submitSteamGuardCode(
    code: string
  ): Promise<{ status: 'done' | 'error' }> {
    if (!this.session) {
      logWarning('submitSteamGuardCode called but no active session', LogPrefix.Steam)
      return { status: 'error' }
    }

    const session = this.session

    try {
      await session.submitSteamGuardCode(code)

      return new Promise<{ status: 'done' | 'error' }>((resolve) => {
        session.once('authenticated', async () => {
          try {
            await this.finishAuth(session.refreshToken)
            resolve({ status: 'done' })
          } catch (err) {
            logError(['Steam guard submit auth finalization failed:', err], LogPrefix.Steam)
            resolve({ status: 'error' })
          }
        })

        session.once('error', (err: Error) => {
          logError(['Steam guard submit session error:', err], LogPrefix.Steam)
          resolve({ status: 'error' })
        })

        session.once('timeout', () => {
          logWarning('Steam guard session timed out', LogPrefix.Steam)
          resolve({ status: 'error' })
        })
      })
    } catch (err) {
      logError(['Steam submitSteamGuardCode failed:', err], LogPrefix.Steam)
      return { status: 'error' }
    }
  }
}
