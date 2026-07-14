/**
 * Spike 002 — fetch and decompress ONE chunk by hand.
 *
 * The filename bug turned out to be steam-user mangling correctly-decrypted data.
 * Question: is the chunk failure the same shape (data is fine, steam-user's
 * handling is broken) or is it a genuine protocol/format problem?
 *
 * Steam chunk format: AES-encrypted (depot key) → decrypt → a container that is
 * either "VZ" (LZMA) or "PK" (zip).
 */

import { createDecipheriv } from 'node:crypto'
import { createHash } from 'node:crypto'
import zlib from 'node:zlib'
import { connectAuthenticated } from '../001-acf-adoption/auth.mjs'

const APP_ID = 264160
const DEPOT = 264162

const { client } = await connectAuthenticated()
const info = await client.getProductInfo([APP_ID], [], true)
const gid = info.apps[APP_ID].appinfo.depots[DEPOT].manifests.public.gid
const key = await new Promise((res, rej) =>
  client.getDepotDecryptionKey(APP_ID, DEPOT, (e, k) => (e ? rej(e) : res(k)))
)

function steamDecrypt(ciphertext, key) {
  const ivDec = createDecipheriv('aes-256-ecb', key, null)
  ivDec.setAutoPadding(false)
  const iv = Buffer.concat([ivDec.update(ciphertext.slice(0, 16)), ivDec.final()])
  const dec = createDecipheriv('aes-256-cbc', key, iv)
  dec.setAutoPadding(false)
  const plain = Buffer.concat([dec.update(ciphertext.slice(16)), dec.final()])
  const pad = plain[plain.length - 1]
  const padOk =
    pad >= 1 && pad <= 16 && plain.slice(plain.length - pad).every((b) => b === pad)
  return padOk ? plain.slice(0, plain.length - pad) : plain
}

const ContentManifest = await import('steam-user/components/content_manifest.js')
const raw = await new Promise((res, rej) =>
  client.getRawManifest(APP_ID, DEPOT, gid, 'public', (e, m) => (e ? rej(e) : res(m)))
)
const parsed = (ContentManifest.default ?? ContentManifest).parse(raw)

const file = parsed.files.find((f) => !(f.flags & 64) && f.chunks?.length === 1)
const chunk = file.chunks[0]
const sha = Buffer.isBuffer(chunk.sha) ? chunk.sha.toString('hex') : chunk.sha

// Content servers — callback-based, and the entry shape is not documented.
const servers = await new Promise((res, rej) =>
  client.getContentServers((e, s) => (e ? rej(e) : res(s)))
)
console.log(`\n${servers.length} content servers; first entry:`)
console.log(' ', JSON.stringify(servers[0]))

const host = servers[0].host ?? servers[0].Host ?? servers[0].vhost
const url = `https://${host}/depot/${DEPOT}/chunk/${sha}`
console.log(`\nGET ${url}`)
const res = await fetch(url)
console.log(`→ ${res.status} ${res.statusText}  ${res.headers.get('content-length')} bytes\n`)
if (!res.ok) {
  console.log('✗ CDN rejected the request.')
  client.logOff()
  process.exit(1)
}

const encrypted = Buffer.from(await res.arrayBuffer())
const decrypted = steamDecrypt(encrypted, key)
const magic = decrypted.slice(0, 2).toString('latin1')

console.log(`encrypted : ${encrypted.length} B`)
console.log(`decrypted : ${decrypted.length} B   (cb_compressed=${chunk.cb_compressed})`)
console.log(`magic     : ${JSON.stringify(magic)}  hex=${decrypted.slice(0, 4).toString('hex')}\n`)

let data = null
if (magic === 'VZ') {
  console.log('→ LZMA ("VZ") container')
  // Steam VZ layout (SteamKit VZipUtil):
  //   header : 'VZ'(2) | version 'a'(1) | timestamp/crc(4) | lzma props(5)  = 12 B
  //   body   : raw LZMA stream
  //   footer : outputCrc(4) | outputSize(4) | 'zv'(2)                        = 10 B
  // NOTE outputSize is at len-6, NOT len-4 — the trailing 'zv' magic is 2 bytes.
  const props = decrypted.slice(7, 12)
  const payload = decrypted.slice(12, decrypted.length - 10)
  const outSize = decrypted.readUInt32LE(decrypted.length - 6)
  const footerMagic = decrypted.slice(decrypted.length - 2).toString('latin1')
  console.log(`  footer magic        : ${JSON.stringify(footerMagic)} ${footerMagic === 'zv' ? '✓' : '✗'}`)
  console.log(`  declared output size: ${outSize}  (cb_original=${chunk.cb_original})`)

  const lzma = await import('lzma-native')
  // Rebuild a standard .lzma_alone header: props(5) + uncompressed size(8 LE)
  const header = Buffer.concat([
    props,
    (() => {
      const b = Buffer.alloc(8)
      b.writeUInt32LE(outSize, 0)
      return b
    })()
  ])
  data = await new Promise((resolve, reject) =>
    lzma.default.decompress(Buffer.concat([header, payload]), (result, err) =>
      err ? reject(err) : resolve(Buffer.from(result))
    )
  )
} else if (magic === 'PK') {
  console.log('→ ZIP ("PK") container')
  data = zlib.inflateRawSync(decrypted.slice(decrypted.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04])) + 30))
} else {
  console.log('→ UNKNOWN container. Decryption may be wrong.')
  console.log(`  first 32 bytes: ${decrypted.slice(0, 32).toString('hex')}`)
}

if (data) {
  const hash = createHash('sha1').update(data).digest('hex')
  console.log(`\n  decompressed : ${data.length} B  (expected ${chunk.cb_original})`)
  console.log(`  sha1         : ${hash}`)
  console.log(`  expected sha : ${sha}`)
  console.log(
    `\n  ${hash === sha && data.length === Number(chunk.cb_original) ? '✓ CHUNK VERIFIED — we can download chunks ourselves.' : '✗ mismatch'}`
  )
}

client.logOff()
process.exit(0)
