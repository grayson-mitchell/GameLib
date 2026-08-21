/**
 * Phase 34 Plan 17 (GAP-B code half, live run 30084918812): executed proof
 * that `verifyUpdaterSigningKeypair` / `pnpm verify:updater-key` catch both
 * failure modes WR-03's existing preflight misses -- a non-empty key with a
 * mismatched password (THE live failure), and a key that decodes fine but
 * does not match the committed `plugins.updater.pubkey`.
 *
 * Fixtures are REAL keypairs generated in `beforeAll` via the real Tauri
 * CLI (`tauri signer generate --ci`) -- no hand-rolled crypto, no checked-in
 * key material. Everything lives under a single `mkdtempSync` dir removed
 * in `afterAll` (no test writes key material anywhere else).
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  keyIdFromMinisignFile,
  resolveTauriCli,
  verifyUpdaterSigningKeypair
} from '../updaterSigningKey'

// The end-to-end `pnpm verify:updater-key` block spawns the full esbuild
// pipeline per invocation -- slow, and Windows Git Bash pipe semantics for
// `esbuild ... | node` are unproven (same describeOnPosix precedent as
// releaseWorkflow.test.ts's executed-path blocks).
const describeOnPosix = process.platform === 'win32' ? describe.skip : describe

describe('updaterSigningKey', () => {
  let fixturesDir: string
  let keyAContent: string
  let keyAPubContent: string
  let keyBPubContent: string
  let confWithPubkeyA: string
  let confWithPubkeyB: string
  let confWithBadPubkey: string

  beforeAll(() => {
    fixturesDir = mkdtempSync(join(tmpdir(), 'gamelib-updater-key-fixtures-'))
    const tauriCli = resolveTauriCli()

    const keyAPath = join(fixturesDir, 'keyA')
    const genA = spawnSync(
      process.execPath,
      [
        tauriCli,
        'signer',
        'generate',
        '--ci',
        '-p',
        'pw-alpha',
        '-w',
        keyAPath,
        '-f'
      ],
      { encoding: 'utf-8' }
    )
    if (genA.status !== 0) {
      throw new Error(
        `fixture setup: failed to generate keypair A: ${genA.stderr}`
      )
    }

    const keyBPath = join(fixturesDir, 'keyB')
    const genB = spawnSync(
      process.execPath,
      [
        tauriCli,
        'signer',
        'generate',
        '--ci',
        '-p',
        'pw-beta',
        '-w',
        keyBPath,
        '-f'
      ],
      { encoding: 'utf-8' }
    )
    if (genB.status !== 0) {
      throw new Error(
        `fixture setup: failed to generate keypair B: ${genB.stderr}`
      )
    }

    keyAContent = readFileSync(keyAPath, 'utf-8')
    keyAPubContent = readFileSync(`${keyAPath}.pub`, 'utf-8')
    keyBPubContent = readFileSync(`${keyBPath}.pub`, 'utf-8')

    confWithPubkeyA = join(fixturesDir, 'conf-pubkey-a.json')
    writeFileSync(
      confWithPubkeyA,
      JSON.stringify({
        plugins: { updater: { pubkey: keyAPubContent.trim() } }
      })
    )

    confWithPubkeyB = join(fixturesDir, 'conf-pubkey-b.json')
    writeFileSync(
      confWithPubkeyB,
      JSON.stringify({
        plugins: { updater: { pubkey: keyBPubContent.trim() } }
      })
    )

    confWithBadPubkey = join(fixturesDir, 'conf-bad-pubkey.json')
    writeFileSync(
      confWithBadPubkey,
      JSON.stringify({
        plugins: { updater: { pubkey: 'not-base64-minisign' } }
      })
    )
  })

  afterAll(() => {
    rmSync(fixturesDir, { recursive: true, force: true })
  })

  test('matched key A + pw-alpha + conf-with-pubkey-A -> ok: true, keyId is 16 lowercase hex chars', () => {
    const result = verifyUpdaterSigningKeypair({
      privateKey: keyAContent,
      password: 'pw-alpha',
      confPath: confWithPubkeyA
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.keyId).toMatch(/^[0-9a-f]{16}$/)
    }
  })

  test('key A + pw-beta -> kind: password-mismatch (THE live failure)', () => {
    const result = verifyUpdaterSigningKeypair({
      privateKey: keyAContent,
      password: 'pw-beta',
      confPath: confWithPubkeyA
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.kind).toBe('password-mismatch')
      if (result.kind === 'password-mismatch') {
        expect(result.detail).toMatch(/Wrong password for that key/)
      }
    }
  })

  test('key A + pw-alpha + conf-with-pubkey-B -> kind: pubkey-mismatch with two different ids', () => {
    const result = verifyUpdaterSigningKeypair({
      privateKey: keyAContent,
      password: 'pw-alpha',
      confPath: confWithPubkeyB
    })
    expect(result.ok).toBe(false)
    if (!result.ok && result.kind === 'pubkey-mismatch') {
      expect(result.signatureKeyId).toMatch(/^[0-9a-f]{16}$/)
      expect(result.pubkeyKeyId).toMatch(/^[0-9a-f]{16}$/)
      expect(result.signatureKeyId).not.toBe(result.pubkeyKeyId)
    } else {
      throw new Error(
        `expected kind "pubkey-mismatch", got ${JSON.stringify(result)}`
      )
    }
  })

  test('empty privateKey -> kind: missing-key and the Tauri CLI is never spawned', () => {
    // A confPath that would throw a filesystem error if verifyUpdaterSigningKeypair
    // ever tried to read it -- proving the missing-key check short-circuits
    // BEFORE the conf is touched (and therefore before the Tauri CLI could ever
    // be resolved/spawned), with no need to mock node:child_process.
    const unreachableConfPath = join(fixturesDir, 'does-not-exist.json')
    const result = verifyUpdaterSigningKeypair({
      privateKey: '',
      password: 'irrelevant',
      confPath: unreachableConfPath
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.kind).toBe('missing-key')
    }
  })

  test('conf whose plugins.updater.pubkey is "not-base64-minisign" -> kind: bad-pubkey', () => {
    const result = verifyUpdaterSigningKeypair({
      privateKey: keyAContent,
      password: 'pw-alpha',
      confPath: confWithBadPubkey
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.kind).toBe('bad-pubkey')
    }
  })

  test("keyIdFromMinisignFile returns the same id for keypair A's .pub content and for a signature produced by keypair A", () => {
    const pubkeyId = keyIdFromMinisignFile(keyAPubContent)

    const result = verifyUpdaterSigningKeypair({
      privateKey: keyAContent,
      password: 'pw-alpha',
      confPath: confWithPubkeyA
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.keyId).toBe(pubkeyId)
    }
  })

  describeOnPosix('pnpm verify:updater-key end-to-end entry', () => {
    function runVerifyUpdaterKey(env: Record<string, string>): {
      status: number | null
      stdout: string
      stderr: string
    } {
      const result = spawnSync('pnpm', ['verify:updater-key'], {
        cwd: join(__dirname, '..', '..'),
        env: { ...process.env, ...env },
        encoding: 'utf-8',
        timeout: 60_000
      })
      return {
        status: result.status,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? ''
      }
    }

    test('wrong password exits non-zero and emits a line starting ::error::', () => {
      const result = runVerifyUpdaterKey({
        TAURI_SIGNING_PRIVATE_KEY: keyAContent,
        TAURI_SIGNING_PRIVATE_KEY_PASSWORD: 'pw-beta',
        GAMELIB_UPDATER_CONF: confWithPubkeyA
      })
      expect(result.status).not.toBe(0)
      expect(result.stdout + result.stderr).toMatch(/^::error::/m)
    }, 90_000)

    test('matched pair exits 0', () => {
      const result = runVerifyUpdaterKey({
        TAURI_SIGNING_PRIVATE_KEY: keyAContent,
        TAURI_SIGNING_PRIVATE_KEY_PASSWORD: 'pw-alpha',
        GAMELIB_UPDATER_CONF: confWithPubkeyA
      })
      expect(result.status).toBe(0)
    }, 90_000)
  })
})
