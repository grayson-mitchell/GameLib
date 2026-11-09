// Spike 046b: the wrap, prototyped outside GameLib. Mac Steam offline (steam://open/gooffline,
// 046a) -> wait for GameLib's own authenticated logon in gamelib.log -> Mac Steam online again.
// The operator triggers the GameLib logon (launch or Refresh) and then judges Friends.
// Usage: node wrap.mjs [settleMs=2000]
import { execFileSync } from 'node:child_process'
import { appendFileSync, openSync, readSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const STEAM_LOG = join(homedir(), 'Library/Application Support/Steam/logs/connection_log.txt')
const GL_LOG = join(homedir(), 'Library/Logs/GameLib/gamelib.log')
const RUN_LOG = join(HERE, 'run.log')
const settleMs = Number(process.argv[2] ?? 2000)
const t0 = Date.now()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function ev(cat, msg, data = {}) {
  const ts = new Date().toISOString()
  const line = `${ts} +${String(Date.now() - t0).padStart(7)}ms [${cat}] ${msg}${Object.keys(data).length ? ' ' + JSON.stringify(data) : ''}`
  console.error(line)
  appendFileSync(RUN_LOG, line + '\n')
}

// Tail that survives GameLib rotating/truncating gamelib.log at launch.
function tail(path) {
  let offset = statSync(path).size
  return () => {
    const size = statSync(path).size
    if (size < offset) offset = 0
    if (size === offset) return []
    const buf = Buffer.alloc(size - offset)
    const fd = openSync(path, 'r')
    readSync(fd, buf, 0, buf.length, offset)
    offset = size
    return buf.toString('utf8').split('\n').filter(Boolean)
  }
}

async function until(read, re, timeoutMs, label) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    for (const l of read()) {
      if (/Steam|LogOff|Logged|LogOn|logon/i.test(l)) ev('log', `${label}: ${l.trim().slice(0, 220)}`)
      if (re.test(l)) return { ok: true, ms: Date.now() - start, line: l.trim() }
    }
    await sleep(250)
  }
  return { ok: false, ms: Date.now() - start }
}

function steamPid() {
  try {
    const pid = execFileSync('/usr/bin/pgrep', ['-x', 'steam_osx']).toString().trim().split('\n')[0]
    return `${pid} ${execFileSync('/bin/ps', ['-o', 'lstart=', '-p', pid]).toString().trim()}`
  } catch {
    return null
  }
}

writeFileSync(RUN_LOG, '')
const pidBefore = steamPid()
ev('snapshot', 'steam_osx', { pid: pidBefore, settleMs })

const steam = tail(STEAM_LOG)
const gl = tail(GL_LOG)

ev('fire', 'open -g steam://open/gooffline')
execFileSync('/usr/bin/open', ['-g', 'steam://open/gooffline'])
const off = await until(steam, /LogOff\(\)|not auto reconnecting due to user initiated logoff/, 20000, 'steam')
if (!off.ok) {
  ev('verdict', 'ABORT: Mac Steam did not log off (game running? Steam signed out?). GameLib logon is NOT safe.')
  process.exit(2)
}
ev('state', `Mac Steam offline after ${off.ms} ms. >>> OPERATOR: trigger the GameLib logon now (launch GameLib or press Refresh). Waiting up to 5 min.`)

const logon = await until(gl, /SteamUser\.loggedOn|LogonSessionReplaced/, 300000, 'gamelib')
if (!logon.ok) {
  ev('timeout', 'no GameLib logon seen; bringing Mac Steam back online anyway')
} else {
  ev('hit', `GameLib logon seen ${logon.ms} ms after offline`, { line: logon.line })
  await sleep(settleMs)
}

ev('fire', 'open -g steam://open/goonline')
execFileSync('/usr/bin/open', ['-g', 'steam://open/goonline'])
const on = await until(steam, /RecvMsgClientLogOnResponse\(\) : processing complete/, 45000, 'steam')
ev(on.ok ? 'hit' : 'timeout', on.ok ? `Mac Steam logon complete ${on.ms} ms after goonline` : 'Mac Steam did not complete logon')

// Watch GameLib for 20 s more: does its session survive Mac Steam rejoining?
const after = await until(gl, /disconnected|relog|LogonSessionReplaced|loggedOn/i, 20000, 'gamelib-after')
ev('after', after.ok ? `GameLib session event after Mac Steam rejoined: ${after.line}` : 'no GameLib session event in 20 s after Mac Steam rejoined')

const pidAfter = steamPid()
ev('snapshot', 'steam_osx', { pid: pidAfter, samePid: pidAfter === pidBefore })
ev('verdict', `${logon.ok && on.ok ? 'WRAP_RAN' : 'WRAP_INCOMPLETE'}. >>> OPERATOR: is Friends signed in, and can you change your status?`)
process.exit(logon.ok && on.ok ? 0 : 1)
