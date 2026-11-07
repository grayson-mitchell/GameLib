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
 * order, that fails to deserialize). Leaf meta: `x-rust-value`.
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
  IPC_INVALID_CHANNEL_MARKER,
  READY_SENTINEL,
  RUST_INVOKE_CHANNELS,
  RUST_INVOKE_KIND,
  SHELL_WINDOW_FOCUSED,
  STORE_SNAPSHOT_CHANNEL
} from '../src/common/types/sidecarTransport'
import { rustInvokeArgs } from '../src/common/types/ipc/rustInvoke'
import { channelSchemas } from '../src/common/types/ipc/channelSchemas'

const OUTPUT_REL = 'src-tauri/src/ipc_contract.rs'
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

function renderStruct(name: string, node: JsonNode, ctx: RenderCtx): string {
  const props = (node.properties ?? {}) as Record<string, JsonNode>
  const required = new Set((node.required ?? []) as string[])
  const lines: string[] = []
  for (const key of Object.keys(props)) {
    const sub = child(ctx, `properties/${key}`, `${name}${pascal(key)}`)
    let ty = rustTypeFor(props[key], sub)
    merge(ctx, sub)
    ctx.decls.push(...sub.decls.splice(0))
    if (!required.has(key) && !ty.startsWith('Option<')) ty = `Option<${ty}>`
    const ident = fieldIdent(key)
    const attrs: string[] = []
    if (ident !== key) attrs.push(`    #[serde(rename = ${rustStr(key)})]`)
    if (!required.has(key)) attrs.push('    #[serde(default)]')
    lines.push([...attrs, `    pub(crate) ${ident}: ${ty},`].join('\n'))
  }
  ctx.usesDeserialize = true
  const body = lines.length ? `\n${lines.join('\n')}\n` : ''
  return `#[derive(Debug, Clone, Deserialize)]\npub(crate) struct ${name} {${body}}`
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
  let main: string
  if (items.length === 0) {
    main = `#[derive(Debug, Clone, Copy)]\npub(crate) struct ${name};\n\nimpl ${name} {\n    pub(crate) fn from_args(_args: &[Value]) -> Result<Self, String> {\n        Ok(Self)\n    }\n}`
    ctx.usesValue = true
  } else if (tuple['x-field-errors'] === true) {
    if (items.length !== 1 || items[0].type !== 'object') {
      fail(ctx, 'x-field-errors needs a tuple of exactly one object argument')
    }
    const sub: RenderCtx = {
      ...ctx,
      nameHint: name,
      pointer: '#/prefixItems/0'
    }
    decls.push(renderStructInto(name, items[0], sub))
    merge(ctx, sub)
    decls.push(...sub.decls)
    const props = (items[0].properties ?? {}) as Record<string, JsonNode>
    const required = new Set((items[0].required ?? []) as string[])
    const lets: string[] = []
    const names: string[] = []
    for (const key of Object.keys(props)) {
      const scratch: RenderCtx = {
        ...ctx,
        nameHint: `${name}${pascal(key)}`,
        pointer: `#/prefixItems/0/properties/${key}`,
        decls: []
      }
      let ty = rustTypeFor(props[key], scratch)
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
  } else if (items.length === 1 && items[0].type === 'object') {
    const sub: RenderCtx = {
      ...ctx,
      nameHint: name,
      pointer: '#/prefixItems/0'
    }
    decls.push(renderStructInto(name, items[0], sub))
    merge(ctx, sub)
    decls.push(...sub.decls)
    ctx.usesValue = true
    main = `impl ${name} {\n    pub(crate) fn from_args(args: &[Value]) -> Result<Self, String> {\n        let first = args.first().ok_or_else(|| ${rustStr(err)}.to_string())?;\n        serde_json::from_value(first.clone()).map_err(|_| ${rustStr(err)}.to_string())\n    }\n}`
  } else {
    const fields: string[] = []
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
    main = `#[derive(Debug, Clone)]\npub(crate) struct ${name} {\n${fields.join('\n')}\n}\n\nimpl ${name} {\n    pub(crate) fn from_args(args: &[Value]) -> Result<Self, String> {\n${lets.join('\n')}\n        Ok(Self { ${names.join(', ')} })\n    }\n}`
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
}

/** Sorted names the renderer may invoke or send (D-14). Shell, local and push are excluded. */
function rendererChannelNames(
  entries: Record<string, { caller: string; kind: string }>
): string[] {
  return Object.keys(entries)
    .filter((n) => {
      const e = entries[n]
      return (
        e.caller === 'renderer' && (e.kind === 'invoke' || e.kind === 'send')
      )
    })
    .sort()
}

export function renderIpcContract(input: ContractInput): string {
  const consts = Object.entries(input.constants)
    .map(([k, v]) => `pub(crate) const ${k}: &str = ${rustStr(v)};`)
    .join('\n')

  let usesValue = false
  let usesDeserialize = false
  const structBlocks: string[] = []
  for (const channel of Object.keys(input.schemas)) {
    const r = renderArgsStruct(channel, input.schemas[channel])
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
    const names = rendererChannelNames(input.entries)
    allowList = `/// Channel names the renderer may name through \`sidecar_invoke\` / \`sidecar_send\` (D-14): every\n/// schema entry with caller 'renderer' and kind invoke or send, sorted. Shell-only, local and push\n/// channels are absent. Arguments are validated only in the sidecar.\npub(crate) const RENDERER_CHANNELS: &[&str] = &[\n${names.map((n) => `    ${rustStr(n)},`).join('\n')}\n];\n\npub(crate) fn is_renderer_channel(name: &str) -> bool {\n    RENDERER_CHANNELS.binary_search(&name).is_ok()\n}`
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
    ...structBlocks
  ].filter((p) => p.length > 0)
  return `${parts.join('\n\n')}\n`
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
      STORE_SNAPSHOT_CHANNEL,
      RUST_INVOKE_KIND,
      IPC_INVALID_CHANNEL_MARKER
    },
    channels: RUST_INVOKE_CHANNELS,
    schemas,
    // channelSchemas is inbound-keyed: pushes whose names collide with an inbound channel live
    // in collidingPushSchemas and are NOT here, so a push name never opens (or shadows) the
    // renderer invoke/send direction.
    entries: channelSchemas
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
  const out = join(process.cwd(), OUTPUT_REL)
  const next = buildContract()
  if (flags.check) {
    let current = ''
    try {
      current = readFileSync(out, 'utf8')
    } catch {
      // missing counts as stale
    }
    if (current !== next) {
      console.error(`::error::${OUTPUT_REL} is stale; run ${REGEN_CMD}`)
      process.exit(1)
    }
    console.log(`${OUTPUT_REL} is up to date`)
    return
  }
  writeFileSync(out, next)
  console.log(`wrote ${OUTPUT_REL}`)
}

// Guarded so the jest suite can import the pure emitter without running the CLI.
if (!process.env.JEST_WORKER_ID) main()
