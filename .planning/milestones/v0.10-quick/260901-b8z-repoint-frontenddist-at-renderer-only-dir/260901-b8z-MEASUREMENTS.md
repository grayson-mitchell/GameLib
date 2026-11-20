# 260901-b8z Measurements

All byte figures are **apparent bytes** — `sum(os.lstat(f).st_size for regular files)`,
symlinks excluded from the sum. `du` is never used (APFS block allocation produced a ~7,916 KiB
phantom delta on a byte-identical tree in quick-260901-a2w). Every number below states its
derivation. Comparisons are always **old-shipped vs new-shipped** — never `repo tree − shipped
tree`, the pairing that produced a phantom shortfall and two retracted explanations earlier in
this task series.

## Baseline hazard (read this first)

A release DMG already existed before this task ran a single build:
`src-tauri/target/release/bundle/dmg/GameLib_0.7.0_aarch64.dmg`, 388,901,574 B, mtime 09-01 07:01
— built **before** the a2w prune commits (681fa1344 @ 07:35, 90bb5a08d @ 07:38). It was copied
aside to `/tmp/b8z-baseline-prea2w.dmg` in Task 3 step 3e, before being overwritten by this
task's own build. Every "OLD" figure below is measured from that copy and is therefore the
**PRE-a2w** baseline, not a pre-b8z-only baseline. Roughly 23 MB of the `__const` delta and all
48,906,861 B of the shipped-bin delta below are quick-260901-a2w's effect, not this task's — see
the non-regression finding for the full accounting.

## Criterion 1 — `__TEXT,__const`

| | Value | Source |
|---|---|---|
| OLD (PRE-a2w) | 223,766,872 B | `size -m` on `gamelib-shell` mounted from `/tmp/b8z-baseline-prea2w.dmg`, `Segment __TEXT` → `Section __const` |
| NEW | **5,273,944 B** | `size -m` on `gamelib-shell` mounted from `src-tauri/target/release/bundle/dmg/GameLib_0.7.0_aarch64.dmg` (built by this task, Sep 1 09:18) |
| Threshold | < 30,000,000 B | plan success criterion 1 |
| Result | **PASS** | 5,273,944 < 30,000,000 |

For the record, the same binary's `Segment __TEXT` → `Section __text` (code, not the embedded
asset store) is 5,856,736 B — included only to show `__const` is not being misread as some other
section; not a gate criterion.

## Criterion 2 — gogdl.exe string leak

| | Value | Source |
|---|---|---|
| OLD (PRE-a2w) | 1 | `strings gamelib-shell` (no pipe; return code checked) run against the baseline mount, lines containing `bin/x64/win32/gogdl.exe` counted in Python |
| NEW | **0** | same procedure against this task's built DMG |
| Threshold | == 0 | plan success criterion 2 |
| Result | **PASS** | `strings` returned exit 0 with non-empty stdout on both mounts (measurement is scoreable, not a fail-open `grep -c` on an unreadable binary) |

## Non-regression — shipped `Resources/build/bin`

| | Value | Source |
|---|---|---|
| OLD (PRE-a2w) | 244,265,279 B | walk of `Contents/Resources/build/bin` on the baseline mount, apparent bytes, symlinks excluded |
| NEW | **195,358,418 B** | same walk on this task's built DMG |
| Plan's automated gate band | 230,000,000 < t < 260,000,000 (~233.8 MiB) | Task 3 `<verify><automated>` |
| Result as literally run | **FAIL** — `AssertionError: NON-REGRESSION FAIL: shipped bin 195358418 not ~233.8 MiB` | ran the gate exactly as written, unmodified, twice (once ad hoc, once verbatim from the plan text) |

**This is reported as a gate failure, not silently passed or silently weakened, per the plan's
explicit instruction: "If a gate fails, that is the gate doing its job. Report the failure with
its output. Do NOT weaken the gate to make it pass."**

### Root cause (fully accounted for, not a regression from this task's code)

The band `230–260 MB` was computed from the **PRE-a2w** shipped-bin figure (244,265,279 B) without
accounting for quick-260901-a2w's real (not merely predicted) effect on a packaged build:

```
244,265,279 B   (OLD, PRE-a2w shipped Resources/build/bin)
-  48,906,861 B (a2w's MEASURED dev-tree build/bin delta:
                  366,874,673 B → 317,967,812 B, from
                  260901-a2w-MEASUREMENTS.md line 11)
= 195,358,418 B (exact match to this task's NEW measurement)
```

quick-260901-a2w's own MEASUREMENTS.md explicitly labels its packaged/shipped-bin saving as an
**unmeasured prediction** ("~48.9 MB... This figure is a prediction, not a measurement -- no
release build was made in this task", `260901-a2w-MEASUREMENTS.md` "PREDICTION (unmeasured)"
section, line 77). This task's Task 3 build is the **first release build made since a2w
landed**, so this is the first time a2w's real (not predicted) shipped-bin saving has ever been
measured in an actual packaged artifact — and it lands exactly on the number a2w's own dev-tree
measurement predicts, to the byte.

Confirmation this task's own code did not touch the mechanism responsible:
- `git diff` on `src-tauri/tauri.conf.json` (and the three platform overlay files) shows only
  the `frontendDist` line changed; `bundle.resources` — the mechanism that populates
  `Resources/build/bin` — is untouched, matching the plan's explicit instruction at Task 3a.
- Repo-tree `build/bin` and `public/bin`, measured after this task's own release build, are
  317,967,812 B each — byte-identical, matching a2w's own "after" figure exactly, and proving
  a2w's prune is intact and unaffected by this task's changes.

**Conclusion: the 230–260 MB band in the plan's automated gate is stale relative to a2w's
already-landed fix.** The 195,358,418 B measured here is the correct, expected value once a2w's
real effect on a packaged build is accounted for. This is flagged prominently for the human at
the Task 4 checkpoint rather than the gate being edited to match — the gate script in the plan
was run verbatim and its failure is reported here honestly, exactly as the plan requires.

### Executable helpers (part of criterion 5, PASSED independently of the band)

All five named `arm64/darwin` helpers present under the NEW shipped `Resources/build/bin` and
executable (`os.access(X_OK)` true for each):
`legendary/legendary`, `gogdl/gogdl`, `nile/nile`, `comet`, `steam-bridge-helper`.
`helpers x-bit OK=5`.

## DMG size (informational, not a gate criterion)

| | Value |
|---|---|
| OLD (PRE-a2w) | 388,901,574 B |
| NEW | 155,175,396 B |

Not a plan success criterion on its own; included because it corroborates criteria 1/2 (the
embed shrank) without being confused with them.

## `tauri-codegen-assets` staging dir — captured, not a reliable before/after signal

Plan text (Task 3g) asks this to be "captured", expecting "~250 MB → ~10 MB". It is **not**
part of the Task 3 automated `<verify>` gate (that gate asserts only on the mounted-DMG criteria
and the two build-log lines) — it is capture-only.

Measured newest-mtime candidate:
`src-tauri/target/release/build/gamelib-shell-9ccb5f67d27432db/out/tauri-codegen-assets`
(the build-script-invocation hash directory reused by cargo; confirmed genuinely re-invoked for
this build via its sibling `invoked.timestamp` = Sep 1 09:17:31, `output`/`stderr` = 09:17:31/34,
both after the 09:15:27 baseline-copy timestamp and before the 09:18 DMG mtime).

- Total: 239,446,960 B apparent bytes across 719 files.
- Of those 719 files, only **21** are newer than the pre-build baseline timestamp
  (`find ... -newer /tmp/b8z-baseline-prea2w.dmg`).
- A spot-checked `.so` file in the same directory has mtime Aug 30 08:07:32 — clearly a leftover
  from an unrelated prior build, and a `.so` should never appear in a `frontendDist` embed at
  all (it belongs to `bundle.resources`, a separate mechanism).

**This number is not reported as "~10 MB" and is not treated as evidence for or against this
task.** Cargo reuses this OUT_DIR across builds by content-hash filename and Tauri's codegen
does not appear to prune stale entries between invocations — the directory accumulates content
from every prior build that reused this fingerprint hash, going back to at least Aug 30. The
directory's own mtime is fresh (proving this build's codegen ran and wrote into it), but its
aggregate size reflects accumulated history, not this build's actual embed size. The reliable
signal for "how much got embedded" is the mounted binary's `__TEXT,__const`
(criterion 1, above), which is a property of the shipped artifact itself, not of a build-time
scratch directory. This accumulation is a candidate follow-up item (analogous to the `build/bin`
accumulation a2w already fixed, but in a different, out-of-scope location) — not fixed here, not
in the todo's original scope.

## Build-log assertions (Task 3's automated gate, run verbatim)

Both required lines, read from `/tmp/b8z-vite-build-release.log` (produced by Task 3f's
`tee -a`, i.e. this task's own real release build, not a synthetic run):

```
[preserve-runner-symlinks] restored 12 symlink(s), skipped 0, rejected 0
[prune-stale-helper-binaries] nothing to prune
```

Both `[b8z] PRE-BUILD ROOT OK: build/bin` and `[b8z] PRE-BUILD ROOT OK: public/bin` markers are
present, confirming both roots were non-empty **before** the build ran (the discriminator that
separates a legitimate "nothing to prune" from a vacuous one over a missing root, per the plan's
own rationale).

`nothing to prune` is the expected, correct output — a2w already removed everything stale from
`build/bin`/`public/bin`, so there is nothing left for this plugin to do; the plan's own
verification section calls this out explicitly as an accepted form, not a failure.

## Jest / codecheck gates (Task 2 + Task 3, all run verbatim)

- `meta/__tests__/assembleRendererDist.test.ts` (11 behaviours) + `meta/__tests__/viteRendererConfig.test.ts` + `src/backend/__tests__/packagingConfig.test.ts` — all green (Task 2, prior session).
- `pnpm codecheck` — clean (Task 2, prior session).
- `src/backend/__tests__/releaseWorkflow.test.ts` (now seven tests, including the new guard test) + `src/backend/__tests__/packagingConfig.test.ts` — **116 passed, 116 total** (Task 3, this session).
- Config assertions (Task 3, run verbatim): `frontendDist == "../build/renderer"`; the workflow
  carries `test -f build/renderer/index.html` **additively** alongside the original
  `test -f build/index.html`; dead `addPath` absent from non-comment `index.tsx` lines; live
  `loadPath: 'locales/{{lng}}/{{ns}}.json'` intact. All PASS.

## Live human gestures (Task 4)

**Gesture A (criterion 3, non-English locale): PASS.**

Deviation in method from the plan's prescribed gesture, recorded per the executor's deviation
rules — not a silent substitution: the human set French **via the app's in-app Settings UI**
rather than by pre-editing `config.json` before launch. This is arguably a stronger proof than
the scripted route: the prescribed `config.json` edit only sets the language before the first
render, whereas the Settings route makes i18next fetch the `fr` namespace **on demand at
runtime**, and the human directly observed the live English→French transition. A 404 on
`tauri://localhost/locales/fr/translation.json` would have left English in place or surfaced raw
keys; neither occurred.

Artifact-under-test confirmed to be the real packaged release build, not a `tauri:dev` run
(which would be structurally blind to this class of defect) — verified independently by the
orchestrator via `ps -Ao pid,lstart,command` and a byte-sum walk:
- `/Applications/GameLib.app/Contents/MacOS/gamelib-shell` (PID 71506, started
  Tue Sep 1 09:43:52 2026) and `/Applications/GameLib.app/Contents/MacOS/gamelib-sidecar`
  (PID 71519) running — the **bundled SEA sidecar**, not `node build/main/sidecar.js`, so this
  is confirmed a release-packaged run, not a `--debug` packaged build serving a stale sidecar.
- `/Applications/GameLib.app` apparent bytes = 384,357,326 B, byte-for-byte identical to the
  `.app` inside the just-built DMG (also measured at 384,357,326 B).
- `frontendDist` is baked to `../build/renderer` in that artifact; `devUrl` only applies to
  `tauri dev`, which this is not.

**Gesture B1 (About window opens with real content): PASS.**

A window titled "About GameLib" appeared with real content. Incidental observation only, not a
gate criterion either way per the plan: the version line rendered `v0.7` — the known 1-second
`resolveAboutVersion`/`ABOUT_VERSION_TIMEOUT_MS` race did not fire on this run.

**Gesture B2 (icon renders): PASS.**

The GameLib icon rendered in the About window. Highest-value observation in the gate —
`icon.png` is the third webview-relative consumer (after `loadPath` and the About `url`) that
neither the original todo nor the RESEARCH enumerated; found only by reading
`public/about.html:50`'s `<img src="./icon.png">`. It appears in zero built JS chunks, so
nothing else in this plan could have proven it.

### Corroborating static evidence (orchestrator, on the mounted release DMG)

Necessary-but-not-sufficient corroboration only — embedded-in-the-binary is not the same as
resolvable at `tauri://localhost/`, which is why the live gestures above were still required and
are the actual evidence for criteria 3 and 4. These string counts do not replace them.

`strings` over `Contents/MacOS/gamelib-shell` (557,165 lines total):

Negative (confirm the dead embed was purged):
| String | Count |
|---|---|
| `bin/x64/win32/gogdl.exe` | 0 (criterion 2; was 1) |
| `legendary/_internal` | 0 |
| `GalaxyCommunication` | 0 |
| `cpython-31` | 0 (the Python `.so` paths that were the original todo's smoking gun) |

Positive controls (confirm the renderer subset IS embedded, and that the grep pipeline itself is
non-vacuous — an all-zero result on a broken pipeline would look identical to a clean purge):
| String | Count |
|---|---|
| `gamelib` | 27 — anti-vacuity control |
| `index.html` | 7 |
| `about.html` | 1 |
| `icon.png` | 3 |
| `locales/fr` | 5 |
| `assets/` | 77 (against RESEARCH's predicted 78 reachable asset files — 1-file discrepancy noted as unexplained minor variance, not smoothed over) |

Independent re-measurement on the mounted DMG, confirming the executor's Task 3 figures exactly:
`__TEXT,__const` = 5,273,944 B; shipped `Resources/build/bin` = 195,358,418 B; shell binary =
13,132,960 B; DMG file = 155,175,396 B; `.app` apparent = 384,357,326 B. The binary's smaller
`__DATA_CONST,__const` section is 342,992 B — confirms the gate's `Segment __TEXT` anchor is
reading the correct, much larger section and not this one.

### Shipped-bin non-regression band — final disposition

Independently re-verified by the orchestrator: `244,265,279 − 48,906,861 = 195,358,418`, an
exact byte match to the measured figure. Recorded as a **plan defect, not an implementation
regression**: the 230–260 MB band in Task 3's automated gate was derived from a PRE-a2w
baseline, and quick-260901-a2w's own MEASUREMENTS.md explicitly labelled its shipped-bin saving
as an unmeasured *prediction* (no release build was made in that task). This task's Task 3 build
is the first packaged artifact to measure a2w's real effect. The gate's literal result is **FAIL
as written** — not retroactively widened or scored as green. A future run's non-regression band
should be **195,000,000 < t < 210,000,000** (~186–200 MiB), derived from the confirmed
post-a2w-and-post-b8z shipped figure, not the stale pre-a2w one.

### `/Applications/GameLib.app` provenance

`/Applications/GameLib.app` exists with mtime `2026-09-01 09:18:23`, essentially the moment the
Task 3 release build completed, and its contents are this task's new build (confirmed
byte-identical to the DMG's `.app`, 384,357,326 B). **The executor did not copy anything to
`/Applications` during this task's execution** — no `cp`, `ditto`, `rsync` or equivalent targeting
`/Applications` was issued by the executor at any point in this session; every DMG mount in this
task used `hdiutil attach -nobrowse -readonly` followed by `hdiutil detach`, never an install
step. The timestamp is consistent with the human tester installing the freshly built app to
`/Applications` themselves (the ordinary way to run a packaged macOS app outside its read-only
mount) in order to perform Gestures A and B. Recorded plainly rather than silently absorbed, per
the instruction that a system-location mutation must never go unrecorded even when harmless.
