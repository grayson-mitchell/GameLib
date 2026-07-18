/**
 * Spike 002 — go under steam-user and look at the actual bytes.
 *
 * lzma-native did NOT fix either failure, so the pure-JS LZMA fallback is not the
 * cause. Both the truncated filenames and the failing chunk decompression are
 * bugs in steam-user's CDN path itself. This dumps the raw decrypted bytes so we
 * can see exactly what is happening rather than inferring.
 */

import SteamCrypto from '@doctormckay/steam-crypto'
import { connectAuthenticated } from '../001-acf-adoption/auth.mjs'

const APP_ID = 264160
const DEPOT = 264162

const { client } = await connectAuthenticated()
const info = await client.getProductInfo([APP_ID], [], true)
const gid = info.apps[APP_ID].appinfo.depots[DEPOT].manifests.public.gid

const key = await new Promise((res, rej) =>
  client.getDepotDecryptionKey(APP_ID, DEPOT, (e, k) => (e ? rej(e) : res(k)))
)
console.log(`\ndepot key: ${key.toString('hex')} (${key.length} bytes)\n`)

// ── A. Filenames ────────────────────────────────────────────────────────────
// Re-fetch the manifest WITHOUT letting steam-user decrypt names, so we can do
// the decryption ourselves and inspect the plaintext byte-for-byte.
const raw = await new Promise((res, rej) =>
  client.getRawManifest(APP_ID, DEPOT, gid, 'public', (e, m) => (e ? rej(e) : res(m)))
)
const ContentManifest = (await import('steam-user/components/content_manifest.js')).default ??
  (await import('steam-user/components/content_manifest.js'))
const parsed = ContentManifest.parse(raw)

console.log('=== A. filename plaintext, straight from AES ===\n')
for (const f of parsed.files.slice(0, 4)) {
  const cipher = Buffer.from(f.filename, 'base64')
  const plain = SteamCrypto.symmetricDecrypt(cipher, key)

  const nulAt = plain.indexOf(0)
  const steamUserWay = plain.slice(0, nulAt).toString('utf8') // what steam-user does
  const correctWay = (nulAt === -1 ? plain : plain.slice(0, nulAt)).toString('utf8')

  console.log(`  cipher len   : ${cipher.length}`)
  console.log(`  plain len    : ${plain.length}   (indexOf(0) = ${nulAt})`)
  console.log(`  plain hex tail: ...${plain.slice(-8).toString('hex')}`)
  console.log(`  steam-user   : ${JSON.stringify(steamUserWay)}  (len ${steamUserWay.length})`)
  console.log(`  correct      : ${JSON.stringify(correctWay)}  (len ${correctWay.length})`)
  console.log()
}

// ── B. Chunk ────────────────────────────────────────────────────────────────
console.log('=== B. chunk: what does the decrypted payload actually look like? ===\n')

const servers = await client.getContentServers()
const server = servers[0]
console.log(`  content server: ${server.Host}`)

const file = parsed.files.find((f) => !(f.flags & 64) && f.chunks?.length)
const chunk = file.chunks[0]
const sha = Buffer.isBuffer(chunk.sha) ? chunk.sha.toString('hex') : chunk.sha

const url = `https://${server.Host}/depot/${DEPOT}/chunk/${sha}`
const res = await fetch(url)
console.log(`  GET ${url}`)
console.log(`  → ${res.status} ${res.statusText}, ${res.headers.get('content-length')} bytes`)

if (res.ok) {
  const encrypted = Buffer.from(await res.arrayBuffer())
  console.log(`  encrypted head: ${encrypted.slice(0, 16).toString('hex')}`)

  const decrypted = SteamCrypto.symmetricDecrypt(encrypted, key)
  const head = decrypted.slice(0, 4)
  console.log(`  decrypted len : ${decrypted.length}  (cb_compressed=${chunk.cb_compressed})`)
  console.log(`  decrypted head: ${head.toString('hex')}  ascii=${JSON.stringify(head.toString('latin1'))}`)
  console.log()
  if (head.slice(0, 2).toString('latin1') === 'VZ') {
    console.log('  → LZMA ("VZ") chunk')
  } else if (head.slice(0, 2).toString('latin1') === 'PK') {
    console.log('  → ZIP ("PK") chunk')
  } else {
    console.log('  → UNKNOWN container magic. This is why decompression blows up.')
  }
}

client.logOff()
process.exit(0)
