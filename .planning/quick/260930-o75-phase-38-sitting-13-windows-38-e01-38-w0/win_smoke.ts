/**
 * win_smoke.ts -- fake-HOME smoke-launch harness for quick 260930-o75 (Phase 38 item 38-W04,
 * sitting 13, Windows 11).
 *
 * The bar is `35-LIVE-GATE.md` criterion 1, as 38-W04 quotes it: GameLib launches, a window
 * appears, and the process survives at least 10 seconds without crashing.
 *
 * The run is not profile-dependent, so under CLAUDE.md's two-profile rule it gets a FRESH
 * createFakeHomeProfile(), disposed in `finally`. The single-instance guard is keyed on the user
 * SID (`Local\gamelib-single-instance-<sid>`), not the profile, so the harness refuses to run while
 * any other gamelib-shell is alive: a second instance would hand off and exit, which reads exactly
 * like a crash.
 *
 *   node meta/runTs.cjs --bundle --platform=node --target=node22 <this file> --exe ABS --evidence ABS
 */
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFakeHomeProfile } from '../../../src/backend/testUtils/fakeHomeProfile'

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0 || !process.argv[i + 1]) throw new Error(`missing --${name}`)
  return process.argv[i + 1]
}

const exe = arg('exe')
const evidence = arg('evidence')
const SAMPLES = 12
mkdirSync(evidence, { recursive: true })
const out = join(evidence, 'w04-smoke.txt')
writeFileSync(out, '')
const rec = (k: string, v: unknown) => {
  const line = `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`
  appendFileSync(out, line + '\n')
  console.log(line)
}

function ps(script: string): string {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    timeout: 20000
  })
  return (r.stdout ?? '').trim()
}

interface Snap {
  alive: boolean
  hwnd: string
  title: string
  kids: { pid: number; name: string; path: string }[]
}
function snap(pid: number): Snap {
  const j = ps(
    `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; ` +
      `$k = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | ForEach-Object { [ordered]@{ pid = $_.ProcessId; name = $_.Name; path = $_.ExecutablePath } }); ` +
      `[ordered]@{ alive = [bool]$p; hwnd = $(if ($p) { '0x{0:X}' -f $p.MainWindowHandle.ToInt64() } else { '' }); title = $(if ($p) { $p.MainWindowTitle } else { '' }); kids = $k } | ConvertTo-Json -Depth 4 -Compress`
  )
  const s = JSON.parse(j) as Snap
  s.kids = ([] as Snap['kids']).concat(s.kids ?? [])
  return s
}

function others(): string {
  return ps(
    `@(Get-Process | Where-Object { $_.ProcessName -match '^gamelib-(shell|sidecar)$' } | ForEach-Object { "$($_.Id):$($_.ProcessName):$($_.Path)" }) -join ';'`
  )
}

async function main() {
  const pre = others()
  rec('PRE_EXISTING_GAMELIB', pre || '(none)')
  if (pre) {
    rec('VERDICT', 'NOT_SCORED (another gamelib process holds the single-instance mutex)')
    return
  }
  rec('EXE', exe)
  rec('EXE_SHA256', ps(`(Get-FileHash -Algorithm SHA256 '${exe}').Hash`))
  const profile = createFakeHomeProfile({ prefix: 'gl-w04s13-' })
  rec('FAKE_HOME', 'createFakeHomeProfile')
  let pid = 0
  try {
    const t0 = Date.now()
    const child = spawn(exe, [], {
      env: profile.childEnv(),
      stdio: ['pipe', 'ignore', 'ignore'],
      detached: false,
      windowsHide: false
    })
    let exitAt: number | null = null
    let exitInfo = ''
    child.on('exit', (code, sig) => {
      exitAt = Date.now() - t0
      exitInfo = `code=${code} signal=${sig}`
    })
    pid = child.pid ?? 0
    rec('SHELL_PID', pid)
    let firstWindowMs: number | null = null
    let aliveSamples = 0
    let sidecarSeen = ''
    for (let s = 1; s <= SAMPLES; s++) {
      const target = t0 + s * 1000
      while (Date.now() < target) await new Promise((r) => setTimeout(r, 50))
      const sn = snap(pid)
      if (sn.alive) aliveSamples++
      if (firstWindowMs === null && sn.hwnd && sn.hwnd !== '0x0') firstWindowMs = Date.now() - t0
      const side = sn.kids.find((k) => /sidecar/i.test(k.name))
      if (side) sidecarSeen = `${side.pid}:${side.path}`
      rec(`S${s}`, { ms: Date.now() - t0, ...sn })
    }
    const shot = join(evidence, 'w04-t12.png')
    ps(
      `Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; ` +
        `$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height; $g = [System.Drawing.Graphics]::FromImage($bmp); ` +
        `$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size); $bmp.Save('${shot}'); $g.Dispose(); $bmp.Dispose()`
    )
    rec('SCREENSHOT', shot)
    rec('FIRST_WINDOW_MS', firstWindowMs)
    rec('ALIVE_SAMPLES', `${aliveSamples}/${SAMPLES}`)
    rec('SIDECAR', sidecarSeen || '(never seen)')
    rec('EXIT_BEFORE_TEARDOWN', exitAt === null ? 'none' : `${exitAt}ms ${exitInfo}`)
    const pass = firstWindowMs !== null && aliveSamples === SAMPLES && exitAt === null && !!sidecarSeen
    rec('VERDICT', pass ? 'PASS' : 'FAIL')
  } finally {
    if (pid) spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { encoding: 'utf8' })
    await new Promise((r) => setTimeout(r, 1500))
    rec('POST_TEARDOWN_GAMELIB', others() || '(none)')
    profile.dispose()
    rec('PROFILE_DISPOSED', 'yes')
  }
}

main().catch((e) => {
  rec('HARNESS_ERROR', String(e?.stack ?? e))
  process.exitCode = 1
})
