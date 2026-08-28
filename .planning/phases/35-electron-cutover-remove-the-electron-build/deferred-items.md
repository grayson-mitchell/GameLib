# Phase 35 — deferred items

Out-of-scope discoveries made during plan execution. Logged, deliberately NOT fixed.

## D-35-03-01 — `meta/i18nForkTouchedFiles.json` is stale against its live git derivation

**Found during:** plan 35-03, regression sweep of the `Meta` jest project.

**Symptom:** `meta/__tests__/genI18nGateScope.test.ts` fails one assertion —
`A-17 ANTI-ROT: the committed meta/i18nForkTouchedFiles.json equals the LIVE git derivation`.
The committed artifact lists three files the live diff against the upstream merge-base no
longer surfaces:

- `src/frontend/components/UI/PathSelectionBox/index.tsx`
- `src/frontend/screens/Library/components/CategoriesManager/index.tsx`
- `src/frontend/screens/Library/components/InstallModal/defaultPlatform.ts`

**Not caused by plan 35-03.** Plan 35-03 touched `vite.config.ts`,
`meta/__tests__/viteRendererConfig.test.ts`, `package.json`, `src-tauri/tauri.conf.json`,
`.github/workflows/release-tauri.yml` and `src/backend/__tests__/releaseWorkflow.test.ts`.
None is a `src/frontend/**` file, and none appears in the failing diff. Verified by grepping
the failure's own diff output for this plan's file names — zero matches.

**Scope note:** the sibling assertions in the same suite pass, including
`A-17 ANTI-ROT non-vacuity: the anti-rot check DOES fail against a mutated copy` — so the
guard is working correctly and is reporting a real staleness, not misfiring.

**Fix when someone owns it:** re-run `pnpm gen-i18n-gate-scope` and commit the regenerated
artifact. Note MEMORY's `regenerating-an-artifact-breaks-the-pins-that-guard-it` before doing
so — regenerating this file has broken its own pins before.

**Status:** open, unowned. Consistent with MEMORY's standing note that the repo's i18n gate is
red repo-wide (`prettier-gate-is-red-repo-wide.md`).

## D-35-03-02 — BLOCKING INPUT FOR PLAN 35-14: `vite` is not a direct dependency

**Found during:** plan 35-03. **This is not a deferred nicety — 35-14 breaks without it.**

Measured at commit `369051ebf`:

```
dependencies:    (no vite package of any kind)
devDependencies: @vitejs/plugin-react-swc, electron-vite, vite-plugin-svgr
```

`vite` itself (6.3.5) resolves only as a **hoisted peer of `electron-vite`**. Plan 35-03's hard
stop therefore did not trigger and nothing was installed — correct behaviour, and the new
`vite.config.ts` works today for exactly that reason.

**Plan 35-14 removes `electron-vite` from `package.json`. That removes the only thing pulling
`vite` in.** After the next `pnpm install`, `pnpm exec vite build` has nothing to resolve — and
that command is 35-14's own `<automated>` verification step, so the plan's proof that "the Tauri
path still works" is the thing that breaks first.

**Required in 35-14:** promote `vite` to a direct `devDependency` in the same commit that removes
`electron-vite`, through the Package Legitimacy Audit protocol in `35-RESEARCH.md`
(`vite` is a new *direct* entry even though it is already installed transitively).
`@vitejs/plugin-react-swc` and `vite-plugin-svgr` are ALREADY direct devDeps and need no action.

**Why this is written down twice** (here and in `35-03-SUMMARY.md`): `35-RESEARCH.md`'s threat
register `T-35-SC` asserts `vite` is already a direct dependency. It is not. A false premise in the
threat register is exactly the shape that survives review, because the plan that would catch it
(35-03) correctly found nothing to install, and the plan that pays for it (35-14) has no reason to
re-derive a fact its own research already states. Neither plan is wrong on its own.

## D-35-03-03 — `tauri dev` does not reap its `beforeDevCommand` Vite server; `strictPort` turns that into a hard failure

**Found during:** plan 35-06 Task 3 live gate, 2026-08-28. Caused by plan 35-03's changes.

**Symptom:** after killing a `tauri:dev` session, the next `pnpm tauri:dev` dies before the
window appears:

```
error when starting dev server:
Error: Port 5173 is already in use
   Error The "beforeDevCommand" terminated with a non-zero status code.
```

**Mechanism.** Plan 35-03 added `beforeDevCommand: pnpm exec vite` and `devUrl:
http://localhost:5173` to `tauri.conf.json`, plus `server: { port: 5173, strictPort: true }` to
`vite.config.ts`. Killing `tauri dev`, `gamelib-shell` and `sidecar.js` leaves the Vite server
**orphaned and still holding 5173** — measured here as pids 27338/27339 (`pnpm exec vite` ->
`./node_modules/.bin/vite`), survivors of a boot 30+ minutes earlier. `strictPort: true` then
correctly refuses to fall through to 5174 and the run aborts.

**`strictPort` is NOT the defect and must not be removed.** It was added deliberately so a
collision fails loudly rather than silently serving the renderer on a port `devUrl` is not
pointing at — a silent 5174 fallback would produce a blank window with no stated cause, which is
strictly worse. The defect is the unreaped child.

**Workaround, which anyone hitting this needs:**

```
lsof -nP -iTCP:5173 -sTCP:LISTEN     # find it
kill <pid>
```

A `pkill -f "tauri dev"; pkill -f gamelib-shell; pkill -f sidecar.js` sequence does **not** cover
it — `vite` matches none of those patterns. This is worth folding into whatever kill helper the
project ends up with, and is a live papercut for anyone driving a live gate.

**Related:** MEMORY's `tauri-dev-noops-against-a-running-instance` — the same family. That one is
"a stale instance survives and you silently test it"; this one is "a stale child survives and
blocks the new run". The second is far better behaviour, because it is visible.

## D-35-06-01 — the tray offers recent games from signed-out stores and from bottled installs, and every failure is SILENT

**Found during:** plan 35-06 Task 3 live gate, 2026-08-28. Operator-observed, then diagnosed
from `~/Library/Logs/GameLib/gamelib.log` and live process state.

**Not a plan 35-06 defect.** The tray resolved the runner and dispatched the launch correctly in
every case measured. Both findings are about what the recent-games list CONTAINS and what the
user is told when a dispatched launch goes nowhere. Recorded here rather than fixed inside a
plan whose scope is the tray surface itself.

### Finding 1 — no auth or availability filter on the recent list

`Phoenix Point` (`appName: Iris`, legendary) renders in the tray while Epic is signed out — the
operator signed out during plan 35-02's item 7 test and the entry survived. `getRecentGames`
reads `games.recent` straight from `configStore` and filters on nothing but `appName` presence.
A `RecentGame` records that a game was once launched, never that it can be launched now.

The correct behaviour is a judgement call and deliberately not made here: filter unavailable
entries out, or render them disabled, or render them and fail loudly. What is NOT defensible is
the current combination of rendering them enabled and failing silently — see Finding 2.

### Finding 2 — a dispatched-but-doomed launch produces NO user-visible signal

Three distinct failure causes were hit in one session and **all three were indistinguishable
from a dead menu item**:

1. **Signed-out store** — Epic logged out (`Iris`).
2. **Bottled Steam not signed in** — `All Will Fall` (`2706020`) IS fully installed
   (`StateFlags 4`, 4.2 GB, in the CrossOver bottle's own `steamapps`, not the macOS Steam
   library) and had run the day before. The launch dispatched correctly:
   `Running Wine command: .../GameLibSteam/.../steam.exe -applaunch 2706020`. But the bottled
   client is logged out — `steamwebhelper.exe ... -steamid=0` — so `-applaunch` lands on a login
   prompt, and per `crossover-renders-steam-dialogs-offscreen` that prompt is INVISIBLE.
   `raiseFrontmostBottledProcess` then waited ~18s for a game process four separate times.
3. **Native vs bottled divergence** — `Pillars of Eternity` (`291650`) launched fine via
   `steam://rungameid/291650`. The operator's own summary — *"native games launch, bottles
   don't"* — was exactly right, and the two paths share nothing downstream of the tray.

`dispatch_tray_launch` logs each outcome to stderr and surfaces nothing, which its own doc
comment states as intentional: *"the tray has nothing to show the user either way."* That is
true of the Rust tray in isolation and false of the product — the app has a toast/dialog surface
and the tray can reach the renderer, as the About item proves.

**Cost of leaving it:** this consumed a large part of the 35-06 live gate. Three benign,
correctly-behaving refusals were investigated as suspected tray defects, and two wrong
conclusions were drawn and retracted along the way (an "uninstalled" call made against the wrong
Steam library, and a "stale binary" call made from a `strings` pattern that could not match a
Rust symbol). A silent failure does not just cost the user — it costs whoever diagnoses it.

**Fix when someone owns it:** surface the outcome. `dispatch_tray_launch`'s `err=` arm and the
"could not resolve a runner" arm both have a caller-visible failure to report. The bottled-Steam
logged-out case additionally deserves its own message, since the underlying prompt is
unreachable by design on this platform.

**Status:** open, unowned. Neither blocks D-16.
