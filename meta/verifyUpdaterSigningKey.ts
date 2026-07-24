/**
 * Phase 34 Plan 17 (GAP-B code half): thin CLI entry for
 * `verifyUpdaterSigningKeypair`. Run with `pnpm verify:updater-key`, both as
 * a release-tauri.yml preflight step (before any expensive build work) and
 * locally by a developer validating a candidate secret pair before
 * enrolling it (prerequisite for 34-18's human enrollment gate).
 *
 * Reads `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
 * from the environment -- never a CLI flag, so neither secret can leak via
 * shell history or a process listing. `GAMELIB_UPDATER_CONF` is an optional
 * override (used only by tests, to point at a fixture conf instead of the
 * real `src-tauri/tauri.conf.json`).
 *
 * On failure: exactly one `::error::` line naming the concrete remedy, then
 * `process.exit(1)`. On success: one INFORMATIONAL line naming the matched
 * key id -- 34-18 hands this whole command to a human as a blocking gate,
 * and that gate keys off the exit code and result kind, never off a literal
 * printed here.
 */
import { verifyUpdaterSigningKeypair } from './updaterSigningKey'

const privateKey = process.env.TAURI_SIGNING_PRIVATE_KEY ?? ''
const password = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? ''
const confPath = process.env.GAMELIB_UPDATER_CONF

const result = verifyUpdaterSigningKeypair({
  privateKey,
  password,
  ...(confPath ? { confPath } : {})
})

if (!result.ok) {
  switch (result.kind) {
    case 'missing-key':
      console.error(
        '::error::TAURI_SIGNING_PRIVATE_KEY is not set. Enrol the secret ' +
          '(with TAURI_SIGNING_PRIVATE_KEY_PASSWORD) before running the ' +
          'release workflow.'
      )
      break
    case 'password-mismatch':
      console.error(
        '::error::TAURI_SIGNING_PRIVATE_KEY_PASSWORD does not decrypt ' +
          'TAURI_SIGNING_PRIVATE_KEY. This is an ENROLMENT defect, not a ' +
          'repo defect -- both secrets must be re-enrolled together as a ' +
          'matched pair (see ' +
          '.planning/phases/34-tauri-packaging-windows-and-linux-builds-signing-auto-update/34-18-PLAN.md). ' +
          `Signer detail: ${result.detail}`
      )
      break
    case 'pubkey-mismatch':
      console.error(
        `::error::The enrolled TAURI_SIGNING_PRIVATE_KEY signs with key id ` +
          `${result.signatureKeyId}, but src-tauri/tauri.conf.json's ` +
          `plugins.updater.pubkey expects key id ${result.pubkeyKeyId}. ` +
          'Either the wrong private key is enrolled, or ' +
          'plugins.updater.pubkey needs updating to the public half of the ' +
          'enrolled key. Shipping in this state produces updates every ' +
          'installed client rejects.'
      )
      break
    case 'bad-pubkey':
      console.error(
        "::error::src-tauri/tauri.conf.json's plugins.updater.pubkey is " +
          `missing or not decodable minisign public key material: ${result.detail}`
      )
      break
    case 'sign-failed':
      console.error(
        '::error::tauri signer sign failed for a reason other than a ' +
          `wrong password: ${result.detail}`
      )
      break
  }
  process.exit(1)
}

// INFORMATIONAL ONLY. This id is the RAW byte-order key id
// (algorithm||key_id||... byte offsets [2,10)) -- it intentionally differs
// from the pubkey file's own "untrusted comment: minisign public key:
// XXXXXXXX" rendering, which is the same id BYTE-REVERSED. It names which
// key matched; it is not a value to diff against anything written
// elsewhere.
console.log(
  'Updater signing key verified: enrolled TAURI_SIGNING_PRIVATE_KEY matches ' +
    `the committed plugins.updater.pubkey (key id ${result.keyId}, raw byte ` +
    'order -- differs from the pubkey comment by design).'
)
