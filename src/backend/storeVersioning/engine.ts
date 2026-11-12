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
import type { Migrations } from '../storeMigrations'
import { atomicWritePrivate, writePreMigrationBackup } from './backup'
import type { ReadOnlyStores } from './readOnlyStores'
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

export type KindMismatch = {
  path: string
  first: StoreKind
  second: StoreKind
}

export interface StoreVersioning {
  runFileMigration(
    filePath: string,
    opts: {
      chainKey: string
      declaration: StoreDeclaration
      codec: VersionCodec
    }
  ): StoreState
  prepareStoreFile(
    filePath: string,
    chainKey: string,
    declaration: StoreDeclaration | undefined,
    codec: VersionCodec
  ): void
  viewOf<T>(filePath: string, data: T): T
  stampForWrite<T extends Record<string, unknown>>(
    filePath: string,
    value: T
  ): T
  isReadOnlyPath(filePath: string): boolean
  readOnlyReasonOf(filePath: string): StoreReadOnlyReason | undefined
  noteRefusedWrite(filePath: string): void
  /** The chain version the migration runner reports for a store (override-aware). */
  currentVersionOf(chainKey: string): number
  /** The kind the engine recorded for a store file (first declaration wins), for parity tests. */
  kindOf(filePath: string): StoreKind | undefined
  /** Stores declared under two different kinds; a diagnostic list, never acted on. */
  kindMismatches(): readonly KindMismatch[]
}

/**
 * One store root's versioning engine (66.4 plan 18, D-05). Per-file state and the kind-mismatch
 * list live in this closure; a root's stores share one engine and two roots share nothing.
 * Synchronous and handle-free like the module it replaced (sidecar exit contract).
 */
export function createStoreVersioning(deps: {
  migrations: Migrations
  readOnly: ReadOnlyStores
}): StoreVersioning {
  const STATE = new Map<string, StoreState>()
  const kindMismatches: KindMismatch[] = []

  function markReadOnly(
    filePath: string,
    state: StoreState,
    reason: StoreReadOnlyReason,
    detail: string
  ): StoreState {
    state.status = 'readOnly'
    state.reason = reason
    deps.readOnly.record({
      storeKey: state.chainKey,
      file: basename(filePath),
      reason,
      detail
    })
    log(`${state.chainKey} is read-only (${reason}): ${detail}`)
    return state
  }

  function runFileMigration(
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
    const current = deps.migrations.currentVersionOf(chainKey)

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

    const steps = deps.migrations.pendingChain(chainKey, fileVersion)
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

  function prepareStoreFile(
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

  function viewOf<T>(filePath: string, data: T): T {
    const state = STATE.get(resolve(filePath))
    if (!state || state.status === 'ok') return data
    if (state.failedView === 'empty') return {} as T
    if (state.kind === 'cache' && state.reason === 'newer') return {} as T
    return data
  }

  function stampForWrite<T extends Record<string, unknown>>(
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
        gamelib: {
          ...gamelib,
          schemaVersion: deps.migrations.currentVersionOf(state.chainKey)
        }
      }
    }
  }

  function isReadOnlyPath(filePath: string): boolean {
    return STATE.get(resolve(filePath))?.status === 'readOnly'
  }

  function readOnlyReasonOf(filePath: string): StoreReadOnlyReason | undefined {
    return STATE.get(resolve(filePath))?.reason
  }

  function noteRefusedWrite(filePath: string): void {
    const state = STATE.get(resolve(filePath))
    if (!state || state.refusedLogged) return
    state.refusedLogged = true
    log(`${state.chainKey} is read-only (${state.reason}): write refused`)
  }

  return {
    runFileMigration,
    prepareStoreFile,
    viewOf,
    stampForWrite,
    isReadOnlyPath,
    readOnlyReasonOf,
    noteRefusedWrite,
    currentVersionOf: (chainKey) => deps.migrations.currentVersionOf(chainKey),
    kindOf: (filePath) => STATE.get(resolve(filePath))?.kind,
    kindMismatches: () => kindMismatches
  }
}
