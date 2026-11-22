/**
 * GameLib store backend (Phase 35 Plan 05 — REQ-35-03, D-04).
 *
 * Replaces `electron-store@8.2.0`, whose ONLY real addition over `conf` was
 * `require('electron')` on line 3 of its `index.js` — the last third-party
 * runtime dependency on Electron in the tree, and the sole remaining
 * justification for the esbuild `--alias:electron=` shim (plan 35-18 removes
 * that alias).
 *
 * WHY THIS MODULE EXISTS AT ALL, rather than importing `conf` directly at each
 * construction site (the load-bearing part — read before "simplifying" this):
 *
 * `electron-store`'s entire value-add was four lines of OPTION TRANSLATION
 * (electron-store/index.js:51-69), and `conf` does NOT accept the options this
 * codebase passes:
 *
 *   1. `options.name` DOES NOT EXIST in `conf`. `conf` reads
 *      `options.configName` (conf/dist/source/index.js:130 —
 *      `path.resolve(options.cwd, `${options.configName ?? 'config'}.json`)`).
 *      Passing `name` through unchanged is silently ignored, so EVERY store
 *      collapses onto a single `config.json` and every previously-persisted
 *      value reads back `undefined`. Measured blast radius when this was
 *      caught: 24 distinct `store_cache/*.json` files on a live profile
 *      (gog_library, steam_library, steam_metadata, humble_library,
 *      legendary_library, crossover_index, ...) collapsing onto one.
 *
 *   2. A RELATIVE `options.cwd` — and every cache-store call site passes the
 *      relative literal `'store_cache'` — is resolved by `conf` against
 *      `process.cwd()`, i.e. the repo working directory. `electron-store`
 *      joined it onto Electron's userData path instead.
 *
 *   3. With no `cwd` at all, `conf` derives one from `env-paths` + the package
 *      name — a DIFFERENT algorithm from Electron's userData path. Accepting
 *      that default would silently RELOCATE every persisted setting, library
 *      cache and credential in the app, and the app would come up looking
 *      factory-fresh while the old files — which hold `humbleConfigStore`'s
 *      sessionCookie/csrfToken and `steamConfigStore`'s refreshToken — sit
 *      orphaned at the previous path where no logout path can ever clear them
 *      (threat T-35-16).
 *
 * So `cwd` is ALWAYS passed to `conf` explicitly and ALWAYS absolute, derived
 * from `the boot's `StoreRoot.userData` — the one per-OS
 * derivation in this codebase, which already matches the conventions Electron
 * itself uses. `conf`'s own default is never allowed to apply. A happy side
 * effect: because `cwd` is always set, `conf` never calls `pkg-up` to infer a
 * project name (index.js:85-92), which would fail inside the bundled SEA
 * sidecar where there is no resolvable `package.json`.
 *
 * Phase 85 (FND-06, D-03): `conf` is gone. The Rust `StoreHost` is the one disk writer for every
 * store, so `GameLibStore` is only a facade over the boot's `MirrorCell` for its path
 * (`stores/mirrorCell.ts`): it reads from memory, applies a write to its own view and sends one
 * ordered frame to the shell. The class name, the constructor and the members consumers use
 * (`get set has delete clear store size path readOnly`) are unchanged, and the option translation
 * above still decides the path: the shell writes `<userData>/<store key>.json`, so a store must
 * resolve there. The versioning, read-only refusal and file modes the conf owner applied are the
 * shell's (gamelib-store), and a corrupt or newer file is reported read-only at boot
 * (`GAMELIB_STORE_BOOT`).
 */

import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'
import type { StoreOptions } from 'common/types/typed_store'
import type { MirrorCell } from './stores/mirrorCell'
import { dotPathsFor, isMirrorStoreKey } from './stores/storeFrames'
import type { StoreRoot } from './stores/storeRoot'
import type { StoreDeclaration } from './stores/types'

/**
 * The chain key the shell's table names a store file by: `<directory basename>/<file name without
 * .json>` (`store/config`, `store_cache/steam_library`). Moved here from the deleted TS versioning
 * engine (85-24); this is its only caller.
 */
function storeKeyOf(filePath: string): string {
  return `${basename(dirname(filePath))}/${basename(filePath, '.json')}`
}

/**
 * The store options after this module has translated `name` -> `configName` and made `cwd`
 * absolute (the shape `conf` took, kept because the file name rules are the same).
 */
type TranslatedOptions<T extends Record<string, unknown>> = Omit<
  StoreOptions<T>,
  'name'
> & {
  configName: string
  cwd: string
}

/**
 * Phase 18's lesson: `path.join` is not containment — use resolve+relative.
 */
function assertContained(candidate: string, root: string, label: string): void {
  const rel = relative(resolve(root), candidate)
  if (rel.startsWith('..') || isAbsolute(rel) || rel === '') {
    throw new Error(
      `[backend/store_backend] refusing a store path that resolves outside ${label}`
    )
  }
}

/**
 * Reproduces `electron-store`'s `name`/`cwd` translation, sourcing the default
 * cwd from the boot's `StoreRoot` instead of Electron's userData path, and enforces path
 * containment.
 *
 * The containment check was MOVED (not reimplemented) from the sidecar file store's
 * `resolveStorePath()` (deleted in quick 261121-pwt; this is now its only home) — Phase 29
 * code review WR-11.
 * It is defence-in-depth for `storeWriteHandlers.ts`'s `resolveWritableStore()`
 * / `storeNew`, which pass an RPC-supplied `storeName` straight into this
 * function's `name`. Those callers validate against `CACHE_STORE_NAME_PATTERN`
 * + `RECOGNIZED_CACHE_STORE_NAMES`, but the invariant must not rest on the
 * caller alone. Phase 18's lesson applies: `path.join` is not containment —
 * use resolve+relative.
 */
// Consumed by src/backend/__tests__/cache.test.ts via
// `const { translateStoreOptions } = jest.requireActual('../store_backend')`
// (line ~115), then CALLED and asserted on. `jest.requireActual`'s return
// type is `any`, so this reference is invisible to ts-prune despite both
// files being in tsconfig `include`.
export function translateStoreOptions<T extends Record<string, unknown>>(
  options: StoreOptions<T> = {},
  root: StoreRoot
): TranslatedOptions<T> {
  const { name, cwd, ...rest } = options
  const configName = name ?? 'config'
  const { userData } = root
  const resolvedCwd = cwd
    ? isAbsolute(cwd)
      ? cwd
      : join(userData, cwd)
    : userData

  // Mirror conf's own path construction (conf/dist/source/index.js:129-130) so
  // the containment check runs against the path conf will ACTUALLY use, not an
  // approximation of it. `fileExtension` defaults to 'json' in conf's own
  // option defaults (index.js:71).
  const fileExtension = rest.fileExtension ?? 'json'
  const predictedPath = resolve(
    join(
      resolvedCwd,
      `${configName}${fileExtension ? `.${fileExtension}` : ''}`
    )
  )

  // ANCHOR 1 — always. The resolved file must sit inside its own `cwd`. This is
  // the anchor that actually addresses WR-11's threat: `cwd` is hardcoded by
  // backend code at every call site, whereas `name` arrives from an RPC frame
  // via `storeWriteHandlers.ts`'s `resolveWritableStore()`/`storeNew`, so `name`
  // is the component an attacker controls and `../../evil` is the payload.
  // Anchoring to `cwd` is STRICTER than the deleted file store's original for that path — it
  // also forbids escaping `store_cache` into a sibling of it.
  assertContained(predictedPath, resolvedCwd, 'its cwd')

  // ANCHOR 2 — only when `cwd` was relative, i.e. when WE derived it from
  // userData just above. Deliberately NOT applied to an absolute caller-supplied
  // `cwd`: `runsForMe/stores.ts` and `macArch/stores.ts` pass an absolute
  // `join(userDataPath, 'store')` where `userDataPath` is Electron's
  // Electron's userData path, which is NOT string-identical to the root's
  // (Electron derives the leaf from the app name -- 'gamelib' unpackaged vs
  // electron-builder.yml's productName 'GameLib'). `path.relative` is a pure
  // string operation with no knowledge that macOS/Windows filesystems are
  // case-insensitive, so anchoring an absolute caller-supplied cwd to
  // the root's userData would compute '../gamelib/store' and throw on a path
  // that is in fact the very same directory. Measured: this threw for real
  // during Phase 35 Plan 05 before the anchor was split.
  if (!cwd || !isAbsolute(cwd)) {
    assertContained(predictedPath, userData, 'userData')
  }

  return { ...rest, configName, cwd: resolvedCwd }
}

type GameLibStoreOptions<T extends Record<string, unknown>> =
  StoreOptions<T> & {
    declaration?: StoreDeclaration
    /** The boot's root: the store's directory and shared state come from it, never from a global. */
    root?: StoreRoot
  }

interface ResolvedStore<T extends Record<string, unknown>> {
  declaration: StoreDeclaration | undefined
  root: StoreRoot
  translated: TranslatedOptions<T>
  filePath: string
}

function resolveStore<T extends Record<string, unknown>>(
  options: GameLibStoreOptions<T> | undefined
): ResolvedStore<T> {
  const { declaration, root, ...rest } = options ?? {}
  if (!root) {
    throw new Error(
      '[backend/store_backend] a store must be constructed with a StoreRoot'
    )
  }
  // The containment throw is preserved on purpose (WR-11).
  const translated = translateStoreOptions(rest as StoreOptions<T>, root)
  const filePath = resolve(
    translated.cwd,
    `${translated.configName}.${translated.fileExtension ?? 'json'}`
  )
  return { declaration, root, translated, filePath }
}

/** The members consumers use, loosely typed (the facade restores the types). */
interface StoreBackend {
  readonly path: string
  readonly readOnly: boolean
  readonly size: number
  store: Record<string, unknown>
  get(key: string, defaultValue?: unknown): unknown
  set(key: string | Record<string, unknown>, value?: unknown): void
  has(key: string): boolean
  delete(key: string): void
  clear(): void
  reset(...keys: string[]): void
  [Symbol.iterator](): IterableIterator<[string, unknown]>
}

/** A window onto the boot's mirror cell for this file path. */
class MirrorBackedStore implements StoreBackend {
  constructor(private readonly cell: MirrorCell) {}

  get path(): string {
    return this.cell.path
  }

  get readOnly(): boolean {
    return this.cell.readOnly
  }

  get size(): number {
    return this.cell.size
  }

  get store(): Record<string, unknown> {
    return this.cell.data
  }

  set store(value: Record<string, unknown>) {
    this.cell.replace(value)
  }

  get(key: string, defaultValue?: unknown): unknown {
    const value = this.cell.get(key)
    return value === undefined ? defaultValue : value
  }

  set(key: string | Record<string, unknown>, value?: unknown): void {
    if (typeof key === 'string') {
      this.cell.set(key, value)
      return
    }
    for (const [k, v] of Object.entries(key)) this.cell.set(k, v)
  }

  has(key: string): boolean {
    return this.cell.has(key)
  }

  delete(key: string): void {
    this.cell.delete(key)
  }

  clear(): void {
    this.cell.clear()
  }

  // conf's `reset` restored the constructor's `defaults`. No store is constructed with any (the
  // family plans moved stores that seed none), so there is nothing to restore.
  reset(): void {}

  [Symbol.iterator](): IterableIterator<[string, unknown]> {
    return Object.entries(this.cell.data)[Symbol.iterator]()
  }
}

/**
 * The mirror cell for a store. The shell writes the file at the store table's own path under ITS
 * user-data directory, so a store whose resolved path is anywhere else would read a different file
 * than the one Rust writes, and a key that names no store (no table row, or the `excluded`
 * `store/migrations`) is a file nobody writes: both are refused at construction instead of
 * diverging silently.
 */
function mirrorCellFor<T extends Record<string, unknown>>(
  resolved: ResolvedStore<T>,
  storeKey: string
): MirrorCell {
  const { root, filePath } = resolved
  if (!isMirrorStoreKey(storeKey)) {
    throw new Error(
      `[backend/store_backend] ${storeKey} is not a store the shell owns`
    )
  }
  const expected = resolve(root.userData, `${storeKey}.json`)
  if (filePath !== expected) {
    throw new Error(
      `[backend/store_backend] the Rust-owned store ${storeKey} must live at its table path under the user-data directory`
    )
  }
  return root.mirrors.cellFor({
    path: filePath,
    storeKey,
    dotPaths: dotPathsFor(storeKey)
  })
}

/**
 * Drop-in replacement for `electron-store`'s default export. Same constructor
 * surface (`{ cwd, name, clearInvalidConfig, ... }`), same on-disk JSON layout
 * and file naming, no `require('electron')`.
 */
export default class GameLibStore<
  T extends Record<string, unknown> = Record<string, unknown>
> {
  private readonly backend: StoreBackend

  /** What the store was declared as at its construction site (Phase 68 D-01 kind, token-bearing). */
  readonly declaration: StoreDeclaration | undefined

  constructor(options?: GameLibStoreOptions<T>) {
    const resolved = resolveStore(options)
    this.declaration = resolved.declaration
    this.backend = new MirrorBackedStore(
      mirrorCellFor(resolved, storeKeyOf(resolved.filePath))
    )
  }

  /** The store file's absolute path. */
  get path(): string {
    return this.backend.path
  }

  get readOnly(): boolean {
    return this.backend.readOnly
  }

  get size(): number {
    return this.backend.size
  }

  get store(): T {
    return this.backend.store as T
  }

  set store(value: T) {
    this.backend.store = value
  }

  get<Key extends keyof T>(key: Key): T[Key]
  get<Key extends keyof T>(
    key: Key,
    defaultValue: Required<T>[Key]
  ): Required<T>[Key]
  get<Key extends string, Value = unknown>(
    key: Exclude<Key, keyof T>,
    defaultValue?: Value
  ): Value
  get(key: string, defaultValue?: unknown): unknown {
    return this.backend.get(key, defaultValue)
  }

  set<Key extends keyof T>(key: Key, value?: T[Key]): void
  set(key: string, value: unknown): void
  set(object: Partial<T>): void
  set(key: string | Partial<T>, value?: unknown): void {
    this.backend.set(key as string | Record<string, unknown>, value)
  }

  has<Key extends keyof T>(key: Key | string): boolean {
    return this.backend.has(key as string)
  }

  delete<Key extends keyof T>(key: Key): void
  delete(key: string): void
  delete(key: string): void {
    this.backend.delete(key)
  }

  clear(): void {
    this.backend.clear()
  }

  reset<Key extends keyof T>(...keys: Key[]): void
  reset(...keys: string[]): void
  reset(...keys: string[]): void {
    this.backend.reset(...keys)
  }

  [Symbol.iterator](): IterableIterator<[keyof T, T[keyof T]]> {
    return this.backend[Symbol.iterator]() as IterableIterator<
      [keyof T, T[keyof T]]
    >
  }
}
