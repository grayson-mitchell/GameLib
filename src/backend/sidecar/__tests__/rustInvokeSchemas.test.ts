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
  RUST_HUMBLE_ACTION_CLOSE,
  RUST_HUMBLE_ACTION_OPEN,
  RUST_HUMBLE_ACTION_POST,
  RUST_INFO_WIKI_CACHE_CLEAR,
  RUST_INFO_WIKI_GET,
  RUST_INVOKE_CHANNELS,
  RUST_LAUNCH_FLIGHT_BEGIN,
  RUST_LAUNCH_FLIGHT_END,
  RUST_LAUNCH_FLIGHT_WAIT,
  RUST_LAUNCH_READOPTED_ANNOUNCE,
  RUST_LAUNCH_RUN,
  RUST_LAUNCH_WINDOW_RAISE,
  RUST_SHORTCUTS_ADD,
  RUST_SHORTCUTS_EXIST,
  RUST_SHORTCUTS_REMOVE,
  RUST_SHORTCUTS_STEAM_ADD,
  RUST_SHORTCUTS_STEAM_IS_ADDED,
  RUST_SHORTCUTS_STEAM_REMOVE
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
    // Phase 87 plan 36: 154 -> 156, wine_run_command_for_game and wine_tool_call.
    // Phase 87 plan 42: 156 -> 167, the eleven bottle, ledger and selection ops.
    // Phase 87 plan 52: 167 -> 172, engine_launch_select, _arm_deadline, _end, _settings_get and engine_state_get.
    // Phase 87 plan 53: 172 -> 173, engine_dialog_displayed.
    // Phase 87 plan 54: 173 -> 183, engine_decide_launch, _decide_creation, _preflight_crossover, _is_crossover_missing,
    // engine_cx_resolve_bin_dir, the three engine_state_* writes and engine_deadline_arm and _cancel.
    // Phase 87 plan 55: 183 -> 185, engine_run_tool and engine_cancel.
    // Phase 87 plan 56a: 185 -> 188, engine_resolve_tool_settings, engine_non_crossover_engine and engine_fallback_ensure.
    // Phase 87 plan 70: 188 -> 189, engine_bottle_remove_per_game.
    // Phase 88 plan 12: 189 -> 191, knownfix_launch_overrides and knownfix_fetch_remote.
    // Phase 88 plan 13: 191 -> 193, knownfix_apply_profile_registry and knownfix_profile_overlay_env.
    // Phase 88 plan 14: 193 -> 195, knownfix_apply_registry and knownfix_resolve_overlay_env.
    // Phase 88 plan 15: 195 -> 196, knownfix_report_detected.
    // Phase 94 plan 11: 189 -> 190, shortcuts_exist.
    // Phase 94 plan 22: 190 -> 195, shortcuts_add, shortcuts_remove and the three shortcuts_steam_* ops.
    // Debug humble-library-cloudflare-403: 202 -> 205, humble_action_open, _post and _close.
    // Phase 88.1 plan 07: 205 -> 210, launch_setup_wrapper_env_vars, launch_setup_env_vars, launch_setup_wine_env_vars,
    // launch_setup_wrappers and launch_known_fix_env.
    // Phase 88.1 plan 08: 210 -> 211, launch_verify_wine_prefix.
    // Phase 88.1 plan 11: 211 -> 213, launch_epic_service_offline and launch_prepare.
    // Phase 88.1 plan 12: 213 -> 214, launch_prepare_wine_begin.
    // Phase 88.1 plan 13: 214 -> 215, launch_prepare_wine_finish.
    // Phase 88.1 plan 14: 215 -> 216, launch_check_wine_before_launch.
    // Phase 88.1 plan 19: 216 -> 207, the nine channels no TS caller reaches any more (wine_runtime_is_installed,
    // wine_runtime_download, wine_manager_install, wine_manager_list, wine_winetricks_list_installed,
    // engine_launch_arm_deadline, knownfix_apply_profile_registry, knownfix_profile_overlay_env and wine_manager_refresh).
    // Phase 88.2 plan 15: 207 -> 210, launch_runner_call, launch_runner_kill and launch_runner_abort.
    // Phase 88.2 plan 17: 210 -> 213, launch_wine_command, launch_wine_path and launch_script_run.
    // Phase 88.2 plan 17 task 2: 213 -> 217, launch_spawn_async, launch_tracked_kill, launch_tracked_kill_all and launch_games_running.
    // Phase 88.2 plan 20: 217 -> 218, launch_ask_force_uninstall.
    // Phase 88.3 plan 06: 218 -> 219, launch_run.
    // Phase 88.3 plan 11: 219 -> 222, launch_flight_begin, launch_flight_wait and launch_flight_end.
    // Phase 88.3 plan 12: 222 -> 223, launch_readopted_announce.
    // Phase 88.3 plan 13: 223 -> 224, launch_window_raise.
    expect(RUST_INVOKE_CHANNELS).toHaveLength(224)
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

  it('accepts the Humble server-action session args and rejects drift (debug humble-library-cloudflare-403)', () => {
    const open = rustInvokeArgs[RUST_HUMBLE_ACTION_OPEN]
    const page = { pageUrl: 'https://www.humblebundle.com/home/library' }
    expect(open.safeParse([page]).success).toBe(true)
    expect(
      open.safeParse([{ ...page, userAgent: 'Mozilla/5.0' }]).success
    ).toBe(true)
    expect(open.safeParse([{ ...page, userAgent: null }]).success).toBe(true)
    for (const bad of [
      [],
      [{}],
      [{ pageUrl: 7 }],
      [{ ...page, userAgent: 7 }],
      [{ ...page, extra: 1 }]
    ]) {
      expect(open.safeParse(bad).success).toBe(false)
    }

    const post = rustInvokeArgs[RUST_HUMBLE_ACTION_POST]
    const pair = (name: string, value: string) => ({ name, value })
    const multipart = {
      sessionId: 'loginwin-1',
      path: '/home/library?page=2',
      headers: [
        pair('Accept', 'text/x-component'),
        pair('Next-Action', '40ab')
      ],
      bodyKind: 'multipart',
      parts: [pair('_1_page', '2'), pair('0', '[{},"$K1"]')],
      referrer: '/home/library?page=2',
      redirect: 'follow'
    }
    const text = {
      sessionId: 'loginwin-1',
      path: '/home/library/abc',
      headers: [pair('Content-Type', 'text/plain;charset=UTF-8')],
      bodyKind: 'text',
      text: '["k","i","$undefined"]'
    }
    expect(post.safeParse([multipart]).success).toBe(true)
    expect(post.safeParse([text]).success).toBe(true)
    // Order is part of the contract: the root part `0` the caller put last stays last.
    const parsed = post.safeParse([multipart])
    expect(parsed.success && parsed.data[0].parts?.map((p) => p.name)).toEqual([
      '_1_page',
      '0'
    ])
    for (const bad of [
      [],
      [{ ...text, bodyKind: 'json' }],
      [{ ...text, redirect: 'error' }],
      [{ ...text, headers: [{ name: 'Accept' }] }],
      [{ ...text, headers: 'Accept: x' }],
      [{ ...text, parts: [{ name: 'a', value: 1 }] }],
      [{ ...text, extra: 1 }],
      [{ ...text, sessionId: undefined }]
    ]) {
      expect(post.safeParse(bad).success).toBe(false)
    }

    const close = rustInvokeArgs[RUST_HUMBLE_ACTION_CLOSE]
    expect(close.safeParse([{ sessionId: 'loginwin-1' }]).success).toBe(true)
    for (const bad of [
      [],
      [{}],
      [{ sessionId: 1 }],
      [{ sessionId: 'a', x: 1 }]
    ]) {
      expect(close.safeParse(bad).success).toBe(false)
    }
  })

  it('accepts the launch_flight_* keys and end message and rejects drift (Phase 88.3 plan 11)', () => {
    const key = { runner: 'steam', appName: '480' }
    for (const channel of [
      RUST_LAUNCH_FLIGHT_BEGIN,
      RUST_LAUNCH_FLIGHT_WAIT
    ] as const) {
      const schema = rustInvokeArgs[channel]
      expect(schema.safeParse([key]).success).toBe(true)
      expect(
        schema.safeParse([{ runner: 'legendary', appName: 'alpha' }]).success
      ).toBe(true)
      for (const bad of [
        [],
        [{}],
        [{ runner: 'steam' }],
        [{ appName: '480' }],
        [{ ...key, runner: 7 }],
        [{ ...key, appName: 480 }],
        [{ ...key, extra: 1 }],
        ['steam:480'],
        [key, {}]
      ]) {
        expect(schema.safeParse(bad).success).toBe(false)
      }
    }
    const end = rustInvokeArgs[RUST_LAUNCH_FLIGHT_END]
    const flightId = 'a'.repeat(32)
    for (const result of [true, false, null, 'done', { status: 'done' }, 3]) {
      expect(end.safeParse([{ flightId, result }]).success).toBe(true)
    }
    for (const bad of [
      [],
      [{}],
      [{ flightId }],
      [{ result: true }],
      [{ flightId: 7, result: true }],
      [{ flightId, result: true, extra: 1 }],
      [flightId],
      [{ flightId, result: true }, {}]
    ]) {
      expect(end.safeParse(bad).success).toBe(false)
    }
  })

  it('accepts only an empty argument list for launch_readopted_announce (Phase 88.3 plan 12)', () => {
    const announce = rustInvokeArgs[RUST_LAUNCH_READOPTED_ANNOUNCE]
    expect(announce.safeParse([]).success).toBe(true)
    for (const bad of [[{}], [null], ['x'], [1, 2], [[]]]) {
      expect(announce.safeParse(bad).success).toBe(false)
    }
  })

  it('accepts the launch_window_raise message and rejects drift (Phase 88.3 plan 13)', () => {
    const raise = rustInvokeArgs[RUST_LAUNCH_WINDOW_RAISE]
    for (const ok of [
      [{ context: 'bridge:1' }],
      [{ context: 'c', pids: [] }],
      [{ context: 'c', pids: ['1', 'x'], processNames: ['A.exe'] }]
    ]) {
      expect(raise.safeParse(ok).success).toBe(true)
    }
    for (const bad of [
      [],
      [{}],
      [{ pids: ['1'] }],
      [{ context: 1 }],
      [{ context: 'c', pids: 'x' }],
      [{ context: 'c', pids: [1] }],
      [{ context: 'c', processNames: [null] }],
      [{ context: 'c', script: 'x' }],
      [{ context: 'c' }, { context: 'c' }],
      ['c']
    ]) {
      expect(raise.safeParse(bad).success).toBe(false)
    }
  })

  it('accepts the launch_run Play message and rejects drift (Phase 88.3 plan 06)', () => {
    const run = rustInvokeArgs[RUST_LAUNCH_RUN]
    const play = { appName: 'alpha', runner: 'legendary' }
    expect(run.safeParse([play]).success).toBe(true)
    expect(
      run.safeParse([
        {
          ...play,
          launchArguments: { type: 'basic', name: 'Windowed' },
          skipVersionCheck: false,
          args: ['-windowed', '-nosplash']
        }
      ]).success
    ).toBe(true)
    for (const runner of ['gog', 'nile', 'sideload', 'steam']) {
      expect(run.safeParse([{ ...play, runner }]).success).toBe(true)
    }
    for (const bad of [
      [],
      [{}],
      [{ appName: 'alpha' }],
      [{ runner: 'legendary' }],
      [{ ...play, runner: 'epic' }],
      [{ ...play, appName: 7 }],
      [{ ...play, skipVersionCheck: 'yes' }],
      [{ ...play, args: '-windowed' }],
      [{ ...play, args: [1] }],
      [{ ...play, launchArguments: 'basic' }],
      [{ ...play, launchArguments: ['basic'] }],
      [{ ...play, extra: 1 }],
      [play, {}]
    ]) {
      expect(run.safeParse(bad).success).toBe(false)
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

  it('accepts the shortcut exists args with or without a title, and rejects drift (Phase 94 plan 11)', () => {
    const exist = rustInvokeArgs[RUST_SHORTCUTS_EXIST]
    const game = { appName: '620', runner: 'steam' }
    expect(exist.safeParse([game]).success).toBe(true)
    expect(exist.safeParse([{ ...game, title: 'Portal 2' }]).success).toBe(true)
    for (const bad of [
      [],
      [{ ...game, runner: 'epic' }],
      [{ ...game, title: 7 }],
      [{ ...game, title: null }],
      [{ ...game, extra: 1 }],
      [{ runner: 'steam' }],
      [game, game]
    ]) {
      expect(exist.safeParse(bad).success).toBe(false)
    }
  })

  it('accepts the shortcut write args and rejects drift (Phase 94 plan 22)', () => {
    const game = {
      appName: 'g1',
      runner: 'gog',
      title: 'Game One',
      isDlc: false,
      canAddSteamShortcut: true
    }
    const settings = {
      addDesktopShortcuts: true,
      addStartMenuShortcuts: false,
      addSteamShortcuts: false
    }
    const full = {
      ...game,
      artSquare: 'a',
      artCover: 'c',
      artLogo: 'l',
      installPath: '/i',
      executable: 'e',
      gogExecutable: 'g',
      gogProductIcon: '//x'
    }
    const add = rustInvokeArgs[RUST_SHORTCUTS_ADD]
    expect(add.safeParse([{ game, settings, notify: true }]).success).toBe(true)
    expect(
      add.safeParse([
        {
          game: full,
          settings: { ...settings, defaultSteamPath: '/s' },
          fromMenu: false,
          notify: false
        }
      ]).success
    ).toBe(true)
    for (const bad of [
      [],
      [{ game, settings }],
      [{ game, notify: true }],
      [{ game: { ...game, extra: 1 }, settings, notify: true }],
      [{ game: { ...game, runner: 'epic' }, settings, notify: true }],
      [{ game: { ...game, isDlc: undefined }, settings, notify: true }],
      [{ game, settings: { ...settings, extra: 1 }, notify: true }],
      [{ game, settings, notify: true, fromMenu: null }]
    ]) {
      expect(add.safeParse(bad).success).toBe(false)
    }
    expect(
      rustInvokeArgs[RUST_SHORTCUTS_REMOVE].safeParse([{ game, notify: false }])
        .success
    ).toBe(true)
    expect(
      rustInvokeArgs[RUST_SHORTCUTS_REMOVE].safeParse([
        { game, settings, notify: false }
      ]).success
    ).toBe(false)
    for (const channel of [
      RUST_SHORTCUTS_STEAM_ADD,
      RUST_SHORTCUTS_STEAM_REMOVE,
      RUST_SHORTCUTS_STEAM_IS_ADDED
    ]) {
      const steam = rustInvokeArgs[channel]
      expect(steam.safeParse([{ game, settings }]).success).toBe(true)
      expect(steam.safeParse([{ game, settings, notify: true }]).success).toBe(
        false
      )
      expect(steam.safeParse([{ game }]).success).toBe(false)
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
