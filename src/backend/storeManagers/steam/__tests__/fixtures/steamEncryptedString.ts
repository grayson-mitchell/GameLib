// Quick 260822-bp4: fixture builder for depotLinktarget.test.ts.
//
// Steam manifest string fields (`filename`, `linktarget` — proto field 7 of
// the same message, content_manifest.proto) are wire-encoded as
// base64( AES-256-ECB(IV) || AES-256-CBC(plaintext + NUL + PKCS#7 pad) ).
// This is the EXACT inverse of depot/crypto.ts's `steamDecrypt` +
// `decryptFilename` — not a convenient approximation. Prototyped and
// executed against real hardware-measured samples (see the todo this task
// resolves): the wire byte counts below match Steam's own Wasteland 1
// (259130) manifest exactly, which is what stops this fixture from
// repeating the same class of defect that burned this file twice already
// today (a zero-filled compression-method byte, a Stored-chunk fixture with
// no EOCD) — both passed against container shapes that cannot exist in the
// wild. A fixture built from a PLAINTEXT linktarget would pass at HEAD and
// prove nothing.
import { createCipheriv, randomBytes } from 'node:crypto'

/** Encrypts `plaintext` into Steam's manifest string layout:
 *  base64( AES-256-ECB(IV) || AES-256-CBC(plaintext + NUL + PKCS#7 pad) ).
 *  The exact inverse of depot/crypto.ts's steamDecrypt + decryptFilename. */
export function steamEncryptString(plaintext: string, key: Buffer): string {
  const body = Buffer.concat([Buffer.from(plaintext, 'utf8'), Buffer.from([0])])
  const padLen = 16 - (body.length % 16) || 16
  const padded = Buffer.concat([body, Buffer.alloc(padLen, padLen)])
  const iv = randomBytes(16)
  const ivEnc = createCipheriv('aes-256-ecb', key, null)
  ivEnc.setAutoPadding(false)
  const ivCt = Buffer.concat([ivEnc.update(iv), ivEnc.final()])
  const enc = createCipheriv('aes-256-cbc', key, iv)
  enc.setAutoPadding(false)
  const bodyCt = Buffer.concat([enc.update(padded), enc.final()])
  return Buffer.concat([ivCt, bodyCt]).toString('base64')
}
