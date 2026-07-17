#!/usr/bin/env node
// Spike 003 helper — inspect + snapshot WazHack's appmanifest so we can capture
// (a) what GameLib wrote (StateFlags=4 experiment) and (b) what Steam leaves it
// as after it reads the manifest (did Steam trust "4" or rewrite/re-verify?).
//
// Usage:
//   node inspect-acf.mjs <label> [path-to-appmanifest_264160.acf]
//   node inspect-acf.mjs after-gamelib
//   node inspect-acf.mjs after-steam-restart
//
// With no path it searches the default macOS Steam library. It prints the
// load-bearing fields and copies the .acf next to this script as
// snapshot-<label>.acf for the README's Results section.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const APPID = '264160' // WazHack
const label = process.argv[2]
if (!label) {
  console.error('usage: node inspect-acf.mjs <label> [path-to-acf]')
  process.exit(1)
}

const candidates = [
  process.argv[3],
  join(homedir(), 'Library/Application Support/Steam/steamapps', `appmanifest_${APPID}.acf`)
].filter(Boolean)

const acfPath = candidates.find((p) => existsSync(p))
if (!acfPath) {
  console.error(
    `Could not find appmanifest_${APPID}.acf. Pass the path explicitly:\n` +
      `  node inspect-acf.mjs ${label} "/path/to/steamapps/appmanifest_${APPID}.acf"`
  )
  process.exit(1)
}

const text = readFileSync(acfPath, 'utf8')
const field = (name) => {
  const m = text.match(new RegExp(`"${name}"\\s+"([^"]*)"`, 'i'))
  return m ? m[1] : '<absent>'
}

const fields = {
  StateFlags: field('StateFlags'),
  BytesToDownload: field('BytesToDownload'),
  BytesDownloaded: field('BytesDownloaded'),
  SizeOnDisk: field('SizeOnDisk'),
  buildid: field('buildid'),
  LastOwner: field('LastOwner'),
  installdir: field('installdir')
}

console.log(`\n[spike-003 :: ${label}]  ${acfPath}`)
for (const [k, v] of Object.entries(fields)) console.log(`  ${k.padEnd(16)} ${v}`)

const consistent = fields.BytesToDownload === fields.BytesDownloaded
const bytesNonZero = fields.BytesDownloaded !== '0'
console.log(
  `\n  StateFlags==4? ${fields.StateFlags === '4'}` +
    `   bytes consistent? ${consistent}` +
    `   bytes non-zero? ${bytesNonZero}` +
    `   buildid set? ${fields.buildid !== '0' && fields.buildid !== '<absent>'}`
)
if (fields.StateFlags === '4') {
  console.log('  → Steam is treating this as FullyInstalled (no verify pending).')
} else if (fields.StateFlags === '1026') {
  console.log('  → 1026: Steam will verify/repair (either GameLib wrote 1026, or Steam reset it).')
} else {
  console.log(`  → StateFlags="${fields.StateFlags}" — note what state Steam is showing.`)
}

const snapshot = join(dirname(fileURLToPath(import.meta.url)), `snapshot-${label}.acf`)
writeFileSync(snapshot, text)
console.log(`\n  snapshot saved: ${snapshot}\n`)
