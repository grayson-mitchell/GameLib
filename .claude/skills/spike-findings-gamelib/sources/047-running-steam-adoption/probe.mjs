#!/usr/bin/env node
/**
 * Spike 047 — does a RUNNING Mac Steam adopt a GameLib-written appmanifest?
 *
 *   node probe.mjs snapshot <appId>                 # ACF + install dir + Steam pid, no side effects
 *   node probe.mjs watch    <appId> <secs> [label]  # passive: record content_log lines only
 *   node probe.mjs fire     <appId> <url> <secs> [label]
 *                                                   # snapshot, `open -g <url>`, watch, snapshot
 *   node probe.mjs setflags <appId> <flags>         # rewrite StateFlags in the ACF (only that line)
 *
 * Each run appends ISO-timestamped events to run.log and writes a JSON record to
 * runs/<label>.json. Oracles: content_log.txt (Steam's own state machine), the ACF on disk
 * (mtime + StateFlags + Bytes*), the install dir byte total, and the steam_osx PID (a restart
 * would invalidate the "without restart" claim).
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STEAM = path.join(process.env.HOME, 'Library/Application Support/Steam')
const CONTENT_LOG = path.join(STEAM, 'logs/content_log.txt')
const RUN_LOG = path.join(HERE, 'run.log')

const log = (cat, msg, data) => {
  const line = `${new Date().toISOString()} [${cat}] ${msg}${data === undefined ? '' : ' ' + JSON.stringify(data)}`
  console.error(line)
  fs.appendFileSync(RUN_LOG, line + '\n')
}

const acfPath = (appId) => path.join(STEAM, 'steamapps', `appmanifest_${appId}.acf`)

function readAcf(appId) {
  const p = acfPath(appId)
  if (!fs.existsSync(p)) return { present: false }
  const text = fs.readFileSync(p, 'utf8')
  // Strings only — never @node-steam/vdf on 64-bit fields (spike 001).
  const field = (k) => text.match(new RegExp(`"${k}"\\s+"([^"]*)"`))?.[1]
  return {
    present: true,
    mtime: fs.statSync(p).mtime.toISOString(),
    StateFlags: field('StateFlags'),
    buildid: field('buildid'),
    installdir: field('installdir'),
    SizeOnDisk: field('SizeOnDisk'),
    BytesToDownload: field('BytesToDownload'),
    BytesDownloaded: field('BytesDownloaded'),
    BytesToStage: field('BytesToStage'),
    BytesStaged: field('BytesStaged'),
    LastUpdated: field('LastUpdated'),
    sha: execFileSync('shasum', ['-a', '256', p]).toString().split(' ')[0]
  }
}

function dirBytes(dir) {
  if (!fs.existsSync(dir)) return null
  let total = 0
  let files = 0
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) walk(p)
      else {
        total += fs.statSync(p).size
        files++
      }
    }
  }
  walk(dir)
  return { bytes: total, files }
}

function steamPid() {
  try {
    return execFileSync('pgrep', ['-f', 'Steam.AppBundle/Steam/Contents/MacOS/steam_osx'])
      .toString()
      .trim()
  } catch {
    return null
  }
}

function snapshot(appId) {
  const acf = readAcf(appId)
  const dir = acf.installdir ? path.join(STEAM, 'steamapps/common', acf.installdir) : null
  return {
    at: new Date().toISOString(),
    steamPid: steamPid(),
    acf,
    install: dir ? dirBytes(dir) : null,
    contentLogSize: fs.statSync(CONTENT_LOG).size
  }
}

function contentLogSince(offset, appId) {
  const buf = fs.readFileSync(CONTENT_LOG)
  const tail = buf.subarray(Math.min(offset, buf.length)).toString('utf8')
  const lines = tail.split('\n').filter(Boolean)
  return {
    all: lines,
    app: lines.filter((l) => l.includes(String(appId)))
  }
}

async function watch(appId, secs, offset) {
  const start = Date.now()
  let seen = 0
  let lastAcf = readAcf(appId).sha
  while (Date.now() - start < secs * 1000) {
    await new Promise((r) => setTimeout(r, 1000))
    const { all } = contentLogSince(offset, appId)
    for (const l of all.slice(seen)) log('content_log', l)
    seen = all.length
    const now = readAcf(appId)
    if (now.sha !== lastAcf) {
      log('acf', 'changed', now)
      lastAcf = now.sha
    }
  }
  return contentLogSince(offset, appId)
}

function save(label, record) {
  const dir = path.join(HERE, 'runs')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${label}.json`), JSON.stringify(record, null, 2) + '\n')
  log('save', `runs/${label}.json`)
}

const [cmd, appId, ...rest] = process.argv.slice(2)
if (!cmd || !appId) {
  console.error('usage: see header')
  process.exit(2)
}

if (cmd === 'snapshot') {
  const s = snapshot(appId)
  console.log(JSON.stringify(s, null, 2))
} else if (cmd === 'watch' || cmd === 'fire') {
  const url = cmd === 'fire' ? rest.shift() : null
  const secs = Number(rest.shift() ?? 60)
  const label = rest.shift() ?? `${cmd}-${appId}-${Date.now()}`
  const before = snapshot(appId)
  log('run', `${cmd} ${label}`, { url, secs, before })
  if (url) {
    execFileSync('open', ['-g', url])
    log('fire', url)
  }
  const lines = await watch(appId, secs, before.contentLogSize)
  const after = snapshot(appId)
  const record = {
    label,
    cmd,
    url,
    secs,
    before,
    after,
    contentLogApp: lines.app,
    contentLogAll: lines.all,
    steamRestarted: before.steamPid !== after.steamPid
  }
  log('run', `done ${label}`, {
    appLines: lines.app.length,
    acfChanged: before.acf.sha !== after.acf.sha,
    installBytes: [before.install?.bytes, after.install?.bytes],
    steamRestarted: record.steamRestarted
  })
  save(label, record)
} else if (cmd === 'setflags') {
  const flags = rest[0]
  const p = acfPath(appId)
  const text = fs.readFileSync(p, 'utf8')
  const next = text.replace(/("StateFlags"\s+")[^"]*(")/, `$1${flags}$2`)
  if (next === text) throw new Error('StateFlags line not found or unchanged')
  fs.writeFileSync(p, next)
  log('setflags', `${appId} -> ${flags}`, readAcf(appId))
} else {
  console.error(`unknown command ${cmd}`)
  process.exit(2)
}
