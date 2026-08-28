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
 *      joined it onto `app.getPath('userData')` instead.
 *
 *   3. With no `cwd` at all, `conf` derives one from `env-paths` + the package
 *      name — a DIFFERENT algorithm from `app.getPath('userData')`. Accepting
 *      that default would silently RELOCATE every persisted setting, library
 *      cache and credential in the app, and the app would come up looking
 *      factory-fresh while the old files — which hold `humbleConfigStore`'s
 *      sessionCookie/csrfToken and `steamConfigStore`'s refreshToken — sit
 *      orphaned at the previous path where no logout path can ever clear them
 *      (threat T-35-16).
 *
 * So `cwd` is ALWAYS passed to `conf` explicitly and ALWAYS absolute, derived
 * from `sidecar/pathShim.ts`'s `getPath('userData')` — the one per-OS
 * derivation in this codebase, which already matches the conventions Electron
 * itself uses. `conf`'s own default is never allowed to apply. A happy side
 * effect: because `cwd` is always set, `conf` never calls `pkg-up` to infer a
 * project name (index.js:85-92), which would fail inside the bundled SEA
 * sidecar where there is no resolvable `package.json`.
 *
 * Verified intact on `conf@10.2.0`, so no call site changed: `.get(key,
 * defaultValue)`, `.set`, `.has`, `.delete`, `.clear`, `.store`,
 * `Symbol.iterator`, dot-notation key paths, `clearInvalidConfig`, `defaults`
 * and `accessPropertiesByDotNotation`.
 *
 * Pinned to `conf@^10.2.0` deliberately, NOT latest: `conf@11+` are
 * `type: module` (ESM-only) and `conf@15` additionally requires Node >=20,
 * either of which would drag an unrelated ESM migration into this change.
 * 10.2.0 is also the exact version already resolved and integrity-pinned in
 * `pnpm-lock.yaml` as `electron-store@8.2.0`'s own dependency, so the
 * supply-chain delta of this swap is zero.
 */

import Conf from 'conf'
import { isAbsolute, join, relative, resolve } from 'path'
import type { StoreOptions } from 'common/types/electron_store'
import { getPath } from './sidecar/pathShim'

/**
 * `conf`'s own option shape, after this module has translated `name` ->
 * `configName` and made `cwd` absolute.
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
 * cwd from `pathShim` instead of `app.getPath('userData')`, and enforces path
 * containment.
 *
 * The containment check is MOVED (not reimplemented) from
 * `sidecar/fileStore.ts`'s `resolveStorePath()` — Phase 29 code review WR-11.
 * It is defence-in-depth for `storeWriteHandlers.ts`'s `resolveWritableStore()`
 * / `storeNew`, which pass an RPC-supplied `storeName` straight into this
 * function's `name`. Those callers validate against `CACHE_STORE_NAME_PATTERN`
 * + `RECOGNIZED_CACHE_STORE_NAMES`, but the invariant must not rest on the
 * caller alone. Phase 18's lesson applies: `path.join` is not containment —
 * use resolve+relative.
 */
export function translateStoreOptions<T extends Record<string, unknown>>(
  options: StoreOptions<T> = {}
): TranslatedOptions<T> {
  const { name, cwd, ...rest } = options
  const configName = name ?? 'config'
  const userData = getPath('userData')
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
  // Anchoring to `cwd` is STRICTER than fileStore's original for that path — it
  // also forbids escaping `store_cache` into a sibling of it.
  assertContained(predictedPath, resolvedCwd, 'its cwd')

  // ANCHOR 2 — only when `cwd` was relative, i.e. when WE derived it from
  // userData just above. Deliberately NOT applied to an absolute caller-supplied
  // `cwd`: `game_overrides/electronStores.ts` passes an absolute
  // `join(userDataPath, 'store')` where `userDataPath` is Electron's
  // `app.getPath('userData')`, which is NOT string-identical to `pathShim`'s
  // (Electron derives the leaf from the app name -- 'gamelib' unpackaged vs
  // electron-builder.yml's productName 'GameLib'). `path.relative` is a pure
  // string operation with no knowledge that macOS/Windows filesystems are
  // case-insensitive, so anchoring an absolute caller-supplied cwd to
  // pathShim's userData would compute '../gamelib/store' and throw on a path
  // that is in fact the very same directory. Measured: this threw for real
  // during Phase 35 Plan 05 before the anchor was split.
  if (!cwd || !isAbsolute(cwd)) {
    assertContained(predictedPath, userData, 'userData')
  }

  return { ...rest, configName, cwd: resolvedCwd }
}

/**
 * Drop-in replacement for `electron-store`'s default export. Same constructor
 * surface (`{ cwd, name, clearInvalidConfig, ... }`), same on-disk JSON layout
 * and file naming, no `require('electron')`.
 */
export default class GameLibStore<
  T extends Record<string, unknown> = Record<string, unknown>
> extends Conf<T> {
  constructor(options?: StoreOptions<T>) {
    super(translateStoreOptions(options))
  }
}
