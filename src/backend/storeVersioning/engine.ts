/**
 * Versioning engine for persisted stores (Phase 68).
 *
 * Decides per file: ok / migrate / discard (cache only) / read-only. Never
 * throws (a throw at store construction is a module-scope throw and stops the
 * sidecar booting), never writes a file newer than this build, and is fully
 * synchronous: no timers, watchers, promises or child processes (sidecar exit
 * contract). Logs carry store key, versions and err.message only, never data.
 * No `backend/logger` import: module-init cycle (see backup.ts).
 */

import { existsSync, readFileSync, unlinkSync } from 'graceful-fs'
import { basename, dirname, resolve } from 'path'
import { currentVersionOf, pendingChain } from '../storeMigrations'
import { atomicWritePrivate, writePreMigrationBackup } from './backup'
import { recordReadOnly } from './readOnlyStores'
import type {
  StoreDeclaration,
  StoreKind,
  StoreReadOnlyReason,
  VersionCodec
} from './types'

export type StoreState = {
  chainKey: string
  kind: StoreKind
  failedView: 'as-is' | 'empty'
  status: 'ok' | 'readOnly'
  reason?: StoreReadOnlyReason
  refusedLogged: boolean
}

const STATE = new Map<string, StoreState>()
const kindMismatches: { path: string; first: StoreKind; second: StoreKind }[] =
  []

const errMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err)

const log = (line: string): void => {
  process.stderr.write(`[storeVersion] ${line}\n`)
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** `<basename of the file's directory>/<file name without .json>` */
export function storeKeyOf(filePath: string): string {
  return `${basename(dirname(filePath))}/${basename(filePath, '.json')}`
}

function markReadOnly(
  filePath: string,
  state: StoreState,
  reason: StoreReadOnlyReason,
  detail: string
): StoreState {
  state.status = 'readOnly'
  state.reason = reason
  recordReadOnly({
    storeKey: state.chainKey,
    file: basename(filePath),
    reason,
    detail
  })
  log(`${state.chainKey} is read-only (${reason}): ${detail}`)
  return state
}

export function runFileMigration(
  filePath: string,
  opts: {
    chainKey: string
    declaration: StoreDeclaration
    codec: VersionCodec
  }
): StoreState {
  const { chainKey, declaration, codec } = opts
  const state: StoreState = {
    chainKey,
    kind: declaration.kind,
    failedView: declaration.failedView ?? 'as-is',
    status: 'ok',
    refusedLogged: false
  }
  const current = currentVersionOf(chainKey)

  let bytes: Buffer
  let data: unknown
  try {
    if (!existsSync(filePath)) return state
    bytes = readFileSync(filePath)
    data = JSON.parse(bytes.toString('utf8'))
  } catch {
    // Unreadable or malformed: conf keeps its own clearInvalidConfig behaviour.
    return state
  }
  if (!isPlainObject(data)) return state

  let fileVersion: number
  try {
    fileVersion = codec.read(data)
  } catch {
    return state
  }

  if (fileVersion > current) {
    return markReadOnly(
      filePath,
      state,
      'newer',
      `file v${fileVersion} is newer than this build (v${current})`
    )
  }
  if (fileVersion === current) return state

  const steps = pendingChain(chainKey, fileVersion)
  if (steps.every((s) => s.identity)) return state

  if (declaration.kind === 'cache') {
    try {
      unlinkSync(filePath)
      return state
    } catch (err) {
      return markReadOnly(
        filePath,
        state,
        'failed',
        `v${fileVersion}->v${current}: ${errMessage(err)}`
      )
    }
  }

  try {
    writePreMigrationBackup(filePath, fileVersion, bytes)
    let result: Record<string, unknown> = structuredClone(data)
    for (const step of steps) {
      result = step.run(result)
      if (!isPlainObject(result)) {
        throw new Error(`migration ${step.id} did not return an object`)
      }
    }
    atomicWritePrivate(
      filePath,
      JSON.stringify(codec.write(result, current), undefined, '\t')
    )
    return state
  } catch (err) {
    return markReadOnly(
      filePath,
      state,
      'failed',
      `v${fileVersion}->v${current}: ${errMessage(err)}`
    )
  }
}

export function prepareStoreFile(
  filePath: string,
  chainKey: string,
  declaration: StoreDeclaration | undefined,
  codec: VersionCodec
): void {
  try {
    const key = resolve(filePath)
    const existing = STATE.get(key)
    if (existing) {
      if (declaration && declaration.kind !== existing.kind) {
        kindMismatches.push({
          path: key,
          first: existing.kind,
          second: declaration.kind
        })
        log(
          `${chainKey} declared as both ${existing.kind} and ${declaration.kind}; keeping ${existing.kind}`
        )
      }
      return
    }
    if (!declaration) return
    STATE.set(key, runFileMigration(key, { chainKey, declaration, codec }))
  } catch (err) {
    try {
      const key = resolve(filePath)
      const state: StoreState = {
        chainKey,
        kind: declaration?.kind ?? 'user-state',
        failedView: declaration?.failedView ?? 'as-is',
        status: 'readOnly',
        reason: 'failed',
        refusedLogged: false
      }
      STATE.set(key, state)
      log(`${chainKey} unexpected error: ${errMessage(err)}`)
    } catch {
      /* never rethrow */
    }
  }
}

export function viewOf<T>(filePath: string, data: T): T {
  const state = STATE.get(resolve(filePath))
  if (!state || state.status === 'ok') return data
  if (state.failedView === 'empty') return {} as T
  if (state.kind === 'cache' && state.reason === 'newer') return {} as T
  return data
}

export function stampForWrite<T extends Record<string, unknown>>(
  filePath: string,
  value: T
): T {
  const state = STATE.get(resolve(filePath))
  if (!state) return value
  const internal = (value.__internal__ ?? {}) as Record<string, unknown>
  const gamelib = (internal.gamelib ?? {}) as Record<string, unknown>
  return {
    ...value,
    __internal__: {
      ...internal,
      gamelib: { ...gamelib, schemaVersion: currentVersionOf(state.chainKey) }
    }
  }
}

export function isReadOnlyPath(filePath: string): boolean {
  return STATE.get(resolve(filePath))?.status === 'readOnly'
}

export function readOnlyReasonOf(
  filePath: string
): StoreReadOnlyReason | undefined {
  return STATE.get(resolve(filePath))?.reason
}

export function noteRefusedWrite(filePath: string): void {
  const state = STATE.get(resolve(filePath))
  if (!state || state.refusedLogged) return
  state.refusedLogged = true
  log(`${state.chainKey} is read-only (${state.reason}): write refused`)
}

export function __kindMismatchesForTest(): readonly {
  path: string
  first: StoreKind
  second: StoreKind
}[] {
  return kindMismatches
}

/** The kind the engine recorded for a store file (first declaration wins), for parity tests. */
export function __kindOfForTest(filePath: string): StoreKind | undefined {
  return STATE.get(resolve(filePath))?.kind
}

export function __resetStoreState(): void {
  STATE.clear()
  kindMismatches.length = 0
}
