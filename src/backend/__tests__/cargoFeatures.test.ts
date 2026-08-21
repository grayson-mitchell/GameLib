/**
 * Phase 34 Plan 01 (Wave-0 config-shape scaffold): asserts the TARGET shape
 * of src-tauri/Cargo.toml's `keyring` feature list and the two new Tauri
 * plugin dependencies. RED today (keyring only has `apple-native`,
 * tauri-plugin-updater/tauri-plugin-shell are not yet dependencies) --
 * turned GREEN by Plan 34-02.
 *
 * Text/regex assertions against the raw TOML (no TOML-parser dependency),
 * per the plan's stated approach.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CARGO_TOML_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'Cargo.toml'
)

function loadCargoToml(): string {
  return readFileSync(CARGO_TOML_PATH, 'utf-8')
}

function extractKeyringLine(source: string): string {
  const match = source.match(/^keyring\s*=\s*\{[^}]*\}/m)
  if (!match) {
    throw new Error(
      'No `keyring = { ... }` dependency line found in Cargo.toml'
    )
  }
  return match[0]
}

/**
 * Extracts the `tauri` dependency line's `features = [...]` list as a parsed array of
 * bare feature names (quotes stripped, whitespace trimmed) -- not a raw substring check,
 * so a stray comment mentioning "tray-icon" elsewhere in the file can't satisfy this gate.
 */
function extractTauriFeatures(source: string): string[] {
  const lineMatch = source.match(/^tauri\s*=\s*\{[^}]*\}/m)
  if (!lineMatch) {
    throw new Error('No `tauri = { ... }` dependency line found in Cargo.toml')
  }
  const featuresMatch = lineMatch[0].match(/features\s*=\s*\[([^\]]*)\]/)
  if (!featuresMatch) {
    throw new Error(
      'No `features = [...]` list found on the tauri dependency line'
    )
  }
  return featuresMatch[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^"|"$/g, ''))
    .filter((entry) => entry.length > 0)
}

describe('Cargo.toml keyring feature list (Pitfall 5 -- cross-platform safeStorage)', () => {
  test('the keyring dependency line contains apple-native', () => {
    const keyringLine = extractKeyringLine(loadCargoToml())
    expect(keyringLine).toContain('apple-native')
  })

  test('the keyring dependency line contains windows-native', () => {
    const keyringLine = extractKeyringLine(loadCargoToml())
    expect(keyringLine).toContain('windows-native')
  })

  test('the keyring dependency line contains sync-secret-service', () => {
    const keyringLine = extractKeyringLine(loadCargoToml())
    expect(keyringLine).toContain('sync-secret-service')
  })

  test('the keyring dependency stays pinned at major version 3 (do not bump)', () => {
    const keyringLine = extractKeyringLine(loadCargoToml())
    expect(keyringLine).toMatch(/version\s*=\s*"3"/)
  })
})

describe('Cargo.toml Tauri updater/shell plugin dependencies (D-06 / D-07 / D-08)', () => {
  test('tauri-plugin-updater is a declared dependency', () => {
    const source = loadCargoToml()
    expect(source).toMatch(/^tauri-plugin-updater\s*=/m)
  })

  test('tauri-plugin-shell is a declared dependency', () => {
    const source = loadCargoToml()
    expect(source).toMatch(/^tauri-plugin-shell\s*=/m)
  })
})

describe('REQ-34.1-07 Cargo.toml tauri tray-icon feature (Phase 34.1 Plan 06, D-11)', () => {
  test('REQ-34.1-07 the tauri dependency line declares a features list containing tray-icon', () => {
    const features = extractTauriFeatures(loadCargoToml())
    expect(features).toContain('tray-icon')
  })

  test('REQ-34.1-07 the existing keyring feature assertions still pass alongside the tray-icon change', () => {
    const keyringLine = extractKeyringLine(loadCargoToml())
    expect(keyringLine).toContain('apple-native')
    expect(keyringLine).toContain('windows-native')
    expect(keyringLine).toContain('sync-secret-service')
  })
})

/**
 * Extracts the `objc2-app-kit` dependency's `features = [...]` list as a parsed array of bare
 * feature names -- mirrors `extractTauriFeatures`'s own convention (parsed array, not a raw
 * substring check, so a stray comment mentioning a feature name elsewhere can't satisfy a gate).
 */
function extractObjc2AppKitFeatures(source: string): string[] {
  const lineMatch = source.match(/^objc2-app-kit\s*=\s*\{[^}]*\}/m)
  if (!lineMatch) {
    throw new Error(
      'No `objc2-app-kit = { ... }` dependency line found in Cargo.toml'
    )
  }
  const featuresMatch = lineMatch[0].match(/features\s*=\s*\[([^\]]*)\]/)
  if (!featuresMatch) {
    throw new Error(
      'No `features = [...]` list found on the objc2-app-kit dependency line'
    )
  }
  return featuresMatch[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^"|"$/g, ''))
    .filter((entry) => entry.length > 0)
}

describe('Phase 34.4.2 Plan 13 (operator decision D-A) objc2-app-kit NSGraphicsContext feature RETIRED', () => {
  test('the objc2-app-kit dependency line does NOT declare NSGraphicsContext -- it existed solely for NSEvent::mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure, the synthesized-right-click poster deleted by Plan 13; a clean cargo build with the feature removed confirms it was never needed by anything else', () => {
    const features = extractObjc2AppKitFeatures(loadCargoToml())
    expect(features).not.toContain('NSGraphicsContext')
  })

  test('the objc2-app-kit dependency line still declares every pre-existing feature this phase relies on', () => {
    const features = extractObjc2AppKitFeatures(loadCargoToml())
    for (const feature of [
      'NSView',
      'NSWindow',
      'NSEvent',
      'NSApplication',
      'block2'
    ]) {
      expect(features).toContain(feature)
    }
  })
})

/**
 * GAP-3 (supply chain, AR-34.1-07 / FOLLOW-UP-1 of 34.1-SECURITY.md): enabling
 * `features = ["tray-icon", "image-png"]` on the `tauri` dependency silently pulled 4
 * registry crates that were not previously in Cargo.lock (`image` 0.25.10, `moxcms` 0.8.1,
 * `pxfm` 0.1.29, `byteorder-lite` 0.1.0), under a plan claim of "no new crate ... no
 * registry fetch of an unaudited package occurs". The assertions above only confirm
 * `tray-icon` is a *declared feature* on Cargo.toml -- they say nothing about what that
 * feature *resolves to* in Cargo.lock. This block pins the full crate-name set so a future
 * feature flip fails a test with an actionable diff instead of sliding through silently.
 *
 * EXPECTED_LOCKFILE_CRATE_NAMES below was machine-generated from the current
 * `src-tauri/Cargo.lock` (`grep '^name = ' Cargo.lock | sed ... | sort -u`), not hand-typed.
 */
const CARGO_LOCK_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'Cargo.lock'
)

function loadCargoLock(): string {
  return readFileSync(CARGO_LOCK_PATH, 'utf-8')
}

/** Unique, sorted crate names from every `[[package]]` entry in Cargo.lock. */
function extractLockfileCrateNames(source: string): string[] {
  const matches = source.match(/^name = "([^"]+)"$/gm) ?? []
  const names = matches.map((line) => line.match(/^name = "([^"]+)"$/)![1])
  return Array.from(new Set(names)).sort()
}

// prettier-ignore
const EXPECTED_LOCKFILE_CRATE_NAMES = [
  "adler2", "aho-corasick", "alloc-no-stdlib", "alloc-stdlib", "android_system_properties", "anyhow",
  "arbitrary", "arboard", "async-broadcast", "async-channel", "async-executor", "async-io",
  "async-lock", "async-process", "async-recursion", "async-signal", "async-task", "async-trait",
  "atk", "atk-sys", "atomic-waker", "autocfg", "base64", "bit-set",
  "bit-vec", "bitflags", "block-buffer", "block2", "blocking", "brotli",
  "brotli-decompressor", "bs58", "bumpalo", "bytemuck", "byteorder", "byteorder-lite",
  "bytes", "cairo-rs", "cairo-sys-rs", "camino", "cargo-platform", "cargo_metadata",
  "cargo_toml", "cc", "cesu8", "cfb", "cfg-expr", "cfg-if",
  "chrono", "clipboard-win", "combine", "concurrent-queue", "cookie", "core-foundation",
  "core-foundation-sys", "core-graphics", "core-graphics-types", "cpufeatures", "crc32fast", "crossbeam-channel",
  "crossbeam-utils", "crunchy", "crypto-common", "cssparser", "cssparser-macros", "ctor",
  "ctor-proc-macro", "darling", "darling_core", "darling_macro", "dbus", "dbus-secret-service",
  "deranged", "derive_arbitrary", "derive_more", "derive_more-impl", "digest", "dirs",
  "dirs-sys", "dispatch2", "displaydoc", "dlopen2", "dlopen2_derive", "dom_query",
  "downcast-rs", "dpi", "dtoa", "dtoa-short", "dtor", "dtor-proc-macro",
  "dunce", "dyn-clone", "embed-resource", "embed_plist", "encoding_rs", "endi",
  "enumflags2", "enumflags2_derive", "equivalent", "erased-serde", "errno", "error-code",
  "event-listener", "event-listener-strategy", "fastrand", "fax", "fdeflate", "field-offset",
  "filetime", "find-msvc-tools", "fixedbitset", "flate2", "fnv", "foldhash",
  "foreign-types", "foreign-types-macros", "foreign-types-shared", "form_urlencoded", "futures-channel", "futures-core",
  "futures-executor", "futures-io", "futures-lite", "futures-macro", "futures-sink", "futures-task",
  "futures-util", "gamelib-shell", "gdk", "gdk-pixbuf", "gdk-pixbuf-sys", "gdk-sys",
  "gdkwayland-sys", "gdkx11", "gdkx11-sys", "generic-array", "gethostname", "getrandom",
  "gio", "gio-sys", "glib", "glib-macros", "glib-sys", "glob",
  "gobject-sys", "gtk", "gtk-sys", "gtk3-macros", "half", "hashbrown",
  "heck", "hermit-abi", "hex", "html5ever", "http", "http-body",
  "http-body-util", "httparse", "hyper", "hyper-rustls", "hyper-util", "iana-time-zone",
  "iana-time-zone-haiku", "ico", "icu_collections", "icu_locale_core", "icu_normalizer", "icu_normalizer_data",
  "icu_properties", "icu_properties_data", "icu_provider", "ident_case", "idna", "idna_adapter",
  "image", "indexmap", "infer", "ipnet", "is-docker", "is-wsl",
  "itoa", "javascriptcore-rs", "javascriptcore-rs-sys", "jni", "jni-macros", "jni-sys",
  "jni-sys-macros", "js-sys", "json-patch", "jsonptr", "keyboard-types", "keyring",
  "libappindicator", "libappindicator-sys", "libc", "libdbus-sys", "libloading", "libredox",
  "linux-raw-sys", "litemap", "lock_api", "log", "mac-notification-sys", "markup5ever",
  "memchr", "memoffset", "mime", "minisign-verify", "miniz_oxide", "mio",
  "moxcms", "muda", "ndk", "ndk-sys", "new_debug_unreachable", "nom",
  "notify-rust", "num-conv", "num-traits", "num_enum", "num_enum_derive", "objc2",
  "objc2-app-kit", "objc2-cloud-kit", "objc2-core-data", "objc2-core-foundation", "objc2-core-graphics", "objc2-core-image",
  "objc2-core-location", "objc2-core-text", "objc2-encode", "objc2-exception-helper", "objc2-foundation", "objc2-io-surface",
  "objc2-osa-kit", "objc2-quartz-core", "objc2-ui-kit", "objc2-user-notifications", "objc2-web-kit", "once_cell",
  "open", "openssl-probe", "option-ext", "ordered-stream", "os_pipe", "osakit",
  "pango", "pango-sys", "parking", "parking_lot", "parking_lot_core", "percent-encoding",
  "petgraph", "phf", "phf_codegen", "phf_generator", "phf_macros", "phf_shared",
  "pin-project-lite", "piper", "pkg-config", "plist", "png", "polling",
  "potential_utf", "powerfmt", "ppv-lite86", "precomputed-hash", "proc-macro-crate", "proc-macro-error",
  "proc-macro-error-attr", "proc-macro2", "pxfm", "quick-error", "quick-xml", "quote",
  "r-efi", "rand", "rand_chacha", "rand_core", "raw-window-handle", "redox_syscall",
  "redox_users", "ref-cast", "ref-cast-impl", "regex", "regex-automata", "regex-syntax",
  "reqwest", "rfd", "ring", "rustc-hash", "rustc_version", "rustix",
  "rustls", "rustls-native-certs", "rustls-pki-types", "rustls-platform-verifier", "rustls-platform-verifier-android", "rustls-webpki",
  "rustversion", "same-file", "schannel", "schemars", "schemars_derive", "scopeguard",
  "security-framework", "security-framework-sys", "selectors", "semver", "serde", "serde-untagged",
  "serde_core", "serde_derive", "serde_derive_internals", "serde_json", "serde_repr", "serde_spanned",
  "serde_with", "serde_with_macros", "serialize-to-javascript", "serialize-to-javascript-impl", "servo_arc", "sha2",
  "shared_child", "shlex", "sigchld", "signal-hook", "signal-hook-registry", "simd-adler32",
  "simd_cesu8", "simdutf8", "siphasher", "slab", "smallvec", "socket2",
  "softbuffer", "soup3", "soup3-sys", "stable_deref_trait", "string_cache", "string_cache_codegen",
  "strsim", "subtle", "swift-rs", "syn", "sync_wrapper", "synstructure",
  "system-deps", "tao", "tao-macros", "tar", "target-lexicon", "tauri",
  "tauri-build", "tauri-codegen", "tauri-macros", "tauri-plugin", "tauri-plugin-clipboard-manager", "tauri-plugin-dialog",
  "tauri-plugin-fs", "tauri-plugin-notification", "tauri-plugin-opener", "tauri-plugin-shell", "tauri-plugin-updater", "tauri-runtime",
  "tauri-runtime-wry", "tauri-utils", "tauri-winres", "tauri-winrt-notification", "tempfile", "tendril",
  "thiserror", "thiserror-impl", "tiff", "time", "time-core", "time-macros",
  "tinystr", "tinyvec", "tinyvec_macros", "tokio", "tokio-rustls", "tokio-util",
  "toml", "toml_datetime", "toml_edit", "toml_parser", "toml_writer", "tower",
  "tower-http", "tower-layer", "tower-service", "tracing", "tracing-attributes", "tracing-core",
  "tray-icon", "tree_magic_mini", "try-lock", "typeid", "typenum", "uds_windows",
  "unic-char-property", "unic-char-range", "unic-common", "unic-ucd-ident", "unic-ucd-version", "unicode-ident",
  "unicode-segmentation", "untrusted", "url", "urlpattern", "utf8_iter", "uuid",
  "version-compare", "version_check", "vswhom", "vswhom-sys", "walkdir", "want",
  "wasi", "wasip2", "wasm-bindgen", "wasm-bindgen-futures", "wasm-bindgen-macro", "wasm-bindgen-macro-support",
  "wasm-bindgen-shared", "wasm-streams", "wayland-backend", "wayland-client", "wayland-protocols", "wayland-protocols-wlr",
  "wayland-scanner", "wayland-sys", "web-sys", "web_atoms", "webkit2gtk", "webkit2gtk-sys",
  "webpki-root-certs", "webview2-com", "webview2-com-macros", "webview2-com-sys", "weezl", "winapi",
  "winapi-i686-pc-windows-gnu", "winapi-util", "winapi-x86_64-pc-windows-gnu", "window-vibrancy", "windows", "windows-collections",
  "windows-core", "windows-future", "windows-implement", "windows-interface", "windows-link", "windows-numerics",
  "windows-result", "windows-strings", "windows-sys", "windows-targets", "windows-threading", "windows-version",
  "windows_aarch64_gnullvm", "windows_aarch64_msvc", "windows_i686_gnu", "windows_i686_gnullvm", "windows_i686_msvc", "windows_x86_64_gnu",
  "windows_x86_64_gnullvm", "windows_x86_64_msvc", "winnow", "winreg", "wit-bindgen", "wl-clipboard-rs",
  "writeable", "wry", "x11", "x11-dl", "x11rb", "x11rb-protocol",
  "xattr", "yoke", "yoke-derive", "zbus", "zbus_macros", "zbus_names",
  "zerocopy", "zerocopy-derive", "zerofrom", "zerofrom-derive", "zeroize", "zeroize_derive",
  "zerotrie", "zerovec", "zerovec-derive", "zip", "zmij", "zune-core",
  "zune-jpeg", "zvariant", "zvariant_derive", "zvariant_utils"
]

describe('Cargo.lock crate-name set pin (AR-34.1-07 / FOLLOW-UP-1, GAP-3)', () => {
  test('the full unique crate-name set in Cargo.lock matches the checked-in pin', () => {
    const actual = extractLockfileCrateNames(loadCargoLock())
    const added = actual.filter(
      (name) => !EXPECTED_LOCKFILE_CRATE_NAMES.includes(name)
    )
    const removed = EXPECTED_LOCKFILE_CRATE_NAMES.filter(
      (name) => !actual.includes(name)
    )
    if (added.length > 0 || removed.length > 0) {
      throw new Error(
        'Cargo.lock crate-name set has changed since it was pinned by this test ' +
          '(see 34.1-SECURITY.md AR-34.1-07 / FOLLOW-UP-1).\n' +
          `Appeared: ${added.length > 0 ? added.join(', ') : '(none)'}\n` +
          `Disappeared: ${removed.length > 0 ? removed.join(', ') : '(none)'}\n` +
          'If this change is intentional (e.g. a deliberate feature flip), update ' +
          'EXPECTED_LOCKFILE_CRATE_NAMES in cargoFeatures.test.ts and re-run the supply-chain ' +
          'review before accepting the new crates.'
      )
    }
    expect(actual).toEqual(EXPECTED_LOCKFILE_CRATE_NAMES)
  })

  test('the four crates disclosed under AR-34.1-07 are present in both Cargo.lock and the pin', () => {
    const actual = extractLockfileCrateNames(loadCargoLock())
    for (const crate of ['image', 'moxcms', 'pxfm', 'byteorder-lite']) {
      expect(actual).toContain(crate)
      expect(EXPECTED_LOCKFILE_CRATE_NAMES).toContain(crate)
    }
  })
})
