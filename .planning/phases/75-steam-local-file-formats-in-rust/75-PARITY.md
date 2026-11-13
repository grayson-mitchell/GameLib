# Phase 75 Parity Report

Status: APPROVED (operator accepted every divergence, accept-all, 2026-11-14)

Plan 75-24 (P75-E, D-07, D-12 Tier 2). Sweep: `pnpm steamfiles-parity-sweep` (`meta/steamFilesParitySweep.ts`), run on the operator's Mac. Output is redacted (sha1 of the relative path plus basename, roots as `<ROOT>`); no absolute path, user name or account id appears here, and no real Steam file was copied into the repo.

## Corpus

| Category | Count |
| -------- | ----- |
| Native Steam libraries (read through libraryfolders.vdf) | 2 |
| Bridge bottles with a steamapps dir | 31 |
| Other CrossOver bottles with a steamapps dir | 2 |
| steamapps dirs swept (libraries + bottles) | 35 |
| Distinct appmanifest ids / ACF inputs per wrapper | 48 ids / 49 files |
| libraryfolders.vdf | 1 (through getSteamLibraries) |
| registry.vdf | 1 |
| userdata localconfig.vdf accounts | 1 (100 appId/beta-key reads: every ACF id plus every UserAppConfig entry) |
| installscript.vdf files under the libraries and bottles | 6 |
| Cached Valve manifests | 0 (acceptable for this category alone: the downloaded `manifest.vdf` is a per-run temp file, only `valve-client.json` is cached, so there is no real file to sweep; Valve manifest parity rests on the golden fixtures) |
| shortcuts.vdf files | 1 (1015 bytes) |

## Sweep result

Exit code: 0 (no unexplained diff). Shortcuts round-trip through the Rust codec: identical = yes, 1015 bytes, checked with the non-writing `steamfiles_shortcuts_roundtrip` op (D-10 part 1). The real file uses binary KV tags 0x00 (5), 0x01 (18) and 0x02 (16) only; tag 0x0A (int64) does not occur in it, so it is still unproven on a real file (see DV-75-14).

| Category | Inputs | Equal | Explained | Unexplained |
| -------- | ------ | ----- | --------- | ----------- |
| libraries (getSteamLibraries) | 1 | 1 | 0 | 0 |
| buildInstalledMap | 1 | 0 | numeric-coercion 1 | 0 |
| buildBridgeInstalledMap | 1 | 0 | numeric-coercion 1 | 0 |
| buildBottleInstalledMap | 2 | 1 | numeric-coercion 1 | 0 |
| registry (readMacRunningAppId) | 1 | 1 | 0 | 0 |
| acfInstalldir (readAcfInstalldir) | 49 | 49 | 0 | 0 |
| readAppManifestFlags | 49 | 49 | 0 | 0 |
| readAcfInstalledDepots | 49 | 48 | integer-key-order 1 | 0 |
| readAcfUpdateFieldsFromDir | 49 | 49 | 0 | 0 |
| readAcfBetaKey | 49 | 49 | 0 | 0 |
| readAcfState | 44 | 29 | numeric-coercion 15 | 0 |
| readLocalConfigBetaKey | 100 | 100 | 0 | 0 |
| readInstallScript | 6 | 6 | 0 | 0 |
| parseValveClientManifest vs File | 0 | 0 | 0 | 0 |
| shortcuts round-trip | 1 | 1 (identical) | 0 | 0 |
| shortcuts validity (oracle parse vs shortcutsValidityFromSummary) | 1 | 1 | 0 | 0 |

`readAcfState` was swept for the native libraries and the bridge bottles; the CrossOver Steam bottle source is covered by `buildBottleInstalledMap`.

## Divergences

Operator decision 2026-11-14: accept-all. Steam-correct side is judged per D-07 (Valve KeyValues behaviour), not by assuming the old parser is right.

| id | Source | Oracle (TS) behaviour | Rust behaviour | Steam-correct side and why | Caller impact | accepted |
| -- | ------ | --------------------- | -------------- | -------------------------- | ------------- | -------- |
| DV-75-01 | sweep class `numeric-coercion` (real: buildInstalledMap, buildBridgeInstalledMap, buildBottleInstalledMap, readAcfState); golden `library/buildInstalledMap/scan`, `library/readAcfState/10`, `library/readAcfState/40` | `@node-steam/vdf` coerces numeric-looking values, so `sizeOnDisk` is a JS number at runtime | `sizeOnDisk` is the on-disk string | Rust: ACF values are strings on disk and the declared type is already `string` | `sizeOnDisk` is now a string at runtime, as its type always said; any caller doing arithmetic on it without `Number()` was already a type error | accepted: yes (2026-11-14) |
| DV-75-02 | golden `acfUpdate/readAcfBetaKey/truncated`, `installdir/readAcfInstalldir/truncated`, `adoption/readAppManifestFlags/truncated`, `library/buildInstalledMap/with-truncated-manifest`, `library/buildIncompleteInstallSet/with-truncated-manifest`, `library/readAcfState/30/with-truncated-manifest`, `library/scanDownloadingAppIds/with-truncated-manifest`, `library/findOtherManifestsWithInstalldir/with-truncated-manifest` | The `@node-steam/vdf` parse never terminates on a truncated manifest (the oracle records a hang); `parseAcfTree` also had a tolerant partial parse | Strict parse: `parsed: false`, the wrapper reads the manifest as unreadable/absent; the rest of the scan continues | Rust: a corrupt manifest must not wedge the queue-head guard or the scan (T-2-01 fail-soft) | A truncated ACF no longer hangs the sidecar; parseAcfTree's tolerant partial parse is replaced by strict `parsed: false`, so a half-written manifest is skipped rather than half-read; a title whose only manifest is truncated reads as absent | accepted: yes (2026-11-14) |
| DV-75-03 | golden `acfUpdate/readAcfUpdateFieldsFromDir/duplicate-keys` (plan 21) | A reopened `AppState` block replaces the first, losing `StateFlags 4` (reports 0) | Duplicate blocks merge as Steam does: `StateFlags` 4 | Rust: Steam's KeyValues merges repeated blocks | An update-state read of a manifest with a reopened AppState block now sees installed (4) instead of 0 | accepted: yes (2026-11-14) |
| DV-75-04 | golden `adoption/readAppManifestFlags/coercion`, `installdir/readAcfInstalldir/coercion` | Numeric-looking strings coerced to numbers: buildid `0123` becomes `123`; installdir `1e3` is a number and rejected as non-string | The on-disk string is kept | Rust: it is what Steam wrote | buildid is only compared with `''` and `'0'`, so the adoption verdict is unchanged; a numeric installdir is now matched by the co-install guard (more conservative) | accepted: yes (2026-11-14) |
| DV-75-05 | golden `adoption/readAppManifestFlags/comments-unquoted`, `installdir/readAcfInstalldir/comments-unquoted` | Rejects `//` comments and unquoted keys/values (manifest looks absent) | Parses them as Valve's KeyValues reader does | Rust: Valve accepts them | Such a manifest now reads as installed instead of absent | accepted: yes (2026-11-14) |
| DV-75-06 | sweep class `case-insensitive-key` (not hit on this Mac's real files); golden `adoption/readAppManifestFlags/lowercase-keys`, `installdir/readAcfInstalldir/lowercase-keys`, `adoption/readMacRunningAppId/lowercase` | Exact-casing lookups: lowercase `appstate`/`stateflags`/`installdir`/registry keys read as missing (0 / null) | Case-insensitive key lookup | Rust: Steam's KeyValues lookups are case-insensitive | registry.vdf with lowercase key casing now yields the running app id instead of 0 (T-06-06 Pitfall 4 relaxed); lowercase-key manifests now read | accepted: yes (2026-11-14) |
| DV-75-07 | golden `installdir/readAcfInstalldir/escapes` | Returns the escape sequence verbatim (two backslashes) | Decodes the escape to one backslash | Rust: Steam decodes KeyValues escapes | `sanitizeInstalldir` still rejects separators, so no path-traversal change | accepted: yes (2026-11-14) |
| DV-75-08 | golden `library/getSteamLibraries/legacy` | Pre-2021 libraryfolders layout (index -> path string): reads `folder.path` off a string, returns no libraries | Reads the legacy layout | Rust: Steam still writes and reads it | A legacy libraryfolders.vdf now yields its libraries | accepted: yes (2026-11-14) |
| DV-75-09 | golden `library/getSteamLibraries/malformed`, `library/getSteamLibraries/no-file` | A malformed file throws out of `getSteamLibraries`; the no-file branch threw only because the logger had no writer outside the sidecar | Fails soft to the system path only (`parsed: false`); no-file logs and returns the system path | Rust: the documented T-2-01 never-throw posture | getSteamLibraries never throws on a bad libraryfolders.vdf; caller policy (system path first, `existsSync` filter) unchanged | accepted: yes (2026-11-14) |
| DV-75-10 | golden `shortcuts/edit-add/sparse-indexes`, `shortcuts/edit-remove-first/sparse-indexes` | `steam-shortcut-editor` pads a sparse shortcuts array (keys 0 and 2) with an empty-string placeholder at the missing index when it re-keys on write | The Rust editor keeps only real entries (add at max key + 1, remove re-keys contiguously) | Rust: no phantom empty entry is written into the user's shortcuts.vdf | A shortcuts.vdf with sparse indexes is rewritten without a placeholder entry; entries are identical by value | accepted: yes (2026-11-14) |
| DV-75-11 | golden `shortcuts/validity/unknown-type` | `steam-shortcut-editor` mis-reads an unknown value type and loses the `Exe` key (nests the rest under an empty key) | The Rust reader skips the unknown field and keeps `Exe`, so only `LaunchOptions` is reported missing | Rust: it keeps the readable fields | An entry with an unknown value type is still invalid, with one fewer spurious error; the title still matches | accepted: yes (2026-11-14) |
| DV-75-12 | golden `adoption/isSteamAdoptedAcf/null-baseline/truncated` (plan 22); code `isSteamAdoptedAcf` / `readAcfSnapshot` | `isSteamAdoptedAcf` parsed the snapshot `content` text (and hung on a truncated one) | The snapshot carries `stateFlags` / `buildid` parsed by Rust at snapshot time; an unreadable ACF records `stateFlags: null` and reads not-adopted | Rust: the conservative restart-on-Play verdict | Once plan 31 deletes `parseAppState`, a pending-adoption snapshot persisted before plan 22 (no `stateFlags`/`buildid`) reads not-adopted. Checked on this Mac: `steam_pending_adoption.json` holds no records, so no such snapshot exists here | accepted: yes (2026-11-14) |
| DV-75-13 | sweep class `integer-key-order` (real: 1 ACF, a bridge-bottle title with two installed depots) | `InstalledDepots` enumerated in ascending numeric depot-id order (JS integer-key ordering) | The file's own order | Rust: the file order is Steam's own; order carries no meaning | Consumers are order-insensitive (`depotRust/updateEstimate.ts` builds a Map; `depotRust/install.ts` fills a depotId to dlcAppId Map) | accepted: yes (2026-11-14) |
| DV-75-14 | plan 06 note (binary KV tag 0x0A, int64) | steam-shortcut-editor does not read tag 0x0A as Rust does | Rust codec reads/writes tag 0x0A | Unproven: the real shortcuts.vdf here has no 0x0A tag (only 0x00, 0x01, 0x02), so the round trip proves tags 0/1/2 only | None on this Mac's data; the 0x0A path rests on synthetic fixtures (assumption A1) | accepted: yes (2026-11-14) |
| DV-75-15 | plan 05 (D-14), verified by build/test only | Linux Steam root discovery as before | Candidate order Flatpak, `~/.steam/steam`, `~/.local/share/Steam`, Snap; first one with `steamapps/libraryfolders.vdf` wins; falls back to `~/.steam/steam`; macOS unchanged | By decision (D-14) | A Linux user whose Steam is at a candidate that previously lost now resolves to the first qualifying one | accepted: yes (2026-11-14) |
| DV-75-16 | D-13, verified by build/test only (no Windows host) | Windows Steam root as before | Reads `HKCU\Software\Valve\Steam\SteamPath` first, then `%PROGRAMFILES(X86)%\Steam`; a user-set `defaultSteamPath` always wins | By decision (D-13) | A Windows install with a non-default SteamPath is now found | accepted: yes (2026-11-14) |

Not divergences (the sweep and golden suite show equal): `readInstallScript` (6 real files equal), `readAcfBetaKey`, `readLocalConfigBetaKey`, `readAppManifestFlags`, `readAcfInstalldir`, `readAcfUpdateFieldsFromDir` on all 49 real ACFs, libraryfolders.vdf, registry.vdf, shortcuts.vdf byte round trip. The `bridge.json` override file records no divergences.

## Fixes made during the sweep

None to the Rust code. Two sweep-harness problems were fixed (not parity bugs): the backend logger had no writer outside the sidecar, so every Rust-branch wrapper silently took its catch path and reported a false mass diff; the sweep now initialises the logger under a throwaway HOME so the real app log is not written. The first complete run surfaced one real class not in the golden overrides, `integer-key-order` (DV-75-13).
