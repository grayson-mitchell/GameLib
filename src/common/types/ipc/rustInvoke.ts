import { z } from 'zod'
import { SAFETY_TARGET_KINDS } from '../safety'
import {
  RUST_APP_EXIT,
  RUST_APP_HIDE,
  RUST_APP_RELAUNCH,
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
  RUST_STEAM_WINDOW_RAISE,
  RUST_NOTIFICATION_SHOW,
  RUST_DEPOT_FINALIZE,
  RUST_DEPOT_JOB_CANCEL,
  RUST_DEPOT_JOB_RUN,
  RUST_DEPOT_MANIFEST_SUMMARY,
  RUST_STEAMPOLL_ACF_ENUMERATE_COPIES,
  RUST_STEAMPOLL_ACF_FIND_OTHER_MANIFESTS,
  RUST_STEAMPOLL_ACF_READ_STATE,
  RUST_STEAMPOLL_ACF_READ_UPDATE,
  RUST_STEAMPOLL_ACF_READ_UPDATE_FROM_DIR,
  RUST_STEAMPOLL_ACF_REMOVE_COPY,
  RUST_STEAMPOLL_ACF_SCAN_DOWNLOADING,
  RUST_STEAMPOLL_ADOPTION_READ,
  RUST_STEAMPOLL_ADOPTION_UNWATCH,
  RUST_STEAMPOLL_ADOPTION_WATCH,
  RUST_STEAMPOLL_BREADCRUMB_INSTALLED_ON_DISK,
  RUST_STEAMPOLL_BRIDGE_FINALIZED,
  RUST_STEAMPOLL_HOLD_DISCARD,
  RUST_STEAMPOLL_HOLD_DRAIN,
  RUST_STEAMPOLL_INSTALL_CANCEL_DELEGATED,
  RUST_STEAMPOLL_INSTALL_START,
  RUST_STEAMPOLL_INSTALL_STOP,
  RUST_STEAMPOLL_MAC_ARCH_VERDICT,
  RUST_STEAMPOLL_NATIVE_IN_FLIGHT,
  RUST_STEAMPOLL_NEXT_NOTICE_SEQ,
  RUST_STEAMPOLL_READ_RUNNING_APP_ID,
  RUST_STEAMPOLL_RUNNING_HOLD,
  RUST_STEAMPOLL_RUNNING_LAST_APP_ID,
  RUST_STEAMPOLL_RUNNING_RELEASE,
  RUST_STEAMPOLL_RUNNING_START,
  RUST_STEAMPOLL_RUNNING_STOP,
  RUST_STEAMPOLL_STATUS,
  RUST_STEAMPOLL_UNINSTALL_START,
  RUST_STEAMPOLL_UNINSTALL_STOP,
  RUST_INFO_ANTICHEAT_DOWNLOAD,
  RUST_INFO_ANTICHEAT_INFO,
  RUST_INFO_ANTICHEAT_STATUS,
  RUST_INFO_CROSSOVER_RATING_MAP,
  RUST_INFO_GOG_DISCOUNTS,
  RUST_INFO_OVERRIDES_ATTACH,
  RUST_INFO_OVERRIDES_GET,
  RUST_INFO_OVERRIDES_GET_ALL,
  RUST_INFO_OVERRIDES_SET,
  RUST_INFO_RECENT_ADD,
  RUST_INFO_RECENT_REMOVE,
  RUST_INFO_UMU_GET,
  RUST_INFO_WIKI_CACHE_CLEAR,
  RUST_INFO_WIKI_GET,
  RUST_STEAMCM_ANON_CLOSE,
  RUST_STEAMCM_ANON_PRODUCT_INFO,
  RUST_STEAMCM_CONFIGURE,
  RUST_STEAMCM_CONTENT_SERVERS,
  RUST_STEAMCM_DEPOT_KEY,
  RUST_STEAMCM_LICENSES,
  RUST_STEAMCM_MAC_OWNED_APPS,
  RUST_STEAMCM_MANIFEST_REQUEST_CODE,
  RUST_STEAMCM_OWNED_APPS,
  RUST_STEAMCM_PERSONAS,
  RUST_STEAMCM_PRODUCT_INFO,
  RUST_STEAMCM_REDEEM_KEY,
  RUST_STEAMCM_REFRESH,
  RUST_STEAMCM_SESSION_ACQUIRE,
  RUST_STEAMCM_SESSION_ACQUIRE_OPEN,
  RUST_STEAMCM_SESSION_ENSURE_CONNECTED,
  RUST_STEAMCM_SESSION_LOGOUT,
  RUST_STEAMCM_SESSION_RELEASE,
  RUST_STEAMCM_SESSION_SHUTDOWN,
  RUST_STEAMCM_SESSION_STATUS,
  RUST_STEAMCM_SIGNIN_CANCEL,
  RUST_STEAMCM_SIGNIN_CREDENTIALS_START,
  RUST_STEAMCM_SIGNIN_GUARD_SUBMIT,
  RUST_STEAMCM_SIGNIN_QR_START,
  RUST_STEAMCM_SIGNIN_STATUS,
  RUST_STEAMCM_STORE_APPDETAILS,
  RUST_STEAMCM_STORE_ENRICH,
  RUST_STEAMCM_WRAP_RESTORE_IF_OWED,
  RUST_STEAM_API_PIN_RESOLVE,
  RUST_WINE_MANAGER_INSTALL,
  RUST_WINE_DISCOVER_ALTERNATIVES,
  RUST_WINE_DISCOVER_CROSSOVER,
  RUST_WINE_DXVK_INSTALL_REMOVE,
  RUST_WINE_WINETRICKS_APPLY,
  RUST_WINE_WINETRICKS_AVAILABLE,
  RUST_WINE_WINETRICKS_INSTALLED,
  RUST_WINE_WINETRICKS_INSTALL,
  RUST_WINE_WINETRICKS_LIST_INSTALLED,
  RUST_WINE_RUN_COMMAND_FOR_GAME,
  RUST_WINE_TOOL_CALL,
  RUST_ENGINE_SET_ONLINE,
  RUST_ENGINE_BOTTLE_PREPARE,
  RUST_ENGINE_BOTTLE_CREATE_FALLBACK,
  RUST_ENGINE_BOTTLE_CANCEL_CREATE,
  RUST_ENGINE_BOTTLE_KILL_WINESERVER,
  RUST_ENGINE_BOTTLE_REMOVE_CREATED,
  RUST_ENGINE_BOTTLE_REMOVE_PER_GAME,
  RUST_ENGINE_BOTTLE_RECONCILE_MARKER,
  RUST_ENGINE_BOTTLE_RECORD_PINNED,
  RUST_ENGINE_BOTTLE_RECORD_CROSSOVER,
  RUST_ENGINE_LEDGER_MARK_RUNNING,
  RUST_ENGINE_LEDGER_MARK_STOPPED,
  RUST_ENGINE_SELECTION_CLEAR,
  RUST_ENGINE_LAUNCH_SELECT,
  RUST_ENGINE_LAUNCH_ARM_DEADLINE,
  RUST_ENGINE_LAUNCH_END,
  RUST_ENGINE_LAUNCH_SETTINGS_GET,
  RUST_ENGINE_STATE_GET,
  RUST_ENGINE_DIALOG_DISPLAYED,
  RUST_ENGINE_DECIDE_LAUNCH,
  RUST_ENGINE_DECIDE_CREATION,
  RUST_ENGINE_PREFLIGHT_CROSSOVER,
  RUST_ENGINE_IS_CROSSOVER_MISSING,
  RUST_ENGINE_CX_RESOLVE_BIN_DIR,
  RUST_ENGINE_STATE_RECORD_DECISION,
  RUST_ENGINE_STATE_PUBLISH_OVERLAY_NOTICE,
  RUST_ENGINE_STATE_PUBLISH_OVERLAY_EXIT_NOTICE,
  RUST_ENGINE_DEADLINE_ARM,
  RUST_ENGINE_DEADLINE_CANCEL,
  RUST_ENGINE_RUN_TOOL,
  RUST_ENGINE_CANCEL,
  RUST_ENGINE_RESOLVE_TOOL_SETTINGS,
  RUST_ENGINE_NON_CROSSOVER_ENGINE,
  RUST_ENGINE_FALLBACK_ENSURE,
  RUST_KNOWNFIX_FETCH_REMOTE,
  RUST_KNOWNFIX_LAUNCH_OVERRIDES,
  RUST_WINE_MANAGER_LIST,
  RUST_WINE_MANAGER_REFRESH,
  RUST_WINE_RELEASES_INFO_READY,
  RUST_WINE_RUN_COMMAND,
  RUST_WINE_RUNTIME_DOWNLOAD,
  RUST_WINE_RUNTIME_IS_INSTALLED,
  RUST_WINE_VALID,
  RUST_SAFETY_CHECK_REMOVAL,
  RUST_SAFETY_REMOVE_TREE,
  RUST_STORE_BACKUP_FILE,
  RUST_STORE_READ_ONLY_NOTICE,
  RUST_STORE_VERSION_GATE,
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
  RUST_STEAMFILES_READ_LOGINUSERS_OFFLINE_MODE,
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
/** One opaque object the engine crate decodes strictly (the 87-42 bottle, ledger and selection ops). */
const engineOpRequest = z.tuple([
  z.unknown().meta({ title: 'request', 'x-rust-value': true })
])
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
// Library, metadata snapshot and install-state payloads of the Refresh/enrichment ops: opaque
// here, strictly typed (serde deny_unknown_fields) in `gamelib-steamcm`.
const opaque = (title: string) =>
  z.unknown().meta({ title, 'x-rust-value': true })
// Depot job / summary envelope: the nested body is validated in-crate (serde deny_unknown_fields),
// so this stays an opaque value and the generated Args carries it as a `serde_json::Value`.
const depotValueArg = z.tuple([
  z.unknown().meta({ title: 'request', 'x-rust-value': true })
])
// ---- Steam polling (Phase 80). Mirrors the gamelib-steampoll op args; the crate re-validates with
// deny_unknown_fields. appId stays a string here (the crate enforces the numeric constraint).
const pollRoots = z
  .object({
    steamRoot: z.string(),
    bottleSteamappsRoot: z.string().nullish(),
    bridgeSteamappsRoot: z.string().nullish()
  })
  .strict()
const pollSource = z.enum(['native', 'bottle', 'bridge'])
const pollAppArg = z.tuple([z.object({ appId: z.string() }).strict()])

// One pending adoption (Phase 81 D-07). The generated shell struct has no string-pattern or
// length keywords (genIpcContract supports neither), so the appId and size bounds are refinements:
// zod enforces them here, the generator sees plain strings, and the crate re-validates all of it.
const adoptionWatchArgs = z
  .object({
    appId: z
      .string()
      .refine((v) => /^\d{1,10}$/.test(v), 'appId: 1 to 10 digits'),
    manifestPath: z
      .string()
      .refine(
        (v) => v.length >= 1 && v.length <= 4096,
        'manifestPath: 1 to 4096'
      ),
    baselineContent: z
      .string()
      .refine((v) => v.length <= 1048576, 'baselineContent: at most 1 MiB'),
    recordedAtMs: z.number().finite(),
    steamPid: z.number().int().min(0).max(4294967295),
    installAppFallback: z.boolean().optional()
  })
  .strict()
const pollRootsAppArg = z.tuple([
  z.object({ roots: pollRoots, appId: z.string() }).strict()
])
const pollRootsAppSourceArg = z.tuple([
  z.object({ roots: pollRoots, appId: z.string(), source: pollSource }).strict()
])
const pollDirAppArg = z.tuple([
  z.object({ steamappsDir: z.string(), appId: z.string() }).strict()
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
// Phase 82 (D-07): the safety request, mirroring gamelib-safety wire.rs `Request` field for field
// (deny_unknown_fields there, strict here). `knownInstalls: null` means "the list could not be
// read" and yields `unknown` in the crate, so it must survive the boundary as null.
const safetyRequestArg = z.tuple([
  z
    .object({
      targets: z.array(
        z
          .object({
            id: z.string(),
            path: z.string(),
            kind: z.enum(SAFETY_TARGET_KINDS),
            trustRoot: z.string().nullish(),
            executable: z.string().nullish()
          })
          .strict()
      ),
      knownInstalls: z
        .array(z.object({ key: z.string(), path: z.string() }).strict())
        .nullable(),
      selfKey: z.string().nullish(),
      protectedRoots: z.array(z.string())
    })
    .strict()
])
const exePath = z.tuple([z.object({ exePath: z.string() })])
const empty = z.tuple([])
const reasonArg = z.tuple([z.object({ reason: z.string() }).strict()])
const flowArg = z.tuple([z.object({ flowId: z.string() }).strict()])

/** The runtimes the wine ops take (`RuntimeName`); the generated Rust decode holds the same three. */
const runtimeName = z
  .enum(['eac_runtime', 'battleye_runtime', 'umu'])
  .meta({ title: 'name' })

/**
 * A `WineVersionInfo` as a wine-manager release, opaque to the generated Rust decode (`x-rust-value`; a
 * single object argument would otherwise be rendered field by field, and the generator has no
 * length bounds). The shell validates it strictly in `wine_dispatch::parse_wine_version` (the eleven keys
 * and nothing else, each with its bound) before the crate sees it (T-87-68).
 */
const wineRelease = z.unknown().meta({ title: 'release', 'x-rust-value': true })

/**
 * A `WineInstallation` (or `null`) as `wine_valid` takes it, opaque to the generated Rust decode
 * (`x-rust-value`, like `wineRelease`). The shell keeps only the six declared keys, each of the declared
 * type, before the crate sees it (T-87-70): a persisted wine with a legacy key still answers.
 */
const wineInstallation = z
  .unknown()
  .meta({ title: 'wine', 'x-rust-value': true })

export const rustInvokeArgs = {
  // ---- Keychain
  [RUST_KEYRING_GET]: z.tuple([slot]).meta({
    'x-error-prefix': 'keyring'
  }),
  [RUST_KEYRING_SET]: z
    .tuple([z.string().meta({ title: 'secret', 'x-secret': true }), slot])
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
  [RUST_STEAM_WINDOW_RAISE]: empty,
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
  // ---- Destructive-path safety (Phase 82; D-06/D-07)
  [RUST_SAFETY_CHECK_REMOVAL]: safetyRequestArg,
  [RUST_SAFETY_REMOVE_TREE]: safetyRequestArg,
  // ---- Bottle-local versioned files (Phase 85, D-17). Path and chain are validated again in Rust.
  [RUST_STORE_VERSION_GATE]: z.tuple([
    z.object({ path: z.string(), chain: z.string() }).strict()
  ]),
  [RUST_STORE_BACKUP_FILE]: z.tuple([
    z
      .object({ path: z.string(), fromVersion: z.number().int().min(0) })
      .strict()
  ]),
  // ---- The read-only stores notice (Phase 85, 85-16, D-12): TS's entries, merged by Rust. Store
  // keys and closed reason words only, never a value. The generator takes no length keywords, so
  // Rust bounds the key length and the entry count itself (store_native::read_only_notice).
  [RUST_STORE_READ_ONLY_NOTICE]: z.tuple([
    z
      .object({
        tsEntries: z.array(
          z
            .object({
              storeKey: z.string(),
              reason: z.enum(['newer', 'failed'])
            })
            .strict()
        )
      })
      .strict()
  ]),
  // ---- Steam local files (Phase 75; paths in, typed results out)
  [RUST_STEAMFILES_FIND_ACF]: dirsAppArg,
  [RUST_STEAMFILES_PARSE_VALVE_MANIFEST]: pathArg,
  [RUST_STEAMFILES_READ_ACF]: pathArg,
  [RUST_STEAMFILES_READ_INSTALLSCRIPT]: pathArg,
  [RUST_STEAMFILES_READ_LIBRARY_FOLDERS]: pathArg,
  [RUST_STEAMFILES_READ_LOCALCONFIG_BETA_KEY]: pathAppArg,
  [RUST_STEAMFILES_READ_LOGINUSERS_OFFLINE_MODE]: pathArg,
  [RUST_STEAMFILES_READ_RUNNING_APP_ID]: pathArg,
  [RUST_STEAMFILES_SCAN_ACFS]: dirsArg,
  [RUST_STEAMFILES_SHORTCUTS_APPLY]: applyArg,
  [RUST_STEAMFILES_SHORTCUTS_READ]: pathArg,
  // ---- Steam install/uninstall/running polling (Phase 80)
  [RUST_STEAMPOLL_ACF_ENUMERATE_COPIES]: pollRootsAppArg,
  [RUST_STEAMPOLL_ACF_FIND_OTHER_MANIFESTS]: z.tuple([
    z
      .object({
        steamappsDir: z.string(),
        installdir: z.string(),
        appId: z.string()
      })
      .strict()
  ]),
  [RUST_STEAMPOLL_ACF_READ_STATE]: pollRootsAppSourceArg,
  [RUST_STEAMPOLL_ACF_READ_UPDATE]: pollRootsAppSourceArg,
  [RUST_STEAMPOLL_ACF_READ_UPDATE_FROM_DIR]: pollDirAppArg,
  [RUST_STEAMPOLL_ACF_REMOVE_COPY]: pollRootsAppSourceArg,
  [RUST_STEAMPOLL_ACF_SCAN_DOWNLOADING]: z.tuple([
    z.object({ roots: pollRoots }).strict()
  ]),
  [RUST_STEAMPOLL_ADOPTION_READ]: z.tuple([adoptionWatchArgs]),
  [RUST_STEAMPOLL_ADOPTION_UNWATCH]: pollAppArg,
  [RUST_STEAMPOLL_ADOPTION_WATCH]: z.tuple([adoptionWatchArgs]),
  [RUST_STEAMPOLL_BREADCRUMB_INSTALLED_ON_DISK]: pollDirAppArg,
  [RUST_STEAMPOLL_BRIDGE_FINALIZED]: z.tuple([
    z.object({ appId: z.string(), finalized: z.boolean() }).strict()
  ]),
  [RUST_STEAMPOLL_HOLD_DISCARD]: empty,
  [RUST_STEAMPOLL_HOLD_DRAIN]: empty,
  [RUST_STEAMPOLL_INSTALL_CANCEL_DELEGATED]: pollAppArg,
  // options (PollOptions) is validated in-crate with deny_unknown_fields, so it stays opaque here.
  [RUST_STEAMPOLL_INSTALL_START]: z.tuple([
    z
      .object({
        appId: z.string(),
        title: z.string(),
        roots: pollRoots,
        options: z
          .unknown()
          .meta({ title: 'options', 'x-rust-value': true })
          .optional()
      })
      .strict()
  ]),
  [RUST_STEAMPOLL_INSTALL_STOP]: pollAppArg,
  [RUST_STEAMPOLL_MAC_ARCH_VERDICT]: z.tuple([
    z.object({ installPath: z.string() }).strict()
  ]),
  [RUST_STEAMPOLL_NATIVE_IN_FLIGHT]: z.tuple([
    z.object({ appId: z.string(), inFlight: z.boolean() }).strict()
  ]),
  [RUST_STEAMPOLL_NEXT_NOTICE_SEQ]: empty,
  [RUST_STEAMPOLL_READ_RUNNING_APP_ID]: z.tuple([
    z.object({ strict: z.boolean().optional() }).strict().optional()
  ]),
  [RUST_STEAMPOLL_RUNNING_HOLD]: z.tuple([
    z.object({ appId: z.number().int().min(0).max(4294967295) }).strict()
  ]),
  [RUST_STEAMPOLL_RUNNING_LAST_APP_ID]: empty,
  [RUST_STEAMPOLL_RUNNING_RELEASE]: z.tuple([
    z
      .object({ claimId: z.number().int().min(0), terminalSent: z.boolean() })
      .strict()
  ]),
  [RUST_STEAMPOLL_RUNNING_START]: empty,
  [RUST_STEAMPOLL_RUNNING_STOP]: empty,
  [RUST_STEAMPOLL_STATUS]: empty,
  [RUST_STEAMPOLL_UNINSTALL_START]: z.tuple([
    z
      .object({
        appId: z.string(),
        title: z.string(),
        roots: pollRoots,
        source: pollSource,
        intervalMs: z.number().int().min(0).optional(),
        bridgeAuthoritative: z.boolean().optional()
      })
      .strict()
  ]),
  [RUST_STEAMPOLL_UNINSTALL_STOP]: pollAppArg,
  // ---- Steam depot jobs (Phase 73). The job body is validated in-crate (deny_unknown_fields),
  // so the envelope only names the identifying strings and the rest is an opaque Value.
  [RUST_DEPOT_FINALIZE]: depotValueArg,
  [RUST_DEPOT_JOB_CANCEL]: z.tuple([z.object({ jobId: z.string() })]),
  [RUST_DEPOT_JOB_RUN]: depotValueArg,
  [RUST_DEPOT_MANIFEST_SUMMARY]: depotValueArg,
  // ---- Rust CM client (Phase 79). Mirrors the gamelib-steamcm arg structs field for field.
  [RUST_STEAMCM_ANON_CLOSE]: reasonArg,
  [RUST_STEAMCM_ANON_PRODUCT_INFO]: z.tuple([
    z
      .object({
        apps: z.array(z.number()),
        packages: z.array(z.number()),
        inclTokens: z.boolean()
      })
      .strict()
  ]),
  [RUST_STEAMCM_CONFIGURE]: z.tuple([
    z.object({ appFolder: z.string() }).strict()
  ]),
  [RUST_STEAMCM_CONTENT_SERVERS]: z.tuple([
    z.object({ leaseId: z.number(), appId: z.number().nullish() }).strict()
  ]),
  [RUST_STEAMCM_DEPOT_KEY]: z.tuple([
    z
      .object({ leaseId: z.number(), appId: z.number(), depotId: z.number() })
      .strict()
  ]),
  [RUST_STEAMCM_LICENSES]: z.tuple([
    z.object({ leaseId: z.number() }).strict()
  ]),
  [RUST_STEAMCM_MAC_OWNED_APPS]: z.tuple([
    z.object({ helperPath: z.string(), steamId: z.string() }).strict()
  ]),
  [RUST_STEAMCM_MANIFEST_REQUEST_CODE]: z.tuple([
    z
      .object({
        leaseId: z.number(),
        appId: z.number(),
        depotId: z.number(),
        manifestId: z.string(),
        branch: z.string()
      })
      .strict()
  ]),
  [RUST_STEAMCM_OWNED_APPS]: z.tuple([
    z
      .object({
        leaseId: z.number(),
        steamId: z.string(),
        includeAppinfo: z.boolean(),
        includePlayedFreeGames: z.boolean(),
        includeFreeSub: z.boolean(),
        skipUnvettedApps: z.boolean()
      })
      .strict()
  ]),
  [RUST_STEAMCM_PERSONAS]: z.tuple([
    z.object({ leaseId: z.number(), steamIds: z.array(z.string()) }).strict()
  ]),
  [RUST_STEAMCM_PRODUCT_INFO]: z.tuple([
    z
      .object({
        leaseId: z.number(),
        apps: z.array(z.number()),
        packages: z.array(z.number()),
        inclTokens: z.boolean()
      })
      .strict()
  ]),
  [RUST_STEAMCM_REDEEM_KEY]: z.tuple([
    z
      .object({
        leaseId: z.number(),
        key: z.string().meta({ 'x-secret': true })
      })
      .strict()
  ]),
  [RUST_STEAMCM_REFRESH]: z.tuple([
    z
      .object({
        // The contract generator has no anyOf, so the tagged union is one object here; the
        // crate's RefreshSource (deny_unknown_fields) enforces which fields go with which kind.
        source: z
          .object({
            kind: z.enum(['cm', 'macSteam']),
            leaseId: z.number().optional(),
            helperPath: z.string().optional(),
            steamId: z.string()
          })
          .strict(),
        // The Rust side does the strict typing of these.
        metadata: opaque('metadata'),
        previousGames: opaque('previousGames'),
        installState: opaque('installState'),
        bridgeAllowlist: z.array(z.string()),
        knownFixMac32: z.array(z.string()),
        isMac: z.boolean()
      })
      .strict()
  ]),
  [RUST_STEAMCM_SESSION_ACQUIRE]: z.tuple([
    z
      .object({
        refreshToken: z.string().meta({ 'x-secret': true }),
        reason: z.string(),
        logonId: z.number()
      })
      .strict()
  ]),
  [RUST_STEAMCM_SESSION_ACQUIRE_OPEN]: reasonArg,
  [RUST_STEAMCM_SESSION_ENSURE_CONNECTED]: empty,
  [RUST_STEAMCM_SESSION_LOGOUT]: empty,
  [RUST_STEAMCM_SESSION_RELEASE]: z.tuple([
    z.object({ leaseId: z.number() }).strict()
  ]),
  [RUST_STEAMCM_SESSION_SHUTDOWN]: z.tuple([
    z.object({ boundMs: z.number() }).strict()
  ]),
  [RUST_STEAMCM_SESSION_STATUS]: empty,
  [RUST_STEAMCM_SIGNIN_CANCEL]: flowArg,
  [RUST_STEAMCM_SIGNIN_CREDENTIALS_START]: z.tuple([
    z
      .object({
        accountName: z.string().meta({ 'x-secret': true }),
        password: z.string().meta({ 'x-secret': true })
      })
      .strict()
  ]),
  [RUST_STEAMCM_SIGNIN_GUARD_SUBMIT]: z.tuple([
    z
      .object({
        flowId: z.string(),
        code: z.string().meta({ 'x-secret': true })
      })
      .strict()
  ]),
  [RUST_STEAMCM_SIGNIN_QR_START]: empty,
  [RUST_STEAMCM_SIGNIN_STATUS]: flowArg,
  [RUST_STEAMCM_STORE_APPDETAILS]: z.tuple([
    z.object({ appId: z.string() }).strict()
  ]),
  [RUST_STEAMCM_STORE_ENRICH]: z.tuple([
    z
      .object({
        appId: z.string(),
        cached: opaque('cached'),
        current: opaque('current'),
        knownFixMac32: z.boolean()
      })
      .strict()
  ]),
  [RUST_STEAMCM_WRAP_RESTORE_IF_OWED]: z.tuple([
    z.object({ trigger: z.enum(['boot', 'shutdown']) }).strict()
  ]),
  // ---- Phase 86 (SVC-01): recent games, served by the `gamelib-info` crate. The generator takes no
  // length keywords, so the crate itself bounds appName (1 to 1024 UTF-16 units) in `recent::add`
  // and `recent::remove`; that holds for the CLI and the native `removeRecent` as well.
  [RUST_INFO_RECENT_ADD]: z.tuple([
    z
      .object({
        appName: z.string(),
        title: z.string(),
        runner: z.string()
      })
      .strict()
  ]),
  [RUST_INFO_RECENT_REMOVE]: z.tuple([
    z.object({ appName: z.string() }).strict()
  ]),
  // Phase 86 (SVC-01): per-game overrides. The crate re-validates every arg (deny_unknown_fields,
  // appName 1 to 1024 UTF-16 units). `gameInfo` is an opaque value: the crate only reads its
  // `app_name` and hands the object back with `overrides` added.
  [RUST_INFO_OVERRIDES_GET]: z.tuple([
    z.object({ appName: z.string() }).strict()
  ]),
  [RUST_INFO_OVERRIDES_GET_ALL]: empty,
  [RUST_INFO_OVERRIDES_SET]: z.tuple([
    z
      .object({
        appName: z.string(),
        overrideData: z
          .object({
            title: z.string().optional(),
            art_cover: z.string().optional(),
            art_square: z.string().optional()
          })
          .strict()
      })
      .strict()
  ]),
  [RUST_INFO_OVERRIDES_ATTACH]: z.tuple([
    z
      .object({
        gameInfo: z.unknown().meta({ title: 'gameInfo', 'x-rust-value': true })
      })
      .strict()
  ]),
  // Phase 86 (SVC-01): anti-cheat. The crate re-validates every arg (deny_unknown_fields; the
  // namespace is at most 1024 UTF-16 units). `appNamespace` is optional: TS's `gameAnticheatInfo`
  // took `string | undefined`.
  [RUST_INFO_ANTICHEAT_INFO]: z.tuple([
    z.object({ appNamespace: z.string().optional() }).strict()
  ]),
  [RUST_INFO_ANTICHEAT_STATUS]: z.tuple([
    z.object({ latestFileHash: z.string().optional() }).strict()
  ]),
  [RUST_INFO_ANTICHEAT_DOWNLOAD]: z.tuple([z.object({}).strict()]),
  // Phase 86 (SVC-01): GOG discounts. The crate re-validates every arg (deny_unknown_fields; each
  // locale part is at most 32 UTF-16 units). `token` is the GOG access token or null; it is never
  // logged.
  [RUST_INFO_GOG_DISCOUNTS]: z.tuple([
    z
      .object({
        locale: z
          .object({
            countryCode: z.string(),
            locale: z.string(),
            currencyCode: z.string()
          })
          .strict(),
        hideOwned: z.boolean(),
        wishlistOnly: z.boolean(),
        token: z.string().nullable()
      })
      .strict()
  ]),
  // Phase 86 (SVC-01): the CrossOver rating map. The crate re-validates every arg (deny_unknown_fields,
  // at most 20000 games, a runner that is not one of the five rejects the call).
  [RUST_INFO_CROSSOVER_RATING_MAP]: z.tuple([
    z
      .object({
        games: z
          .array(
            z
              .object({
                appName: z.string(),
                title: z.string(),
                runner: z.string()
              })
              .strict()
          )
          .max(20000)
      })
      .strict()
  ]),
  // Phase 86 (SVC-01, 86-20, D-04): the umu id lookup. `runner` is one of the five runner names; the
  // crate re-validates (deny_unknown_fields, the runner table).
  [RUST_INFO_UMU_GET]: z.tuple([
    z
      .object({
        appName: z.string(),
        runner: z.enum(['gog', 'legendary', 'nile', 'sideload', 'steam'])
      })
      .strict()
  ]),
  // Phase 86 (SVC-01, 86-22, D-23): the wiki game info lookup. The crate re-validates (deny_unknown_fields,
  // the runner table; the title is at most 1024 and the app name 1 to 256 UTF-16 units). `forceRefresh`
  // is optional (TS's `forceRefresh = false`).
  [RUST_INFO_WIKI_GET]: z.tuple([
    z
      .object({
        title: z.string(),
        appName: z.string(),
        runner: z.enum(['gog', 'legendary', 'nile', 'sideload', 'steam']),
        forceRefresh: z.boolean().optional()
      })
      .strict()
  ]),
  [RUST_INFO_WIKI_CACHE_CLEAR]: z.tuple([z.object({}).strict()]),
  [RUST_STEAM_API_PIN_RESOLVE]: empty,
  // Phase 87 (SVC-02, 87-18): the wine runtime ops. One positional string, one of the three runtime
  // names; the shell decodes the same set again (T-87-65) and the crate validates the name a third time.
  [RUST_WINE_RUNTIME_IS_INSTALLED]: z.tuple([runtimeName]),
  [RUST_WINE_RUNTIME_DOWNLOAD]: z.tuple([runtimeName]),
  // Phase 87 (SVC-02, 87-20): the wine-manager ops. The refresh takes one boolean (`fetch`); the list takes
  // nothing; the install takes one WineVersionInfo (opaque here, decoded strictly in the shell); the
  // releases-info check takes the ReleasesInfo object, of which the crate reads the five feed stamps
  // (an unknown key is ignored there, as in the TS).
  [RUST_WINE_MANAGER_REFRESH]: z.tuple([z.boolean().meta({ title: 'fetch' })]),
  [RUST_WINE_MANAGER_INSTALL]: z.tuple([wineRelease]),
  [RUST_WINE_MANAGER_LIST]: empty,
  [RUST_WINE_RELEASES_INFO_READY]: z.tuple([
    z.unknown().meta({ title: 'releasesInfo', 'x-rust-value': true })
  ]),
  // Phase 87 (SVC-02, 87-24): the wine core ops. `wine_valid` takes one WineInstallation (or null);
  // `wine_run_command` one WineCommandArgs object, both opaque here and decoded by the shell and the crate
  // (the shell adds its own process environment and Darwin release as the host facts).
  [RUST_WINE_VALID]: z.tuple([wineInstallation]),
  [RUST_WINE_RUN_COMMAND]: z.tuple([
    z.unknown().meta({ title: 'command', 'x-rust-value': true })
  ]),
  // Phase 87 (SVC-02, 87-26): wine discovery. `wine_discover_alternatives` takes one boolean (`scanCustom`);
  // the shell builds the rest of the crate's DiscoveryHost itself (T-87-71), so no path travels from the
  // sidecar. `wine_discover_crossover` takes nothing.
  [RUST_WINE_DISCOVER_ALTERNATIVES]: z.tuple([
    z.boolean().meta({ title: 'scanCustom' })
  ]),
  [RUST_WINE_DISCOVER_CROSSOVER]: empty,
  // Phase 87 (SVC-02, 87-34): one DXVK-family install or remove. One object `{ settings, tool, action,
  // source? }`, opaque here and decoded strictly by the crate; the host facts (environment, Darwin release,
  // public directory, online) are the shell's, never the sidecar's.
  [RUST_WINE_DXVK_INSTALL_REMOVE]: z.tuple([
    z.unknown().meta({ title: 'request', 'x-rust-value': true })
  ]),
  // Phase 87 (SVC-02, 87-35): the Winetricks family. Each takes the game's target `{ runner, appName,
  // settings | unavailable }` as one object, opaque here and decoded strictly by the crate (`TargetArg`,
  // deny_unknown_fields); the wine host facts are the shell's, never the sidecar's. `apply` also takes the
  // renderer's verbs payload as it sent it (the crate's apply guard judges it); `install` takes a string list.
  [RUST_WINE_WINETRICKS_APPLY]: z.tuple([
    z.unknown().meta({ title: 'request', 'x-rust-value': true }),
    z.unknown().meta({ title: 'verbs', 'x-rust-value': true })
  ]),
  [RUST_WINE_WINETRICKS_AVAILABLE]: z.tuple([
    z.unknown().meta({ title: 'request', 'x-rust-value': true })
  ]),
  [RUST_WINE_WINETRICKS_INSTALLED]: z.tuple([
    z.unknown().meta({ title: 'request', 'x-rust-value': true })
  ]),
  [RUST_WINE_WINETRICKS_INSTALL]: z.tuple([
    z.unknown().meta({ title: 'request', 'x-rust-value': true }),
    z.array(z.string().meta({ title: 'verb' })).meta({ title: 'verbs' })
  ]),
  [RUST_WINE_WINETRICKS_LIST_INSTALLED]: z.tuple([
    z.unknown().meta({ title: 'request', 'x-rust-value': true })
  ]),
  // Phase 87 (SVC-02, 87-36): a wine command on a game. One object, the game facts and the command, opaque here and
  // decoded strictly by the crate (`ForGameArgs`, deny_unknown_fields); the command's shape (`commandParts`) is
  // the crate's guard to judge, so it travels as the renderer sent it. The wine host facts are the shell's.
  [RUST_WINE_RUN_COMMAND_FOR_GAME]: z.tuple([
    z.unknown().meta({ title: 'request', 'x-rust-value': true })
  ]),
  // Phase 87 (SVC-02, 87-36): `callTool`'s winecfg and runExe. One object, the tool, the exe and the same game facts,
  // opaque here and decoded strictly by the crate (`CallToolArgs`, deny_unknown_fields).
  [RUST_WINE_TOOL_CALL]: z.tuple([
    z.unknown().meta({ title: 'request', 'x-rust-value': true })
  ]),
  // Phase 87 (SVC-02, 87-31): the sidecar online monitor's status, written through to the engine context.
  // One strict object with one boolean; the crate decodes it again (deny_unknown_fields).
  [RUST_ENGINE_SET_ONLINE]: z.tuple([
    z.object({ online: z.boolean() }).strict()
  ]),
  // Phase 87 (SVC-02, 87-42): the bottle, ledger and selection ops. Each takes one object, opaque here and decoded
  // strictly by the crate (every request struct denies unknown fields; the paths, names and keys it is handed are
  // checked there, T-87-82).
  [RUST_ENGINE_BOTTLE_PREPARE]: engineOpRequest,
  [RUST_ENGINE_BOTTLE_CREATE_FALLBACK]: engineOpRequest,
  [RUST_ENGINE_BOTTLE_CANCEL_CREATE]: engineOpRequest,
  [RUST_ENGINE_BOTTLE_KILL_WINESERVER]: engineOpRequest,
  [RUST_ENGINE_BOTTLE_REMOVE_CREATED]: engineOpRequest,
  [RUST_ENGINE_BOTTLE_REMOVE_PER_GAME]: engineOpRequest,
  [RUST_ENGINE_BOTTLE_RECONCILE_MARKER]: engineOpRequest,
  [RUST_ENGINE_BOTTLE_RECORD_PINNED]: engineOpRequest,
  [RUST_ENGINE_BOTTLE_RECORD_CROSSOVER]: engineOpRequest,
  [RUST_ENGINE_LEDGER_MARK_RUNNING]: engineOpRequest,
  [RUST_ENGINE_LEDGER_MARK_STOPPED]: engineOpRequest,
  [RUST_ENGINE_SELECTION_CLEAR]: engineOpRequest,
  // Phase 87 (SVC-02, 87-52): the launch-time engine step of a non-Steam launch. One object each, decoded strictly by
  // the crate (every request struct denies unknown fields; the runner, app name and title are length-bounded there and
  // the engine key is derived, never taken from the caller, T-87-53).
  [RUST_ENGINE_LAUNCH_SELECT]: engineOpRequest,
  [RUST_ENGINE_LAUNCH_ARM_DEADLINE]: engineOpRequest,
  [RUST_ENGINE_LAUNCH_END]: engineOpRequest,
  [RUST_ENGINE_LAUNCH_SETTINGS_GET]: engineOpRequest,
  // Phase 87 (87-52, D-23): `getEngineState`. `{identity, facts?}`, decoded strictly by the crate; the identity is
  // validated there (an unknown runner or a path-shaped app name answers null) and the facts are values only.
  [RUST_ENGINE_STATE_GET]: engineOpRequest,
  // Phase 87 (87-53): the renderer's engine dialog ack, one `{ackId}` object the crate decodes strictly.
  [RUST_ENGINE_DIALOG_DISPLAYED]: engineOpRequest,
  // Phase 87 (87-54, D-03): the Steam bridge's engine decisions. One object each, decoded strictly by the crate; the
  // stored override, the monitor's phase and the wine-binary hints are values TypeScript gathered, never callbacks.
  [RUST_ENGINE_DECIDE_LAUNCH]: engineOpRequest,
  [RUST_ENGINE_DECIDE_CREATION]: engineOpRequest,
  [RUST_ENGINE_PREFLIGHT_CROSSOVER]: engineOpRequest,
  [RUST_ENGINE_IS_CROSSOVER_MISSING]: engineOpRequest,
  [RUST_ENGINE_CX_RESOLVE_BIN_DIR]: engineOpRequest,
  // Phase 87 (87-54, D-03): the bridge's engine-state writes, one object each (the facts are values; the override id and
  // the bottle name are checked by the crate).
  [RUST_ENGINE_STATE_RECORD_DECISION]: engineOpRequest,
  [RUST_ENGINE_STATE_PUBLISH_OVERLAY_NOTICE]: engineOpRequest,
  [RUST_ENGINE_STATE_PUBLISH_OVERLAY_EXIT_NOTICE]: engineOpRequest,
  // Phase 87 (87-54, D-17): a bridge launch's deadline. `{key}` to arm, `{key, reason}` to cancel; the crate checks the
  // key and the closed reason set.
  [RUST_ENGINE_DEADLINE_ARM]: engineOpRequest,
  [RUST_ENGINE_DEADLINE_CANCEL]: engineOpRequest,
  // Phase 87 (87-55, D-03, Pitfall 10): the bridge's tool runs. One object each, decoded strictly by the crate; the
  // program must be one of its five allowlisted absolute paths and the cancel id is `[A-Za-z0-9_-]{1,64}`.
  [RUST_ENGINE_RUN_TOOL]: engineOpRequest,
  [RUST_ENGINE_CANCEL]: engineOpRequest,
  // Phase 87 (87-56a, D-23): the settings a Wine tool acts on for a game. One object, decoded strictly by the crate
  // (`deny_unknown_fields`); the crate derives the engine key and the bottle name itself and creates a bottle only
  // through the per-game flight.
  [RUST_ENGINE_RESOLVE_TOOL_SETTINGS]: engineOpRequest,
  // Phase 87 (87-56a): the engine an id runs on, one `{engineId}` object the crate decodes strictly; a read.
  [RUST_ENGINE_NON_CROSSOVER_ENGINE]: engineOpRequest,
  // Phase 87 (87-56a, T-87-90): the pinned-engine download. One object naming a pin id (never a URL or a path) and the
  // cancel id `[A-Za-z0-9_-]{1,64}`, decoded strictly by the crate.
  [RUST_ENGINE_FALLBACK_ENSURE]: engineOpRequest,
  // Phase 88 (SVC-03, 88-12, D-19): the known-fix launch overrides of a non-Steam game. One strict object, the
  // fields the Rust serde decode takes with `deny_unknown_fields`; `installPath` is `null` (or absent) when the
  // install folder is unknown. The shell decodes the same set again and the crate a third time.
  [RUST_KNOWNFIX_LAUNCH_OVERRIDES]: z.tuple([
    z
      .object({
        appName: z.string(),
        runner: z.enum(['gog', 'legendary', 'nile', 'sideload', 'steam']),
        installPath: z.string().nullable().optional()
      })
      .strict()
  ]),
  // Phase 88 (SVC-03, 88-12, D-19): the install-time remote fixes fetch. One strict object, `{appName, runner}`;
  // the crate bounds the app name again (1 to 256 UTF-16 units) and the shell decodes the runner a second time.
  [RUST_KNOWNFIX_FETCH_REMOTE]: z.tuple([
    z
      .object({
        appName: z.string(),
        runner: z.enum(['gog', 'legendary', 'nile', 'sideload', 'steam'])
      })
      .strict()
  ])
} satisfies Record<RustInvokeChannel, z.ZodTuple>

/** The positional args a `rustInvoke` call for channel `C` sends (input side of the schema). */
export type RustInvokeArgsOf<C extends RustInvokeChannel> = z.input<
  (typeof rustInvokeArgs)[C]
>
