import { z } from 'zod'
import {
  IPC_INVALID_ARGS,
  IPC_INVALID_ARGS_MARKER,
  IPC_INVALID_CHANNEL_MARKER
} from '../../src/common/types/sidecarTransport'
import { at } from './fixtures/indexed'
import {
  channelSchemas,
  collidingPushSchemas
} from '../../src/common/types/ipc/channelSchemas'
import {
  newCtx,
  parseCliFlags,
  parseNativeManifest,
  renderArgsStruct,
  renderIpcContract,
  renderIpcSchemaSnapshot,
  rustTypeFor,
  SNAPSHOT_CHANNELS_FLOOR
} from '../genIpcContract'

type Node = Record<string, unknown>
const js = (s: z.ZodType): Node =>
  z.toJSONSchema(s, { io: 'input' }) as unknown as Node
const ty = (n: Node) => rustTypeFor(n, newCtx('chan'))

describe('rustTypeFor', () => {
  it('maps scalars', () => {
    expect(ty({ type: 'string' })).toBe('String')
    expect(ty(js(z.number().int()))).toBe('i64')
    expect(ty({ type: 'number' })).toBe('f64')
    expect(ty({ type: 'boolean' })).toBe('bool')
  })
  it('maps arrays and nullable', () => {
    expect(ty(js(z.array(z.string())))).toBe('Vec<String>')
    expect(ty(js(z.string().nullable()))).toBe('Option<String>')
  })
  it('emits enums with serde renames', () => {
    const ctx = newCtx('dialog_open')
    expect(rustTypeFor(js(z.enum(['a', 'b-c'])), ctx)).toBe('DialogOpen')
    expect(ctx.decls[0]).toContain('#[serde(rename = "b-c")]')
    expect(ctx.decls[0]).toContain('BC,')
  })
  it('emits a single-variant enum for const', () => {
    const ctx = newCtx('x')
    expect(rustTypeFor(js(z.literal('x')), ctx)).toBe('XConst')
    expect(ctx.decls[0]).toContain('enum XConst')
  })
  it('maps x-rust-value to Value', () => {
    const ctx = newCtx('x')
    expect(
      rustTypeFor(js(z.unknown().meta({ 'x-rust-value': true })), ctx)
    ).toBe('Value')
    expect(ctx.usesValue).toBe(true)
  })
  it('maps a nullable array (anyOf [X, null]) to Option<Vec<X>>', () => {
    const ctx = newCtx('x')
    expect(rustTypeFor(js(z.array(z.string()).nullable()), ctx)).toBe(
      'Option<Vec<String>>'
    )
    expect(() =>
      ty(js(z.union([z.array(z.string()), z.array(z.number())])))
    ).toThrow(/anyOf/)
  })
  it('throws naming channel and pointer', () => {
    expect(() =>
      rustTypeFor(js(z.union([z.string(), z.number()])), newCtx('bad_chan'))
    ).toThrow(/bad_chan.*#/)
    expect(() => ty({ oneOf: [{ type: 'string' }] })).toThrow(/oneOf/)
    expect(() => ty(js(z.unknown()))).toThrow(/unknown/)
    expect(() => ty(js(z.record(z.string(), z.string())))).toThrow(/record/)
    expect(() => ty({ type: 'string', pattern: 'x' })).toThrow(/pattern/)
  })
})

describe('renderArgsStruct', () => {
  it('copies .meta keys into the JSON Schema', () => {
    const j = js(
      z.tuple([z.string().meta({ title: 'a' })]).meta({
        'x-error-prefix': 'p'
      })
    )
    expect(at(j.prefixItems as Node[], 0, 'prefixItems').title).toBe('a')
    expect(j['x-error-prefix']).toBe('p')
  })
  it('single object element becomes a struct, optional fields Option', () => {
    const r = renderArgsStruct(
      'dialog_open',
      js(
        z.tuple([
          z.object({
            title: z.string(),
            filterList: z.array(z.string()).optional()
          })
        ])
      )
    )
    expect(r.text).toContain('pub(crate) struct DialogOpenArgs')
    expect(r.text).toContain('pub(crate) title: String,')
    expect(r.text).toContain('pub(crate) filter_list: Option<Vec<String>>,')
    expect(r.text).not.toContain('deny_unknown_fields')
    expect(r.text).toContain('"dialog_open:bad-args"')
  })
  it('an optional single object reads [] and [null] as the empty object (80 review B/WR-03)', () => {
    const r = renderArgsStruct(
      'steampoll_read_running_app_id',
      js(
        z.tuple([
          z.object({ strict: z.boolean().optional() }).strict().optional()
        ])
      )
    )
    expect(r.text).toContain(
      'args.first().filter(|v| !v.is_null()).cloned().unwrap_or_else(|| Value::Object(serde_json::Map::new()))'
    )
    expect(r.text).not.toContain('ok_or_else')
    // A required object keeps rejecting a missing argument.
    const req = renderArgsStruct(
      'dialog_open',
      js(z.tuple([z.object({ title: z.string() })]))
    )
    expect(req.text).toContain('args.first().ok_or_else(')
  })
  it('x-secret fields get a redacting Debug instead of derive(Debug) (79 review B/IN-01)', () => {
    const r = renderArgsStruct(
      'steamcm_signin_guard_submit',
      js(
        z.tuple([
          z.object({
            flowId: z.string(),
            code: z.string().meta({ 'x-secret': true })
          })
        ])
      )
    )
    expect(r.text).toContain(
      '#[derive(Clone, Deserialize)]\npub(crate) struct SteamcmSigninGuardSubmitArgs'
    )
    expect(r.text).not.toMatch(
      /derive\(Debug[^)]*\)\]\npub\(crate\) struct SteamcmSigninGuardSubmitArgs/
    )
    expect(r.text).toContain(
      'impl std::fmt::Debug for SteamcmSigninGuardSubmitArgs'
    )
    expect(r.text).toContain('.field("code", &"<redacted>")')
    expect(r.text).toContain('.field("flow_id", &self.flow_id)')
    expect(r.text).not.toContain('&self.code')
  })
  it('x-secret on a positional item redacts it too', () => {
    const r = renderArgsStruct(
      'keyring_set',
      js(
        z.tuple([
          z.string().meta({ title: 'secret', 'x-secret': true }),
          z.string().meta({ title: 'slot' }).optional()
        ])
      )
    )
    expect(r.text).toContain(
      '#[derive(Clone)]\npub(crate) struct KeyringSetArgs'
    )
    expect(r.text).toContain('.field("secret", &"<redacted>")')
    expect(r.text).toContain('.field("slot", &self.slot)')
  })
  it('a struct without x-secret fields keeps derive(Debug)', () => {
    const r = renderArgsStruct(
      'dialog_open',
      js(z.tuple([z.object({ title: z.string() })]))
    )
    expect(r.text).toContain('#[derive(Debug, Clone, Deserialize)]')
    expect(r.text).not.toContain('impl std::fmt::Debug')
  })
  it('multi-element tuple uses titles; trailing optional is Option', () => {
    const r = renderArgsStruct(
      'keyring_set',
      js(
        z
          .tuple([
            z.string().meta({ title: 'service' }),
            z.string().meta({ title: 'note' }).optional()
          ])
          .meta({ 'x-error-prefix': 'keyring' })
      )
    )
    expect(r.text).toContain('pub(crate) service: String,')
    expect(r.text).toContain('pub(crate) note: Option<String>,')
    expect(r.text).toContain('"keyring:bad-args"')
  })
  it('optional positionals read JSON null as None (67 review WR-05)', () => {
    const r = renderArgsStruct(
      'keyring_get',
      js(
        z
          .tuple([z.string().nullish().meta({ title: 'slot' })])
          .meta({ 'x-error-prefix': 'keyring' })
      )
    )
    expect(r.text).toContain('args.first().filter(|v| !v.is_null()).map(')
    expect(r.text).not.toContain('args.get(0)')
    expect(r.text).toContain('pub(crate) slot: Option<String>,')
  })
  it('index 0 uses first() and later indices keep get(n) (clippy::get_first)', () => {
    const r = renderArgsStruct(
      'keyring_set',
      js(
        z
          .tuple([
            z.string().meta({ title: 'service' }),
            z.string().meta({ title: 'note' }).optional()
          ])
          .meta({ 'x-error-prefix': 'keyring' })
      )
    )
    expect(r.text).toContain('args.first().ok_or_else(')
    expect(r.text).toContain('args.get(1).filter(')
    expect(r.text).not.toContain('args.get(0)')
  })
  it('throws on an untitled positional item', () => {
    expect(() =>
      renderArgsStruct('c', js(z.tuple([z.string(), z.string()])))
    ).toThrow(/c.*item 0/)
  })
})

describe('renderIpcContract', () => {
  const input = {
    constants: { READY_SENTINEL: 'r', RUST_INVOKE_KIND: 'rustInvoke' },
    channels: ['keyring_get', 'app_exit'],
    schemas: {}
  }
  it('has header, consts and the enum API', () => {
    const out = renderIpcContract(input)
    expect(out.startsWith('// @generated by meta/genIpcContract.ts')).toBe(true)
    expect(out).toContain('DO NOT EDIT')
    expect(out).toContain('pub(crate) const READY_SENTINEL: &str = "r";')
    expect(out).toContain('pub(crate) enum RustInvokeChannel')
    expect(out).toContain('    KeyringGet,')
    expect(out).toContain('pub(crate) const ALL:')
    expect(out).toContain('fn from_name(name: &str) -> Option<Self>')
    expect(out).toContain("fn as_str(self) -> &'static str")
  })
  it('is deterministic', () => {
    expect(renderIpcContract(input)).toBe(renderIpcContract(input))
  })
  it('emits a sorted renderer invoke/send allow-list only', () => {
    const out = renderIpcContract({
      ...input,
      entries: {
        d: { caller: 'renderer', kind: 'send' },
        c: { caller: 'local', kind: 'send' },
        b: { caller: 'shell', kind: 'invoke' },
        a: { caller: 'renderer', kind: 'invoke' },
        e: { caller: 'renderer', kind: 'push' }
      }
    })
    expect(out).toContain(
      'pub(crate) const RENDERER_CHANNELS: &[&str] = &[\n    "a",\n    "d",\n];'
    )
    expect(out).toContain(
      'pub(crate) fn is_renderer_channel(name: &str) -> bool'
    )
    expect(out).toContain('binary_search')
  })
  it('emits no allow-list without entries', () => {
    expect(renderIpcContract(input)).not.toContain('RENDERER_CHANNELS')
  })
  it('emits the invalid-channel marker equal to the TS export', () => {
    const out = renderIpcContract({
      ...input,
      constants: { IPC_INVALID_CHANNEL_MARKER }
    })
    expect(out).toContain(
      `pub(crate) const IPC_INVALID_CHANNEL_MARKER: &str = "${IPC_INVALID_CHANNEL_MARKER}";`
    )
  })
})

describe('native channel manifest (Phase 83)', () => {
  const spec = {
    kind: 'invoke',
    slice: 'app-shell',
    args: [],
    returns: 'string',
    valid: [[]],
    invalid: [['extra']]
  }
  const input = {
    constants: { READY_SENTINEL: 'r' },
    channels: ['keyring_get'],
    schemas: {}
  }
  it('a manifest-only name lands in RENDERER_CHANNELS and NATIVE_INVOKE_CHANNELS in sorted position', () => {
    const out = renderIpcContract({
      ...input,
      entries: {
        zeta: { caller: 'renderer', kind: 'invoke' },
        alpha: { caller: 'renderer', kind: 'send' }
      },
      native: parseNativeManifest({ channels: { middle: spec } })
    })
    expect(out).toContain(
      'pub(crate) const RENDERER_CHANNELS: &[&str] = &[\n    "alpha",\n    "middle",\n    "zeta",\n];'
    )
    expect(out).toContain(
      'pub(crate) const NATIVE_INVOKE_CHANNELS: &[&str] = &[\n    "middle",\n];'
    )
    expect(out).toContain(
      'pub(crate) const NATIVE_SEND_CHANNELS: &[&str] = &[];'
    )
    expect(out).toContain('fn is_native_invoke_channel(name: &str) -> bool')
    expect(out).toContain('fn is_native_send_channel(name: &str) -> bool')
  })
  it('a name present in both the schema entries and the manifest is refused as two owners (83-05)', () => {
    expect(() =>
      renderIpcContract({
        ...input,
        entries: { a: { caller: 'renderer', kind: 'invoke' } },
        native: parseNativeManifest({ channels: { a: spec } })
      })
    ).toThrow('native channel a also has a sidecar schema (two owners)')
  })
  it('a manifest name that is a colliding push name is refused as two owners (83-05)', () => {
    expect(() =>
      renderIpcContract({
        ...input,
        entries: {},
        collidingPush: ['a'],
        native: parseNativeManifest({ channels: { a: spec } })
      })
    ).toThrow('native channel a also has a sidecar schema (two owners)')
  })
  it('emits no native sets without a manifest and accepts an empty channels map', () => {
    expect(renderIpcContract(input)).not.toContain('NATIVE_INVOKE_CHANNELS')
    const out = renderIpcContract({
      ...input,
      native: parseNativeManifest({ channels: {} })
    })
    expect(out).toContain('NATIVE_INVOKE_CHANNELS: &[&str] = &[];')
  })
  it('splits invoke and send names', () => {
    const out = renderIpcContract({
      ...input,
      native: parseNativeManifest({
        channels: { b: { ...spec, kind: 'send' }, a: spec }
      })
    })
    expect(out).toContain('NATIVE_INVOKE_CHANNELS: &[&str] = &[\n    "a",\n];')
    expect(out).toContain('NATIVE_SEND_CHANNELS: &[&str] = &[\n    "b",\n];')
  })
  it('parseNativeManifest throws naming the channel for an empty invalid list', () => {
    expect(() =>
      parseNativeManifest({ channels: { ch: { ...spec, invalid: [] } } })
    ).toThrow(/"ch".*invalid/)
  })
  it('parseNativeManifest throws for a bad kind, a bad slice and a non-ASCII name', () => {
    expect(() =>
      parseNativeManifest({ channels: { ch: { ...spec, kind: 'push' } } })
    ).toThrow(/"ch".*kind/)
    expect(() =>
      parseNativeManifest({ channels: { ch: { ...spec, slice: 'App Shell' } } })
    ).toThrow(/"ch".*slice/)
    expect(() =>
      parseNativeManifest({ channels: { 'caf\u00e9': spec } })
    ).toThrow(/caf.*name must match/)
    expect(() =>
      parseNativeManifest({ channels: { ch: { ...spec, valid: [1] } } })
    ).toThrow(/"ch".*valid/)
  })
  it('emits the invalid-args marker constants equal to the TS exports', () => {
    const out = renderIpcContract({
      ...input,
      constants: { IPC_INVALID_ARGS_MARKER, IPC_INVALID_ARGS }
    })
    expect(out).toContain(
      `pub(crate) const IPC_INVALID_ARGS_MARKER: &str = "${IPC_INVALID_ARGS_MARKER}";`
    )
    expect(out).toContain(
      `pub(crate) const IPC_INVALID_ARGS: &str = "${IPC_INVALID_ARGS}";`
    )
  })
})

describe('x-field-errors', () => {
  const fe = (t: z.ZodType) => renderArgsStruct('p', js(t)).text
  const tagged = z
    .tuple([
      z.object({
        url: z.string(),
        x: z.number(),
        home: z.string().nullish(),
        tags: z.array(z.string()).optional()
      })
    ])
    .meta({ 'x-field-errors': true })

  it('returns the bare error for a missing or non-object argument', () => {
    const t = fe(tagged)
    expect(t).toContain('args.first().and_then(Value::as_object)')
    expect(t).toContain('.ok_or_else(|| "p:bad-args".to_string())?;')
  })
  it('suffixes each property in declared order', () => {
    const t = fe(tagged)
    const at = (k: string) => t.indexOf(`"p:bad-args:${k}"`)
    expect(at('url')).toBeGreaterThan(-1)
    expect(at('url')).toBeLessThan(at('x'))
    expect(at('x')).toBeLessThan(at('home'))
    expect(at('home')).toBeLessThan(at('tags'))
  })
  it('reads an absent property as null: required fails, optional is None', () => {
    const t = fe(tagged)
    expect(t).toContain(
      'let url: String = serde_json::from_value(obj.get("url").cloned().unwrap_or(Value::Null))'
    )
    expect(t).toContain('let home: Option<String>')
    expect(t).toContain('let tags: Option<Vec<String>>')
  })
  it('never emits deny_unknown_fields', () => {
    expect(fe(tagged)).not.toContain('deny_unknown_fields')
  })
  it('leaves untagged tuples unchanged', () => {
    const t = fe(z.tuple([z.object({ url: z.string() })]))
    expect(t).not.toContain('bad-args:url')
  })
  it('throws when misused', () => {
    expect(() =>
      renderArgsStruct(
        'bad_chan',
        js(z.tuple([z.string()]).meta({ 'x-field-errors': true }))
      )
    ).toThrow(/bad_chan.*x-field-errors/)
    expect(() =>
      renderArgsStruct(
        'bad_chan',
        js(
          z
            .tuple([z.object({ a: z.string() }), z.object({ b: z.string() })])
            .meta({ 'x-field-errors': true })
        )
      )
    ).toThrow(/bad_chan.*x-field-errors/)
  })
})

describe('parseCliFlags', () => {
  it('accepts --check and rejects typos', () => {
    expect(parseCliFlags(['--check'])).toEqual({ check: true })
    expect(parseCliFlags([])).toEqual({ check: false })
    expect(() => parseCliFlags(['--chek'])).toThrow(/unrecognised/)
  })
})

describe('IPC schema snapshot (83-05, D-06)', () => {
  const spec = {
    kind: 'invoke',
    slice: 'app-shell',
    args: [],
    returns: 'string',
    valid: [[]],
    invalid: [['extra']]
  }
  const noNative = parseNativeManifest({ channels: {} })
  const synthetic = {
    zeta: {
      caller: 'renderer',
      kind: 'send',
      args: z.tuple([z.string()])
    },
    alpha: {
      caller: 'renderer',
      kind: 'invoke',
      args: z.tuple([z.number().int()])
    },
    // not renderer-reachable, so absent from the snapshot
    shellOnly: { caller: 'local', kind: 'invoke', args: z.tuple([]) }
  }

  it('lists renderer channels sorted by name with kind, owner and the zod input schema', () => {
    const doc = JSON.parse(
      renderIpcSchemaSnapshot({
        entries: synthetic,
        native: noNative,
        floor: 2
      })
    ) as {
      channelCount: number
      channels: { channel: string; kind: string; owner: string; args: object }[]
    }
    expect(doc.channelCount).toBe(2)
    expect(doc.channels.map((c) => c.channel)).toEqual(['alpha', 'zeta'])
    expect(doc.channels.map((c) => [c.kind, c.owner])).toEqual([
      ['invoke', 'sidecar'],
      ['send', 'sidecar']
    ])
    expect(at(doc.channels, 0).args).toMatchObject({
      type: 'array',
      prefixItems: [{ type: 'integer' }]
    })
    expect(at(doc.channels, 0).args).not.toHaveProperty('$schema')
  })
  it('emits each entry keys in the fixed order channel, kind, owner, args', () => {
    const out = renderIpcSchemaSnapshot({
      entries: synthetic,
      native: noNative,
      floor: 2
    })
    const doc = JSON.parse(out) as { channels: object[] }
    expect(Object.keys(at(doc.channels, 0))).toEqual([
      'channel',
      'kind',
      'owner',
      'args'
    ])
    expect(Object.keys(JSON.parse(out) as object)).toEqual([
      'generatedBy',
      'channelCount',
      'channels'
    ])
  })
  it('a manifest channel gets owner native, its manifest args and its returns, sorted in', () => {
    const doc = JSON.parse(
      renderIpcSchemaSnapshot({
        entries: synthetic,
        native: parseNativeManifest({ channels: { middle: spec } }),
        floor: 3
      })
    ) as { channels: Record<string, unknown>[] }
    expect(doc.channels.map((c) => c.channel)).toEqual([
      'alpha',
      'middle',
      'zeta'
    ])
    const middle = at(doc.channels, 1)
    expect(middle).toEqual({
      channel: 'middle',
      kind: 'invoke',
      owner: 'native',
      args: [],
      returns: 'string'
    })
    expect(Object.keys(middle)).toEqual([
      'channel',
      'kind',
      'owner',
      'args',
      'returns'
    ])
  })
  it('two renders of the same input are identical strings', () => {
    const run = (): string =>
      renderIpcSchemaSnapshot({
        entries: synthetic,
        native: parseNativeManifest({ channels: { middle: spec } }),
        floor: 3
      })
    expect(run()).toBe(run())
    expect(run().endsWith('\n')).toBe(true)
  })
  it('an empty channel input throws the floor error', () => {
    expect(() =>
      renderIpcSchemaSnapshot({
        entries: {},
        native: noNative,
        floor: SNAPSHOT_CHANNELS_FLOOR
      })
    ).toThrow(
      `ipc schema snapshot: scanned 0 renderer channels, below the floor ${SNAPSHOT_CHANNELS_FLOOR}`
    )
  })
  it('a truncated channel input (the real entries cut to 10) throws the floor error', () => {
    const truncated = Object.fromEntries(
      Object.entries(channelSchemas)
        .filter(([, e]) => e.caller === 'renderer')
        .slice(0, 10)
    )
    expect(() =>
      renderIpcSchemaSnapshot({
        entries: truncated,
        native: noNative,
        floor: SNAPSHOT_CHANNELS_FLOOR
      })
    ).toThrow(/scanned 10 renderer channels, below the floor/)
  })
  it('the real tree clears the floor', () => {
    const doc = JSON.parse(
      renderIpcSchemaSnapshot({
        entries: channelSchemas,
        native: parseNativeManifest({
          channels: {
            getHeroicVersion: { ...spec, slice: 'app-shell' }
          }
        }),
        floor: SNAPSHOT_CHANNELS_FLOOR,
        collidingPush: Object.keys(collidingPushSchemas)
      })
    ) as { channelCount: number }
    expect(doc.channelCount).toBeGreaterThanOrEqual(SNAPSHOT_CHANNELS_FLOOR)
  })
  it('refuses a native channel that also has a sidecar schema or a colliding push (two owners)', () => {
    expect(() =>
      renderIpcSchemaSnapshot({
        entries: synthetic,
        native: parseNativeManifest({ channels: { alpha: spec } }),
        floor: 1
      })
    ).toThrow('native channel alpha also has a sidecar schema (two owners)')
    expect(() =>
      renderIpcSchemaSnapshot({
        entries: synthetic,
        native: parseNativeManifest({ channels: { pushy: spec } }),
        floor: 1,
        collidingPush: ['pushy']
      })
    ).toThrow('native channel pushy also has a sidecar schema (two owners)')
  })
})
