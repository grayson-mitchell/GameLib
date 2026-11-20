#!/usr/bin/env node
'use strict'

/*
 * appimage_provenance.cjs -- read-only provenance check for quick 260929-v1v
 * (Phase 38 item 38-W05).
 *
 *   node appimage_provenance.cjs --appimage PATH [--sig PATH] [--latest PATH] [--rev REV]
 *
 * Prints KEY=VALUE lines. Exits 1 on any FAIL. A SKIP never counts as PASS.
 * Without --sig every signature key is SKIP. The latest.json checks only
 * corroborate: they print yes/no and never FAIL.
 * It only reads: the AppImage, the .sig, latest.json and `git show REV:...`.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')

function arg(name, dflt) {
  const i = process.argv.indexOf(name)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const appimage = arg('--appimage')
const sigPath = arg('--sig')
const latestPath = arg('--latest')
const rev = arg('--rev', '19b5e3a9e')
if (!appimage) {
  console.error('usage: --appimage PATH [--sig PATH] [--latest PATH] [--rev REV]')
  process.exit(2)
}

let failed = false
function out(k, v) {
  console.log(`${k}=${v}`)
}
function verdict(k, ok) {
  out(k, ok ? 'PASS' : 'FAIL')
  if (!ok) failed = true
}
function skip(k) {
  out(k, 'SKIP')
}

// ---- file identity ----------------------------------------------------------
const st = fs.statSync(appimage)
const h = crypto.createHash('sha256')
const b2 = crypto.createHash('blake2b512')
{
  const fd = fs.openSync(appimage, 'r')
  const buf = Buffer.allocUnsafe(1 << 20)
  let n
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
    h.update(buf.subarray(0, n))
    b2.update(buf.subarray(0, n))
  }
  fs.closeSync(fd)
}
const sha256 = h.digest('hex')
const blake = b2.digest()
out('APPIMAGE_NAME', path.basename(appimage))
out('APPIMAGE_SIZE', st.size)
out('APPIMAGE_SHA256', sha256)
out('APPIMAGE_MTIME', st.mtime.toISOString())

// ---- magic ------------------------------------------------------------------
const head = Buffer.alloc(16)
{
  const fd = fs.openSync(appimage, 'r')
  fs.readSync(fd, head, 0, 16, 0)
  fs.closeSync(fd)
}
verdict('ELF_MAGIC', head.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])))
verdict('APPIMAGE_TYPE2_MAGIC', head.subarray(8, 11).equals(Buffer.from([0x41, 0x49, 0x02])))

// ---- public key -------------------------------------------------------------
const conf = JSON.parse(
  execFileSync('git', ['show', `${rev}:src-tauri/tauri.conf.json`], { encoding: 'utf8' })
)
const pubkeyB64 = conf.plugins.updater.pubkey
const pubText = Buffer.from(pubkeyB64, 'base64').toString('utf8')
const pubLines = pubText.split('\n')
const pubRaw = Buffer.from(pubLines[1].trim(), 'base64')
const pubAlg = pubRaw.subarray(0, 2).toString('latin1')
const pubKeyId = pubRaw.subarray(2, 10)
const pubKey = pubRaw.subarray(10, 42)
out('PUBKEY_KEYID', pubKeyId.reverse().toString('hex').toUpperCase())
pubKeyId.reverse() // restore raw byte order after the display reversal
out('PUBKEY_ALG', pubAlg)
out('PUBKEY_COMMENT_KEYID', (pubLines[0].match(/public key:\s*([0-9A-Fa-f]+)/) || [])[1] || '')
try {
  const headConf = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8')
  )
  out('PUBKEY_SAME_AT_HEAD', headConf.plugins.updater.pubkey === pubkeyB64 ? 'yes' : 'no')
} catch (e) {
  out('PUBKEY_SAME_AT_HEAD', 'unknown')
}

const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex')
const keyObj = crypto.createPublicKey({
  key: Buffer.concat([spkiPrefix, pubKey]),
  format: 'der',
  type: 'spki'
})

// ---- signature --------------------------------------------------------------
let sigContentTrim = null
if (!sigPath) {
  for (const k of [
    'SIG_KEYID_MATCH',
    'SIGNATURE_VERIFY',
    'NEGATIVE_CONTROL',
    'GLOBAL_SIGNATURE_VERIFY',
    'TRUSTED_COMMENT',
    'SIGNED_AT',
    'SIGNED_FILE',
    'SIGNED_IN_RUN_WINDOW'
  ])
    skip(k)
} else {
  sigContentTrim = fs.readFileSync(sigPath, 'utf8').trim()
  const sigText = Buffer.from(sigContentTrim, 'base64').toString('utf8')
  const L = sigText.split('\n')
  const raw = Buffer.from(L[1].trim(), 'base64')
  const alg = raw.subarray(0, 2).toString('latin1')
  const keyId = raw.subarray(2, 10)
  const sig = raw.subarray(10, 74)
  const trusted = (L[2] || '').replace(/^trusted comment: ?/, '')
  const globalSig = Buffer.from((L[3] || '').trim(), 'base64')
  out('SIG_ALG', alg)
  verdict('SIG_KEYID_MATCH', keyId.equals(pubKeyId))

  function verifyOver(prehashed, appended) {
    let msg
    if (alg === 'ED') {
      if (!appended) msg = blake
      else {
        const hh = crypto.createHash('blake2b512')
        const fd = fs.openSync(appimage, 'r')
        const buf = Buffer.allocUnsafe(1 << 20)
        let n
        while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hh.update(buf.subarray(0, n))
        fs.closeSync(fd)
        hh.update(Buffer.from([0]))
        msg = hh.digest()
      }
    } else {
      const whole = fs.readFileSync(appimage)
      msg = appended ? Buffer.concat([whole, Buffer.from([0])]) : whole
    }
    return crypto.verify(null, msg, keyObj, sig)
  }
  const good = verifyOver(alg === 'ED', false)
  verdict('SIGNATURE_VERIFY', good)
  const neg = verifyOver(alg === 'ED', true)
  verdict('NEGATIVE_CONTROL', neg === false)
  verdict(
    'GLOBAL_SIGNATURE_VERIFY',
    crypto.verify(null, Buffer.concat([sig, Buffer.from(trusted, 'utf8')]), keyObj, globalSig)
  )
  out('TRUSTED_COMMENT', trusted)
  const ts = (trusted.match(/timestamp:(\d+)/) || [])[1]
  const signedAt = ts ? new Date(Number(ts) * 1000) : null
  out('SIGNED_AT', signedAt ? signedAt.toISOString() : '')
  out('SIGNED_FILE', (trusted.match(/file:(\S+)/) || [])[1] || '')
  const lo = Date.parse('2026-09-24T01:15:00Z')
  const hi = Date.parse('2026-09-24T01:45:00Z')
  out('SIGNED_IN_RUN_WINDOW', signedAt && signedAt >= lo && signedAt <= hi ? 'yes' : 'no')
}

// ---- latest.json ------------------------------------------------------------
if (!latestPath) {
  for (const k of [
    'LATEST_VERSION',
    'LATEST_PUB_DATE',
    'LATEST_PUB_DATE_MATCHES_RUN',
    'LATEST_LINUX_SIG_EQUALS_SIG_FILE',
    'LATEST_LINUX_URL_BASENAME'
  ])
    skip(k)
} else {
  const lj = JSON.parse(fs.readFileSync(latestPath, 'utf8'))
  out('LATEST_VERSION', lj.version)
  out('LATEST_PUB_DATE', lj.pub_date)
  out(
    'LATEST_PUB_DATE_MATCHES_RUN',
    new Date(lj.pub_date).getTime() === Date.parse('2026-09-24T01:33:50.127Z') ? 'yes' : 'no'
  )
  const p1 = lj.platforms && lj.platforms['linux-x86_64']
  const p2 = lj.platforms && lj.platforms['linux-x86_64-appimage']
  if (sigContentTrim === null) skip('LATEST_LINUX_SIG_EQUALS_SIG_FILE')
  else
    out(
      'LATEST_LINUX_SIG_EQUALS_SIG_FILE',
      p1 && p2 && p1.signature.trim() === sigContentTrim && p2.signature.trim() === sigContentTrim
        ? 'yes'
        : 'no'
    )
  out('LATEST_LINUX_URL_BASENAME', p1 ? path.basename(new URL(p1.url).pathname) : '')
}

process.exit(failed ? 1 : 0)
