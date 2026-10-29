#!/usr/bin/env node
/**
 * Spike 050 — which on-disk source gives a smooth percent and a stable speed while native Mac
 * Steam performs a download? Harness shape follows 047/048 (strings-only ACF reads, content_log
 * offset tailing, run.log + runs/<label>.*).
 *
 *   node probe.mjs snapshot <appId>
 *   node probe.mjs sample   <appId> <maxSecs> <label> [url]
 *       # 1 s samples of all sources; optional `open -g <url>` first (steam://install needs the
 *       # operator to click Install in Steam's dialog — 047-049 correction). Stops 5 s after
 *       # `scheduler finished` or at maxSecs. Writes runs/<label>.jsonl.
 *   node probe.mjs analyze  <label>   # runs/<label>.summary.json + runs/<label>.html
 *
 * Sources sampled each second:
 *   A. ACF BytesDownloaded/BytesToDownload (+ BytesStaged/BytesToStage) — what GameLib reads today
 *   B. steamapps/downloading/<appId>/ byte total, BOTH apparent size (st_size) and allocated
 *      bytes (st_blocks*512): if Steam preallocates, size jumps but blocks may not (or both jump)
 *   C. steamapps/common/<installdir>/ the same two totals (in case Steam writes in place)
 *   D. content_log.txt new lines: `Current download rate`, `App update changed`, `update started`
 */
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STEAM = path.join(process.env.HOME, 'Library/Application Support/Steam')
const CONTENT_LOG = path.join(STEAM, 'logs/content_log.txt')
const RUN_LOG = path.join(HERE, 'run.log')
const RUNS = path.join(HERE, 'runs')

const log = (cat, msg, data) => {
  const line = `${new Date().toISOString()} [${cat}] ${msg}${data === undefined ? '' : ' ' + JSON.stringify(data)}`
  console.error(line)
  fs.appendFileSync(RUN_LOG, line + '\n')
}

const acfPath = (appId) =>
  path.join(STEAM, 'steamapps', `appmanifest_${appId}.acf`)

function readAcf(appId) {
  const p = acfPath(appId)
  let text
  let mtime
  try {
    text = fs.readFileSync(p, 'utf8')
    mtime = fs.statSync(p).mtimeMs
  } catch {
    return { present: false }
  }
  // Strings only — never @node-steam/vdf on 64-bit fields (spike 001).
  const field = (k) => text.match(new RegExp(`"${k}"\\s+"([^"]*)"`))?.[1]
  const num = (k) => (field(k) === undefined ? null : Number(field(k)))
  return {
    present: true,
    mtimeMs: mtime,
    StateFlags: field('StateFlags'),
    buildid: field('buildid'),
    installdir: field('installdir'),
    BytesToDownload: num('BytesToDownload'),
    BytesDownloaded: num('BytesDownloaded'),
    BytesToStage: num('BytesToStage'),
    BytesStaged: num('BytesStaged')
  }
}

function dirBytes(dir) {
  const t0 = performance.now()
  if (!fs.existsSync(dir)) return null
  let size = 0
  let alloc = 0
  let files = 0
  const walk = (d) => {
    let entries
    try {
      entries = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return // Steam can remove a directory mid-walk at commit
    }
    for (const e of entries) {
      const p = path.join(d, e.name)
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) walk(p)
      else {
        try {
          const st = fs.lstatSync(p)
          size += st.size
          alloc += st.blocks * 512
          files++
        } catch {}
      }
    }
  }
  walk(dir)
  return { size, alloc, files, walkMs: +(performance.now() - t0).toFixed(1) }
}

function steamPid() {
  try {
    // -x on the process name: -f also matches Steam Helper, whose argv carries the steam_osx path.
    return execFileSync('pgrep', ['-x', 'steam_osx'])
      .toString()
      .trim()
      .split('\n')[0]
  } catch {
    return null
  }
}

/**
 * E. nettop per-flow bytes_in for steam_osx. nettop's per-process total only covers flows still
 * open (2.8 GB downloaded, 207 KB reported afterwards), so accumulate each flow's positive
 * deltas instead. Loopback flows (CEF <-> client IPC) are excluded.
 */
function startNettop(pid) {
  const state = { cum: 0, flows: new Map(), blocks: 0, child: null }
  if (!pid) return state
  // nettop block-buffers when stdout is a pipe (0 rows in 4 s); `script` gives it a pty.
  const child = spawn(
    'script',
    [
      '-q',
      '/dev/null',
      'nettop',
      '-x',
      '-n',
      '-L',
      '0',
      '-s',
      '1',
      '-J',
      'bytes_in',
      '-p',
      pid
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] }
  )
  state.child = child
  let buf = ''
  child.stdout.on('data', (d) => {
    buf += d.toString()
    const rows = buf.split('\n')
    buf = rows.pop()
    for (const r of rows) {
      if (r.startsWith(',bytes_in')) {
        state.blocks++
        continue
      }
      const m = r.match(/^(tcp|udp)\S*\s+(\S+),(\d*),/)
      if (!m || m[2].includes('127.0.0.1') || !m[3]) continue
      const v = Number(m[3])
      const prev = state.flows.get(m[2]) ?? 0
      // First block is a baseline: flows already open carry bytes from before the run.
      if (state.blocks > 1 && v > prev) state.cum += v - prev
      state.flows.set(m[2], v)
    }
  })
  child.unref()
  return state
}

function parseLine(l) {
  l = l.replace(/\r$/, '') // content_log is CRLF; `.` never matches \r, so `(.*)$` would fail
  const ts = l.match(/^\[([^\]]+)\]/)?.[1]
  let m
  if ((m = l.match(/Current download rate: ([\d.]+) Mbps/)))
    return { ts, kind: 'rate', mbps: +m[1] }
  if ((m = l.match(/AppID (\d+) App update changed : (.*)$/)))
    return { ts, kind: 'phase', appId: m[1], phase: m[2].replace(/,$/, '') }
  if ((m = l.match(/AppID (\d+) state changed : (.*)$/)))
    return { ts, kind: 'state', appId: m[1], state: m[2].replace(/,$/, '') }
  if (
    (m = l.match(
      /AppID (\d+) update (started|changed|finished|canceled)[^:]*: (.*)$/
    ))
  )
    return { ts, kind: 'update', appId: m[1], verb: m[2], detail: m[3].trim() }
  if ((m = l.match(/Downloading (\d+) chunks for depot (\d+)/)))
    return { ts, kind: 'chunks', n: +m[1], depot: m[2] }
  return { ts, kind: 'other' }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function sample(appId, maxSecs, label, url) {
  fs.mkdirSync(RUNS, { recursive: true })
  const out = path.join(RUNS, `${label}.jsonl`)
  fs.writeFileSync(out, '')
  const write = (rec) => fs.appendFileSync(out, JSON.stringify(rec) + '\n')

  let offset = fs.statSync(CONTENT_LOG).size
  let carry = ''
  const pid0 = steamPid()
  const net = startNettop(pid0)
  const acf0 = readAcf(appId)
  write({
    kind: 'meta',
    appId,
    label,
    url,
    maxSecs,
    startIso: new Date().toISOString(),
    steamPid: pid0,
    acf0
  })
  log('run', `sample ${label}`, { appId, url, maxSecs, steamPid: pid0, acf0 })
  if (url) {
    execFileSync('open', ['-g', url])
    log('fire', url)
  }

  const t0 = Date.now()
  let finishedAt = null
  let installdir = acf0.installdir
  for (let i = 0; ; i++) {
    // Drift-corrected 1 s cadence.
    const due = t0 + i * 1000
    if (due > Date.now()) await sleep(due - Date.now())
    const t = Date.now() - t0

    const acf = readAcf(appId)
    if (acf.installdir) installdir = acf.installdir
    const staging = dirBytes(
      path.join(STEAM, 'steamapps/downloading', String(appId))
    )
    const install = installdir
      ? dirBytes(path.join(STEAM, 'steamapps/common', installdir))
      : null

    // content_log: read only new bytes, keep partial last line for the next tick.
    const lines = []
    try {
      const size = fs.statSync(CONTENT_LOG).size
      if (size < offset) offset = 0 // rotated
      if (size > offset) {
        const fd = fs.openSync(CONTENT_LOG, 'r')
        const buf = Buffer.alloc(size - offset)
        fs.readSync(fd, buf, 0, buf.length, offset)
        fs.closeSync(fd)
        offset = size
        const parts = (carry + buf.toString('utf8')).split('\n')
        carry = parts.pop()
        for (const l of parts.filter(Boolean))
          lines.push({ raw: l, ...parseLine(l) })
      }
    } catch {}

    const nettop = { cum: net.cum, flows: net.flows.size, blocks: net.blocks }
    write({
      kind: 'sample',
      i,
      t,
      iso: new Date().toISOString(),
      acf,
      staging,
      install,
      nettop,
      lines
    })
    for (const l of lines) if (l.kind !== 'other') log('content_log', l.raw)
    if (i % 10 === 0)
      log('tick', `${(t / 1000).toFixed(0)}s`, {
        acf: [acf.BytesDownloaded, acf.BytesToDownload],
        staging: staging && [staging.size, staging.alloc, staging.files],
        install: install && [install.size, install.alloc],
        nettop: nettop.cum
      })

    if (
      !finishedAt &&
      lines.some((l) => l.raw.includes(`AppID ${appId} scheduler finished`))
    ) {
      finishedAt = Date.now()
      log('run', 'scheduler finished seen; 5 s grace')
    }
    if (finishedAt && Date.now() - finishedAt > 5000) break
    if (t > maxSecs * 1000) break
  }
  net.child?.kill()
  try {
    execFileSync('pkill', [
      '-f',
      `nettop -x -n -L 0 -s 1 -J bytes_in -p ${pid0}`
    ])
  } catch {}
  const pid1 = steamPid()
  write({
    kind: 'end',
    endIso: new Date().toISOString(),
    steamPid: pid1,
    acf1: readAcf(appId)
  })
  log('run', `done ${label}`, { steamRestarted: pid0 !== pid1 })
}

// ---------------------------------------------------------------- analysis

const quant = (xs, q) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const cv = (xs) => {
  if (xs.length < 2) return null
  const m = mean(xs)
  const sd = Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
  return m ? +(sd / m).toFixed(3) : null
}

/** Cadence + smoothness for one byte series [{t, v}] (v may be null). */
function seriesStats(points, total, windowMs) {
  const pts = points.filter((p) => p.v !== null && p.v !== undefined)
  if (!pts.length || !total) return null
  const changes = []
  for (let k = 1; k < pts.length; k++)
    if (pts[k].v !== pts[k - 1].v) changes.push(pts[k])
  const gaps = changes.slice(1).map((c, k) => c.t - changes[k].t)
  const steps = changes.map((c, k) => {
    const prev = k === 0 ? pts[0].v : changes[k - 1].v
    return ((c.v - prev) / total) * 100
  })
  const backwards = steps.filter((s) => s < 0).length
  // Speed exactly as a hero would derive it: delta over the trailing window, every second,
  // restricted to the active span (first change → last change).
  const active = changes.length
    ? [changes[0].t, changes[changes.length - 1].t]
    : null
  const speeds = []
  if (active)
    for (const p of pts) {
      if (p.t < active[0] + windowMs || p.t > active[1]) continue
      const prev = [...pts].reverse().find((q) => q.t <= p.t - windowMs)
      if (prev) speeds.push(((p.v - prev.v) / (p.t - prev.t)) * 1000)
    }
  return {
    changes: changes.length,
    updateGapMs: {
      p50: quant(gaps, 0.5),
      p90: quant(gaps, 0.9),
      max: gaps.length ? Math.max(...gaps) : null
    },
    stepPct: {
      p50: quant(steps, 0.5),
      max: steps.length ? +Math.max(...steps).toFixed(2) : null
    },
    backwards,
    activeSpanMs: active && active[1] - active[0],
    speedWindowMs: windowMs,
    speedMBps: speeds.length
      ? {
          mean: +(mean(speeds) / 1e6).toFixed(2),
          cv: cv(speeds),
          zeroSamples: speeds.filter((s) => s === 0).length,
          n: speeds.length
        }
      : null
  }
}

function analyze(label) {
  const recs = fs
    .readFileSync(path.join(RUNS, `${label}.jsonl`), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
  const meta = recs.find((r) => r.kind === 'meta')
  const samples = recs.filter((r) => r.kind === 'sample')
  const lastAcf =
    [...samples].reverse().find((s) => s.acf.BytesToDownload)?.acf ?? {}
  const dlTotal = Math.max(...samples.map((s) => s.acf.BytesToDownload || 0))
  const stTotal = Math.max(...samples.map((s) => s.acf.BytesToStage || 0))
  // Re-parse raw lines so older runs benefit from parser fixes.
  const lines = samples.flatMap((s) =>
    s.lines.map((l) => ({
      ...parseLine(l.raw),
      raw: l.raw.replace(/\r$/, ''),
      t: s.t
    }))
  )

  const series = {
    acfDownloaded: samples.map((s) => ({ t: s.t, v: s.acf.BytesDownloaded })),
    acfStaged: samples.map((s) => ({ t: s.t, v: s.acf.BytesStaged })),
    stagingSize: samples.map((s) => ({ t: s.t, v: s.staging?.size ?? null })),
    stagingAlloc: samples.map((s) => ({ t: s.t, v: s.staging?.alloc ?? null })),
    installSize: samples.map((s) => ({ t: s.t, v: s.install?.size ?? null })),
    installAlloc: samples.map((s) => ({ t: s.t, v: s.install?.alloc ?? null })),
    // Zeroed at the first sample so pre-download chatter does not count toward the percent.
    nettopIn: samples.map((s) => ({
      t: s.t,
      v: s.nettop ? s.nettop.cum - (samples[0].nettop?.cum ?? 0) : null
    }))
  }
  const totals = {
    acfDownloaded: dlTotal,
    acfStaged: stTotal,
    stagingSize: stTotal,
    stagingAlloc: stTotal,
    installSize: stTotal,
    installAlloc: stTotal,
    nettopIn: dlTotal
  }
  const stats = {}
  for (const [k, pts] of Object.entries(series))
    stats[k] = {
      w1s: seriesStats(pts, totals[k], 1000),
      w3s: seriesStats(pts, totals[k], 3000)
    }

  // ACF write cadence by mtime, independent of whether Bytes* moved.
  const mt = [...new Set(samples.map((s) => s.acf.mtimeMs).filter(Boolean))]
  const acfWriteGaps = mt.slice(1).map((m, k) => m - mt[k])

  const rates = lines.filter((l) => l.kind === 'rate')
  const rateGaps = rates.slice(1).map((r, k) => r.t - rates[k].t)
  const phases = lines.filter(
    (l) =>
      l.kind === 'phase' ||
      l.kind === 'state' ||
      l.kind === 'update' ||
      l.kind === 'chunks'
  )

  const maxPrealloc = Math.max(
    0,
    ...samples.map((s) =>
      s.staging && s.staging.size
        ? (s.staging.size - s.staging.alloc) / s.staging.size
        : 0
    )
  )
  const firstStaging = samples.find((s) => s.staging && s.staging.size > 0)

  const summary = {
    label,
    appId: meta.appId,
    durationS: samples.length ? samples[samples.length - 1].t / 1000 : 0,
    samples: samples.length,
    totals: { BytesToDownload: dlTotal, BytesToStage: stTotal },
    acfWrites: {
      n: mt.length,
      gapMs: { p50: quant(acfWriteGaps, 0.5), p90: quant(acfWriteGaps, 0.9) }
    },
    contentLogRate: {
      n: rates.length,
      gapMs: {
        p50: quant(rateGaps, 0.5),
        max: rateGaps.length ? Math.max(...rateGaps) : null
      },
      values: rates.map((r) => [r.t, r.mbps])
    },
    preallocation: {
      maxApparentMinusAllocatedFrac: +maxPrealloc.toFixed(3),
      firstStagingSample: firstStaging && {
        t: firstStaging.t,
        ...firstStaging.staging
      }
    },
    walkMs: {
      p90: quant(samples.map((s) => s.staging?.walkMs).filter(Boolean), 0.9)
    },
    stats,
    phases: phases.map((p) => [p.t, p.raw.replace(/^\[[^\]]+\] /, '')])
  }
  fs.writeFileSync(
    path.join(RUNS, `${label}.summary.json`),
    JSON.stringify(summary, null, 2) + '\n'
  )
  fs.writeFileSync(
    path.join(RUNS, `${label}.html`),
    report(summary, series, totals, rates)
  )
  console.log(JSON.stringify(summary, null, 2))
}

function report(summary, series, totals, rates) {
  const W = 900
  const H = 260
  const tMax = Math.max(1, summary.durationS * 1000)
  const x = (t) => ((t / tMax) * W).toFixed(1)
  const colors = {
    acfDownloaded: '#e5534b',
    acfStaged: '#c69026',
    stagingSize: '#6cb6ff',
    stagingAlloc: '#57ab5a',
    nettopIn: '#f47067',
    installSize: '#b083f0',
    installAlloc: '#768390'
  }
  const pctPath = (k) => {
    const tot = totals[k]
    const pts = series[k].filter((p) => p.v !== null && p.v !== undefined)
    if (!tot || !pts.length) return ''
    return `<polyline fill="none" stroke="${colors[k]}" stroke-width="1.6" points="${pts
      .map(
        (p) =>
          `${x(p.t)},${(H - Math.min(1.05, p.v / tot) * (H / 1.05)).toFixed(1)}`
      )
      .join(' ')}"/>`
  }
  const speedPts = (k, win) => {
    const pts = series[k].filter((p) => p.v !== null && p.v !== undefined)
    const out = []
    for (const p of pts) {
      const prev = [...pts].reverse().find((q) => q.t <= p.t - win)
      if (prev)
        out.push({
          t: p.t,
          s: Math.max(0, ((p.v - prev.v) / (p.t - prev.t)) * 1000)
        })
    }
    return out
  }
  const speedSeries = {
    'ACF dl, 3 s window (today)': [
      speedPts('acfDownloaded', 3000),
      colors.acfDownloaded
    ],
    'staging alloc, 1 s': [speedPts('stagingAlloc', 1000), colors.stagingAlloc],
    'staging alloc, 3 s': [speedPts('stagingAlloc', 3000), '#2f6f33'],
    'nettop in, 1 s': [speedPts('nettopIn', 1000), '#f47067'],
    'nettop in, 3 s': [speedPts('nettopIn', 3000), '#8b2c2c'],
    'content_log rate': [
      rates.map((r) => ({ t: r.t, s: (r.mbps * 1e6) / 8 })),
      '#f69d50'
    ]
  }
  const sMax = Math.max(
    1,
    ...Object.values(speedSeries).flatMap(([p]) => p.map((q) => q.s))
  )
  const speedSvg = Object.entries(speedSeries)
    .map(([, [pts, c]]) =>
      pts.length
        ? `<polyline fill="none" stroke="${c}" stroke-width="1.4" points="${pts
            .map((p) => `${x(p.t)},${(H - (p.s / sMax) * H).toFixed(1)}`)
            .join(' ')}"/>`
        : ''
    )
    .join('')
  const phaseMarks = summary.phases
    .map(
      ([t, txt]) =>
        `<line x1="${x(t)}" x2="${x(t)}" y1="0" y2="${H}" stroke="#888" stroke-dasharray="2,3" opacity=".5"><title>${txt.replace(/</g, '&lt;')}</title></line>`
    )
    .join('')
  const legend = (m) =>
    Object.entries(m)
      .map(
        ([k, c]) =>
          `<span><i style="background:${Array.isArray(c) ? c[1] : c}"></i>${k}</span>`
      )
      .join('')
  const rows = Object.entries(summary.stats)
    .map(([k, v]) => {
      const s = v.w3s
      if (!s) return `<tr><td>${k}</td><td colspan=6>no data</td></tr>`
      return `<tr><td>${k}</td><td>${s.changes}</td><td>${s.updateGapMs.p50 ?? '–'} / ${s.updateGapMs.p90 ?? '–'}</td><td>${s.stepPct.p50?.toFixed?.(2) ?? '–'} / ${s.stepPct.max ?? '–'}</td><td>${v.w1s?.speedMBps?.cv ?? '–'}</td><td>${s.speedMBps?.cv ?? '–'}</td><td>${s.speedMBps?.mean ?? '–'}</td></tr>`
    })
    .join('')
  return `<!doctype html><meta charset="utf-8"><title>Spike 050 ${summary.label}</title>
<style>
:root{--bg:#fff;--fg:#1f2328;--mut:#656d76;--line:#d0d7de}
@media (prefers-color-scheme:dark){:root{--bg:#1c2128;--fg:#cdd9e5;--mut:#768390;--line:#444c56}}
body{background:var(--bg);color:var(--fg);font:14px/1.45 -apple-system,system-ui,sans-serif;max-width:940px;margin:24px auto;padding:0 16px}
svg{width:100%;height:auto;border:1px solid var(--line);border-radius:6px}
.lg span{margin-right:14px;color:var(--mut);font-size:12px}.lg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px}
table{border-collapse:collapse;font-size:12px;width:100%}td,th{border-bottom:1px solid var(--line);padding:4px 6px;text-align:left}
code,pre{font:12px ui-monospace,monospace}pre{white-space:pre-wrap;color:var(--mut)}
</style>
<h1>Spike 050 — ${summary.label} (app ${summary.appId})</h1>
<p>${summary.samples} samples over ${summary.durationS.toFixed(0)} s. BytesToDownload ${(summary.totals.BytesToDownload / 1e9).toFixed(2)} GB, BytesToStage ${(summary.totals.BytesToStage / 1e9).toFixed(2)} GB. Dashed lines = content_log phase/state lines (hover).</p>
<h2>Percent</h2><div class="lg">${legend(colors)}</div>
<svg viewBox="0 0 ${W} ${H}">${phaseMarks}${Object.keys(series).map(pctPath).join('')}</svg>
<h2>Speed (peak ${(sMax / 1e6).toFixed(1)} MB/s)</h2><div class="lg">${legend(speedSeries)}</div>
<svg viewBox="0 0 ${W} ${H}">${phaseMarks}${speedSvg}</svg>
<h2>Cadence and smoothness</h2>
<table><tr><th>source</th><th>value changes</th><th>update gap p50/p90 ms</th><th>step % p50/max</th><th>speed CV 1 s</th><th>speed CV 3 s</th><th>mean MB/s (3 s)</th></tr>${rows}</table>
<p>ACF writes: ${summary.acfWrites.n}, gap p50 ${summary.acfWrites.gapMs.p50} ms. content_log rate lines: ${summary.contentLogRate.n}, gap p50 ${summary.contentLogRate.gapMs.p50} ms. Max (apparent − allocated)/apparent in staging: ${summary.preallocation.maxApparentMinusAllocatedFrac}. Staging walk p90 ${summary.walkMs.p90} ms.</p>
<h2>Phase lines</h2><pre>${summary.phases.map(([t, l]) => `${(t / 1000).toFixed(0).padStart(5)}s  ${l.replace(/</g, '&lt;')}`).join('\n')}</pre>`
}

// ---------------------------------------------------------------- main

const [cmd, a1, ...rest] = process.argv.slice(2)
if (cmd === 'snapshot' && a1) {
  const acf = readAcf(a1)
  console.log(
    JSON.stringify(
      {
        steamPid: steamPid(),
        acf,
        staging: dirBytes(path.join(STEAM, 'steamapps/downloading', a1)),
        install: acf.installdir
          ? dirBytes(path.join(STEAM, 'steamapps/common', acf.installdir))
          : null
      },
      null,
      2
    )
  )
} else if (cmd === 'sample' && a1) {
  await sample(
    a1,
    Number(rest[0] ?? 900),
    rest[1] ?? `sample-${a1}-${Date.now()}`,
    rest[2]
  )
} else if (cmd === 'analyze' && a1) {
  analyze(a1)
} else {
  console.error('usage: see header')
  process.exit(2)
}
