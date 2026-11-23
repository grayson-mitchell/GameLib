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
import {
  RUST_INFO_WIKI_CACHE_CLEAR,
  RUST_INFO_WIKI_GET,
  RUST_INVOKE_CHANNELS
} from 'common/types/sidecarTransport'

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
    // Phase 85 plan 16: 122 -> 123, store_read_only_notice.
    // Phase 86 plan 08: 123 -> 125, info_recent_add and info_recent_remove.
    // Phase 86 plan 10: 125 -> 129, the four info_overrides_* ops.
    // Phase 86 plan 12: 129 -> 132, the three info_anticheat_* ops.
    // Phase 86 plan 18: 132 -> 133, info_gog_discounts.
    // Phase 86 plan 19: 133 -> 134, info_crossover_rating_map.
    // Phase 86 plan 20: 134 -> 135, info_umu_get.
    // Phase 86 plan 22: 135 -> 137, info_wiki_get and info_wiki_cache_clear.
    // Phase 87 plan 18: 137 -> 139, wine_runtime_is_installed and wine_runtime_download.
    // Phase 87 plan 20: 139 -> 143, wine_manager_refresh, wine_manager_install, wine_manager_list and
    // wine_releases_info_ready.
    // Phase 87 plan 24: 143 -> 145, wine_valid and wine_run_command.
    // Phase 87 plan 26: 145 -> 147, wine_discover_alternatives and wine_discover_crossover.
    // Phase 87 plan 31: 147 -> 148, engine_set_online.
    // Phase 87 plan 34: 148 -> 149, wine_dxvk_install_remove.
    // Phase 87 plan 35: 149 -> 154, wine_winetricks_apply, _available, _installed, _install and _list_installed.
    // Phase 87 plan 36: 154 -> 155, wine_run_command_for_game.
    expect(RUST_INVOKE_CHANNELS).toHaveLength(155)
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

  it('accepts the wiki lookup args and the empty clear arg, and rejects drift (Phase 86 plan 22)', () => {
    const get = rustInvokeArgs[RUST_INFO_WIKI_GET]
    const game = { title: 'Portal 2', appName: '620', runner: 'steam' }
    expect(get.safeParse([game]).success).toBe(true)
    expect(get.safeParse([{ ...game, forceRefresh: true }]).success).toBe(true)
    for (const bad of [
      [],
      [{ ...game, runner: 'epic' }],
      [{ ...game, forceRefresh: 'yes' }],
      [{ ...game, extra: 1 }],
      [{ title: 'Portal 2', appName: '620' }]
    ]) {
      expect(get.safeParse(bad).success).toBe(false)
    }
    const clear = rustInvokeArgs[RUST_INFO_WIKI_CACHE_CLEAR]
    expect(clear.safeParse([{}]).success).toBe(true)
    expect(clear.safeParse([]).success).toBe(false)
    expect(clear.safeParse([{ x: 1 }]).success).toBe(false)
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
