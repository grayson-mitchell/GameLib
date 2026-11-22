import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { deletePath, setPath } from '../stores/dotPath'
import type { MirrorRegistry } from '../stores/mirrorCell'
import type { StoreFrame, StoreFrameSink } from '../stores/storeFrames'
import { dotPathsFor } from '../stores/storeOwnership'
import type { StoreVersioning } from '../storeVersioning/engine'

/**
 * The in-process stand-in for the Rust store owner, for jest (Phase 85 plan 11, research
 * Pitfall 12). A real-store suite builds a store, writes through it and reads the file back; once a
 * store belongs to Rust its writes are frames for the shell, and there is no shell under jest. This
 * sink is the shell's one writer in miniature: it applies each frame to an in-memory copy of the
 * store's file, writes the file synchronously, and answers the frame at once with the
 * `storeMirrorEvent` the shell would send, so the mirror's pending list is empty again before the
 * next line of the test runs.
 *
 * Bytes follow the shell's: a conf store is `JSON.stringify(stamped, undefined, '\t')`, the version
 * envelope (`__internal__.gamelib.schemaVersion`) added where the store has none and left in its
 * place where it has; a settings document is two-space with no envelope. Dot paths are `dotPath.ts`.
 * A write that cannot reach the disk is answered `refused` (`io`), as a failed persist is.
 *
 * `attach` connects the sink to the root it serves (the root is built with this sink, so the two
 * cannot be given each other at construction). A frame that arrives before `attach` is a test
 * wiring error and throws. No timers or handles: everything is synchronous.
 */

type Doc = Record<string, unknown>

export interface DiskStoreSink {
  readonly sink: StoreFrameSink
  /** Connects the sink to the mirrors it answers and the versioning engine that names store versions. */
  attach(root: {
    readonly mirrors: Pick<MirrorRegistry, 'applyEvent'>
    readonly versioning: Pick<StoreVersioning, 'currentVersionOf'>
  }): void
}

export interface DiskStoreSinkOptions {
  /** The directory store keys resolve under (`<userData>/<store key>.json`, as `mirrorCellFor` expects; `settings/global` is `<userData>/config.json`). */
  userData: string
  /** Every frame the sink receives is also pushed here, in order, before it is applied. */
  recordFrames?: StoreFrame[]
}

function loadDoc(path: string): Doc {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as Doc
    }
  } catch {
    // A missing or unreadable file is an empty store, as the shell opens it.
  }
  return {}
}

export function createDiskStoreSink(
  options: DiskStoreSinkOptions
): DiskStoreSink {
  const docs = new Map<string, Doc>()
  const revs = new Map<string, number>()
  let root: Parameters<DiskStoreSink['attach']>[0] | undefined

  // `settings/global` is the app folder's `config.json` (the shell's `path_for`); every other key,
  // `GamesConfig/<app>` included, is `<userData>/<key>.json`.
  const pathOf = (storeKey: string): string =>
    storeKey === 'settings/global'
      ? resolve(options.userData, 'config.json')
      : resolve(options.userData, `${storeKey}.json`)

  /** Applies the frame's op to the store's document in memory and returns the file's text. */
  function apply(frame: StoreFrame): string {
    const path = pathOf(frame.store)
    let doc = docs.get(frame.store)
    if (!doc) {
      doc = loadDoc(path)
      docs.set(frame.store, doc)
    }
    const dotPaths = dotPathsFor(frame.store)
    switch (frame.op) {
      case 'set':
        setPath(
          doc,
          frame.key as string,
          JSON.parse(frame.valueJson as string),
          dotPaths
        )
        break
      case 'delete':
        deletePath(doc, frame.key as string, dotPaths)
        break
      case 'clear':
        doc = {}
        break
      case 'replace':
        doc = JSON.parse(frame.valueJson as string) as Doc
        break
    }
    // A settings DOCUMENT (the `settings` flavour): config.json or a GamesConfig file. The family's
    // third store, store/config (configStore), is a conf store like any other (85-15).
    const settings =
      frame.store === 'settings/global' ||
      frame.store.startsWith('GamesConfig/')
    if (!settings) {
      const internal = (doc.__internal__ ?? {}) as Doc
      const gamelib = (internal.gamelib ?? {}) as Doc
      doc = {
        ...doc,
        __internal__: {
          ...internal,
          gamelib: {
            ...gamelib,
            schemaVersion: (
              root as NonNullable<typeof root>
            ).versioning.currentVersionOf(frame.store)
          }
        }
      }
    }
    docs.set(frame.store, doc)
    return JSON.stringify(doc, undefined, settings ? 2 : '\t')
  }

  return {
    sink: {
      send(frame) {
        if (!root) {
          throw new Error(
            '[diskStoreSink] a frame arrived before the sink was attached to a root'
          )
        }
        options.recordFrames?.push(frame)
        const { mirrors } = root
        if (frame.op === 'flush') {
          mirrors.applyEvent({
            store: frame.store,
            rev: revs.get(frame.store) ?? 0,
            op: 'flushed',
            originSeq: frame.seq
          })
          return
        }
        try {
          const text = apply(frame)
          const path = pathOf(frame.store)
          mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
          writeFileSync(path, text, { mode: 0o600 })
        } catch {
          // The memory copy may be ahead of a file that was not written: drop it so the next
          // frame starts from what the disk holds.
          docs.delete(frame.store)
          mirrors.applyEvent({
            store: frame.store,
            rev: revs.get(frame.store) ?? 0,
            op: 'refused',
            originSeq: frame.seq,
            reason: 'io'
          })
          return
        }
        const rev = (revs.get(frame.store) ?? 0) + 1
        revs.set(frame.store, rev)
        mirrors.applyEvent({
          store: frame.store,
          rev,
          op: 'applied',
          originSeq: frame.seq
        })
      }
    },
    attach(target) {
      root = target
    }
  }
}
