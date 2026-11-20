#!/usr/bin/env node
// nile v1.2.0 token-store codec (nile/utils/config.py, ConfigType.JSONENC).
//   key   = sha256(user_id)                      (32 bytes -> AES-256)
//   file  = ECB(key).encrypt(iv) || CBC(key, iv).encrypt(pad(json))
// Usage:
//   node nileEnc.cjs keys   <dir>                 -> dotted KEY NAMES of the decrypted store (never values)
//   node nileEnc.cjs induce <dir> <garbage|flip>  -> rewrite the .enc in <dir> with an invalid refresh token
//                                                   and token_obtain_time=1; prints which keys changed
// <dir> is the nile config dir holding current_user.json and <md5(uid)>.enc.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

function load(dir) {
  const cu = JSON.parse(fs.readFileSync(path.join(dir, 'current_user.json'), 'utf8'))
  const uid = Buffer.from(cu.user_id, 'utf8')
  const store = crypto.createHash('md5').update(uid).digest('hex')
  const key = crypto.createHash('sha256').update(uid).digest()
  const file = path.join(dir, `${store}.enc`)
  return { file, key }
}

function decrypt(file, key) {
  const buf = fs.readFileSync(file)
  const ecb = crypto.createDecipheriv('aes-256-ecb', key, null)
  ecb.setAutoPadding(false)
  const iv = Buffer.concat([ecb.update(buf.subarray(0, 16)), ecb.final()])
  const cbc = crypto.createDecipheriv('aes-256-cbc', key, iv)
  const plain = Buffer.concat([cbc.update(buf.subarray(16)), cbc.final()])
  return JSON.parse(plain.toString('utf8'))
}

function encrypt(file, key, obj) {
  const iv = crypto.randomBytes(16)
  const cbc = crypto.createCipheriv('aes-256-cbc', key, iv)
  const body = Buffer.concat([cbc.update(Buffer.from(JSON.stringify(obj), 'utf8')), cbc.final()])
  const ecb = crypto.createCipheriv('aes-256-ecb', key, null)
  ecb.setAutoPadding(false)
  const encIv = Buffer.concat([ecb.update(iv), ecb.final()])
  fs.writeFileSync(file, Buffer.concat([encIv, body]))
}

function keyNames(o, p, out) {
  for (const k of Object.keys(o)) {
    const q = p ? `${p}.${k}` : k
    out.push(q)
    if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) keyNames(o[k], q, out)
  }
  return out
}

const [cmd, dir, shape] = process.argv.slice(2)
if (!cmd || !dir) {
  console.error('usage: nileEnc.cjs keys|induce <dir> [garbage|flip]')
  process.exit(2)
}
const { file, key } = load(dir)
const data = decrypt(file, key)

if (cmd === 'keys') {
  console.log(`store=${path.basename(file)} bytes=${fs.statSync(file).size}`)
  for (const k of keyNames(data, '', [])) console.log(k)
  const t = data?.NILE?.token_obtain_time
  const e = data?.tokens?.bearer?.expires_in
  console.log(`NILE.token_obtain_time is ${typeof t}; tokens.bearer.expires_in is ${typeof e}`)
  process.exit(0)
}

if (cmd === 'induce') {
  const changed = []
  const bearer = data.tokens.bearer
  if (shape === 'flip') {
    const s = bearer.refresh_token
    const i = Math.floor(s.length / 2)
    const c = s[i] === 'A' ? 'B' : 'A'
    bearer.refresh_token = s.slice(0, i) + c + s.slice(i + 1)
    changed.push(`tokens.bearer.refresh_token (one character altered at index ${i} of ${s.length})`)
  } else {
    bearer.refresh_token = 'gate-invalid'
    changed.push('tokens.bearer.refresh_token (set to the literal gate-invalid)')
  }
  data.NILE.token_obtain_time = 1
  changed.push('NILE.token_obtain_time (set to 1)')
  encrypt(file, key, data)
  const back = decrypt(file, key)
  if (back.NILE.token_obtain_time !== 1 || back.tokens.bearer.refresh_token !== bearer.refresh_token) {
    console.error('round-trip verification FAILED')
    process.exit(1)
  }
  console.log(`rewrote ${path.basename(file)}; changed: ${changed.join('; ')}; round-trip ok`)
  process.exit(0)
}
console.error(`unknown command ${cmd}`)
process.exit(2)
