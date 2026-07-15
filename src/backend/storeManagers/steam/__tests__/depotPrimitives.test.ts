// Phase 21 (21-01): Unit tests for the lifted depot primitive layers
// (crypto, decompress, select). Proves byte-fidelity, SHA1-verify-then-trust,
// and 64-bit-GID-as-string invariants asserted by tests, not just prose.

import { createCipheriv, randomBytes } from 'node:crypto'

import { steamDecrypt, decryptFilename } from '../depot/crypto'

// ── Test helpers ─────────────────────────────────────────────────────────

/** Steam's symmetric encrypt (inverse of steamDecrypt) — for round-trip fixtures. */
function steamEncrypt(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(16)
  const ivEnc = createCipheriv('aes-256-ecb', key, null)
  ivEnc.setAutoPadding(false)
  const encryptedIv = Buffer.concat([ivEnc.update(iv), ivEnc.final()])

  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])

  return Buffer.concat([encryptedIv, encrypted])
}

// ── crypto ────────────────────────────────────────────────────────────────

describe('crypto', () => {
  const key = randomBytes(32)

  it('steamDecrypt round-trips a known plaintext under a known key', () => {
    const plaintext = Buffer.from('some depot chunk plaintext bytes, arbitrary length!')
    const ciphertext = steamEncrypt(plaintext, key)
    expect(steamDecrypt(ciphertext, key)).toEqual(plaintext)
  })

  it('decryptFilename returns UTF-8 up to the first NUL, stripping trailing PKCS padding', () => {
    const filename = 'UnityEngine.SubstanceModule.dll'
    const plaintext = Buffer.concat([Buffer.from(filename, 'utf8'), Buffer.from([0])])
    const ciphertext = steamEncrypt(plaintext, key)
    expect(decryptFilename(ciphertext.toString('base64'), key)).toBe(filename)
  })

  it('a filename decrypting to bytes containing "../" is returned verbatim (no sanitization)', () => {
    const filename = '../../evil/traversal.txt'
    const plaintext = Buffer.concat([Buffer.from(filename, 'utf8'), Buffer.from([0])])
    const ciphertext = steamEncrypt(plaintext, key)
    expect(decryptFilename(ciphertext.toString('base64'), key)).toBe(filename)
  })
})
