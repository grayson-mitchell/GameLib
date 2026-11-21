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
    // Quick 261120-pp4: 118 -> 117, the picker-window open channel deleted with the custom invite picker.
    // Phase 82 plan 05: 117 -> 119, the two safety_* channels.
    // Debug bridged-launch-steam-signed-out: 119 -> 120, steamfiles_read_loginusers_offline_mode.
    // Phase 85 plan 18: 120 -> 122, store_version_gate and store_backup_file.
    expect(RUST_INVOKE_CHANNELS).toHaveLength(122)
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

  it('accepts a safety request, keeps an unreadable known-installs null, and rejects drift', () => {
    const target = {
      id: 'a',
      path: '/g/a',
      kind: 'game-install',
      trustRoot: '/g'
    }
    const ok = [
      { targets: [target], knownInstalls: null, protectedRoots: ['/home'] }
    ]
    expect(rustInvokeArgs.safety_check_removal.safeParse(ok).success).toBe(true)
    expect(rustInvokeArgs.safety_remove_tree.safeParse(ok).success).toBe(true)
    const extra = [{ ...ok[0], bogus: 1 }]
    expect(rustInvokeArgs.safety_check_removal.safeParse(extra).success).toBe(
      false
    )
    const badKind = [{ ...ok[0], targets: [{ ...target, kind: 'elsewhere' }] }]
    expect(rustInvokeArgs.safety_check_removal.safeParse(badKind).success).toBe(
      false
    )
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
