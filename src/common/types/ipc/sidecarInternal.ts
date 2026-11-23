/**
 * Schemas for channels no `<Domain>` file declares (Phase 67, plan 18; RESEARCH open question 2).
 *
 * These are shell-originated (`health`, `trayResolveRunner`, `shellWindowFocused`,
 * `handleProtocolUrl`, the depot and steam-poll callbacks, `storeMirrorEvent`), and the
 * DEV-ONLY `devSweepEpicCookieDomain` (deliberately not on the preload surface; see
 * devEpicCookieSweepRegistration.ts). They are NOT part of the `ipc/index.ts` umbrella types, so
 * they never appear on `window.api`. The map names carry no Sync/Async suffix so the census
 * parser (`ipcDomainParse`) does not treat them as a declared domain part.
 *
 * Envelope checks only (D-05, D-07): the `gamelib://` prefix check stays in bootstrap.ts, the
 * Epic-domain gate stays in the Rust arm, and store field policy is the shell's
 * (`storeChannels.json`, `store_policy.rs`).
 */
import { z } from 'zod'

import { nonEmptyString } from './schemaTypes'

// Phase 73 (73-11): the Rust depot job calls back into Node. Every id is a decimal string
// (64-bit ids never cross as JS numbers); every payload is a single strict object.
const numericId = z.string().regex(/^\d+$/).max(20)
const jobId = nonEmptyString(64)
const count = z.number().nonnegative().finite()

const depotCdnTokenRequest = z.strictObject({
  jobId,
  appId: numericId,
  depotId: numericId,
  host: nonEmptyString(253),
  force: z.boolean()
})

const depotManifestRequestCodeRequest = z.strictObject({
  jobId,
  appId: numericId,
  depotId: numericId,
  manifestId: numericId
})

const depotJobEvent = z.discriminatedUnion('kind', [
  z.strictObject({
    jobId,
    seq: count,
    kind: z.literal('planned'),
    totalBytes: count,
    totalFiles: count,
    depots: z
      .array(
        z.strictObject({ depotId: numericId, gid: numericId, size: count })
      )
      .max(512)
  }),
  z.strictObject({
    jobId,
    seq: count,
    kind: z.literal('progress'),
    doneBytes: count,
    netBytes: count,
    totalBytes: count,
    filesDone: count,
    filesTotal: count,
    host: z.string().max(253).nullable(),
    elapsedMs: count
  }),
  z.strictObject({
    jobId,
    seq: count,
    kind: z.literal('warning'),
    message: nonEmptyString(512),
    count
  }),
  z.strictObject({
    jobId,
    seq: count,
    kind: z.literal('hostSummary'),
    hosts: z
      .array(
        z.strictObject({
          host: z.string().max(253),
          bytes: count,
          chunks: count,
          failures: count
        })
      )
      .max(256)
  }),
  // Phase 74: Rust JobEventBody::Stage (delta_planning / delta_committing); keep in lockstep with RustJobEvent.
  z.strictObject({
    jobId,
    seq: count,
    kind: z.literal('stage'),
    stage: z.enum(['delta_planning', 'delta_committing'])
  })
])

// Phase 80 (80-11): the Rust steampoll state events (gamelib-steampoll events.rs). Every event
// carries the full resulting state and a monotonic seq; keep in lockstep with `StateEvent`.
// 80-REVIEW C-WR-08: the bounds match what Rust can actually emit, not what a well-formed ACF
// holds. `sizeOnDisk` and `buildid` are raw ACF strings Rust passes through unvalidated (an empty
// or non-numeric SizeOnDisk is possible), and `installPath` is a steamapps dir joined with the
// raw installdir. An event this schema rejects is re-sent by the shell every 10 s for the rest of
// the session, so it must not be stricter than its producer. The handler sanitises the values.
// steamPollStateEventParity.test.ts parses the crate's serialised fixture of every variant.
const pollSource = z.enum(['native', 'bottle', 'bridge'])
const pollBuildId = z.string().max(256).nullable().optional()
const pollSizeOnDisk = z.string().max(256)
const pollInstallPath = nonEmptyString(65536)
const pollBase = { appId: numericId, seq: count }

const steamPollStateEvent = z.discriminatedUnion('kind', [
  z.strictObject({
    ...pollBase,
    kind: z.literal('installed'),
    source: pollSource,
    installPath: pollInstallPath,
    sizeOnDisk: pollSizeOnDisk,
    buildid: pollBuildId
  }),
  z.strictObject({ ...pollBase, kind: z.literal('installIncomplete') }),
  z.strictObject({
    ...pollBase,
    kind: z.literal('updateDone'),
    completed: z.boolean()
  }),
  z.strictObject({
    ...pollBase,
    kind: z.literal('uninstalled'),
    source: pollSource,
    survivor: z
      .strictObject({
        source: pollSource,
        installPath: pollInstallPath,
        sizeOnDisk: pollSizeOnDisk,
        buildid: pollBuildId
      })
      .nullable()
  }),
  z.strictObject({ ...pollBase, kind: z.literal('bridgeUninstalled') }),
  z.strictObject({
    ...pollBase,
    kind: z.literal('forcedWindowsViaBottleCleared')
  }),
  z.strictObject({
    ...pollBase,
    kind: z.literal('macArchVerdict'),
    verdict: z.enum(['32', '64'])
  }),
  // Phase 81 D-07: Steam adopted (or has not adopted) a GameLib-written install. `signedIn` is
  // the latest signed-in reading, null when unknown.
  z.strictObject({
    ...pollBase,
    kind: z.literal('adoptionState'),
    adopted: z.boolean(),
    signedIn: z.boolean().nullable()
  })
])

// Phase 85 (FND-06): what the shell tells the sidecar's mirror about a Rust-owned store, in the
// host's rev order. Keep in lockstep with `store_dispatch.rs` (`reply`, `mirror_event_for`).
// An answer to one sidecar store frame (`kind:"store"`) names the frame's `seq` as `originSeq` (a
// JS-safe positive integer); `rev` is the store's change count (0 when the store was never opened);
// `reason` rides only a `refused`. A `changed` event (85-17) reports a write from another origin (the
// renderer, a Rust module) the way a frame names one: `key` and `valueJson` a set, `key` alone a
// delete, `valueJson` alone a replace, neither a clear. `valueJson` is unbounded here, as a frame's is
// bounded only by the frame size the shell accepts.
const storeMirrorAck = z.strictObject({
  store: nonEmptyString(128),
  rev: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  op: z.enum(['applied', 'refused', 'flushed']),
  originSeq: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  reason: z
    .enum(['read-only', 'evicted', 'rejected', 'io', 'not-owned'])
    .optional()
})
const storeMirrorChanged = z.strictObject({
  store: nonEmptyString(128),
  rev: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  op: z.literal('changed'),
  key: nonEmptyString(65536).optional(),
  valueJson: z.string().optional()
})
const storeMirrorEvent = z.discriminatedUnion('op', [
  storeMirrorAck,
  storeMirrorChanged
])

// Phase 87 (87-42, D-24): Rust's engine registry changed on its own (a launch deadline, a game exit); the sidecar's
// selection view applies it. `selection` is the registry's value for `key`, `null` when the key was cleared. The
// engine fields mirror `EngineSelection` in `common/types/engine.ts` and the crate's serialisation.
const engineDxvk = z
  .strictObject({ dir: z.string().max(4096), version: z.string().max(256) })
  .nullable()
const engineBinaries = {
  wineBin: z.string().max(4096),
  wineserverBin: z.string().max(4096),
  label: z.string().max(256),
  version: z.string().max(256),
  dxvk: engineDxvk
}
const engineSelectionWire = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('crossover'),
    reason: z.enum(['cx-healthy', 'cx-inconclusive', 'override']),
    crossoverBuild: z.string().max(256).nullable(),
    binDir: z.string().max(4096)
  }),
  z.strictObject({
    kind: z.literal('pinned'),
    pinId: z.string().max(256),
    reason: z.enum([
      'cx-missing',
      'cx-expired',
      'cx-broken',
      'cx-inconclusive',
      'override'
    ]),
    ...engineBinaries
  }),
  z.strictObject({
    kind: z.literal('wine-manager'),
    managerVersion: z.string().max(256),
    reason: z.enum(['override', 'cx-inconclusive']),
    ...engineBinaries
  })
])
const engineSelectionChanged = z.strictObject({
  key: nonEmptyString(256),
  selection: engineSelectionWire.nullable()
})

// Phase 87 (87-54, D-17): a Steam bridge launch's deadline passed in Rust with no game process seen; the sidecar's
// bridge owner stops the bottle and shows its own dialog. `key` is the title's engine key (a Steam app id), `reason` the
// one word Rust sends.
const engineDeadlineFired = z.strictObject({
  key: nonEmptyString(256),
  reason: z.literal('no-game-process')
})

const noArgs = z.tuple([])

export const sidecarInternalInvokeArgs = {
  health: noArgs,
  // DEV-ONLY (unpackaged sidecars); driven from DevTools with ['fortnite.com'].
  devSweepEpicCookieDomain: z.tuple([nonEmptyString(253)]),
  trayResolveRunner: z.tuple([nonEmptyString(256)]),
  // The `gamelib://` prefix check stays in bootstrap.ts (D-05).
  handleProtocolUrl: z.tuple([nonEmptyString(8192)]),
  // Shell-originated: the Rust depot job asks Node for a CDN token / manifest request code.
  depotCdnToken: z.tuple([depotCdnTokenRequest]),
  depotManifestRequestCode: z.tuple([depotManifestRequestCodeRequest]),
  // Shell-originated: the Rust steam poll tells Node about sidecar-owned state changes (D-02).
  steamPollStateEvent: z.tuple([steamPollStateEvent])
}

export const sidecarInternalSendArgs = {
  shellWindowFocused: noArgs,
  // Shell-originated: Rust depot job progress events.
  depotJobEvent: z.tuple([depotJobEvent]),
  // Shell-originated: the answer to one sidecar store frame (Phase 85).
  storeMirrorEvent: z.tuple([storeMirrorEvent]),
  // Shell-originated: Rust's engine registry changed by itself (87-42). Never renderer-reachable.
  engineSelectionChanged: z.tuple([engineSelectionChanged]),
  // Shell-originated: a Steam bridge launch's deadline fired in Rust (87-54). Never renderer-reachable.
  engineDeadlineFired: z.tuple([engineDeadlineFired])
}

/** Channels only the Rust shell invokes; the 67-19 relay allow-list excludes them. */
export const sidecarInternalCallers = {
  health: 'shell',
  trayResolveRunner: 'shell',
  handleProtocolUrl: 'shell',
  shellWindowFocused: 'shell',
  depotCdnToken: 'shell',
  depotManifestRequestCode: 'shell',
  depotJobEvent: 'shell',
  storeMirrorEvent: 'shell',
  steamPollStateEvent: 'shell',
  engineSelectionChanged: 'shell',
  engineDeadlineFired: 'shell'
} as const

/** One Rust steampoll state event, as validated off the wire. */
export type SteamPollStateEvent = z.infer<typeof steamPollStateEvent>
