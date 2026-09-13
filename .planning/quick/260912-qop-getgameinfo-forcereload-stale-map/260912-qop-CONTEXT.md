# Quick Task 260912-qop: getGameInfo forceReload stale-map probe - Context

**Gathered:** 2026-09-13
**Status:** Ready for planning

<domain>
## Task Boundary

Write a desk-level (jest, no live app, no Epic login) probe that MEASURES the following claim,
which is currently only a static reading of the source:

> `LegendaryLibraryManager.getGameInfo(appName, forceReload = true)` does NOT re-read
> `installed.json`. It re-reads the *metadata* file and merges install fields from the
> module-scope `installedGames` map, which is rebuilt ONLY by `refreshInstalled()`. Therefore the
> `save_path` readback in `save_sync.ts` can return a STALE value even when `legendary` has just
> written a fresh `save_path` into `installed.json` on disk.

In scope: the probe (a test that turns RED against the described defect, or GREEN as a
characterisation test pinning current behaviour — see decision below).
OUT of scope: fixing `save_sync.ts`. Do not add a `refreshInstalled()` call. The fix is a separate
task gated on this probe's result.

</domain>

<decisions>
## Implementation Decisions

### Probe shape: characterisation, not a failing test
Write the probe as a PASSING characterisation test that pins the stale-read behaviour, with the
assertion phrased so the stale value is what is asserted, and a comment naming this as the defect.
Rationale: a red test in the suite blocks CI. A green characterisation test that *documents* the
staleness will flip to red the moment someone fixes `getGameInfo`/`save_sync`, which is the
signal we want. Name the test so the intent is unmissable.

### It must include the positive control
Asserting only "the value is stale" is satisfiable by a probe that never wired anything up at all
(the map could be empty for an unrelated reason, or `loadFile` could be bailing early on the
metadata fixture). The probe MUST also assert the CONTROL: after an explicit `refreshInstalled()`,
the SAME `getGameInfo(appName, true)` call returns the NEW `save_path`. Without that second
assertion the first proves nothing.

### Do not assert on the 500ms watcher timing
The watcher's debounce race is a live-timing property. It is not desk-provable and is explicitly
out of scope for this probe. The probe's job is the narrower, fully deterministic half: that
`forceReload` does not consult `installed.json`.

### Claude's Discretion
- Exact test file path and name (follow the conventions already in
  `src/backend/storeManagers/legendary/__tests__/`).
- Fixture construction strategy (real temp dir vs mocked `graceful-fs`).
- Whether to split into one or two `it()` blocks.

</decisions>

<specifics>
## Established Mechanism (verified by reading source at 5ded84fab — do not re-derive)

`src/backend/save_sync.ts`, `getDefaultLegendarySavePath()`:
- ~L66-85: runs `legendary sync-saves --skip-upload --skip-download --accept-path`, which is what
  writes `save_path` into `installed.json`.
- ~L87-105: IMMEDIATELY afterwards reads back
  `libraryManagerMap['legendary'].getGameInfo(appName, true)` and returns `save_path`, logging
  `Unable to compute default save path for <appName>` when it is falsy.
- There is NO `refreshInstalled()` between the subprocess and the readback.

`src/backend/storeManagers/legendary/library.ts`:
- L58: `let installedGames: Map<string, InstalledJsonMetadata> = new Map()` — module scope.
- L131 `refreshInstalled()`: the ONLY writer of `installedGames`. Reads
  `join(legendaryConfigPath, 'installed.json')`, `JSON.parse`, appends third-party games,
  `installedGames = new Map(installedCache)`.
- L203 `getGameInfo(appName, forceReload = false)`: if `!library.has(appName) || forceReload` →
  `this.loadFile(appName)`; returns `library.get(appName)`.
- L485 `private loadFile(app_name)`: calls `loadGameMetadata(app_name)` (reads
  `legendaryMetadata/<app_name>.json`), then takes install fields via
  `const info = installedGames.get(app_name)` — **the stale map**, not the file.
- `loadFile` early-returns `false` on: metadata parse failure, UE titles (`namespace === 'ue'` or
  a category in assets/asset-format/plugins/projects), a `mods` category, and titles whose
  `releaseInfo` is Android/iOS-only. The metadata fixture must avoid ALL of these or the probe
  will measure nothing. This is the most likely way to build a probe that silently passes for the
  wrong reason.
- `getGameInfo` returns `undefined` early unless `hasGame(appName)` is true — the fixture must
  satisfy that too.

Constants (`legendary/constants.ts`): `legendaryConfigPath` is the base;
`legendaryInstalled = join(legendaryConfigPath, 'installed.json')`,
`legendaryMetadata = join(legendaryConfigPath, 'metadata')`,
`legendaryUserInfo = join(legendaryConfigPath, 'user.json')`.

## Real-world anchor (optional, for fixture realism only)

The live title this defect was filed against is Epic appName `Iris` (Phoenix Point), platform
`Mac`. Do NOT read the operator's real `~/Library/Application Support/GameLib/legendaryConfig`
from the test — the probe must be hermetic.

</specifics>

<canonical_refs>
## Canonical References

- `.planning/todos/pending/2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title.md`
  — the todo this probe serves. Its discharge condition is a LIVE gate; this probe is the
  desk-provable half, and does NOT discharge it.
- `src/backend/sidecar/installedJsonWatcher.ts` — the ported watcher whose 500ms debounce is the
  reason the todo assumed the first-call symptom was fixed.

## Known jest gotchas in this repo (from prior sessions)

- `resetMocks` in the backend jest project strips factory implementations — re-establish impls in
  `beforeEach` if you rely on them.
- `jest.mock('os')` declared per-suite is inert in this project.
- `process.env` is sandboxed per test FILE.
- Run the suite with the backend project selected; `--selectProjects` is case-sensitive and exits
  0 when it matches nothing, so pair it with `--passWithNoTests` deliberately or verify the test
  count moved.

</canonical_refs>
