// Phase 21 (21-01): Steam depot crypto primitives.
//
// Lifted near-verbatim from `.planning/spikes/002-steam-user-depot-download/steam-depot.mjs`
// (steamDecrypt L34-58, decryptFilename L50-58). Do not hand-roll AES — Node's
// built-in `node:crypto` is the only allowed source for the cipher primitives.
//
// SECURITY (T-21-01, accepted here): `decryptFilename` only DECODES bytes from an
// untrusted CDN response. It must never silently sanitize a path — doing so would
// hide traversal attempts from the audited chokepoint. Path-traversal containment
// (resolve+relative check against the install root) is the CALLER's responsibility,
// enforced in Plan 05's write loop.

import * as nodeCrypto from 'node:crypto'

/**
 * Steam's symmetric decrypt.
 * First 16 bytes of ciphertext = IV, itself AES-256-ECB encrypted under the key.
 * Remainder = AES-256-CBC under that IV, PKCS#7 padded.
 */
export function steamDecrypt(ciphertext: Buffer, key: Buffer): Buffer {
  const ivDec = nodeCrypto.createDecipheriv('aes-256-ecb', key, null)
  ivDec.setAutoPadding(false)
  const iv = Buffer.concat([
    ivDec.update(ciphertext.subarray(0, 16)),
    ivDec.final()
  ])

  const dec = nodeCrypto.createDecipheriv('aes-256-cbc', key, iv)
  dec.setAutoPadding(false)
  const plain = Buffer.concat([
    dec.update(ciphertext.subarray(16)),
    dec.final()
  ])

  const pad = plain[plain.length - 1]
  const padOk =
    pad >= 1 &&
    pad <= 16 &&
    plain.subarray(plain.length - pad).every((b) => b === pad)
  return padOk ? plain.subarray(0, plain.length - pad) : plain
}

/**
 * Decrypt a manifest filename correctly.
 * Plaintext is `filename + NUL + padding`; strip padding, then cut at the NUL.
 * This layer never sanitizes — see the SECURITY note above.
 */
export function decryptFilename(b64: string, key: Buffer): string {
  const plain = steamDecrypt(Buffer.from(b64, 'base64'), key)
  const nul = plain.indexOf(0)
  return (nul === -1 ? plain : plain.subarray(0, nul)).toString('utf8')
}
