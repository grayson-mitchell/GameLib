# Store corpus (Phase 85, FND-06, decision D-09)

Real store files, redacted and pinned by hash, that the Rust roundtrip and migration tests (plans 85-07 and 85-08) run
over. Only a byte diff over real files exposes the divergences a synthetic fixture hides (sorted nested keys, `.0` floats,
integer-key order). `MANIFEST.json` lists every file; `meta/__tests__/storeCorpus.test.ts` fails when the tree and the
manifest disagree, so a Rust test can read the manifest and trust that what it names exists.

## Sources

| source     | directory     | what it is                                                                                                    |
| ---------- | ------------- | ------------------------------------------------------------------------------------------------------------- |
| `operator` | `operator/`   | the operator's live profile, redacted and re-serialised in the byte flavour TS writes                         |
| `backup`   | `backups/`    | the profile's real pre-migration captures (`<name>.v<from>.<stamp>.bak.json`, plus a hand `config.v1.from-phase68.*`) |
| `v0.8`, `v0.9`, `v0.10` | `v0.8/` ... | the files each tagged release writes on a cold boot in a fake HOME, as raw bytes                    |
| `edge`     | `edge/`       | hand-built edge cases (see the edge table below)                                                              |

Every path in the manifest is relative to this directory and starts with its source's directory.

## Regenerate

Run from the repo root. `<profile>` is the operator's user-data directory
(macOS: `$HOME/Library/Application Support/gamelib`).

```
node meta/runTs.cjs --bundle --platform=node --target=node22 meta/harvestStoreCorpus.ts operator <profile>
node meta/runTs.cjs --bundle --platform=node --target=node22 meta/harvestStoreCorpus.ts backups <profile>
node meta/runTs.cjs --bundle --platform=node --target=node22 meta/harvestStoreCorpus.ts tag v0.10 [--scratch <dir>]
node meta/runTs.cjs --bundle --platform=node --target=node22 meta/harvestStoreCorpus.ts edge
```

- `operator --only <relpath>` (repeatable) re-harvests just those files.
- A re-run of a subcommand replaces that source's manifest entries and deletes its files that are no longer produced.
- `operator` and `backups` only read the profile: they never write to it and never spawn a process (the one named
  real-profile arm; D-09 requires the live profile).
- `tag` does `git worktree add --detach <scratch>/.../gamelib-<tag> <tag>`, `pnpm install --frozen-lockfile` and
  `pnpm build:sidecar` inside it, boots `build/main/sidecar.js` with a fresh `createFakeHomeProfile()` (the eight home
  variables plus PATH only), waits for the ready sentinel and `store/config.json` (30 s), closes stdin, waits 15 s for the
  sidecar to leave by event-loop drain, then kills its process group. Every child (git, pnpm, the sidecar) runs under a
  fresh fake HOME that is disposed afterwards, and the worktree is removed in a `finally`.
- The `tag` install borrows the operator's pnpm content-addressable store (`npm_config_store_dir`) so nothing is downloaded
  twice, sets `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` (the fake HOME has no corepack cache) and `CI=true` (pnpm will not remove a
  `node_modules` it did not create without a TTY). Nothing new enters this repo's lockfile.

The three tagged releases all built and booted on 2026-11-22; `failures` in `MANIFEST.json` is therefore absent. When a tag
cannot build, the harvester records the exact error under `failures.<tag>` in the manifest, contributes no files for it and
continues with the others.

## Flavour (D-05)

- `store`: conf stores (`store/`, `store_cache/`, `gog_store/`, `steam_store/`, `humble_store/`, `nile_store/`,
  `legendary_store/`, `sideload_apps/`). `JSON.stringify(value, undefined, '\t')`, tab per level, no trailing newline,
  `__internal__.gamelib.schemaVersion` envelope.
- `settings`: the root `config.json` and `GamesConfig/<app>.json`. `JSON.stringify(value, null, 2)`, 2 spaces, no trailing
  newline, top-level `version: 'vN'` string.

The `operator` and `backup` files are re-serialised to the flavour by the harvester, and the test asserts that
`serialise(JSON.parse(file), flavour)` equals the committed bytes, so the redacted bytes are exactly what TS would write for
that content. `tag` files are raw bytes as that release wrote them (they are not held to the current flavour; that is the
point of having them), and `edge` files are hand-built.

## `expect`: the outcome the Rust engine must produce

| value             | meaning                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `roundtrip`       | open and write back with no change in content; on a no-op boot nothing is rewritten                                             |
| `migrate`         | the stored version is below the chain's current version, so the engine backs up and migrates (a cache with a non-identity pending chain loses its file instead) |
| `readOnly-failed` | the file cannot be read as a store (corrupt, wrong root type, empty, BOM, lone surrogate): keep the bytes, copy aside, open read-only |
| `readOnly-newer`  | stamped with a version above the chain's current one: open read-only, never rewrite                                             |
| `startEmpty`      | a cache that cannot be read: after its copy exists, continue empty (D-18)                                                       |
| `missing`         | a manifest-only entry: there is no file, the store starts empty                                                                 |

For `operator`, `tag` and `backup` files `expect` is derived, not assumed: from the stored version (`__internal__.gamelib.schemaVersion`
for stores, the `version` string for settings documents; for a backup, the `<from>` in its file name) against the chain's
current version. An unstamped file at baseline 1 is adopted in place with nothing written, so it is `roundtrip`. The chain
table (`CHAIN_CURRENT` in the harvester) is checked against the TS migration registry by the test. `tableKey` names the
store whose rules apply: `<dir>/<name>`, or `settings/global` and `settings/game`.

A settings document in the operator profile with no `version` key (a `GamesConfig/<app>.json` no boot has touched since
Phase 68) is `migrate`: that is the real state of the profile, not a harvest error.

## Redaction

Key names are kept (including keys no schema declares). Values are changed only as follows; the test scans every committed
value independently of the harvester.

| what                                                                                                                  | becomes                                                |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| value under a denylisted key (token, tokens, accessToken, access_token, refresh_token, refreshToken, password, cookie, cookies, session, session_id, csrf, username, accountName, account_name, email, steamId, steamid, userId, user_id, galaxyUserId, displayName, avatar, cmLogonId, any `api_key`/`apiKey`, `secret`, `password`, `credential`) | the same JSON type: string `"REDACTED"` (an empty string stays `""`), number `0`, boolean `false`, array `[]`, object with every nested leaf redacted |
| string starting `steam:v1:` or `humble:v1:` (ciphertext), a JWT (`eyJ...`), a SteamID64 (`7656119` + 10 digits), an email | `"REDACTED"`                                           |
| the OS account name inside any string or key name                                                                     | `operator` (so `/Users/<name>/Games` becomes `/Users/operator/Games`) |
| a Humble order gamekey leading a key, `<16 alphanumerics>:<product>` (it grants access to the order)                    | `GKREDACTED<6 digits>:<product>`, stable across files in one run |

`steamid` is denylisted although some caches use it for a plain app id: over-redacting an app id costs a roundtrip test
nothing, under-redacting a SteamID64 leaks an account.

The test fails on a JWT, ciphertext, a SteamID64, an email, a bearer token or cookie, a 40+ char hex run, a 40+ char base64-looking
run that reads as random (mixed case and digits, entropy of 4.4 bits per char or more, few vowels, not a path), a
denylisted key that does not hold its placeholder, a Humble gamekey in a key name, and the harvesting machine's OS account name,
with an allow-list of hash-bearing keys (`sha`, `sha256`, `hash`, `checksum`, `buildId`, `md5`, `etag`, `external_id`). It carries
self-tests that fail when the JWT and ciphertext patterns are removed.

## Excluded

Files GameLib does not own are never copied:

- `gog_store/auth.json`: written by gogdl, and it holds the real GOG session tokens
- `nile_config/**`: nile's own configuration
- `legendaryConfig/**`: legendary's own configuration

Also skipped: every non-JSON file (logs, sockets, icons), the `steam-api/`, `steam-bridge/`, `tools/`, `fixes/`, `overlays/`
and `icons/` trees, and `areweanticheatyet.json` (a public download, not a store).

## Edge cases (`edge/`)

Hand-built by `edge`; the bytes are written exactly as listed, never re-serialised or redacted. `tableKey` is the store
whose rules apply (`store/timestamp` for user state, `store_cache/wikigameinfo` for a cache, `settings/global` for a settings
document).

| file                                    | bytes                                                         | expect            | why                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------- |
| `store_cache/edge_unknown_keys.json`    | a current-version store with two keys no schema declares, nested at depth 2 | `roundtrip` | unknown keys must survive untouched                                                                      |
| `store/edge_corrupt.json`               | `{not json`                                                   | `readOnly-failed` | user state that does not parse: keep the bytes, copy aside, open read-only (D-18)                       |
| `store_cache/edge_corrupt_cache.json`   | `{not json`                                                   | `startEmpty`      | a cache that does not parse: continue empty after its copy exists (D-18)                                |
| `store/edge_array_root.json`            | `[1]`                                                         | `readOnly-failed` | valid JSON, wrong root type                                                                              |
| `store/edge_empty.json`                 | zero bytes                                                    | `readOnly-failed` | an empty file is not an empty object                                                                     |
| `store/edge_bom.json`                   | UTF-8 BOM, then a valid object                                | `readOnly-failed` | serde_json rejects a BOM where TS conf resets the store (a deliberate divergence)                        |
| `store/edge_crlf.json`                  | valid JSON, CRLF line breaks                                  | `roundtrip`       | semantic roundtrip: Rust rewrites with LF only on the next real write, never on a no-op boot           |
| `store/edge_newer.json`                 | `schemaVersion` 99                                            | `readOnly-newer`  | newer than any chain: open read-only, bytes never rewritten                                              |
| `store/edge_lone_surrogate.json`        | a string holding the escape `\ud800`                          | `readOnly-failed` | JS accepts a lone surrogate escape, serde_json rejects it (the golden's `rustParse: reject` vector)      |
| `settings/edge_newer_global.json`       | a settings document with `version: "v9"`                      | `readOnly-newer`  | newer than the global settings chain (v2)                                                                |
| `store/edge_missing.json`               | no file (manifest-only entry, `sha256: null`)                 | `missing`         | the store starts empty                                                                                   |

The divergences in the `readOnly-failed`, `startEmpty` and `readOnly-newer` rows are the D-18 wording in
`../golden/NOTES.md`: where TS conf resets or discards a store it cannot read, Rust deliberately keeps the bytes.
