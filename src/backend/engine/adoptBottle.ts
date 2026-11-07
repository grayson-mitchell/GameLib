/**
 * Writes the minimal `cxbottle.conf` that lets CrossOver adopt a bottle GameLib created with the
 * fallback engine (Phase 59, D-03).
 *
 * The conf omits the bottle timestamp and version keys on purpose: CrossOver's `bin/wine` then
 * runs the win10_64 template's `setup --upgrade` on first use (CXBT_win10_64.pm
 * upgrade_cxbottle fills in the rest). `WineArch` must be `win64` because CrossOver defaults a
 * missing WineArch to win32. 59-01 measured this adoption as clean.
 *
 * The conf is written LAST during bottle creation, so `isBridgeBottleReady` (conf exists) only
 * turns true once the bottle is complete. An existing conf is never overwritten.
 */
import { randomUUID } from 'crypto'
import { existsSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'

export function buildCxbottleConf(bottleId: string): string {
  return [
    '[Bottle]',
    `"BottleID" = "${bottleId}"`,
    '"Encoding" = "UTF-8"',
    '"Template" = "win10_64"',
    '"MenuMode" = "ignore"',
    '"AssocMode" = "ignore"',
    '"WineArch" = "win64"',
    ''
  ].join('\n')
}

export function writeCxbottleConf(
  bottleDir: string,
  opts: { uuid?: () => string } = {}
): boolean {
  const confPath = join(bottleDir, 'cxbottle.conf')
  // system.reg is CrossOver's find_bottle key: without it the dir is not a wine prefix.
  if (!existsSync(join(bottleDir, 'system.reg'))) {
    logWarning(
      `cxbottle.conf not written: ${bottleDir} has no system.reg`,
      LogPrefix.Backend
    )
    return false
  }
  if (existsSync(confPath)) {
    logInfo(
      `cxbottle.conf already exists in ${bottleDir}; left untouched`,
      LogPrefix.Backend
    )
    return false
  }
  const id = (opts.uuid ?? randomUUID)().toUpperCase()
  const tmp = join(bottleDir, `.cxbottle.conf.tmp-${process.pid}`)
  try {
    writeFileSync(tmp, buildCxbottleConf(id), { mode: 0o644, flag: 'wx' })
    renameSync(tmp, confPath)
  } catch (err) {
    rmSync(tmp, { force: true })
    logWarning(['cxbottle.conf write failed', err], LogPrefix.Backend)
    return false
  }
  logInfo(`Wrote cxbottle.conf (${id}) in ${bottleDir}`, LogPrefix.Backend)
  return true
}
