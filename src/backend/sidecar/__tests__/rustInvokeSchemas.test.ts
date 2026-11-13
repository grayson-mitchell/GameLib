/**
 * Phase 67 D-13: the 45 rustInvoke args schemas (44 + main_window_hide, quick 261108-kpc). Key-set equality is the runtime twin of the
 * `satisfies Record<RustInvokeChannel, ...>` compile-time check, the shared wire fixtures prove
 * the schemas accept exactly what the sidecar emits, and JSON Schema conversion proves each
 * schema stays inside what `meta/genIpcContract.ts` can consume.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'
import { rustInvokeArgs } from 'common/types/ipc/rustInvoke'
import { RUST_INVOKE_CHANNELS } from 'common/types/sidecarTransport'

const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(
    readFileSync(join(__dirname, '../../../../meta/fixtures', name), 'utf8')
  )

describe('rustInvokeArgs', () => {
  it('has exactly one schema per RUST_INVOKE_CHANNELS entry', () => {
    expect(Object.keys(rustInvokeArgs).sort()).toEqual(
      [...RUST_INVOKE_CHANNELS].sort()
    )
    expect(RUST_INVOKE_CHANNELS).toHaveLength(59)
  })

  it('parses the store-embed wire fixtures', () => {
    const wire = fixture('store-embed-wire-args.json')
    for (const channel of [
      'store_embed_open',
      'store_embed_set_bounds',
      'store_embed_navigate'
    ] as const) {
      expect(rustInvokeArgs[channel].safeParse(wire[channel]).success).toBe(
        true
      )
    }
  })

  it('parses every tray_set_icon wire fixture', () => {
    const wire = fixture('tray-set-icon-wire-args.json')
      .tray_set_icon as Record<string, unknown>
    for (const payload of Object.values(wire)) {
      expect(rustInvokeArgs.tray_set_icon.safeParse(payload).success).toBe(true)
    }
  })

  it('rejects a payload that omits a required field', () => {
    expect(
      rustInvokeArgs.store_embed_set_bounds.safeParse([{ x: 1 }]).success
    ).toBe(false)
  })

  it.each([...RUST_INVOKE_CHANNELS])(
    'converts %s to JSON Schema',
    (channel) => {
      expect(() =>
        z.toJSONSchema(rustInvokeArgs[channel], { io: 'input' })
      ).not.toThrow()
    }
  )
})
