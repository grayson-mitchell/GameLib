/**
 * Phase 56 plan 32: the wine session output of the DRM bottle stage.
 *
 * The stage's `reg add` runs in its own wine session, which the game later
 * reuses, and its output used to go nowhere (verification gap 1). This opens a
 * bounded, symlink-safe sink for it beside the DRM traces.
 *
 * Retention is owned here: `<appId>-<id>.stage.wine.log` is never matched by
 * the games.ts per-id retention, and this module never touches
 * `<appId>-<id>.log` or `<appId>-<id>.wine.log`.
 *
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
import { newDrmLaunchId } from './drmPaths'

export const DRM_STAGE_LOG_KEEP_PER_APP = 8

const APP_ID_RE = /^[0-9]{1,10}$/

export type StageWineLog = {
  path: string
  write: (chunk: string) => void
  close: () => void
}

export function openStageWineLog(
  traceRoot: string,
  appId: string,
  now: number = Date.now(),
  bottleName = '',
  maxBytes = 2 * 1024 * 1024
): StageWineLog | null {
  try {
    if (!APP_ID_RE.test(appId)) throw new Error('invalid appId')
    if (!isAbsolute(traceRoot)) throw new Error('trace root is not absolute')
    mkdirSync(traceRoot, { recursive: true, mode: 0o700 })
    if (!lstatSync(traceRoot).isDirectory()) {
      throw new Error('trace dir is a symlink or not a directory')
    }
    chmodSync(traceRoot, 0o700)

    // Prune: keep the newest KEEP-1 old stage logs; the new one makes KEEP.
    try {
      const re = new RegExp(`^${appId}-([0-9]{1,16})\\.stage\\.wine\\.log$`)
      const found: { id: number; name: string }[] = []
      for (const name of readdirSync(traceRoot)) {
        const m = re.exec(name)
        if (!m) continue
        const st = lstatSync(join(traceRoot, name), { throwIfNoEntry: false })
        if (!st || !st.isFile()) continue
        found.push({ id: Number(m[1]), name })
      }
      found.sort((a, b) => b.id - a.id)
      for (const f of found.slice(DRM_STAGE_LOG_KEEP_PER_APP - 1)) {
        try {
          unlinkSync(join(traceRoot, f.name))
        } catch (error) {
          logWarning(
            `stageWineLog: removal failed for ${f.name}: ${String(error)}`,
            LogPrefix.Steam
          )
        }
      }
    } catch (error) {
      logWarning(
        `stageWineLog: retention failed: ${String(error)}`,
        LogPrefix.Steam
      )
    }

    const path = join(
      traceRoot,
      `${appId}-${newDrmLaunchId(now)}.stage.wine.log`
    )
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
          writeSync(
            fd,
            `\n[gamelib] stage wine log truncated at ${maxBytes} bytes\n`
          )
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

    writeRaw(
      `[gamelib] stage session appId=${appId} bottle=${bottleName} started=${new Date(now).toISOString()}\n`
    )
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
    logWarning(`stageWineLog: unavailable: ${String(error)}`, LogPrefix.Steam)
    return null
  }
}
