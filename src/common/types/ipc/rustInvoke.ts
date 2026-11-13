import { z } from 'zod'
import {
  RUST_APP_EXIT,
  RUST_APP_HIDE,
  RUST_APP_RELAUNCH,
  RUST_BRIDGE_INVITE_PICKER_OPEN,
  RUST_CLIPBOARD_READ_TEXT,
  RUST_CLIPBOARD_WRITE_TEXT,
  RUST_DIALOG_MESSAGE,
  RUST_DIALOG_OPEN,
  RUST_DIALOG_SAVE,
  RUST_HUMBLE_LOGIN_CLEAR_COOKIES,
  RUST_HUMBLE_LOGIN_CLEAR_STORAGE,
  RUST_HUMBLE_LOGIN_CLOSE,
  RUST_HUMBLE_LOGIN_COOKIES,
  RUST_HUMBLE_LOGIN_COOKIES_FOR_DOMAIN,
  RUST_HUMBLE_LOGIN_OPEN,
  RUST_HUMBLE_LOGIN_TAKE_EVENTS,
  RUST_HUMBLE_REVEAL_POST,
  RUST_KEYRING_AVAILABLE,
  RUST_KEYRING_DELETE,
  RUST_KEYRING_GET,
  RUST_KEYRING_SET,
  RUST_MAIN_WINDOW_RAISE,
  RUST_MAIN_WINDOW_HIDE,
  RUST_NOTIFICATION_SHOW,
  RUST_DEPOT_FINALIZE,
  RUST_DEPOT_JOB_CANCEL,
  RUST_DEPOT_JOB_RUN,
  RUST_DEPOT_MANIFEST_SUMMARY,
  RUST_SCAN_CONTAINED_REAL,
  RUST_SCAN_PE_IMPORTED_DLLS,
  RUST_SCAN_STEAMSTUB_SECTION,
  RUST_SCAN_STEAM_API_IMPORTS,
  RUST_SCAN_STEAM_DRM,
  RUST_SCAN_WINEMAC_METAL_EXPORTS,
  RUST_STEAMFILES_FIND_ACF,
  RUST_STEAMFILES_PARSE_VALVE_MANIFEST,
  RUST_STEAMFILES_READ_ACF,
  RUST_STEAMFILES_READ_INSTALLSCRIPT,
  RUST_STEAMFILES_READ_LIBRARY_FOLDERS,
  RUST_STEAMFILES_READ_LOCALCONFIG_BETA_KEY,
  RUST_STEAMFILES_READ_RUNNING_APP_ID,
  RUST_STEAMFILES_SCAN_ACFS,
  RUST_STEAMFILES_SHORTCUTS_APPLY,
  RUST_STEAMFILES_SHORTCUTS_READ,
  RUST_SHELL_OPEN_PATH,
  RUST_SHELL_SHOW_ITEM_IN_FOLDER,
  RUST_STORE_EMBED_BACK,
  RUST_STORE_EMBED_CLOSE,
  RUST_STORE_EMBED_FORWARD,
  RUST_STORE_EMBED_HIDE,
  RUST_STORE_EMBED_NAVIGATE,
  RUST_STORE_EMBED_OPEN,
  RUST_STORE_EMBED_RELOAD,
  RUST_STORE_EMBED_SET_BOUNDS,
  RUST_STORE_EMBED_SHOW,
  RUST_STORE_EMBED_TAKE_NAV_EVENTS,
  RUST_TRAY_SET_ICON,
  RUST_WAKE_LOCK_START,
  RUST_WAKE_LOCK_STOP,
  type RustInvokeChannel
} from '../sidecarTransport'

/**
 * Phase 67 D-13: one args-tuple schema per RUST_INVOKE_CHANNELS entry, consumed by
 * `meta/genIpcContract.ts` to emit Rust arg structs, and by `requestRustInvoke` (type-only,
 * via `RustInvokeArgsOf`) so call sites are checked at compile time. The sidecar does not
 * re-check these at runtime. Kept out of `sidecarTransport.ts` because the preload value-imports
 * that file and zod must not reach the renderer.
 *
 * Written against what the Rust arms in `src-tauri/src/store_embed.rs` actually read. Plain
 * `z.object` (not strict): args are sidecar-produced and Electron option objects carry extra keys
 * Rust ignores. An optional trailing positional maps to serde `Option` and the generated `from_args` reads absent
 * AND JSON null as None (JSON turns a positional `undefined` into null), so schemas for those
 * positionals use `.nullish()` to say so.
 */

/** The keyring slot is optional on the wire: Rust defaults an absent or null slot to the Steam token. */
const slot = z.string().nullish().meta({ title: 'slot' })
const label = z.string().meta({ title: 'label' })
const names = z.array(z.string()).meta({ title: 'names' })
const dialogFilters = z.array(
  z.object({
    name: z.string().optional(),
    extensions: z.array(z.string()).optional()
  })
)
const bounds = {
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number()
}
// Depot job / summary envelope: the nested body is validated in-crate (serde deny_unknown_fields),
// so this stays an opaque value and the generated Args carries it as a `serde_json::Value`.
const depotValueArg = z.tuple([
  z.unknown().meta({ title: 'request', 'x-rust-value': true })
])
const pathArg = z.tuple([z.object({ path: z.string() }).strict()])
const pathAppArg = z.tuple([
  z.object({ path: z.string(), appId: z.string() }).strict()
])
const dirsArg = z.tuple([
  z.object({ steamappsDirs: z.array(z.string()) }).strict()
])
const dirsAppArg = z.tuple([
  z.object({ steamappsDirs: z.array(z.string()), appId: z.string() }).strict()
])
// shortcuts_apply: the mutation (op add/update/remove over string/int32 entry fields) is an
// opaque value validated in-crate with deny_unknown_fields, the depotValueArg precedent.
const applyArg = z.tuple([
  z
    .object({
      path: z.string(),
      mutation: z.unknown().meta({ title: 'mutation', 'x-rust-value': true })
    })
    .strict()
])
const exePath = z.tuple([z.object({ exePath: z.string() })])
const empty = z.tuple([])

export const rustInvokeArgs = {
  // ---- Keychain
  [RUST_KEYRING_GET]: z.tuple([slot]).meta({
    'x-error-prefix': 'keyring'
  }),
  [RUST_KEYRING_SET]: z
    .tuple([z.string().meta({ title: 'secret' }), slot])
    .meta({ 'x-error-prefix': 'keyring' }),
  [RUST_KEYRING_DELETE]: z.tuple([slot]).meta({
    'x-error-prefix': 'keyring'
  }),
  [RUST_KEYRING_AVAILABLE]: z.tuple([slot]).meta({
    'x-error-prefix': 'keyring'
  }),
  // ---- Dialogs, notification, shell
  [RUST_DIALOG_OPEN]: z.tuple([
    z.object({
      title: z.string().optional(),
      defaultPath: z.string().optional(),
      properties: z.array(z.string()).optional(),
      filters: dialogFilters.optional()
    })
  ]),
  [RUST_DIALOG_MESSAGE]: z.tuple([
    z.object({
      message: z.string().optional(),
      title: z.string().optional(),
      kind: z.string().optional(),
      buttons: z.array(z.string()).optional()
    })
  ]),
  [RUST_DIALOG_SAVE]: z.tuple([
    z.object({
      defaultPath: z.string().optional(),
      filters: dialogFilters.optional()
    })
  ]),
  [RUST_NOTIFICATION_SHOW]: z.tuple([
    z.object({ title: z.string().optional(), body: z.string().optional() })
  ]),
  [RUST_SHELL_SHOW_ITEM_IN_FOLDER]: z.tuple([
    z.string().meta({ title: 'path' })
  ]),
  [RUST_SHELL_OPEN_PATH]: z.tuple([z.string().meta({ title: 'path' })]),
  // ---- App lifecycle
  [RUST_APP_EXIT]: empty,
  [RUST_APP_RELAUNCH]: empty,
  [RUST_APP_HIDE]: empty,
  [RUST_MAIN_WINDOW_RAISE]: empty,
  [RUST_MAIN_WINDOW_HIDE]: empty,
  [RUST_BRIDGE_INVITE_PICKER_OPEN]: z.tuple([
    z.object({ appId: z.string(), ackId: z.string() })
  ]),
  // ---- Clipboard, tray
  [RUST_CLIPBOARD_WRITE_TEXT]: z.tuple([z.string().meta({ title: 'text' })]),
  [RUST_CLIPBOARD_READ_TEXT]: empty,
  [RUST_TRAY_SET_ICON]: z.tuple([
    z.object({ variant: z.enum(['auto', 'light', 'dark']) })
  ]),
  // ---- Login windows (Humble / Epic / GOG)
  [RUST_HUMBLE_LOGIN_OPEN]: z.tuple([
    z.string().meta({ title: 'url' }),
    z.boolean().meta({ title: 'visible' }),
    z.string().meta({ title: 'user_agent' })
  ]),
  [RUST_HUMBLE_LOGIN_COOKIES]: z.tuple([
    label,
    z.string().meta({ title: 'host' }),
    names
  ]),
  [RUST_HUMBLE_LOGIN_COOKIES_FOR_DOMAIN]: z.tuple([
    label,
    z.string().meta({ title: 'domain' }),
    names
  ]),
  [RUST_HUMBLE_LOGIN_TAKE_EVENTS]: z.tuple([label]),
  [RUST_HUMBLE_LOGIN_CLOSE]: z.tuple([label]),
  [RUST_HUMBLE_LOGIN_CLEAR_COOKIES]: z.tuple([
    label,
    z.string().meta({ title: 'domain' })
  ]),
  [RUST_HUMBLE_REVEAL_POST]: z.tuple([
    z.string().meta({ title: 'origin_url' }),
    z.string().meta({ title: 'path' }),
    z.string().meta({ title: 'body' }),
    z.string().nullable().meta({ title: 'csrf_token' }),
    z.string().meta({ title: 'user_agent' })
  ]),
  [RUST_HUMBLE_LOGIN_CLEAR_STORAGE]: z.tuple([
    z.string().meta({ title: 'origin_url' }),
    z.string().meta({ title: 'user_agent' })
  ]),
  // ---- Store embed
  [RUST_STORE_EMBED_OPEN]: z
    .tuple([
      z.object({
        url: z.string(),
        ...bounds,
        storeKey: z.string(),
        homeUrl: z.string().nullish()
      })
    ])
    .meta({ 'x-field-errors': true }),
  [RUST_STORE_EMBED_SET_BOUNDS]: z
    .tuple([z.object(bounds)])
    .meta({ 'x-field-errors': true }),
  [RUST_STORE_EMBED_HIDE]: empty,
  [RUST_STORE_EMBED_SHOW]: empty,
  [RUST_STORE_EMBED_CLOSE]: empty,
  [RUST_STORE_EMBED_TAKE_NAV_EVENTS]: empty,
  [RUST_STORE_EMBED_BACK]: empty,
  [RUST_STORE_EMBED_FORWARD]: empty,
  [RUST_STORE_EMBED_RELOAD]: empty,
  [RUST_STORE_EMBED_NAVIGATE]: z
    .tuple([z.object({ url: z.string() })])
    .meta({ 'x-field-errors': true }),
  // ---- Wake lock
  [RUST_WAKE_LOCK_START]: z.tuple([z.string().meta({ title: 'kind' })]),
  [RUST_WAKE_LOCK_STOP]: z.tuple([
    z.number().int().min(0).max(4294967295).meta({ title: 'id' })
  ]),
  // ---- Executable scanners (all-string args objects; D-08: paths in, never bytes)
  [RUST_SCAN_STEAM_API_IMPORTS]: z.tuple([
    z.object({ exePath: z.string(), appId: z.string() })
  ]),
  [RUST_SCAN_STEAM_DRM]: exePath,
  [RUST_SCAN_STEAMSTUB_SECTION]: exePath,
  [RUST_SCAN_PE_IMPORTED_DLLS]: exePath,
  [RUST_SCAN_CONTAINED_REAL]: z.tuple([
    z.object({ path: z.string(), rootDir: z.string() })
  ]),
  [RUST_SCAN_WINEMAC_METAL_EXPORTS]: z.tuple([
    z.object({ wineBundlePath: z.string() })
  ]),
  // ---- Steam local files (Phase 75; paths in, typed results out)
  [RUST_STEAMFILES_FIND_ACF]: dirsAppArg,
  [RUST_STEAMFILES_PARSE_VALVE_MANIFEST]: pathArg,
  [RUST_STEAMFILES_READ_ACF]: pathArg,
  [RUST_STEAMFILES_READ_INSTALLSCRIPT]: pathArg,
  [RUST_STEAMFILES_READ_LIBRARY_FOLDERS]: pathArg,
  [RUST_STEAMFILES_READ_LOCALCONFIG_BETA_KEY]: pathAppArg,
  [RUST_STEAMFILES_READ_RUNNING_APP_ID]: pathArg,
  [RUST_STEAMFILES_SCAN_ACFS]: dirsArg,
  [RUST_STEAMFILES_SHORTCUTS_APPLY]: applyArg,
  [RUST_STEAMFILES_SHORTCUTS_READ]: pathArg,
  // ---- Steam depot jobs (Phase 73). The job body is validated in-crate (deny_unknown_fields),
  // so the envelope only names the identifying strings and the rest is an opaque Value.
  [RUST_DEPOT_FINALIZE]: depotValueArg,
  [RUST_DEPOT_JOB_CANCEL]: z.tuple([z.object({ jobId: z.string() })]),
  [RUST_DEPOT_JOB_RUN]: depotValueArg,
  [RUST_DEPOT_MANIFEST_SUMMARY]: depotValueArg
} satisfies Record<RustInvokeChannel, z.ZodTuple>

/** The positional args a `rustInvoke` call for channel `C` sends (input side of the schema). */
export type RustInvokeArgsOf<C extends RustInvokeChannel> = z.input<
  (typeof rustInvokeArgs)[C]
>
