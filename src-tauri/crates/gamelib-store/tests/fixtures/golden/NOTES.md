# Store golden (Phase 85, FND-06)

The byte-exact "before" of the Rust store: what the real TS store stack (`store_backend.ts` over conf 10.2.0,
the Phase 68 versioning engine, `storeMigrations`) writes for each case in `cases.json`. Decision D-05 makes the Rust
store's writes byte-identical to these. The Rust replay lands in plans 85-06..85-08.

## Regenerate

```
GAMELIB_WRITE_STORE_GOLDEN=1 pnpm exec jest --runTestsByPath src/backend/stores/__tests__/storeOracle.test.ts
```

Without the variable the same suite is a compare: it regenerates every case in memory and asserts the produced file set,
each file's bytes, and `outcomes.json` equal what is committed. `cases.json` is the one hand-authored input and is never
rewritten by the oracle. Nothing under `expected/` or `outcomes.json` is ever typed by hand. The oracle owns this tree
until plan 85-21 deletes it; the fixtures stay.

Every recorded path is relative to the case's userData. A temp root that leaked into a string would be replaced by the
token `${USERDATA}`, and the compare asserts no temp root appears anywhere in `outcomes.json` or `expected/`.

## Layout

- `cases.json`: the inputs (see below).
- `outcomes.json`: per case `{ id, constructThrew, reads, threw, readOnly, backups, files }`, plus `rounds` for a
  multi-round case. `reads` are the results of `get` / `has` / `dump` ops, `threw` the ops that raised (error name only),
  `readOnly` the engine's read-only reason for the main store file (`newer` or `failed`) or null.
- `expected/<id>/<relative path>`: every file the case left under userData, backups included.
- `inputs/<id>.json`: the bytes a `migrate` case starts from. Copied from the committed migration fixtures in write mode
  and read from here in compare mode, so the golden never depends on `src/backend/storeMigrations/__tests__/fixtures`
  (plan 85-24 deletes that directory).

## Case kinds

- `ops`: construct the declared store(s) over optional `initial` file text, then run the ops in order. A declaration is
  `{ dir, name, kind, tokenBearing?, failedView?, clearInvalidConfig?, accessPropertiesByDotNotation? }` and the store
  file is `<userData>/<dir>/<name>.json`. `second` is a second declaration (it may name the same file: two declarations,
  one file). Ops: `set`, `delete`, `clear`, `assign` (the whole-object replace `x.store = obj`), `get`, `has`, `dump`
  (`x.store`). `accessPropertiesByDotNotation` is only passed when the case sets it.
- `engine`: an `ops` case that also states `expectPath`, the path the versioning engine takes at construction:
  `identity` (unstamped baseline v1 adoption: nothing written), `current` (stamped at the current version: untouched),
  `newer` (read-only, bytes never rewritten), `migrates` (backup then rewrite), `failed` (a step raised: backup, then
  read-only), `cacheChainDeletes` (a cache with a non-identity pending chain loses its file), `corrupt`. The oracle fails
  if the TS engine takes another path, so the label is checked.
- `migrate`: copy `inputs/<id>.json` to `file`, then open the store (`flavour: conf`) or call
  `ensureSettingsMigrated` (`flavour: settings`) through the real chain `chain`. With `rounds`, each round builds a fresh
  root (a new boot) over what the previous round left; `reseed: newestBackup` first replaces the store file with the
  bytes of its newest backup (the newest-equal skip).
- `settingsDoc`: `writeSettingsFile` of `data` for the global document (`config.json`) or a game document
  (`GamesConfig/<appName>.json`), after an optional `initial` and, with `ensure`, `ensureSettingsMigrated`.

`steps` (on `ops`/`engine`/`migrate`, or per round) replaces the chain of the store's chain key. A step is
`{ id, to, identity?, setTop?, deleteTop?, throws? }`: it sets and deletes top-level keys, so the override chains need no
code. Without `steps` the real `STORE_MIGRATIONS` apply.

## The two on-disk flavours and their byte rules (D-05)

- conf stores (`store/`, `store_cache/`, `gog_store/`, `steam_store/`, ...): `JSON.stringify(value, undefined, '\t')`,
  a tab per level, **no trailing newline**, with the `__internal__.gamelib.schemaVersion` envelope. The stamp keeps its
  position when `__internal__` is already present and is appended last otherwise; other keys inside `gamelib` survive.
  The `gamelib-core` `store.rs` header ("2-space pretty JSON") is wrong for conf stores: it describes the settings
  documents. Conf stores are tab-indented.
- settings documents (`config.json`, `GamesConfig/<app>.json`): `JSON.stringify(data, null, 2)`, 2 spaces, **no
  trailing newline**, with a top-level `version: 'vN'` string and no `__internal__`.
- A migration rewrite always goes through the engine, which writes `JSON.stringify(..., undefined, '\t')` for both
  flavours. So a settings document that has just been migrated is **tab-indented** until the next `writeSettingsFile`
  rewrites it with 2 spaces (see `expected/migrate-settings-global-v0/config.json`). This is what TS does today and is
  recorded as such.
- Bottle markers and other compact files are not covered by this golden.
- Integer-like keys come first in ascending order at every depth, then the other keys in insertion order (JS object key
  order); numbers print as JS prints them. The shared vectors in `../vectors` pin both.

## Fake clock and backups

The oracle fakes only `Date`: 2026-11-21 09:00:00 UTC, advanced per round. A backup is
`<name>.v<from>.<UTC stamp>.bak.json` with the stamp `YYYYMMDDTHHMMSSmmmZ` (`20261121T090000000Z`), holds the bytes of
the file as it was before the migration (so it keeps its original layout), is skipped when those bytes equal the newest
existing backup, and at most 3 are kept (oldest pruned). See `migrate-sequence-backups-max3-newest-equal`.

## Not in the golden

File modes. The oracle does not stat files, so the 0600 files / 0700 directories (D-13) are pinned by a Rust unit test.

## Deliberate Rust divergences

Cases marked `oracle: "tsOnly"` record a TS outcome the Rust store does not reproduce; each carries a
`divergenceNote`. The Rust side pins its own behaviour with its own tests.

- Corrupt files (D-18): `engine-corrupt-not-json`, `-array`, `-empty`, `-bom`. TS resets the file when
  `clearInvalidConfig` is set (the first write replaces it; `[1]` is read as `{"0": 1}`; an empty file or a BOM is a
  syntax error). Rust keeps the bytes, copies them aside and opens read-only (user-state) or starts empty (cache).
- A cache never resets silently in Rust.
- A JS-only parse: a lone surrogate escape is accepted by `JSON.parse` and rejected by serde_json; Rust keeps such a
  file read-only (numbers vector `lone-surrogate`, `rustParse: "reject"`).
