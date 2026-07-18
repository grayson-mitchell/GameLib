/**
 * Spike 002 — decrypt a filename BY HAND, padding disabled, and print every byte.
 *
 * Steam's symmetric scheme: the first 16 bytes of ciphertext are the IV, itself
 * encrypted with AES-256-ECB under the depot key. The remainder is AES-256-CBC
 * under that IV.
 *
 * Question: is the final block garbage (→ decryption is broken, unfixable), or is
 * it valid plaintext + PKCS#7 padding that steam-crypto is mis-stripping (→ a
 * userland fix is trivial)?
 */

import { createDecipheriv } from 'node:crypto'
import { connectAuthenticated } from '../001-acf-adoption/auth.mjs'

const APP_ID = 264160
const DEPOT = 264162

const { client } = await connectAuthenticated()
const info = await client.getProductInfo([APP_ID], [], true)
const gid = info.apps[APP_ID].appinfo.depots[DEPOT].manifests.public.gid
const key = await new Promise((res, rej) =>
  client.getDepotDecryptionKey(APP_ID, DEPOT, (e, k) => (e ? rej(e) : res(k)))
)

const ContentManifest = await import('steam-user/components/content_manifest.js')
const raw = await new Promise((res, rej) =>
  client.getRawManifest(APP_ID, DEPOT, gid, 'public', (e, m) => (e ? rej(e) : res(m)))
)
const parsed = (ContentManifest.default ?? ContentManifest).parse(raw)

/** Steam symmetric decrypt, done properly. */
function steamDecrypt(ciphertext, key) {
  // 1. First 16 bytes = IV, encrypted with AES-256-ECB (no padding).
  const ivDec = createDecipheriv('aes-256-ecb', key, null)
  ivDec.setAutoPadding(false)
  const iv = Buffer.concat([ivDec.update(ciphertext.slice(0, 16)), ivDec.final()])

  // 2. Remainder = AES-256-CBC under that IV. Padding OFF so we can see it.
  const dec = createDecipheriv('aes-256-cbc', key, iv)
  dec.setAutoPadding(false)
  return Buffer.concat([dec.update(ciphertext.slice(16)), dec.final()])
}

console.log('\n=== filename decryption, padding NOT stripped ===\n')

for (const f of parsed.files.slice(0, 3)) {
  const cipher = Buffer.from(f.filename, 'base64')
  const plain = steamDecrypt(cipher, key)

  const lastByte = plain[plain.length - 1]
  const padOk =
    lastByte >= 1 &&
    lastByte <= 16 &&
    plain.slice(plain.length - lastByte).every((b) => b === lastByte)

  console.log(`  cipher ${cipher.length}B → plain ${plain.length}B`)
  console.log(`  full plaintext : ${JSON.stringify(plain.toString('latin1'))}`)
  console.log(`  last byte      : 0x${lastByte.toString(16).padStart(2, '0')} (${lastByte})`)
  console.log(`  valid PKCS#7?  : ${padOk ? 'YES' : 'NO'}`)
  if (padOk) {
    const unpadded = plain.slice(0, plain.length - lastByte).toString('utf8')
    console.log(`  ✓ TRUE FILENAME: ${JSON.stringify(unpadded)}  (len ${unpadded.length})`)
  }
  console.log()
}

client.logOff()
process.exit(0)
