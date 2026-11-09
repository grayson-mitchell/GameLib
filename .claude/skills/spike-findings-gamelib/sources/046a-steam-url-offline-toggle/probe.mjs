// Spike 046a: does steam://open/gooffline / steam://open/goonline toggle Mac Steam's offline
// mode with no dialog and no restart? Oracle: Mac Steam's own connection_log.txt, read from a
// byte offset taken just before each URL fires, plus steam_osx PID + start time.
// Usage: node probe.mjs [--offline-only | --online-only]
import { execFileSync } from 'node:child_process'
import { appendFileSync, openSync, readSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const LOG = join(homedir(), 'Library/Application Support/Steam/logs/connection_log.txt')
const RUN_LOG = join(HERE, 'run.log')
const mode = process.argv[2] ?? 'both'
const t0 = Date.now()
const events = []

function ev(cat, msg, data = {}) {
  const e = { ts: new Date().toISOString(), ms: Date.now() - t0, cat, msg, ...data }
  events.push(e)
  const line = `${e.ts} +${String(e.ms).padStart(6)}ms [${cat}] ${msg}${Object.keys(data).length ? ' ' + JSON.stringify(data) : ''}`
  console.error(line)
  appendFileSync(RUN_LOG, line + '\n')
}

function steamProc() {
  try {
    const pid = execFileSync('/usr/bin/pgrep', ['-x', 'steam_osx']).toString().trim().split('\n')[0]
    const lstart = execFileSync('/bin/ps', ['-o', 'lstart=', '-p', pid]).toString().trim()
    return { pid, lstart }
  } catch {
    return { pid: null, lstart: null }
  }
}

function readFrom(offset) {
  const size = statSync(LOG).size
  if (size <= offset) return { text: '', size }
  const buf = Buffer.alloc(size - offset)
  const fd = openSync(LOG, 'r')
  readSync(fd, buf, 0, buf.length, offset)
  return { text: buf.toString('utf8'), size }
}

const lastState = (text) => {
  const m = [...text.matchAll(/\] \[([A-Za-z ]+), \d+, \d+\]/g)]
  return m.length ? m[m.length - 1][1] : null
}

async function fireAndWatch(url, doneRe, timeoutMs) {
  const offset = statSync(LOG).size
  ev('fire', `open -g ${url}`, { logOffset: offset })
  execFileSync('/usr/bin/open', ['-g', url])
  const start = Date.now()
  let seen = ''
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 250))
    seen = readFrom(offset).text
    const hit = seen.split('\n').find((l) => doneRe.test(l))
    if (hit) {
      ev('hit', `matched after ${Date.now() - start} ms`, { line: hit.trim() })
      await new Promise((r) => setTimeout(r, 1500))
      seen = readFrom(offset).text
      return { ok: true, latencyMs: Date.now() - start - 1500, lines: seen.trim().split('\n'), state: lastState(seen) }
    }
  }
  ev('timeout', `no match for ${doneRe} within ${timeoutMs} ms`, { newLines: seen.trim().split('\n').filter(Boolean).length })
  return { ok: false, lines: seen.trim().split('\n').filter(Boolean), state: lastState(seen) }
}

writeFileSync(RUN_LOG, '')
const before = steamProc()
ev('snapshot', 'steam_osx before', before)
const result = { mode, before }

if (mode !== '--online-only') {
  result.offline = await fireAndWatch('steam://open/gooffline', /LogOff|Logged Off|logoff/i, 20000)
  for (const l of result.offline.lines) ev('log', l)
  if (!result.offline.ok) {
    ev('verdict', 'gooffline produced no LogOff: dialog, no-op, or unknown verb; NOT firing goonline')
    console.log(JSON.stringify({ ...result, verdict: 'OFFLINE_NOT_REACHED' }, null, 2))
    process.exit(2)
  }
  if (mode === 'both') await new Promise((r) => setTimeout(r, 5000))
}

if (mode !== '--offline-only') {
  result.online = await fireAndWatch('steam://open/goonline', /RecvMsgClientLogOnResponse\(\) : processing complete/, 45000)
  for (const l of result.online.lines) ev('log', l)
}

result.after = steamProc()
result.samePid = before.pid === result.after.pid && before.lstart === result.after.lstart
ev('snapshot', 'steam_osx after', { ...result.after, samePid: result.samePid })
const ok = (result.offline?.ok ?? true) && (result.online?.ok ?? true) && result.samePid
result.verdict = ok ? 'TOGGLED' : 'FAILED'
ev('verdict', result.verdict)
console.log(JSON.stringify({ ...result, offline: result.offline && { ...result.offline, lines: result.offline.lines.length }, online: result.online && { ...result.online, lines: result.online.lines.length } }, null, 2))
process.exit(ok ? 0 : 1)
