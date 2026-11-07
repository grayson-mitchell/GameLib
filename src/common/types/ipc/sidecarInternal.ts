/**
 * Schemas for channels no `<Domain>` file declares (Phase 67, plan 18; RESEARCH open question 2).
 *
 * These are shell-originated (`health`, `trayResolveRunner`, `shellWindowFocused`,
 * `handleProtocolUrl`, `sidecar:store-snapshot`), the renderer-driven store channels, and the
 * DEV-ONLY `devSweepEpicCookieDomain` (deliberately not on the preload surface; see
 * devEpicCookieSweepRegistration.ts). They are NOT part of the `ipc/index.ts` umbrella types, so
 * they never appear on `window.api`. The map names carry no Sync/Async suffix so the census
 * parser (`ipcDomainParse`) does not treat them as a declared domain part.
 *
 * Envelope checks only (D-05, D-07): the `gamelib://` prefix check stays in bootstrap.ts, the
 * Epic-domain gate stays in the Rust arm, and store field policy stays in
 * `common/types/storePolicy.ts` and `storeWriteHandlers.ts`.
 */
import { z } from 'zod'

import { nonEmptyString, optionalArg } from './schemaTypes'

const noArgs = z.tuple([])

// Store name and dot-notation key path, as the preload sends them (strings, never arrays).
const storeName = nonEmptyString(128)
const keyPath = nonEmptyString(512)

export const sidecarInternalInvokeArgs = {
  health: noArgs,
  // DEV-ONLY (unpackaged sidecars); driven from DevTools with ['fortnite.com'].
  devSweepEpicCookieDomain: z.tuple([nonEmptyString(253)]),
  trayResolveRunner: z.tuple([nonEmptyString(256)]),
  'sidecar:store-snapshot': noArgs,
  'sidecar:store-fetch': z.tuple([storeName]),
  // The `gamelib://` prefix check stays in bootstrap.ts (D-05).
  handleProtocolUrl: z.tuple([nonEmptyString(8192)])
}

export const sidecarInternalSendArgs = {
  shellWindowFocused: noArgs,
  // The value is any JSON value (it crosses the wire as JSON). `storePolicy.ts`
  // `isWritableStoreField` / `isSafeKeyPath` own the field policy, not this schema.
  storeSet: z.tuple([storeName, keyPath, z.json()]),
  storeDelete: z.tuple([storeName, keyPath]),
  // The handler ignores `options` (T-27-03) beyond a mismatch log.
  storeNew: z.tuple([storeName, optionalArg(z.record(z.string(), z.json()))])
}

/** Channels only the Rust shell invokes; the 67-19 relay allow-list excludes them. */
export const sidecarInternalCallers = {
  health: 'shell',
  trayResolveRunner: 'shell',
  'sidecar:store-snapshot': 'shell',
  handleProtocolUrl: 'shell',
  shellWindowFocused: 'shell'
} as const
