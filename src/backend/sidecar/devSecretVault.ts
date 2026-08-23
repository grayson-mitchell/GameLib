/**
 * `devSecretVault` — a DEV-ONLY, env-gated, PLAINTEXT local secret store (34.5 gap cycle 4 plan
 * 36, developer-scoped Routing addition; see `34.5-CYCLE4-ROUTING.md`).
 *
 * **This module says the OPPOSITE of `keyringTokenStore.ts`'s own header, in the same voice, on
 * purpose.** That module's `SidecarKeyringSlotStore` states: "No env-var, in-memory, or
 * plaintext fallback exists here (D-08/REQ-28-07) — a Keychain failure is a failure, full stop;
 * there is no dev escape hatch." THIS module IS that escape hatch, deliberately and narrowly:
 * it stores the Steam refresh token and both Humble secrets in PLAINTEXT on local disk, purely
 * to remove macOS Keychain approval prompts as a CONFOUNDER from live gate runs — none of the
 * five blocking gate items (the three OAuth login flows, `addToSteam`, `runWineCommand`) touch
 * the keyring at all, so a Keychain dialog mid-gate is pure noise that has already cost real
 * time (`34.5-CYCLE4-ROUTING.md`'s `## Authorisation`).
 *
 * This project has already shipped a credential store that persisted secrets in PLAINTEXT
 * SILENTLY — the `safeStorage` stub under Tauri (`electronStub.ts`), which became finding F-1
 * at a live gate (`34.4.1-08-gate-failed.md`) before `keyringTokenStore.ts`/`humbleSecretStore.ts`
 * closed it. This module MUST NOT become a second instance of that defect. Three guardrails,
 * each independently tested, each non-negotiable:
 *
 *   (a) opt-in via `GAMELIB_DEV_SECRET_VAULT === '1'` ONLY — an exact string match, never a
 *       truthiness check (a stray `=0`/`=false` must never enable this), and read at INSTALL
 *       time only, never cached at module scope.
 *   (b) a LOUD warning on install and on every read/write, naming only the slot/key identifier —
 *       never a secret value, never a substring of one, never a length.
 *   (c) REFUSED in a packaged build, and REFUSED whenever the build kind cannot be determined
 *       (fail CLOSED) — enforced by reusing `humbleFlowRegistration.ts`'s `isPackagedSidecar()`
 *       verbatim (never re-derived, so the two copies of a fail-closed detector cannot diverge
 *       and silently stop failing closed).
 *
 * **Stated cost, tracked not implied.** Any run that uses this vault leaves the real macOS
 * Keychain read/write path for `steam-refresh-token`/`humble-session`/`humble-csrf` UNPROVEN —
 * see ledger row `U-34.5-01` in `34.5-UNTESTED-ITEMS.md`. That row states plainly that a
 * `dev-vault` run proves NOTHING about the Keychain path and stays OPEN regardless of that run's
 * outcome — this module's install banner exists partly so a live `gamelib.log` carries the same
 * fact inline, not only in a planning document.
 *
 * This is a DEV-ONLY vault. It is never reachable in a packaged build (guardrail (c)), and it
 * must never become a production credential path — if a future change makes that untrue, this
 * header's claim (and `U-34.5-01`'s bar on using a vault run as Keychain evidence) both become
 * false at the same time.
 */

import {
  chmodSync,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'graceful-fs'
import { join } from 'path'

import { logError, logWarning, LogPrefix } from 'backend/logger'
import { getPath } from './pathShim'
import { isPackagedSidecar } from './humbleFlowRegistration'
import {
  setTokenStore,
  type TokenStore
} from 'backend/storeManagers/steam/tokenStore'
import {
  setHumbleSecretStore,
  type HumbleSecretStore,
  type HumbleSecretKey
} from 'backend/humble/secretStore'
import {
  setSteamGridDbSecretStore,
  type SteamGridDbSecretStore
} from 'backend/steamgrid/secretStore'

/** The exact-match env var this vault gates on. Read ONLY inside `installDevSecretVault()` —
 * grepped at plan-verify time (`grep -rn "GAMELIB_DEV_SECRET_VAULT" src/`) to confirm this is
 * the ONE non-test read site in the codebase. */
const DEV_SECRET_VAULT_ENV_VAR = 'GAMELIB_DEV_SECRET_VAULT'

/** File name — deliberately contains `dev-secret-vault` so it is obvious on sight in a
 * directory listing and cannot be mistaken for real application data (D-14/T-27-03's sibling
 * concern, applied to a file this project actively wants a developer to notice). Placed under
 * `pathShim`'s `temp` resolution (`os.tmpdir()`), NOT `userData` — this vault is disposable
 * gate-run scratch, never part of the persisted app profile. */
const VAULT_FILE_NAME = 'gamelib-dev-secret-vault.json'

/** The slot/key identifiers this vault ever logs or stores under. A closed set, not a free
 * string, mirroring `HumbleSecretKey`'s own closed-union reasoning one layer up — nothing else
 * may ever appear in a `[dev-secret-vault]` log line. Extended by Phase 34.6 plan 02 (A-03) with
 * `steamGridDbApiKey` for `DevVaultSteamGridDbSecretStore` below — same closed-set discipline,
 * one more literal. */
type VaultSlot =
  | 'steam-refresh-token'
  | 'sessionCookie'
  | 'csrfToken'
  | 'steamGridDbApiKey'

const STEAM_SLOT: VaultSlot = 'steam-refresh-token'
const STEAMGRID_SLOT: VaultSlot = 'steamGridDbApiKey'

type VaultFileShape = Partial<Record<VaultSlot, string>>

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function vaultFilePath(): string {
  return join(getPath('temp'), VAULT_FILE_NAME)
}

/** Re-asserts owner-only permissions on every call (guardrail, T-34.5-C4-41) — a mode set once
 * can be widened later by an unrelated tool, so this is not "set once at creation" but
 * "reasserted on every write". Throws on failure; callers decide what that means for them. */
function assertOwnerOnlyMode(path: string): void {
  chmodSync(path, 0o600)
  const mode = statSync(path).mode & 0o777
  if (mode !== 0o600) {
    throw new Error(
      `vault file mode is 0${mode.toString(8)} after chmod, expected 0600`
    )
  }
}

/** Creates the vault file (empty JSON object) if it does not already exist, with owner-only
 * permissions, and re-asserts that mode either way. Throws on any failure — the caller
 * (`installDevSecretVault`) treats a throw here as "refuse to install", per this module's own
 * header: "a vault that silently degrades to world-readable is the same class of defect as the
 * `safeStorage` stub." */
function ensureVaultFileCreated(path: string): void {
  if (!existsSync(path)) {
    writeFileSync(path, JSON.stringify({}), { mode: 0o600 })
  }
  assertOwnerOnlyMode(path)
}

function readVaultFile(path: string): VaultFileShape {
  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object'
      ? (parsed as VaultFileShape)
      : {}
  } catch {
    // Missing file, unreadable, or corrupt JSON — treated as "nothing stored yet", the same
    // honest-empty semantics `TokenStore`/`HumbleSecretStore` already document for their real
    // implementations. Never thrown from here — a read must always resolve to a value.
    return {}
  }
}

function writeVaultFile(path: string, data: VaultFileShape): void {
  writeFileSync(path, JSON.stringify(data, null, 2), { mode: 0o600 })
  // Re-assert the mode after every write (guardrail (T-34.5-C4-41)) — writeFileSync's own
  // `mode` option only applies at file CREATION time on most platforms, not on an overwrite of
  // an existing file, so this is not redundant.
  assertOwnerOnlyMode(path)
}

/** Reads one slot, emitting the mandated `[dev-secret-vault] read key=<slot>` line — the slot
 * name only, never the value (guardrail (b)/T-34.5-C4-42). */
function readSlot(path: string, slot: VaultSlot): string {
  logWarning(`[dev-secret-vault] read key=${slot}`, LogPrefix.Backend)
  const value = readVaultFile(path)[slot]
  return typeof value === 'string' ? value : ''
}

/** Writes one slot, emitting the mandated `[dev-secret-vault] write key=<slot>` line — the slot
 * name only, never the value (guardrail (b)/T-34.5-C4-42). */
function writeSlot(path: string, slot: VaultSlot, value: string): void {
  logWarning(`[dev-secret-vault] write key=${slot}`, LogPrefix.Backend)
  const data = readVaultFile(path)
  data[slot] = value
  writeVaultFile(path, data)
}

/** Clears one slot. Treated as a write for logging purposes (guardrail (b)) — it mutates the
 * on-disk vault exactly as `writeSlot` does, just to the empty string, which is indistinguishable
 * from "never stored" on the next `readSlot` (matches `TokenStore.getToken()`'s own documented
 * "''" == "none stored OR unavailable" semantics). */
function clearSlot(path: string, slot: VaultSlot): void {
  writeSlot(path, slot, '')
}

/** The Steam `TokenStore` half of the vault, bound to the fixed `steam-refresh-token` slot. */
class DevVaultTokenStore implements TokenStore {
  constructor(private readonly path: string) {}

  async isAvailable(): Promise<boolean> {
    return true
  }

  async getToken(): Promise<string> {
    return readSlot(this.path, STEAM_SLOT)
  }

  async setToken(token: string): Promise<void> {
    writeSlot(this.path, STEAM_SLOT, token)
  }

  async clearToken(): Promise<void> {
    clearSlot(this.path, STEAM_SLOT)
  }
}

/** The Humble `HumbleSecretStore` half of the vault, addressing both `sessionCookie` and
 * `csrfToken` slots by the same `HumbleSecretKey` the real seam uses — no remapping, since this
 * vault's `VaultSlot` union already includes both literal key names verbatim. */
class DevVaultHumbleSecretStore implements HumbleSecretStore {
  constructor(private readonly path: string) {}

  async isAvailable(): Promise<boolean> {
    return true
  }

  async getSecret(key: HumbleSecretKey): Promise<string> {
    return readSlot(this.path, key)
  }

  async setSecret(key: HumbleSecretKey, value: string): Promise<void> {
    writeSlot(this.path, key, value)
  }

  async clearSecrets(): Promise<void> {
    clearSlot(this.path, 'sessionCookie')
    clearSlot(this.path, 'csrfToken')
  }
}

/** The SteamGridDB `SteamGridDbSecretStore` half of the vault (Phase 34.6 plan 02, A-03), bound
 * to the fixed `steamGridDbApiKey` slot. Total-method contract, same as the real
 * `SidecarSteamGridDbSecretStore` this stands in for — `isAvailable()` is declared SYNCHRONOUS by
 * the seam's own interface (`steamgrid/secretStore.ts`, plan 34.6-01), so this always reports
 * `true`, mirroring that implementation's identical choice; a real unavailability has no meaning
 * for a local plaintext file. This arm is NOT optional (see `installDevSecretVault()`'s own doc
 * comment below): the branch this function's return value gates is exclusive, so a
 * `GAMELIB_DEV_SECRET_VAULT=1` boot that omitted this class would fall through to
 * `ElectronSteamGridDbSecretStore` — whose `safeStorage` resolves to the sidecar's dead stub —
 * and re-open the exact plaintext hazard A-03 exists to close, on the development machines most
 * likely to hold a real key. */
class DevVaultSteamGridDbSecretStore implements SteamGridDbSecretStore {
  constructor(private readonly path: string) {}

  isAvailable(): boolean {
    return true
  }

  async getApiKey(): Promise<string | undefined> {
    const value = readSlot(this.path, STEAMGRID_SLOT)
    return value ? value : undefined
  }

  async setApiKey(value: string): Promise<void> {
    writeSlot(this.path, STEAMGRID_SLOT, value)
  }

  async clearApiKey(): Promise<void> {
    clearSlot(this.path, STEAMGRID_SLOT)
  }
}

/**
 * Installs the dev-only plaintext secret vault as the Steam `TokenStore`, the Humble
 * `HumbleSecretStore`, AND the SteamGridDB `SteamGridDbSecretStore` (Phase 34.6 plan 02, A-03),
 * if and only if every guardrail passes:
 *
 *   1. `process.env.GAMELIB_DEV_SECRET_VAULT === '1'` (exact match — guardrail (a)). Anything
 *      else, including unset/`'0'`/`'false'`, returns `false` and calls neither setter.
 *   2. `isPackagedSidecar()` (imported, never re-derived — guardrail (c)) must resolve `false`.
 *      A `true` result, OR the call itself throwing, refuses installation — this function's own
 *      `try`/`catch` around the call inherits the SAME fail-closed direction
 *      `isPackagedSidecar()` already applies internally, so a caller that manages to make it
 *      throw (e.g. a test double) still cannot install.
 *   3. The vault file must be creatable (or already present) with owner-only `0o600`
 *      permissions. A failure here (guardrail, T-34.5-C4-41) also refuses installation.
 *
 * Returns `true` only when all three guardrails passed AND all three setters were called — the
 * `[bootstrap] secret stores: <keyring|dev-vault>` receipt line (`bootstrap.ts`, Task 2) is
 * keyed directly off this return value, so a caller can always tell which arm actually ran.
 */
export function installDevSecretVault(): boolean {
  if (process.env[DEV_SECRET_VAULT_ENV_VAR] !== '1') {
    return false
  }

  let packaged: boolean
  try {
    packaged = isPackagedSidecar()
  } catch (error) {
    // isPackagedSidecar() already fails closed (returns true) on its own internal errors — this
    // catch exists so that even a caller/test double that makes the IMPORTED reference itself
    // throw (rather than resolve true) still refuses, never installs. Same fail-closed direction,
    // one layer further out.
    logError(
      `[dev-secret-vault] REFUSED — could not determine build kind, failing closed: ${errorMessage(error)}`,
      LogPrefix.Backend
    )
    return false
  }

  if (packaged) {
    logError(
      `[dev-secret-vault] REFUSED — packaged build; ${DEV_SECRET_VAULT_ENV_VAR} ignored`,
      LogPrefix.Backend
    )
    return false
  }

  const path = vaultFilePath()
  try {
    ensureVaultFileCreated(path)
  } catch (error) {
    logError(
      `[dev-secret-vault] REFUSED — could not create the vault file with owner-only permissions at ${path}: ${errorMessage(error)}`,
      LogPrefix.Backend
    )
    return false
  }

  setTokenStore(new DevVaultTokenStore(path))
  setHumbleSecretStore(new DevVaultHumbleSecretStore(path))
  setSteamGridDbSecretStore(new DevVaultSteamGridDbSecretStore(path))

  logWarning(
    `[dev-secret-vault] INSTALLED — secrets are stored in PLAINTEXT at ${path} — NEVER use in production`,
    LogPrefix.Backend
  )

  return true
}
