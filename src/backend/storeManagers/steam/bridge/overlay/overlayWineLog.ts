/**
 * Phase 60 plan 04 (D-15 evidence): a bounded, symlink-safe wine-log sink for
 * overlay launches, plus a forwarder for the shim's stderr trace.
 *
 * `hook_set_pixel_format` logs only on a format change, so a handful of lines
 * per run is normal (RESEARCH Pitfall 4); the forwarder copies them into the
 * main launch log as D-15 evidence.
 *
 * Retention is owned here: only `<appId>-<id>.overlay.wine.log` is touched.
 * Nothing here throws and no child process is spawned.
 */
import {
  chmodSync,
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  unlinkSync,
  writeSync
} from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { logWarning, LogPrefix } from 'backend/logger'

const OVERLAY_WINE_LOG_KEEP_PER_APP = 8
const APP_ID_RE = /^[0-9]{1,10}$/
const MAX_PARTIAL = 4096
const MAX_LINE = 512

type OverlayWineLog = {
  path: string
  write: (chunk: string) => void
  close: () => void
}

// ts-prune-ignore-next
export function openOverlayWineLog(
  traceRoot: string,
  appId: string,
  now: number = Date.now(),
  maxBytes = 8 * 1024 * 1024
): OverlayWineLog | null {
  try {
    if (!APP_ID_RE.test(appId)) throw new Error('invalid appId')
    if (!isAbsolute(traceRoot)) throw new Error('trace root is not absolute')
    mkdirSync(traceRoot, { recursive: true, mode: 0o700 })
    if (!lstatSync(traceRoot).isDirectory()) {
      throw new Error('trace dir is a symlink or not a directory')
    }
    chmodSync(traceRoot, 0o700)

    try {
      const re = new RegExp(`^${appId}-([0-9]{1,16})\\.overlay\\.wine\\.log$`)
      const found: { id: number; name: string }[] = []
      for (const name of readdirSync(traceRoot)) {
        const m = re.exec(name)
        if (!m) continue
        const st = lstatSync(join(traceRoot, name), { throwIfNoEntry: false })
        if (!st || !st.isFile()) continue
        found.push({ id: Number(m[1]), name })
      }
      found.sort((a, b) => b.id - a.id)
      for (const f of found.slice(OVERLAY_WINE_LOG_KEEP_PER_APP - 1)) {
        try {
          unlinkSync(join(traceRoot, f.name))
        } catch (error) {
          logWarning(
            `overlayWineLog: removal failed for ${f.name}: ${String(error)}`,
            LogPrefix.Steam
          )
        }
      }
    } catch (error) {
      logWarning(
        `overlayWineLog: retention failed: ${String(error)}`,
        LogPrefix.Steam
      )
    }

    const id = Number.isFinite(now) && now >= 0 ? String(Math.trunc(now)) : '0'
    const path = join(traceRoot, `${appId}-${id}.overlay.wine.log`)
    // O_EXCL: refuses a pre-planted symlink or file at the name.
    let fd: number | null = openSync(path, 'wx', 0o600)
    let written = 0
    let truncated = false

    const writeRaw = (text: string) => {
      if (fd === null || truncated) return
      try {
        const buf = Buffer.from(text, 'utf8')
        if (written + buf.length > maxBytes) {
          const room = Math.max(0, maxBytes - written)
          if (room > 0) writeSync(fd, buf, 0, room)
          writeSync(fd, `\n[gamelib] wine log truncated at ${maxBytes} bytes\n`)
          written = maxBytes
          truncated = true
          return
        }
        writeSync(fd, buf)
        written += buf.length
      } catch {
        truncated = true
      }
    }

    return {
      path,
      write: writeRaw,
      close: () => {
        if (fd === null) return
        try {
          closeSync(fd)
        } catch {
          // nothing to clean up
        }
        fd = null
      }
    }
  } catch (error) {
    logWarning(`overlayWineLog: unavailable: ${String(error)}`, LogPrefix.Steam)
    return null
  }
}

// ts-prune-ignore-next
export function createShimLineForwarder(
  onLine: (line: string) => void,
  maxLines = 50
): (chunk: string) => void {
  let partial = ''
  let forwarded = 0
  let suppressedSent = false

  const handle = (raw: string) => {
    // eslint-disable-next-line no-control-regex
    const line = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim()
    if (!line.startsWith('overlay_shim')) return
    if (forwarded >= maxLines) {
      if (!suppressedSent) {
        suppressedSent = true
        onLine('overlay_shim: further lines suppressed')
      }
      return
    }
    forwarded += 1
    onLine(line.slice(0, MAX_LINE))
  }

  return (chunk: string) => {
    partial += chunk
    const parts = partial.split('\n')
    partial = parts.pop() ?? ''
    for (const p of parts) handle(p)
    if (partial.length > MAX_PARTIAL) partial = ''
  }
}
