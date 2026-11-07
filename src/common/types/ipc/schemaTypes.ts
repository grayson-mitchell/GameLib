/**
 * Contract helpers for IPC channel schemas (Phase 67).
 *
 * Each domain declares `export const <domain><Kind>Args = { channel: z.tuple([...]) }` (the
 * part name the census derives is the const name minus `Args`, first letter upper-cased:
 * `shellFilesSyncArgs` -> `ShellFilesSync`) and derives its function types with `SendFns` /
 * `InvokeFns` / `PushFns` so the schema is the single source of truth for argument types.
 *
 * Every object schema a conversion writes is `z.strictObject` (D-06) unless it is wrapped in
 * `phase70Passthrough`. Backend and sidecar only: the renderer must never value-import this
 * module (D-04 keeps zod out of the renderer; `ipc/index.ts` stays type-only).
 */
import { z } from 'zod'

import type { Runner } from '../../types'

/**
 * A positional optional argument. JSON turns a positional `undefined` into `null` on the
 * wire, so the schema must accept both.
 */
export function optionalArg<T extends z.ZodType>(schema: T) {
  return schema.nullish()
}

export function nonEmptyString(max = 4096) {
  return z.string().min(1).max(max)
}

/**
 * Shape-only absolute path (D-05): no fs access, no settings, no containment. Handler-level
 * `rendererPathGuard` calls remain the containment check.
 */
export function absolutePathArg() {
  return z
    .string()
    .min(1)
    .max(4096)
    .refine((p) => !p.includes(String.fromCharCode(0)), 'NUL byte')
    .refine(
      (p) =>
        p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\'),
      'not absolute'
    )
}

const RUNNERS = ['legendary', 'gog', 'sideload', 'nile', 'steam'] as const
// Drift guard both ways: a Runner added to or removed from the union fails tsc here.
type RunnerListMatchesUnion = Runner extends (typeof RUNNERS)[number]
  ? (typeof RUNNERS)[number] extends Runner
    ? true
    : never
  : never
const runnerListMatchesUnion: RunnerListMatchesUnion = true
void runnerListMatchesUnion

/** A store runner id; the enum is derived from the Runner union so drift fails tsc. */
export function runnerArg() {
  return z.enum(RUNNERS)
}

/** WineInstallation, every key declared (D-06). */
export function wineInstallationArg() {
  return z.strictObject({
    bin: nonEmptyString(),
    name: z.string().max(1024),
    type: z.enum(['wine', 'proton', 'crossover', 'toolkit']),
    lib: z.string().max(4096).optional(),
    lib32: z.string().max(4096).optional(),
    wineserver: z.string().max(4096).optional()
  })
}

/** Any-scheme URL. Scheme allow-lists are Phase 72. */
export function urlArg() {
  return z
    .string()
    .max(8192)
    .refine((u) => URL.canParse(u), 'not a URL')
}

export function httpUrlArg() {
  return z.url({ protocol: /^https?$/ }).max(8192)
}

/**
 * PHASE70-PASSTHROUGH: D-07. The envelope stays strict; the nested GameInfo / settings object
 * is an explicit loose object that Phase 70 tightens. Grep `phase70Passthrough(` to find every
 * one.
 */
export function phase70Passthrough<T extends z.ZodRawShape>(shape: T) {
  return z.looseObject(shape)
}

export type ArgsMap = Record<string, z.ZodTuple>

export type SendFns<A extends ArgsMap> = {
  [K in keyof A]: (...args: z.input<A[K]>) => void
}

export type InvokeFns<A extends ArgsMap, R extends Record<keyof A, unknown>> = {
  [K in keyof A]: (...args: z.input<A[K]>) => R[K]
}

export type PushFns<A extends ArgsMap> = SendFns<A>

export type ChannelKind = 'invoke' | 'send' | 'push'

/** `local` = declared for typing, served in the preload/Tauri, never reaches the sidecar. */
export type ChannelCaller = 'renderer' | 'shell' | 'local'

export interface ChannelEntry {
  kind: ChannelKind
  caller: ChannelCaller
  testOnly: boolean
  args: z.ZodTuple
}

export function defineChannelEntries(
  kind: ChannelKind,
  argsMap: ArgsMap,
  opts: {
    caller?: ChannelCaller
    callers?: Partial<Record<string, ChannelCaller>>
    testOnly?: boolean
  } = {}
): Record<string, ChannelEntry> {
  const out: Record<string, ChannelEntry> = {}
  for (const [name, args] of Object.entries(argsMap)) {
    out[name] = {
      kind,
      caller: opts.callers?.[name] ?? opts.caller ?? 'renderer',
      testOnly: opts.testOnly ?? false,
      args
    }
  }
  return out
}
