/**
 * TS -> Rust IPC contract generator (Phase 67, D-16..D-18).
 *
 * Reads the TypeScript transport contract (`src/common/types/sidecarTransport.ts`) and the
 * per-channel zod schemas for Rust-owned channels (`src/common/types/ipc/rustInvoke.ts`) and writes
 * `src-tauri/src/ipc_contract.rs`: the five transport constants, the `RustInvokeChannel` name enum
 * and (as 67-06 fills `rustInvokeArgs`) one `<Channel>Args` struct per channel.
 *
 * Schemas go through `z.toJSONSchema(..., { io: 'input' })` and a project-owned emitter: no Rust
 * crate is added. The emitter supports ONLY string, integer, number, boolean, enum, const,
 * optional/nullable, array and object. Anything else throws naming the channel and JSON pointer; the
 * one way to ask for `serde_json::Value` is the explicit `x-rust-value: true` meta key.
 *
 * Tuple-level meta keys: `x-error-prefix` (error-string prefix, default the channel name) and
 * `x-field-errors: true` (single-object tuples only: `from_args` reports `<prefix>:bad-args` when
 * the object is missing, and `<prefix>:bad-args:<property>` naming the first property, in declared
 * order, that fails to deserialize). Leaf meta: `x-rust-value`, and `x-secret: true` on a field
 * whose value must never reach a log: its struct gets a hand-written `Debug` that prints
 * `<redacted>` for that field instead of `#[derive(Debug)]` (79 review B/IN-01, T-28-04).
 *
 * Run with `pnpm gen:ipc-contract`. The generated file is COMMITTED so `cargo build` needs no Node;
 * `pnpm check:ipc-contract` (CI + path-filtered pre-commit) regenerates in memory and fails on any
 * difference.
 *
 * Imports below are relative on purpose: `meta/runTs.cjs` bundling does not honour tsconfig baseUrl.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'
import {
  FRONTEND_MESSAGE_EVENT,
  IPC_INVALID_ARGS,
  IPC_INVALID_ARGS_MARKER,
  IPC_INVALID_CHANNEL_MARKER,
  READY_SENTINEL,
  RUST_INVOKE_CHANNELS,
  RUST_INVOKE_KIND,
  SHELL_WINDOW_FOCUSED,
  STORE_FRAME_KIND,
  STORE_MIRROR_EVENT_CHANNEL,
  STORE_SNAPSHOT_CHANNEL
} from '../src/common/types/sidecarTransport'
import { rustInvokeArgs } from '../src/common/types/ipc/rustInvoke'
import {
  channelSchemas,
  collidingPushSchemas
} from '../src/common/types/ipc/channelSchemas'

const OUTPUT_REL = 'src-tauri/src/ipc_contract.rs'
const SNAPSHOT_REL = 'src/common/types/ipc/ipcSchemaSnapshot.json'
const NATIVE_MANIFEST_REL = 'src/common/types/ipc/nativeChannels.json'
const GENERATOR = 'meta/genIpcContract.ts'
const REGEN_CMD = 'pnpm gen:ipc-contract'

type JsonNode = Record<string, unknown>

export interface RenderCtx {
  channel: string
  /** Pascal-case prefix used to name nested decls (structs/enums). */
  nameHint: string
  /** JSON pointer of the node being rendered, for error messages. */
  pointer: string
  decls: string[]
  usesValue: boolean
  usesDeserialize: boolean
}

export function newCtx(channel: string): RenderCtx {
  return {
    channel,
    nameHint: pascal(channel),
    pointer: '#',
    decls: [],
    usesValue: false,
    usesDeserialize: false
  }
}

function fail(ctx: RenderCtx, what: string): never {
  throw new Error(
    `genIpcContract: channel "${ctx.channel}" at ${ctx.pointer}: ${what}`
  )
}

function pascal(s: string): string {
  return s
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')
}

function snake(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toLowerCase()
}

const RUST_KEYWORDS = new Set([
  'type',
  'match',
  'move',
  'ref',
  'self',
  'fn',
  'mod',
  'use',
  'loop',
  'in',
  'as',
  'box',
  'impl',
  'trait',
  'where',
  'async',
  'await',
  'dyn',
  'static',
  'struct',
  'enum',
  'const',
  'let',
  'if',
  'else',
  'for',
  'while',
  'return',
  'break',
  'continue',
  'pub',
  'super',
  'crate',
  'mut',
  'true',
  'false',
  'unsafe',
  'extern',
  'yield'
])

function fieldIdent(name: string): string {
  const s = snake(name)
  return RUST_KEYWORDS.has(s) ? `${s}_` : s
}

const ANNOTATION_KEYS = new Set([
  'title',
  'description',
  'x-error-prefix',
  'x-rust-value',
  'x-field-errors',
  'x-secret',
  '$schema',
  'minimum',
  'maximum'
])

function checkKeys(node: JsonNode, allowed: string[], ctx: RenderCtx): void {
  const ok = new Set([...allowed, ...ANNOTATION_KEYS])
  for (const k of Object.keys(node)) {
    if (!ok.has(k)) fail(ctx, `unsupported JSON Schema keyword "${k}"`)
  }
}

function child(ctx: RenderCtx, seg: string, hint?: string): RenderCtx {
  return {
    ...ctx,
    pointer: `${ctx.pointer}/${seg}`,
    nameHint: hint ?? ctx.nameHint
  }
}

function merge(into: RenderCtx, from: RenderCtx): void {
  into.usesValue ||= from.usesValue
  into.usesDeserialize ||= from.usesDeserialize
}

function rustStr(s: string): string {
  return JSON.stringify(s)
}

function renderEnum(name: string, values: unknown[], ctx: RenderCtx): string {
  if (values.length === 0) fail(ctx, 'empty enum')
  const seen = new Set<string>()
  const variants = values.map((v) => {
    if (typeof v !== 'string')
      fail(ctx, 'only string enums/consts are supported')
    let ident = pascal(v) || 'Empty'
    if (/^[0-9]/.test(ident)) ident = `V${ident}`
    if (seen.has(ident)) ident = `${ident}${seen.size}`
    seen.add(ident)
    return `    #[serde(rename = ${rustStr(v)})]\n    ${ident},`
  })
  ctx.usesDeserialize = true
  return `#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]\npub(crate) enum ${name} {\n${variants.join('\n')}\n}`
}

/**
 * Rust type for one JSON-Schema node. Nested enums/structs are appended to `ctx.decls`.
 */
export function rustTypeFor(node: JsonNode, ctx: RenderCtx): string {
  if (node['x-rust-value'] === true) {
    ctx.usesValue = true
    return 'Value'
  }
  // A nullable non-primitive (`z.array(...).nullable()`) arrives as `anyOf: [X, { type: 'null' }]`
  // (primitives collapse to a `type` array instead). That one shape is `Option<X>`; any other
  // `anyOf` is a real union and stays unsupported.
  if (Array.isArray(node.anyOf) && node.anyOf.length === 2) {
    const [a, b] = node.anyOf as JsonNode[]
    const isNull = (n: JsonNode | undefined): boolean =>
      n !== undefined && n.type === 'null' && Object.keys(n).length === 1
    const inner = isNull(b) ? a : isNull(a) ? b : undefined
    if (inner !== undefined && !isNull(inner)) {
      return `Option<${rustTypeFor(inner, ctx)}>`
    }
  }
  for (const k of ['oneOf', 'anyOf', 'allOf', 'not', '$ref']) {
    if (k in node) fail(ctx, `"${k}" is not supported`)
  }
  if ('propertyNames' in node) fail(ctx, 'record schemas are not supported')
  if (Object.keys(node).filter((k) => !ANNOTATION_KEYS.has(k)).length === 0) {
    fail(ctx, 'unknown/any schema ({}); use x-rust-value to opt in to Value')
  }

  if ('const' in node) {
    checkKeys(node, ['const', 'type'], ctx)
    const name = `${ctx.nameHint}Const`
    ctx.decls.push(renderEnum(name, [node.const], ctx))
    return name
  }
  if ('enum' in node) {
    checkKeys(node, ['enum', 'type'], ctx)
    const name = ctx.nameHint
    ctx.decls.push(renderEnum(name, node.enum as unknown[], ctx))
    return name
  }

  let type = node.type
  let nullable = false
  if (Array.isArray(type)) {
    const rest = type.filter((t) => t !== 'null')
    nullable = rest.length !== type.length
    if (rest.length !== 1) fail(ctx, 'multi-type unions are not supported')
    type = rest[0]
  }
  if (typeof type !== 'string') fail(ctx, 'schema has no usable "type"')

  let out: string
  switch (type) {
    case 'string':
      checkKeys(node, ['type'], ctx)
      out = 'String'
      break
    case 'integer':
      checkKeys(node, ['type'], ctx)
      out = 'i64'
      break
    case 'number':
      checkKeys(node, ['type'], ctx)
      out = 'f64'
      break
    case 'boolean':
      checkKeys(node, ['type'], ctx)
      out = 'bool'
      break
    case 'null':
      fail(ctx, 'a bare null schema is not supported')
      break
    case 'array': {
      checkKeys(node, ['type', 'items', 'minItems', 'maxItems'], ctx)
      if (!node.items || node.items === true) {
        fail(ctx, 'array without an items schema (rest/unknown items)')
      }
      const inner = child(ctx, 'items', `${ctx.nameHint}Item`)
      out = `Vec<${rustTypeFor(node.items as JsonNode, inner)}>`
      merge(ctx, inner)
      break
    }
    case 'object': {
      checkKeys(
        node,
        ['type', 'properties', 'required', 'additionalProperties'],
        ctx
      )
      const ap = node.additionalProperties
      if (
        ap !== undefined &&
        ap !== false &&
        !(typeof ap === 'object' && ap && Object.keys(ap).length === 0)
      ) {
        fail(ctx, 'record / typed additionalProperties is not supported')
      }
      const name = ctx.nameHint
      ctx.decls.push(renderStruct(name, node, ctx))
      out = name
      break
    }
    default:
      fail(ctx, `unsupported type "${String(type)}"`)
  }
  return nullable ? `Option<${out}>` : out
}

/**
 * `Debug` for a struct with `x-secret` fields: the secret fields print `<redacted>`, the rest
 * print as `#[derive(Debug)]` would. Field order is the declared order.
 */
function renderRedactingDebug(
  name: string,
  fields: { ident: string; secret: boolean }[]
): string {
  const lines = fields.map(({ ident, secret }) =>
    secret
      ? `            .field(${rustStr(ident)}, &"<redacted>")`
      : `            .field(${rustStr(ident)}, &self.${ident})`
  )
  return `impl std::fmt::Debug for ${name} {\n    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {\n        f.debug_struct(${rustStr(name)})\n${lines.join('\n')}\n            .finish()\n    }\n}`
}

/** The derive line plus, when any field is secret, the redacting `Debug` impl to append. */
function debugParts(
  name: string,
  fields: { ident: string; secret: boolean }[],
  derives: string
): { derive: string; debugImpl: string } {
  if (!fields.some((f) => f.secret)) {
    return { derive: `#[derive(Debug, ${derives})]`, debugImpl: '' }
  }
  return {
    derive: `#[derive(${derives})]`,
    debugImpl: `\n\n${renderRedactingDebug(name, fields)}`
  }
}

function renderStruct(name: string, node: JsonNode, ctx: RenderCtx): string {
  const props = (node.properties ?? {}) as Record<string, JsonNode>
  const required = new Set((node.required ?? []) as string[])
  const lines: string[] = []
  const fields: { ident: string; secret: boolean }[] = []
  for (const [key, prop] of Object.entries(props)) {
    const sub = child(ctx, `properties/${key}`, `${name}${pascal(key)}`)
    let ty = rustTypeFor(prop, sub)
    merge(ctx, sub)
    ctx.decls.push(...sub.decls.splice(0))
    if (!required.has(key) && !ty.startsWith('Option<')) ty = `Option<${ty}>`
    const ident = fieldIdent(key)
    const attrs: string[] = []
    if (ident !== key) attrs.push(`    #[serde(rename = ${rustStr(key)})]`)
    if (!required.has(key)) attrs.push('    #[serde(default)]')
    lines.push([...attrs, `    pub(crate) ${ident}: ${ty},`].join('\n'))
    fields.push({ ident, secret: prop['x-secret'] === true })
  }
  ctx.usesDeserialize = true
  const body = lines.length ? `\n${lines.join('\n')}\n` : ''
  const { derive, debugImpl } = debugParts(name, fields, 'Clone, Deserialize')
  return `${derive}\npub(crate) struct ${name} {${body}}${debugImpl}`
}

/**
 * Struct + `from_args` for one channel's positional-argument tuple schema.
 * A single-object tuple maps to the object's fields; a multi-element tuple takes field names from
 * each prefixItem's `title`.
 */
export function renderArgsStruct(
  channel: string,
  tuple: JsonNode,
  ctxIn?: RenderCtx
): { text: string; usesValue: boolean; usesDeserialize: boolean } {
  const ctx = ctxIn ?? newCtx(channel)
  const prefix = (tuple['x-error-prefix'] as string | undefined) ?? channel
  const err = `${prefix}:bad-args`
  const name = `${pascal(channel)}Args`
  const items = (tuple.prefixItems ?? []) as JsonNode[]
  if (tuple.type !== 'array') fail(ctx, 'args schema must be a tuple')
  if (tuple.items !== false && tuple.items !== undefined) {
    fail(ctx, 'rest items are not supported on an args tuple')
  }
  const minItems = (tuple.minItems as number | undefined) ?? 0

  const decls: string[] = []
  const firstItem = items[0]
  let main: string
  if (items.length === 0) {
    main = `#[derive(Debug, Clone, Copy)]\npub(crate) struct ${name};\n\nimpl ${name} {\n    pub(crate) fn from_args(_args: &[Value]) -> Result<Self, String> {\n        Ok(Self)\n    }\n}`
    ctx.usesValue = true
  } else if (tuple['x-field-errors'] === true) {
    if (
      items.length !== 1 ||
      firstItem === undefined ||
      firstItem.type !== 'object'
    ) {
      fail(ctx, 'x-field-errors needs a tuple of exactly one object argument')
    }
    const sub: RenderCtx = {
      ...ctx,
      nameHint: name,
      pointer: '#/prefixItems/0'
    }
    decls.push(renderStructInto(name, firstItem, sub))
    merge(ctx, sub)
    decls.push(...sub.decls)
    const props = (firstItem.properties ?? {}) as Record<string, JsonNode>
    const required = new Set(
      (Array.isArray(firstItem.required) ? firstItem.required : []).filter(
        (r): r is string => typeof r === 'string'
      )
    )
    const lets: string[] = []
    const names: string[] = []
    for (const [key, prop] of Object.entries(props)) {
      const scratch: RenderCtx = {
        ...ctx,
        nameHint: `${name}${pascal(key)}`,
        pointer: `#/prefixItems/0/properties/${key}`,
        decls: []
      }
      let ty = rustTypeFor(prop, scratch)
      if (scratch.decls.length > 0) {
        fail(
          scratch,
          'x-field-errors supports scalar and array properties only'
        )
      }
      if (!required.has(key) && !ty.startsWith('Option<')) ty = `Option<${ty}>`
      const ident = fieldIdent(key)
      names.push(ident)
      lets.push(
        `        let ${ident}: ${ty} = serde_json::from_value(obj.get(${rustStr(key)}).cloned().unwrap_or(Value::Null)).map_err(|_| ${rustStr(`${err}:${key}`)}.to_string())?;`
      )
    }
    ctx.usesValue = true
    main = `impl ${name} {\n    pub(crate) fn from_args(args: &[Value]) -> Result<Self, String> {\n        let obj = args.first().and_then(Value::as_object).ok_or_else(|| ${rustStr(err)}.to_string())?;\n${lets.join('\n')}\n        Ok(Self { ${names.join(', ')} })\n    }\n}`
  } else if (
    items.length === 1 &&
    firstItem !== undefined &&
    firstItem.type === 'object'
  ) {
    const sub: RenderCtx = {
      ...ctx,
      nameHint: name,
      pointer: '#/prefixItems/0'
    }
    decls.push(renderStructInto(name, firstItem, sub))
    merge(ctx, sub)
    decls.push(...sub.decls)
    ctx.usesValue = true
    // An optional object (`z.tuple([z.object(...).optional()])`, so no `minItems`) accepts `[]`
    // and `[null]` (`[undefined]` over JSON) as the empty object, as the zod schema does
    // (80-REVIEW B/WR-03). Required fields still fail with `bad-args` then.
    const first =
      minItems === 0
        ? `let first = args.first().filter(|v| !v.is_null()).cloned().unwrap_or_else(|| Value::Object(serde_json::Map::new()));\n        serde_json::from_value(first)`
        : `let first = args.first().ok_or_else(|| ${rustStr(err)}.to_string())?;\n        serde_json::from_value(first.clone())`
    main = `impl ${name} {\n    pub(crate) fn from_args(args: &[Value]) -> Result<Self, String> {\n        ${first}.map_err(|_| ${rustStr(err)}.to_string())\n    }\n}`
  } else {
    const fields: string[] = []
    const debugFields: { ident: string; secret: boolean }[] = []
    const lets: string[] = []
    const names: string[] = []
    items.forEach((item, i) => {
      const title = item.title
      const sub: RenderCtx = {
        ...ctx,
        nameHint: `${name}${pascal(String(title ?? i))}`,
        pointer: `#/prefixItems/${i}`
      }
      if (typeof title !== 'string' || !title) {
        fail(sub, `positional item ${i} has no title (use .meta({ title }))`)
      }
      const ident = fieldIdent(title)
      let ty = rustTypeFor(item, sub)
      merge(ctx, sub)
      decls.push(...sub.decls)
      if (i >= minItems && !ty.startsWith('Option<')) ty = `Option<${ty}>`
      fields.push(`    pub(crate) ${ident}: ${ty},`)
      debugFields.push({ ident, secret: item['x-secret'] === true })
      names.push(ident)
      // clippy::get_first is held at zero by the clippy ratchet
      // (meta/clippyRatchet.cjs), so index 0 must be read with first().
      const accessor = i === 0 ? 'args.first()' : `args.get(${i})`
      if (i >= minItems) {
        lets.push(
          `        let ${ident} = ${accessor}.filter(|v| !v.is_null()).map(|v| serde_json::from_value(v.clone())).transpose().map_err(|_| ${rustStr(err)}.to_string())?;`
        )
      } else {
        lets.push(
          `        let ${ident} = serde_json::from_value(${accessor}.ok_or_else(|| ${rustStr(err)}.to_string())?.clone()).map_err(|_| ${rustStr(err)}.to_string())?;`
        )
      }
    })
    ctx.usesValue = true
    ctx.usesDeserialize = true
    const { derive, debugImpl } = debugParts(name, debugFields, 'Clone')
    main = `${derive}\npub(crate) struct ${name} {\n${fields.join('\n')}\n}${debugImpl}\n\nimpl ${name} {\n    pub(crate) fn from_args(args: &[Value]) -> Result<Self, String> {\n${lets.join('\n')}\n        Ok(Self { ${names.join(', ')} })\n    }\n}`
  }
  return {
    text: [...decls, main].join('\n\n'),
    usesValue: ctx.usesValue,
    usesDeserialize: ctx.usesDeserialize
  }
}

function renderStructInto(
  name: string,
  node: JsonNode,
  ctx: RenderCtx
): string {
  checkKeys(
    node,
    ['type', 'properties', 'required', 'additionalProperties'],
    ctx
  )
  const ap = node.additionalProperties
  if (
    ap !== undefined &&
    ap !== false &&
    !(typeof ap === 'object' && ap && Object.keys(ap).length === 0)
  ) {
    fail(ctx, 'record / typed additionalProperties is not supported')
  }
  return renderStruct(name, node, ctx)
}

/** One channel the Rust native router owns (Phase 83, D-06/D-07). */
interface NativeChannelSpec {
  kind: 'invoke' | 'send'
  /** kebab-case slice name, e.g. 'app-shell' */
  slice: string
  /** documentation of the positional args; the Rust args type is the schema authority */
  args: unknown[]
  returns: string
  /** positional-arg arrays the handler must accept */
  valid: unknown[][]
  /** positional-arg arrays the handler must reject; never empty */
  invalid: unknown[][]
}

export interface NativeManifest {
  channels: Record<string, NativeChannelSpec>
}

const NATIVE_NAME = /^[A-Za-z0-9:_-]+$/
const NATIVE_SLICE = /^[a-z0-9]+(-[a-z0-9]+)*$/

function isArrayOfArrays(v: unknown): v is unknown[][] {
  return Array.isArray(v) && v.every((x) => Array.isArray(x))
}

/**
 * Validates `nativeChannels.json`. Every refusal names the channel. The name charset is the
 * reason sorted output equals the byte order Rust's `binary_search` needs.
 */
export function parseNativeManifest(raw: unknown): NativeManifest {
  const bad = (name: string, what: string): never => {
    throw new Error(`genIpcContract: native channel "${name}": ${what}`)
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('genIpcContract: native manifest must be an object')
  }
  const channels = (raw as { channels?: unknown }).channels
  if (
    typeof channels !== 'object' ||
    channels === null ||
    Array.isArray(channels)
  ) {
    throw new Error('genIpcContract: native manifest needs a "channels" object')
  }
  const out: Record<string, NativeChannelSpec> = {}
  for (const [name, value] of Object.entries(channels)) {
    if (!NATIVE_NAME.test(name)) {
      bad(name, 'name must match [A-Za-z0-9:_-]')
    }
    const e = value as Partial<Record<keyof NativeChannelSpec, unknown>> | null
    if (typeof e !== 'object' || e === null)
      bad(name, 'entry must be an object')
    const spec = e as Partial<Record<keyof NativeChannelSpec, unknown>>
    if (spec.kind !== 'invoke' && spec.kind !== 'send') {
      bad(name, 'kind must be "invoke" or "send"')
    }
    if (typeof spec.slice !== 'string' || !NATIVE_SLICE.test(spec.slice)) {
      bad(name, 'slice must be a kebab-case string')
    }
    if (!Array.isArray(spec.args)) bad(name, 'args must be an array')
    if (typeof spec.returns !== 'string') bad(name, 'returns must be a string')
    if (!isArrayOfArrays(spec.valid)) {
      bad(name, 'valid must be an array of positional arg arrays')
    }
    if (!isArrayOfArrays(spec.invalid) || spec.invalid.length === 0) {
      bad(name, 'invalid must be a non-empty array of positional arg arrays')
    }
    out[name] = spec as unknown as NativeChannelSpec
  }
  return { channels: out }
}

export interface ContractInput {
  constants: Record<string, string>
  channels: readonly string[]
  /** channel -> JSON Schema (input mode) of its positional-args tuple */
  schemas: Record<string, JsonNode>
  /**
   * name -> caller/kind of the inbound-keyed channel map. Drives RENDERER_CHANNELS: caller
   * 'renderer' and kind invoke|send only. Omitted = no allow-list is emitted.
   */
  entries?: Record<string, { caller: string; kind: string }>
  /**
   * Native channel manifest (Phase 83). Its names join RENDERER_CHANNELS and the sorted
   * NATIVE_INVOKE_CHANNELS / NATIVE_SEND_CHANNELS sets are emitted. Omitted = no native sets.
   */
  native?: NativeManifest
  /**
   * Names in the colliding-push map (`collidingPushSchemas`). Together with `entries` they are the
   * sidecar's schema names; a native channel naming one of them has two owners (83-05).
   */
  collidingPush?: readonly string[]
}

/**
 * Phase 83-05 (D-06): a channel is owned by the Rust native router or by the sidecar, never both.
 * Throws naming the channel when a manifest name is also a schema entry or a colliding push name.
 * One helper so the contract and the snapshot cannot disagree about what counts as a collision.
 */
function assertSingleOwner(
  native: NativeManifest | undefined,
  entries: Record<string, unknown> | undefined,
  collidingPush: readonly string[] | undefined
): void {
  if (native === undefined) return
  const push = new Set(collidingPush ?? [])
  for (const name of Object.keys(native.channels).sort()) {
    if (
      (entries !== undefined &&
        Object.prototype.hasOwnProperty.call(entries, name)) ||
      push.has(name)
    ) {
      throw new Error(
        `native channel ${name} also has a sidecar schema (two owners)`
      )
    }
  }
}

/** Sorted manifest names of one kind. */
function nativeNames(
  native: NativeManifest,
  kind: 'invoke' | 'send'
): string[] {
  return Object.keys(native.channels)
    .filter((n) => native.channels[n]?.kind === kind)
    .sort()
}

/** Sorted names the renderer may invoke or send (D-14). Shell, local and push are excluded. */
function rendererChannelNames(
  entries: Record<string, { caller: string; kind: string }>
): string[] {
  return Object.keys(entries)
    .filter((n) => {
      const e = entries[n]
      return (
        e !== undefined &&
        e.caller === 'renderer' &&
        (e.kind === 'invoke' || e.kind === 'send')
      )
    })
    .sort()
}

export function renderIpcContract(input: ContractInput): string {
  assertSingleOwner(input.native, input.entries, input.collidingPush)
  const consts = Object.entries(input.constants)
    .map(([k, v]) => `pub(crate) const ${k}: &str = ${rustStr(v)};`)
    .join('\n')

  let usesValue = false
  let usesDeserialize = false
  const structBlocks: string[] = []
  for (const [channel, schema] of Object.entries(input.schemas)) {
    const r = renderArgsStruct(channel, schema)
    usesValue ||= r.usesValue
    usesDeserialize ||= r.usesDeserialize
    structBlocks.push(r.text)
  }

  const variants = input.channels.map((c) => `    ${pascal(c)},`).join('\n')
  const all = input.channels
    .map((c) => `        RustInvokeChannel::${pascal(c)},`)
    .join('\n')
  const fromName = input.channels
    .map(
      (c) =>
        `            ${rustStr(c)} => Some(RustInvokeChannel::${pascal(c)}),`
    )
    .join('\n')
  const asStr = input.channels
    .map((c) => `            RustInvokeChannel::${pascal(c)} => ${rustStr(c)},`)
    .join('\n')

  let allowList = ''
  if (input.entries) {
    const names = [
      ...new Set([
        ...rendererChannelNames(input.entries),
        ...(input.native ? Object.keys(input.native.channels) : [])
      ])
    ].sort()
    allowList = `/// Channel names the renderer may name through \`sidecar_invoke\` / \`sidecar_send\` (D-14): every\n/// schema entry with caller 'renderer' and kind invoke or send, plus every native channel, sorted.\n/// Shell-only, local and push channels are absent. Arguments are validated in the sidecar, or in\n/// Rust for NATIVE_* channels.\npub(crate) const RENDERER_CHANNELS: &[&str] = &[\n${names.map((n) => `    ${rustStr(n)},`).join('\n')}\n];\n\npub(crate) fn is_renderer_channel(name: &str) -> bool {\n    RENDERER_CHANNELS.binary_search(&name).is_ok()\n}`
  }

  let nativeBlock = ''
  if (input.native) {
    const native = input.native
    const set = (kind: 'invoke' | 'send'): string => {
      const body = nativeNames(native, kind)
        .map((n) => `    ${rustStr(n)},`)
        .join('\n')
      return body.length > 0 ? `[\n${body}\n]` : '[]'
    }
    nativeBlock = `/// Renderer invoke channels owned by the Rust native router (Phase 83), sorted. Generated from\n/// src/common/types/ipc/nativeChannels.json.\npub(crate) const NATIVE_INVOKE_CHANNELS: &[&str] = &${set('invoke')};\n\n/// Renderer send channels owned by the Rust native router (Phase 83), sorted.\npub(crate) const NATIVE_SEND_CHANNELS: &[&str] = &${set('send')};\n\npub(crate) fn is_native_invoke_channel(name: &str) -> bool {\n    NATIVE_INVOKE_CHANNELS.binary_search(&name).is_ok()\n}\n\npub(crate) fn is_native_send_channel(name: &str) -> bool {\n    NATIVE_SEND_CHANNELS.binary_search(&name).is_ok()\n}`
  }

  const uses: string[] = []
  if (usesDeserialize) uses.push('use serde::Deserialize;')
  if (usesValue) uses.push('use serde_json::Value;')

  const parts = [
    `// @generated by ${GENERATOR} — DO NOT EDIT. Regenerate with: ${REGEN_CMD}\n//\n// Phase 67 (D-16..D-18): the TypeScript contract in src/common/types/sidecarTransport.ts and\n// src/common/types/ipc/rustInvoke.ts is the only source of these items. \`pnpm check:ipc-contract\`\n// fails CI when this file is stale.\n//\n// dead_code is allowed because members are consumed incrementally across plans and by\n// cfg-specific code.\n#![allow(dead_code)]`,
    uses.join('\n'),
    consts,
    `#[derive(Debug, Clone, Copy, PartialEq, Eq)]\npub(crate) enum RustInvokeChannel {\n${variants}\n}\n\nimpl RustInvokeChannel {\n    pub(crate) const ALL: &'static [RustInvokeChannel] = &[\n${all}\n    ];\n\n    pub(crate) fn from_name(name: &str) -> Option<Self> {\n        match name {\n${fromName}\n            _ => None,\n        }\n    }\n\n    pub(crate) fn as_str(self) -> &'static str {\n        match self {\n${asStr}\n        }\n    }\n}`,
    allowList,
    nativeBlock,
    ...structBlocks
  ].filter((p) => p.length > 0)
  return `${parts.join('\n\n')}\n`
}

/** One sidecar schema entry as the snapshot reads it (the shape of `ChannelEntry`). */
interface SnapshotEntryInput {
  caller: string
  kind: string
  args: z.ZodType
}

/**
 * Lowest renderer-channel count the snapshot generator accepts (83-05, D-06 vacuous-pass guard).
 * Measured at execution on 2026-11-20: 237 renderer channels (236 sidecar plus 1 native,
 * getHeroicVersion); the floor is that minus 6.
 * A truncated or empty scan fails loudly instead of writing, or passing `--check` against, a
 * snapshot that proves nothing. Raise it when the channel set grows for good; never lower it to
 * make a red run green.
 */
export const SNAPSHOT_CHANNELS_FLOOR = 231

/**
 * The committed IPC schema snapshot (83-05, D-06): one entry per renderer channel with its kind,
 * its owner (native router or sidecar) and its argument schema. Sidecar args are the zod tuple's
 * JSON Schema in input mode; native args are the manifest's args description (plus `returns`).
 *
 * Sorted by channel name; each entry's keys are emitted in a fixed order, so two runs on the same
 * tree are byte-identical. A reviewer sees every renderer-reachable channel change as a diff.
 */
export function renderIpcSchemaSnapshot(input: {
  entries: Record<string, SnapshotEntryInput>
  native: NativeManifest
  floor: number
  collidingPush?: readonly string[]
}): string {
  assertSingleOwner(input.native, input.entries, input.collidingPush)
  const rows: {
    channel: string
    kind: string
    owner: 'native' | 'sidecar'
    args: unknown
    returns?: string
  }[] = []
  for (const name of rendererChannelNames(input.entries)) {
    const e = input.entries[name]
    if (e === undefined) continue
    const schema = z.toJSONSchema(e.args, {
      io: 'input',
      unrepresentable: 'any'
    }) as JsonNode
    delete schema.$schema
    rows.push({ channel: name, kind: e.kind, owner: 'sidecar', args: schema })
  }
  for (const name of Object.keys(input.native.channels)) {
    const spec = input.native.channels[name]
    if (spec === undefined) continue
    rows.push({
      channel: name,
      kind: spec.kind,
      owner: 'native',
      args: spec.args,
      returns: spec.returns
    })
  }
  rows.sort((a, b) =>
    a.channel < b.channel ? -1 : a.channel > b.channel ? 1 : 0
  )
  if (rows.length < input.floor) {
    throw new Error(
      `ipc schema snapshot: scanned ${rows.length} renderer channels, below the floor ${input.floor}`
    )
  }
  // Keys are listed explicitly so the emitted order is fixed regardless of how a row was built.
  const channels = rows.map((r) =>
    r.returns === undefined
      ? { channel: r.channel, kind: r.kind, owner: r.owner, args: r.args }
      : {
          channel: r.channel,
          kind: r.kind,
          owner: r.owner,
          args: r.args,
          returns: r.returns
        }
  )
  const doc = { generatedBy: GENERATOR, channelCount: rows.length, channels }
  return `${JSON.stringify(doc, null, 2)}\n`
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const RECOGNISED_FLAGS = ['--check']

export function parseCliFlags(argv: string[]): { check: boolean } {
  let check = false
  for (const token of argv) {
    if (token === '--check') {
      check = true
      continue
    }
    // A typo must fail loudly rather than degrade into a plain regenerate.
    throw new Error(
      `${GENERATOR}: unrecognised argument "${token}". Recognised flags: ${RECOGNISED_FLAGS.join(', ')}.`
    )
  }
  return { check }
}

function loadNative(): NativeManifest {
  return parseNativeManifest(
    JSON.parse(
      readFileSync(join(process.cwd(), NATIVE_MANIFEST_REL), 'utf8')
    ) as unknown
  )
}

function buildContract(): string {
  const schemas: Record<string, JsonNode> = {}
  for (const channel of RUST_INVOKE_CHANNELS) {
    const s = (rustInvokeArgs as Record<string, z.ZodType | undefined>)[channel]
    if (s) schemas[channel] = z.toJSONSchema(s, { io: 'input' }) as JsonNode
  }
  return renderIpcContract({
    constants: {
      READY_SENTINEL,
      FRONTEND_MESSAGE_EVENT,
      SHELL_WINDOW_FOCUSED,
      STORE_FRAME_KIND,
      STORE_MIRROR_EVENT_CHANNEL,
      STORE_SNAPSHOT_CHANNEL,
      RUST_INVOKE_KIND,
      IPC_INVALID_CHANNEL_MARKER,
      IPC_INVALID_ARGS_MARKER,
      IPC_INVALID_ARGS
    },
    channels: RUST_INVOKE_CHANNELS,
    schemas,
    // channelSchemas is inbound-keyed: pushes whose names collide with an inbound channel live
    // in collidingPushSchemas and are NOT here, so a push name never opens (or shadows) the
    // renderer invoke/send direction.
    entries: channelSchemas,
    native: loadNative(),
    collidingPush: Object.keys(collidingPushSchemas)
  })
}

function buildSnapshot(): string {
  return renderIpcSchemaSnapshot({
    entries: channelSchemas,
    native: loadNative(),
    floor: SNAPSHOT_CHANNELS_FLOOR,
    collidingPush: Object.keys(collidingPushSchemas)
  })
}

function main(): void {
  let flags: { check: boolean }
  try {
    flags = parseCliFlags(process.argv.slice(2))
  } catch (e) {
    console.error(`::error::${(e as Error).message}`)
    process.exit(1)
  }
  const outputs = [
    { rel: OUTPUT_REL, next: buildContract() },
    { rel: SNAPSHOT_REL, next: buildSnapshot() }
  ]
  if (flags.check) {
    let stale = false
    for (const { rel, next } of outputs) {
      let current = ''
      try {
        current = readFileSync(join(process.cwd(), rel), 'utf8')
      } catch {
        // missing counts as stale
      }
      if (current !== next) {
        console.error(`::error::${rel} is stale; run ${REGEN_CMD}`)
        stale = true
      } else {
        console.log(`${rel} is up to date`)
      }
    }
    if (stale) process.exit(1)
    return
  }
  for (const { rel, next } of outputs) {
    writeFileSync(join(process.cwd(), rel), next)
    console.log(`wrote ${rel}`)
  }
}

// Guarded so the jest suite can import the pure emitter without running the CLI.
if (!process.env.JEST_WORKER_ID) main()
