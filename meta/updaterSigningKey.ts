/**
 * Phase 34 Plan 17 (GAP-B code half, live run 30084918812): proves an
 * enrolled `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
 * pair actually decodes AND matches the committed
 * `src-tauri/tauri.conf.json` `plugins.updater.pubkey`, before any expensive
 * build work runs.
 *
 * BACKGROUND: live run 30084918812 bundled `GameLib_0.7.0_amd64.AppImage`
 * and `GameLib_0.7.0_x64-setup.exe` in full and THEN failed at updater
 * signing with `failed to decode secret key: incorrect updater private key
 * password: Wrong password for that key`, ~13 minutes into the Windows leg.
 * WR-03's existing preflight (release-tauri.yml, "Fail fast with a clear
 * message if the updater signing key is absent") only asserts
 * `TAURI_SIGNING_PRIVATE_KEY != ''` -- a non-empty key with a mismatched
 * password sails straight through it. This module exercises the key for
 * real, against the real Tauri signer, before that 13-minute Rust build ever
 * starts.
 *
 * MECHANISM (verified empirically against @tauri-apps/cli 2.11.4 -- see
 * 34-17-PLAN.md <interfaces> for the full derivation):
 *   1. `tauri signer sign <FILE>` reads both secrets from
 *      `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` env
 *      vars. A bad password exits non-zero with stderr containing exactly
 *      `incorrect updater private key password: Wrong password for that
 *      key` -- the same string the live CI run produced, because it is the
 *      same code path `tauri build` takes.
 *   2. The written `<FILE>.sig` is BASE64 of a two-line minisign signature
 *      file. Decoding line 2 (itself base64) yields
 *      `algorithm(2 bytes) || key_id(8 bytes) || signature(64 bytes)`.
 *   3. `tauri.conf.json`'s `plugins.updater.pubkey` is BASE64 of a two-line
 *      minisign PUBLIC KEY file. Decoding line 2 yields
 *      `algorithm(2 bytes) || key_id(8 bytes) || public_key(32 bytes)`.
 *   4. The key id is therefore bytes [2,10) of the decoded line 2 in BOTH
 *      files, comparable as raw bytes with no endianness handling. This is
 *      NOT the same string as the pubkey file's own
 *      `untrusted comment: minisign public key: XXXXXXXX` line -- that
 *      comment renders the same id BYTE-REVERSED. Nobody should ever
 *      eyeball-compare the two; that is what the discriminated
 *      `pubkey-mismatch` result exists for.
 *
 * SECURITY (T-34-37/38/39, threat register): the private key and password
 * cross into this process only via the child process env, are never written
 * to disk, and never appear in an error string -- only the (public) key id
 * is ever printed by the CLI entry point (meta/verifyUpdaterSigningKey.ts).
 * The probe file is a fixed literal (no secret material); it and its `.sig`
 * are removed in a `finally`. The Tauri CLI is resolved via
 * `require.resolve('@tauri-apps/cli/tauri.js')` and spawned through
 * `process.execPath` in argv form -- never a bare `tauri` / pnpm `.bin` path
 * and never `shell: true` -- mirroring `meta/buildSidecarSea.ts`'s
 * `resolveEsbuildCli()` (the proven GAP-2 fix; a bare `.bin` shim spawn is
 * exactly what killed the Windows leg before that fix).
 */
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_CONF_PATH = join('src-tauri', 'tauri.conf.json')
const PROBE_FILE_NAME = 'updater-preflight-probe.txt'
const PROBE_FILE_CONTENTS = 'GameLib updater signing key preflight probe\n'

const PASSWORD_MISMATCH_PATTERN =
  /incorrect updater private key password|Wrong password for that key/

export type VerifyUpdaterSigningKeypairResult =
  | { ok: true; keyId: string }
  | { ok: false; kind: 'missing-key' }
  | { ok: false; kind: 'password-mismatch'; detail: string }
  | { ok: false; kind: 'sign-failed'; detail: string }
  | {
      ok: false
      kind: 'pubkey-mismatch'
      signatureKeyId: string
      pubkeyKeyId: string
    }
  | { ok: false; kind: 'bad-pubkey'; detail: string }

export interface VerifyUpdaterSigningKeypairOptions {
  privateKey: string
  password: string
  /** Defaults to `src-tauri/tauri.conf.json` resolved from `process.cwd()`. */
  confPath?: string
  /** Defaults to a `mkdtempSync` dir, removed after the run. */
  workdir?: string
}

/**
 * `require.resolve`-based resolution of the Tauri CLI entry, run through
 * `process.execPath` so no PATH/PATHEXT lookup and no pnpm `.bin` shim is
 * ever involved (GAP-2 pattern, T-24-06/T-34-39). Mirrors
 * `resolveEsbuildCli()` in `meta/buildSidecarSea.ts`.
 */
export function resolveTauriCli(): string {
  try {
    return require.resolve('@tauri-apps/cli/tauri.js')
  } catch (error) {
    throw new Error(
      `PREFLIGHT GATE FAILED: cannot resolve @tauri-apps/cli/tauri.js -- ` +
        `is the devDependency installed? (${(error as Error).message})`
    )
  }
}

/**
 * Extracts the raw-byte-order minisign key id (16 lowercase hex chars) from
 * the BASE64-encoded content of either a minisign public key file or a
 * minisign signature file -- both share the same
 * `algorithm(2) || key_id(8) || ...` line-2 layout. See the file header for
 * the empirically-verified derivation.
 */
export function keyIdFromMinisignFile(base64FileContent: string): string {
  const decodedText = Buffer.from(base64FileContent.trim(), 'base64').toString(
    'utf-8'
  )
  const lines = decodedText.split('\n')
  if (lines.length < 2 || lines[1].trim().length === 0) {
    throw new Error(
      `keyIdFromMinisignFile: expected a two-line minisign file (comment + ` +
        `body), got ${lines.length} line(s) after decoding`
    )
  }
  const bodyBytes = Buffer.from(lines[1].trim(), 'base64')
  if (bodyBytes.length < 10) {
    throw new Error(
      `keyIdFromMinisignFile: decoded body is only ${bodyBytes.length} ` +
        `bytes, need at least 10 (2-byte algorithm + 8-byte key id)`
    )
  }
  return bodyBytes.subarray(2, 10).toString('hex')
}

/**
 * Reads `plugins.updater.pubkey` out of a `tauri.conf.json`-shaped file.
 * Throws a named error when the file is missing, unparsable, or the field
 * is absent/empty -- callers surface this as the `bad-pubkey` result kind.
 */
export function readCommittedPubkey(confPath: string): string {
  const raw = readFileSync(confPath, 'utf-8')
  const conf = JSON.parse(raw) as {
    plugins?: { updater?: { pubkey?: string } }
  }
  const pubkey = conf.plugins?.updater?.pubkey
  if (typeof pubkey !== 'string' || pubkey.trim().length === 0) {
    throw new Error(
      `readCommittedPubkey: no plugins.updater.pubkey found in ${confPath}`
    )
  }
  return pubkey
}

/**
 * Signs a throwaway probe file with the candidate key/password pair using
 * the real Tauri signer, then compares the resulting signature's minisign
 * key id against the key id inside the committed `plugins.updater.pubkey`.
 * Never throws for an expected failure mode -- always returns a
 * discriminated result. The probe file and its `.sig` are removed in a
 * `finally`, regardless of outcome.
 */
export function verifyUpdaterSigningKeypair(
  options: VerifyUpdaterSigningKeypairOptions
): VerifyUpdaterSigningKeypairResult {
  const { privateKey, password } = options

  // Checked FIRST, before touching the conf file or resolving/spawning the
  // Tauri CLI at all -- an empty key can never sign anything, and this
  // ordering is what lets a test prove the CLI is never spawned without
  // needing to mock node:child_process.
  if (!privateKey || privateKey.trim().length === 0) {
    return { ok: false, kind: 'missing-key' }
  }

  const confPath = options.confPath ?? join(process.cwd(), DEFAULT_CONF_PATH)

  let pubkeyKeyId: string
  try {
    const pubkeyBase64 = readCommittedPubkey(confPath)
    pubkeyKeyId = keyIdFromMinisignFile(pubkeyBase64)
  } catch (error) {
    return { ok: false, kind: 'bad-pubkey', detail: (error as Error).message }
  }

  let workdir = options.workdir
  let ownsWorkdir = false
  if (!workdir) {
    workdir = mkdtempSync(join(tmpdir(), 'gamelib-updater-key-'))
    ownsWorkdir = true
  }

  const probePath = join(workdir, PROBE_FILE_NAME)
  const sigPath = `${probePath}.sig`

  try {
    writeFileSync(probePath, PROBE_FILE_CONTENTS)

    const tauriCli = resolveTauriCli()
    // Argv form only (T-24-06) -- never shell: true. The secrets cross into
    // this child process's env ONLY, never a file, never a command-line
    // arg (T-34-37).
    const result = spawnSync(
      process.execPath,
      [tauriCli, 'signer', 'sign', probePath],
      {
        env: {
          ...process.env,
          TAURI_SIGNING_PRIVATE_KEY: privateKey,
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: password
        },
        encoding: 'utf-8'
      }
    )

    if (result.status !== 0) {
      const stderr = (result.stderr ?? '').trim()
      if (PASSWORD_MISMATCH_PATTERN.test(stderr)) {
        return { ok: false, kind: 'password-mismatch', detail: stderr }
      }
      return { ok: false, kind: 'sign-failed', detail: stderr }
    }

    if (!existsSync(sigPath)) {
      return {
        ok: false,
        kind: 'sign-failed',
        detail: `tauri signer sign exited 0 but no signature was emitted at ${sigPath}`
      }
    }

    let signatureKeyId: string
    try {
      signatureKeyId = keyIdFromMinisignFile(readFileSync(sigPath, 'utf-8'))
    } catch (error) {
      return {
        ok: false,
        kind: 'sign-failed',
        detail: `signature was emitted but could not be decoded: ${(error as Error).message}`
      }
    }

    if (signatureKeyId !== pubkeyKeyId) {
      return {
        ok: false,
        kind: 'pubkey-mismatch',
        signatureKeyId,
        pubkeyKeyId
      }
    }

    return { ok: true, keyId: signatureKeyId }
  } finally {
    rmSync(probePath, { force: true })
    rmSync(sigPath, { force: true })
    if (ownsWorkdir) {
      rmSync(workdir, { recursive: true, force: true })
    }
  }
}
