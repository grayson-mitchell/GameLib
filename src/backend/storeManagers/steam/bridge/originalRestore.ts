/**
 * Quick 261026-lif: restore the game-original steam_api(64).dll behind every
 * placed GameLib bridge shim that lost its `.gamelib-orig` backup.
 *
 * The original is fetched from the Steam depot into a staging tree INSIDE the
 * bottle (same volume, never the live install), sha1-verified against the
 * manifest, and written ONLY as `<shim>.gamelib-orig`. The live shim is never
 * touched, so a running game is unaffected. Placement reads the backup the
 * next time it runs and rescans (see shimGenerate.ts).
 *
 * Never throws: every failure is a named per-file outcome.
 */
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import {
  downloadSelectedDepotFiles,
  normalizeDepotPath,
  resolveContainedPath,
  sha1File
} from '../depot'
import { findRuntimeLoadedSteamApiDlls, isContainedWithin } from './bridgeScan'
import { isGameLibShimBytes, probeOriginalBackup } from './shimGenerate'

const BACKUP_SUFFIX = '.gamelib-orig'

export type RestoreOutcomeName =
  | 'restored'
  | 'already-backed-up'
  | 'original-in-place'
  | 'not-in-depot'
  | 'refused'
  | 'backup-refused'
  | 'download-failed'

export interface RestoreOutcome {
  path: string
  outcome: RestoreOutcomeName
  detail?: string
}

export interface RestoreInput {
  appId: string
  bottleDir: string
  installRoot: string
  installdir: string
  signal?: AbortSignal
}

export interface RestoreResult {
  status: 'ok' | 'partial' | 'error'
  outcomes: RestoreOutcome[]
}

export interface RestoreDeps {
  downloadSelected?: typeof downloadSelectedDepotFiles
  findDlls?: typeof findRuntimeLoadedSteamApiDlls
}

function backupPathState(backup: string): 'absent' | 'regular' | 'refused' {
  try {
    const st = lstatSync(backup)
    return st.isFile() && !st.isSymbolicLink() ? 'regular' : 'refused'
  } catch {
    return 'absent'
  }
}

export async function restoreBridgeSteamApiOriginals(
  input: RestoreInput,
  deps: RestoreDeps = {}
): Promise<RestoreResult> {
  const { appId, installdir, signal } = input
  const bottleDir = resolve(input.bottleDir)
  const installRoot = resolve(input.installRoot)
  if (!/^\d+$/.test(appId) || !isContainedWithin(bottleDir, installRoot)) {
    return { status: 'error', outcomes: [] }
  }
  const downloadSelected = deps.downloadSelected ?? downloadSelectedDepotFiles
  const findDlls = deps.findDlls ?? findRuntimeLoadedSteamApiDlls
  const stagingRoot = join(bottleDir, '.gamelib-restore', appId)
  const outcomes: RestoreOutcome[] = []

  try {
    const dlls = await findDlls(installRoot, [], {
      isShimBytes: isGameLibShimBytes
    })
    const candidates: string[] = []
    for (const dll of dlls) {
      const path = resolve(dll.path)
      if (!dll.isGameLibShim) {
        outcomes.push({ path, outcome: 'original-in-place' })
        continue
      }
      const backup = path + BACKUP_SUFFIX
      const state = backupPathState(backup)
      if (state === 'refused') {
        outcomes.push({
          path,
          outcome: 'backup-refused',
          detail: 'backup path is a symlink or not a regular file'
        })
      } else if (state === 'regular') {
        if (probeOriginalBackup(bottleDir, path) === 'restorable') {
          outcomes.push({ path, outcome: 'already-backed-up' })
        } else {
          outcomes.push({
            path,
            outcome: 'backup-refused',
            detail: 'existing backup is not a restorable original'
          })
        }
      } else {
        candidates.push(path)
      }
    }
    if (!candidates.length) {
      return { status: 'ok', outcomes }
    }

    const wanted = new Map<string, string>()
    for (const path of candidates) {
      wanted.set(normalizeDepotPath(relative(installRoot, path)), path)
    }
    const stagingSteamapps = join(stagingRoot, 'steamapps')
    const dl = await downloadSelected(appId, {
      targetSteamappsDir: stagingSteamapps,
      installdir,
      os: 'windows',
      signal,
      select: (p) => wanted.has(p)
    })

    if (dl.status !== 'done') {
      const detail =
        dl.status === 'cancelled'
          ? 'cancelled'
          : (dl.error ?? 'download failed')
      for (const path of candidates) {
        outcomes.push({ path, outcome: 'download-failed', detail })
      }
      return { status: 'error', outcomes }
    }

    const stagedInstallRoot = join(stagingSteamapps, 'common', installdir)
    const byPath = new Map(
      dl.files.map((f) => [normalizeDepotPath(f.filename), f])
    )
    for (const [key, path] of wanted) {
      const file = byPath.get(key)
      if (!file) {
        outcomes.push({ path, outcome: 'not-in-depot' })
        continue
      }
      try {
        const staged = resolveContainedPath(stagedInstallRoot, file.filename)
        const sha = await sha1File(staged)
        if (sha.toLowerCase() !== file.sha1) {
          outcomes.push({
            path,
            outcome: 'refused',
            detail: 'staged sha1 does not match the depot manifest'
          })
          continue
        }
        const bytes = readFileSync(staged)
        if (isGameLibShimBytes(bytes)) {
          outcomes.push({
            path,
            outcome: 'refused',
            detail: 'depot file carries GameLib shim markers'
          })
          continue
        }
        const backup = path + BACKUP_SUFFIX
        if (
          !isContainedWithin(bottleDir, path) ||
          !isContainedWithin(bottleDir, resolve(backup)) ||
          backupPathState(backup) !== 'absent'
        ) {
          outcomes.push({ path, outcome: 'backup-refused' })
          continue
        }
        mkdirSync(dirname(backup), { recursive: true })
        // 'wx' (O_EXCL): refuses an existing path, including a symlink.
        writeFileSync(backup, bytes, { flag: 'wx' })
        logInfo(
          `restoreBridgeSteamApiOriginals: appId ${appId} wrote ${backup} (sha1 ${sha})`,
          LogPrefix.Steam
        )
        outcomes.push({ path, outcome: 'restored' })
      } catch (err) {
        outcomes.push({
          path,
          outcome: 'refused',
          detail: err instanceof Error ? err.message : String(err)
        })
      }
    }
    const bad = outcomes.some(
      (o) => o.outcome === 'download-failed' || o.outcome === 'refused'
    )
    return { status: bad ? 'partial' : 'ok', outcomes }
  } catch (err) {
    logWarning(
      `restoreBridgeSteamApiOriginals: appId ${appId} failed: ${err instanceof Error ? err.message : String(err)}`,
      LogPrefix.Steam
    )
    return { status: 'error', outcomes }
  } finally {
    try {
      if (isContainedWithin(bottleDir, stagingRoot)) {
        await rm(stagingRoot, { recursive: true, force: true })
      }
    } catch {
      /* best effort */
    }
  }
}
