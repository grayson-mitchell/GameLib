---
phase: 35-electron-cutover-remove-the-electron-build
plan: 12
subsystem: build-release
tags: [d-11, flatpak, flathub, packaging, artifact-targets, appimage, req-35-12, t-35-50, t-35-51, t-35-52, t-35-53, t-35-sc]
status: COMPLETE — autonomous, no checkpoints, 2026-08-29

# Dependency graph
requires: [35-01]
provides:
  - "The Flatpak/Flathub publishing path deleted outright — 10 files, 5 package.json scripts, 2 whole CI workflows, and 4 dangling config references"
  - "meta/__tests__/artifactTargets.test.ts — an 8-assertion pin on bundle.targets, mutation-proven red in 4 directions including the over-reach direction"
  - "A measured residual-reference census separating the Flatpak PUBLISHING path (now 1 hit) from Flatpak RUNTIME host detection (~119 hits, correct and out of scope)"
  - "D-35-12-01 — the com.heroicgameslauncher.hgl identity survives D-11 in a Steam shortcut, which this plan's own T-35-52 mitigation text did not consider"
affects: [35-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Delete scripts in the same commit as the directories they invoke — a script pointing at a missing path reports a shell error at the worst possible moment, and `dist:flatpak` chained into two of the others"
    - "When two concerns share a token, make the gate's matcher narrower than the token and SAY SO in the file — `flatpak` means both 'publish a Flatpak' and 'we are running inside a Flatpak', and only the first is D-11's"
    - "Mutation-prove an absence assertion in both the under-reach and over-reach directions; the over-reach control is the one a normal sweep never writes"
    - "Restore a mutated file with `cp` + `shasum -a 256` against a pristine copy taken before the mutation — never `git checkout -- <path>`, which fires .husky/post-checkout"
    - "Derive which jest projects to run from which tests READ the changed artifact (`grep -rln 'package.json' --include='*.test.ts'`), not from where the artifact lives — package.json belongs to no project yet three projects read it"

key-files:
  created:
    - meta/__tests__/artifactTargets.test.ts
  modified:
    - package.json
    - tsconfig.eslint.json
    - .prettierignore
    - .gitignore
    - README.md
    - .planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md
  deleted:
    - flatpak/com.heroicgameslauncher.hgl.desktop
    - flatpak/com.heroicgameslauncher.hgl.png
    - flatpak/flathub.json
    - flatpak/patches/0001-timidity-fix-missing-includes.patch
    - flatpak/prepareFlatpak.js
    - flatpak/templates/com.heroicgameslauncher.hgl.metainfo.xml.template
    - flatpak/templates/com.heroicgameslauncher.hgl.yml.template
    - flathub/update-flathub.ts
    - .github/workflows/flatpak-build.yml
    - .github/workflows/release_flathub.yml

key-decisions:
  - "THE PLAN'S SCRIPT LIST IS WRONG AND PREFLIGHT IS RIGHT: 5 scripts, not 4. The real key is `flatpak:build`, not `flatpak-build` (the plan's own `<verify>` block probes a key that never existed, so it would have passed vacuously), and `dist:flatpak` is absent from the plan's partial list entirely."
  - "`dist:flatpak` was the ONLY chainer (`pnpm dist:linux appimage && pnpm flatpak:prepare && pnpm flatpak:build`) and is itself deleted, so no broken chain survives. Nothing else in the 53-script block referenced either directory."
  - "BOTH workflows are deleted whole, not step-trimmed: each exists solely for this path. `release_flathub.yml` was live-armed — it triggers on `release: [published]` and would have cloned, branched, committed to and opened a PR against `flathub/com.heroicgameslauncher.hgl` on GameLib's first real release, under a hardcoded upstream-maintainer git identity."
  - "THE PLAN'S ACCEPTANCE CRITERION 'grep returns nothing outside CHANGELOG' IS UNMEETABLE AND WAS NOT MET. It was written from the plan-time partial finding and never anticipated that `flatpak` names a second, unrelated concern: RUNTIME host detection. ~119 hits legitimately survive. There is no CHANGELOG.md in this repo at all, so the escape hatch the criterion offered does not exist either."
  - "The pin test therefore matches a NARROW publishing-path pattern, not /flatpak/. A test asserting the plan's literal criterion would be red at HEAD and would pressure a future reader into deleting live Steam-detection and Gamescope behaviour to make it green."
  - "MUTATION 4 CAUGHT THE NEW GATE FAILING OPEN. The workflow assertion stayed GREEN against a planted `release:updateFlathub:ci` line because the matcher was case-sensitive and the real names spell it `Flathub` with a capital F. Fixed with /i and re-proven red. Three of the four mutations the plan asked for would have passed without exposing this."
  - "src-tauri/tauri.conf.json is byte-identical to HEAD across both commits (sha256 f903707...be3f71 verified after every mutation). Plans 35-04 and 35-07 own it."
  - "The dependency-trap check the orchestrator asked for was run and came back CLEAN: `fast-xml-parser`, imported by the deleted `flathub/update-flathub.ts`, retains two live consumers in `meta/` (buildCrossoverIndex.ts, measureCrossoverMatching.ts), so no devDependency is orphaned by this deletion."
  - "Per the orchestrator's standing instruction, STATE.md and ROADMAP.md were NOT touched and no gsd-sdk state.*/roadmap.*/phase.complete verb was invoked."
---

# Phase 35 Plan 12: Delete the Flatpak/Flathub publishing path Summary

Deleted the Flatpak/Flathub publishing channel outright — 10 files, 5 scripts, 2 whole CI
workflows, 4 dangling config references — and pinned `bundle.targets` behind an 8-assertion gate
that was proven red in four directions, one of which exposed the gate itself failing open.

**Nothing about what GameLib ships changed.** `src-tauri/tauri.conf.json`'s `bundle.targets` was
already exactly `["nsis","appimage","dmg"]` and is byte-identical to HEAD.

## What this plan did

| Item | Count | Detail |
|---|---|---|
| Files deleted | 10 | 7 under `flatpak/`, `flathub/update-flathub.ts`, 2 workflows |
| `package.json` scripts deleted | 5 | not the 4 the plan named — see below |
| Dangling config refs removed | 4 | `tsconfig.eslint.json`, `.prettierignore` ×2, `.gitignore` |
| Doc edits | 1 | `README.md` install prose |
| Tests added | 8 assertions | `meta/__tests__/artifactTargets.test.ts` |
| Mutations run | 4 | all confirmed red; #4 found a fail-open |

## The plan's script list was wrong; PREFLIGHT's was right

The plan's `<interfaces>` block names four scripts. `35-PREFLIGHT.md`'s `CENSUS-FLATPAK` — which
the plan itself designates authoritative and warns "the list below is the plan-time partial and may
be incomplete" — names **five**, and it is correct:

```
"release:updateFlathub:ci": "tsc flathub/update-flathub.ts ... && node flathub/update-flathub.js"
"dist:flatpak":            "pnpm dist:linux appimage && pnpm flatpak:prepare && pnpm flatpak:build"
"flatpak:build":           "cd flatpak-build && flatpak-builder build com.heroicgameslauncher.hgl.yml --install --force-clean --user"
"flatpak:prepare":         "node ./flatpak/prepareFlatpak.js"
"flatpak:prepare-release": "node ./flatpak/prepareFlatpak.js release"
```

Two corrections carried forward:

1. **The real key is `flatpak:build`, not `flatpak-build`.** The plan's own
   `<verify><automated>` block probes `s['flatpak-build']` — a key that has never existed in this
   repo. Run as written it would have reported PASS while `flatpak:build` sat untouched. The
   verification was re-run with the real names (both spellings, plus `dist:flatpak`).
2. **`dist:flatpak` is missing from the plan entirely**, and it is the one that matters for the
   chain question the plan asked me to check: it is the **only** script that chained into the
   others. Because it is itself deleted, no broken chain survives. No other script in the 53-entry
   block referenced either directory (verified by regex over every script *value*, not just keys).

`release:linux`, `release:mac`, `release:win`, `dist:linux`, `dist:mac`, `dist:win` and every other
`electron-builder` script survive untouched — plan 35-14 owns those.

## Both workflows were deleted whole, and one was live-armed

Neither workflow is a mixed file needing step-surgery; each exists solely for this path.

- **`.github/workflows/flatpak-build.yml`** — a `Flatpak-CI` job running on every push and PR to
  `main`, in a privileged `flathub-infra` container, calling the now-deleted `pnpm flatpak:prepare`
  and building `flatpak-build/com.heroicgameslauncher.hgl.yml`. This is the T-35-50 shape: a CI
  step that would have failed the run the moment the script vanished.

- **`.github/workflows/release_flathub.yml`** — worth stating plainly because it was more than dead
  weight. It triggers on `release: types: [published]`. On GameLib's **first real release** it would
  have cloned `https://github.com/flathub/com.heroicgameslauncher.hgl.git`, run
  `pnpm release:updateFlathub:ci`, committed under a hardcoded upstream-maintainer identity
  (`26871415+flavioislima@users.noreply.github.com`, "Flavio F Lima"), force-pushed a branch to
  `flathub/com.heroicgameslauncher.hgl`, and opened a PR against Heroic's Flathub repository.
  D-00e records that GameLib has published no releases of its own, which is the only reason this
  never fired.

Cross-checked before deleting: no other workflow, no composite action under `.github/actions/`, and
no test names either file. `buildRunnersOnedir.test.ts` does `readdirSync` over a *legendary
fixture* directory, not `.github/workflows`, so nothing is count-sensitive. All **16** surviving
workflows still parse as YAML.

## The residual-reference sweep — the number, not an assertion of zero

The orchestrator asked for the grep output either way rather than a bare claim of zero. Here it is.

### Before deletion

`grep -rn "flatpak\|flathub\|hgl\."` excluding `node_modules`, `.git`, `graphify-out`, `.planning`
returned hits in: `pnpm-lock.yaml` (4), `.prettierignore` (2), `tsconfig.eslint.json` (1),
`package.json` (5), `.gitignore` (2), the two workflows (14), the 8 deleted files, `README.md` (1),
plus `src/**` and `public/locales/**`.

### After deletion

**Total residual excluding `.planning/`: 123 hits.** Split into two classes:

**Class A — the PUBLISHING path.** Narrow probe
(`flathub|flatpak-builder|flatpak:prepare|flatpak:build|dist:flatpak|heroicgameslauncher\.hgl|prepareFlatpak`):

```
src/backend/shortcuts/nonesteamgame/nonesteamgame.ts:302:
      newEntry.LaunchOptions = `run com.heroicgameslauncher.hgl ${newEntry.LaunchOptions}`
```

**Class A total: 1.** Deliberate — see `D-35-12-01` below.

Plus 4 hits in `pnpm-lock.yaml` for `@malept/flatpak-bundler@0.4.0`, which is **not ours to
remove**: it is a transitive dependency of `app-builder-lib@24.13.3` ← `electron-builder`. It dies
with electron-builder in plan 35-14. Removing it here would mean hand-editing a lockfile.

**Class B — RUNTIME Flatpak host detection, ~119 hits, all correct and all out of scope.** This is
the thing the plan did not anticipate. `flatpak` names two unrelated concerns in this repo, and only
the first is D-11's:

| Symbol | Hits | What it is |
|---|---|---|
| `flatpak-path-not-writtable` | 48 | i18n key + 47 locale translations — sandbox write warning |
| `isFlatpak` | 46 | "are we running inside a Flatpak?" (`/.flatpak-info` probe) |
| `flatpakHome` | 16 | `XDG_DATA_HOME`-derived home; pinned by `structuralContainment.test.ts` Test 4 |
| `flatpakRuntimeVersion` | 10 | exposed to the renderer for Gamescope/MangoHud messages |
| `flatpakSteamPath` | 3 | **detects the user's Steam installed AS a Flatpak** — `backend/config.ts:47-60` |

None of these concern publishing a Flatpak. `flatpakSteamPath` in particular is load-bearing for a
Steam launcher on Linux. Deleting any of it would be over-reach into `src/backend/`,
`src/frontend/` and `public/locales/` — none of which is in this plan's `files_modified`.

### Consequence for the plan's acceptance criterion

The plan's criterion — *"grep ... returns nothing, or every remaining hit is inside `CHANGELOG.md`"*
— **is unmeetable and was not met.** Two things are wrong with it:

1. It was written from the plan-time partial finding and never considered Class B.
2. **There is no `CHANGELOG.md` in this repo** (`grep -c` → *no CHANGELOG.md*), so the escape hatch
   it offers does not exist. The criterion could only ever have been satisfied by an empty grep.

Recorded rather than quietly satisfied by widening the deletion, which is exactly what the
criterion's literal reading would have driven.

## The pin test, and the mutation that mattered

`meta/__tests__/artifactTargets.test.ts` — 8 assertions, project **`Meta`**, all green:

```
PASS Meta meta/__tests__/artifactTargets.test.ts
  D-11: artifact target set is pinned to nsis/appimage/dmg
    ✓ bundle.targets deep-equals the exact intended array (not merely includes appimage)
    ✓ OVER-REACH CONTROL: nsis and dmg survive -- D-11 reduced the LINUX set only
    ✓ exactly one Linux target ships, and it is appimage
  D-11: the Flatpak/Flathub publishing path stays deleted
    ✓ neither flatpak/ nor flathub/ exists on disk
    ✓ no package.json script invokes the deleted publishing path
    ✓ the five deleted script names do not come back
    ✓ the electron-builder release scripts are NOT collateral damage of this deletion
    ✓ no CI workflow references the deleted publishing path
Tests: 8 passed, 8 total
```

The matcher is deliberately narrower than `/flatpak/`, and the header comment says why at length —
otherwise this test becomes a lever for deleting the Class B behaviour above. It also records that
deb/rpm were **deferred** while Flatpak was **deleted**, so a future reader knows which direction is
intentional.

### Mutations — 4 run, all red, restored with `cp` + `shasum`

The plan required two; four were run because the over-reach control and the workflow assertion are
the novel ones and a gate that cannot fail is worse than no gate.

**Mutation 1 — `bundle.targets += 'deb'`** → 2 red:

```
● bundle.targets deep-equals the exact intended array
    Array [ "nsis", "appimage", +   "deb", "dmg" ]
● exactly one Linux target ships, and it is appimage
    Array [ "appimage", +   "deb" ]
```
The over-reach control correctly stayed **green** — good discrimination.

**Mutation 2 — `mkdir flatpak/`** → 1 red:

```
● neither flatpak/ nor flathub/ exists on disk
    Expected: false
    Received: true
```

**Mutation 3 — `bundle.targets = ['appimage']`** (the over-reach direction) → 2 red:

```
● bundle.targets deep-equals the exact intended array
    - Expected  - 2
      Array [ -   "nsis", "appimage", -   "dmg" ]
● OVER-REACH CONTROL: nsis and dmg survive -- D-11 reduced the LINUX set only
```
"Exactly one Linux target" correctly stayed **green** here, since appimage was still the only Linux
target — the two assertions are measuring different things, as intended.

**Mutation 4 — re-add `flatpak:prepare` + append a Flathub line to a workflow.** This one found a
real defect **in the new gate**:

```
✕ no package.json script invokes the deleted publishing path
✕ the five deleted script names do not come back
✓ no CI workflow references the deleted publishing path      <-- FAILED OPEN
```

The workflow assertion stayed green against a planted `pnpm release:updateFlathub:ci` line. Cause:
the matcher was **case-sensitive**, and every real name spells it `Flathub` with a capital F —
`release:updateFlathub:ci`, and the workflow literally named *"Draft Release Flathub"*. A
case-sensitive `/flathub/` matches neither. The gate would have shipped unable to catch the exact
artifact it was written to catch — the `grep-gate-is-blind-in-one-direction` /
`jest-selectprojects-is-case-sensitive-and-exits-zero` shape.

Fixed with the `/i` flag, commented as load-bearing, and re-run with the mutations still in place:

```
✕ no package.json script invokes the deleted publishing path
✕ the five deleted script names do not come back
✕ no CI workflow references the deleted publishing path
```

All four mutations reverted with `cp` from a pristine pre-mutation copy, never
`git checkout -- <path>`. `src-tauri/tauri.conf.json` verified byte-identical after each:

```
f903707535d6ba66ed097b597e1720a0645da367776e697619ceb43510be3f71  src-tauri/tauri.conf.json
```

and `git diff HEAD -- src-tauri/tauri.conf.json` empty. `codecheck.yml` likewise restored and
confirmed untouched vs HEAD.

## Deviations

### 1. [Rule 1 - Bug, self-inflicted] The new gate's matcher was case-sensitive and failed open

Found by mutation 4, before commit. Added `/i` to `PUBLISHING_PATH_PATTERN` and re-proved red.
Documented in-file so the flag is not dropped as noise. Commit `a50a23b70`.

### 2. [Scope] Five scripts and four config files, where the plan named four scripts and none

The plan's `files_modified` lists `package.json`, `flatpak/`, `flathub/`, `.github/workflows/` and
the new test. Also modified: `tsconfig.eslint.json` (its `include` array carried
`"flathub/**/*.ts"`), `.prettierignore` (`flatpak`, `flatpak-build`) and `.gitignore`
(`flatpak-build`). Each is a reference to a path this commit deletes, and the plan's constraint —
*"verify afterwards that no reference survives anywhere in the repo"* — covers them. `README.md` was
edited under the task's explicit instruction despite not being in `files_modified`.

### 3. [Documentation] The README already said the right thing for the wrong reason

The plan directs: state the AppImage route plainly, and *"do not cite Heroic's Flathub identity as
the reason — the reader does not need the project's internal history"*. The existing line did
exactly what the plan forbids:

```diff
-from source**. (Upstream Heroic ships Flatpak/AUR/WinGet/Homebrew packages — but
-those install Heroic, not GameLib.) The steps below are a quickstart; see
-[Development environment](#development-environment) for full details.
+from source**. On Linux the build produces an **AppImage**. The steps below are a
+quickstart; see [Development environment](#development-environment) for full details.
```

The `dist:linux` deb/rpm/pacman/tar.xz options documented further down were left alone — those are
`electron-builder` surface owned by plan 35-14.

### 4. [Scope — logged, not fixed] `D-35-12-01`

See below. Logged to `deferred-items.md` per the scope boundary.

### 5. `STATE.md` and `ROADMAP.md` were not touched

Per the orchestrator's standing instruction, and no `gsd-sdk` `state.*` / `roadmap.*` /
`phase.complete` verb was invoked.

## `D-35-12-01` — this plan's own T-35-52 mitigation text overclaims

`T-35-52` in the plan's threat register disposes of the spoofing risk with: *"The whole identity is
deleted rather than renamed, which removes the claim entirely."* That is true **for the distribution
manifests**. It is not true of the repo:

```ts
// src/backend/shortcuts/nonesteamgame/nonesteamgame.ts
if (isFlatpak) { newEntry.Exe = `"flatpak"` }                                              // :262
if (isFlatpak) {
  newEntry.LaunchOptions = `run com.heroicgameslauncher.hgl ${newEntry.LaunchOptions}`     // :302
}
```

`isFlatpak` derives from `/.flatpak-info`, not from the app id. Since D-11 guarantees GameLib is
never distributed as `com.heroicgameslauncher.hgl`, this branch writes a Steam shortcut that runs
`flatpak run com.heroicgameslauncher.hgl "gamelib://launch?..."` — asking Flatpak to launch
**Heroic** with a GameLib deep link. It either fails or hands the URL to another application.

Not fixed here: it is a `src/backend/` runtime behaviour change, outside `files_modified`, and the
call — delete the `isFlatpak` branches as D-11-dead, or keep them for running *under* a foreign
Flatpak runtime — is not this plan's to make. This is the
`threat-mitigation-text-can-assert-false-parity` shape: the mitigation's *rationale* was the false
part, not its disposition.

## Verification

| Check | Result |
|---|---|
| `test ! -d flatpak && test ! -d flathub` | PASS |
| Plan `<verify><automated>`, re-run with the real script names | `PASS: flatpak/flathub removed, electron-builder scripts intact` |
| No surviving script *value* matches `/flatpak\|flathub/i` | PASS (0 hits in `package.json`) |
| `release:linux` / `release:mac` / `release:win` / `dist:linux` intact | PASS |
| `src/backend/updater.ts` exists; `electron-updater` still declared | PASS — `^6.8.3` |
| `src-tauri/tauri.conf.json` unmodified across both commits | PASS — 0 hits in `git diff --name-only HEAD~2 HEAD` |
| All surviving workflows parse as YAML | PASS — 16/16 |
| `pnpm codecheck` | **EXIT=0** |
| `npx eslint meta/__tests__/artifactTargets.test.ts` | **EXIT=0** (also confirms edited `tsconfig.eslint.json` resolves) |
| `fast-xml-parser` orphan check | CLEAN — 2 live `meta/` consumers survive |

### Test counts

Projects selected by which tests **read** the changed artifacts, not by where the artifacts live —
`package.json` belongs to no jest project yet is read by tests in three. Derived with
`grep -rln "package\.json" --include="*.test.ts" src/ meta/` → Meta 9, `src/backend` 5,
`src/frontend` 1. Each project confirmed by name in its own run output.

| Project | Suites | Tests | Result |
|---|---|---|---|
| **Meta** | 29 passed / 1 failed / 30 | **636 passed, 1 failed, 1 skipped / 638** | 1 known pre-existing failure |
| **Frontend** | 130 passed / 130 | **2101 passed / 2101** | clean |
| **Backend** | 182 passed / 1 failed / 183 | **4295 passed, 3 failed, 2 skipped / 4300** | 3 known pre-existing failures |

Run separately rather than combined — a single full-suite run manufactures a different failure set
under load.

**The 4 failures are all pre-existing and named in advance as do-not-chase:**

- **Meta ×1** — `genI18nGateScope.test.ts`, assertion *"A-17 ANTI-ROT: the committed
  `meta/i18nForkTouchedFiles.json` equals the LIVE git derivation"* — the exact assertion recorded
  as `D-35-03-01`. Confirmed not mine: the gate's scope is `src/frontend/**`, this plan touches zero
  such files, and none of this plan's filenames appears in the failure diff. The three `package.json`
  mentions in that log are all **passing** assertions, including the two that verify
  `upstream.baseCommit`/`baseVersion` — so the `package.json` edit did not disturb the pins.
- **Backend ×3** — all in `decompressPool.test.ts`, all `lzmaLoader` native-decode tests.
- `enrichmentFlows.test.ts` (the documented intermittent flake) **passed** this run.

## Threat register outcomes

| ID | Disposition | Outcome |
|---|---|---|
| T-35-50 | mitigate | **MET.** Sweep run and recorded before deletion; scripts and workflows removed in the same commit; automated assertion over every script *value*. |
| T-35-51 | mitigate | **MET.** Over-reach control present and mutation-proven red (mutation 3). |
| T-35-52 | mitigate | **PARTIAL.** Manifests deleted; the identity survives at one Steam-shortcut call site the mitigation text did not consider → `D-35-12-01`. |
| T-35-53 | mitigate | **MET.** README no longer names Flatpak; states the AppImage route plainly. |
| T-35-SC | mitigate | **MET.** `flatpak:build` ran `flatpak-builder --install --user`, installing software onto the developer's machine from a Heroic-derived manifest with a bundled timidity patch. Removed entirely, no replacement. |

## Self-Check

Files claimed created/modified, verified on disk:

- `meta/__tests__/artifactTargets.test.ts` — FOUND
- `package.json`, `tsconfig.eslint.json`, `.prettierignore`, `.gitignore`, `README.md` — FOUND
- `deferred-items.md` — FOUND, `D-35-12-01` heading present
- `flatpak/`, `flathub/`, both workflows — CONFIRMED ABSENT

Commits verified present in `git log`:

- `50cc156b6` — `chore(35-12): delete the Flatpak/Flathub publishing path (D-11)` — 10 deletions
- `a50a23b70` — `test(35-12): pin the artifact target set in both directions (D-11)`

## Self-Check: PASSED
