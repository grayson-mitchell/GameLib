---
quick-task: 260901-i8i
verified: 2026-09-01T02:35:25Z
status: passed
score: 6/6 asks verified, 11/11 plan success criteria verified
overrides_applied: 0
---

# Quick Task 260901-i8i Verification — Drop x64/darwin Intel Mac Tree

**Task:** Remove Intel Mac (`x86_64-apple-darwin` / `x64/darwin`) support from GameLib's macOS
build and release path.
**Verified:** 2026-09-01T02:35:25Z
**Status:** PASSED

This verification does not re-run the DMG census (already independently mounted and measured
by the requesting agent — those numbers are accepted as settled). It focuses on the record and
the specific claims flagged for adversarial review: the CR-01 deviation, gate non-vacuity via
live mutation, test-count arithmetic and the flake attribution, size-basis labelling, and
whether anything was silently lost.

## 1. CR-01 deviation — sound resolution, not a routed-around gate

The reworded prose at `.github/workflows/release-tauri.yml:143` now reads:

> `Mac leg (`--target` `x86_64-apple-darwin`) emitted bin/arm64/...`

This deliberately splits `--target` and `x86_64-apple-darwin` into separate backtick spans so
the contiguous substring `--target x86_64-apple-darwin` (with a plain space) does not appear.
Confirmed by direct grep against the live file:

```
$ grep -n -- "--target x86_64-apple-darwin" .github/workflows/release-tauri.yml
(no match, exit 1)
```

The negative assertion this dodges is `src/backend/__tests__/releaseWorkflow.test.ts:368`:
`expect(source).not.toContain('--target x86_64-apple-darwin')`. This is judged **sound**, not a
gate-gesture-blind-to-its-own-defect instance, for two reasons:

- **The gate's real target is executable syntax, not prose.** The two negative assertions in
  that `describe` bind on `sidecar_triple: 'x86_64-apple-darwin'` (a real YAML matrix key) and
  `--target x86_64-apple-darwin` (a real CLI argument shape used elsewhere in the file for the
  signing/build commands). A genuine re-introduction of the Intel leg requires the actual YAML
  key `sidecar_triple: 'x86_64-apple-darwin'` — markdown backticks have no effect on YAML
  parsing, so that assertion cannot be dodged by reformatting. I confirmed this key is not
  merely absent as a coincidence of the split: `grep -c "sidecar_triple: 'x86_64-apple-darwin'"` is
  `0` against the current file and was `1` against the pre-sweep parent commit (`763faa239^`).
- **The provenance rule the plan itself states** (`<provenance>` block) explicitly forbids a
  blanket `not.toContain('x86_64-apple-darwin')` over the whole file, because that would outlaw
  the CR-01 historical prose that is required to survive. The split-backtick resolution is the
  narrowest fix available: it keeps the assertion scoped to the two executable literals
  (RESEARCH.md's own instruction) while keeping the historical prose both readable and
  non-colliding. This is the documented, deliberate trade-off, not an accidental discovery of a
  bypass.

I do not consider this "teaching the codebase to hide from the gate" in a load-bearing sense —
the only thing hidden is prose commentary, and the assertions that matter (the YAML key and the
CLI arg) are untouched by formatting tricks. **Verdict: sound.**

## 2. Non-vacuity of new/changed gates — live mutation, not reasoning

Ran real mutations against the working tree (not reasoning), on each new/changed assertion,
then restored the files exactly (`git status --short` clean before and after).

**Category 1' (`x64NonGoalSurvivor.test.ts`, new) — Tauri-era win32 resource keys.**
Mutated `src-tauri/tauri.macos.conf.json` to delete the `EpicGamesLauncher.exe` resource key,
ran `pnpm exec jest --config meta/jest.config.js x64NonGoalSurvivor`:

```
✕ category 1' ... — FAIL
  Expected value: "../build/bin/x64/win32/EpicGamesLauncher.exe"
  Received array: ["../build/bin/x64/win32/GalaxyCommunication.exe", "../build/bin/legendary.LICENSE"]
Tests: 1 failed, 3 passed, 4 total
```
Restored the file, reran: 4/4 green. **RED before restore, GREEN after — confirmed non-vacuous.**

**Category 2' (`x64NonGoalSurvivor.test.ts`, new) — surviving comet/helper literals.**
First mutation attempt (appending `-MUTATED` suffix) stayed GREEN because `toContain` is a
substring match and the mutated string still contained the pinned substring — this itself is a
useful finding (see caveat below). Corrected mutation: deleted the
`darwin: 'comet-aarch64-apple-darwin',` line entirely from `meta/downloadHelperBinaries.ts`:

```
✕ category 2' ... — FAIL
  expect(DOWNLOAD_HELPER_BINARIES_SOURCE).toContain('comet-aarch64-apple-darwin')
Tests: 1 failed, 3 passed, 4 total
```
Restored the file, reran: 4/4 green. **RED before restore, GREEN after — confirmed non-vacuous.**

*Caveat surfaced by this exercise:* the `toContain` idiom this suite uses is a substring check.
A mutation that appends a suffix (`comet-aarch64-apple-darwin-MUTATED`) does **not** flip a
`toContain('comet-aarch64-apple-darwin')` assertion RED, because the target string is still a
substring. This is not a defect in category 2' itself (deleting/renaming the key, the realistic
failure mode, is correctly caught, as shown above) but it means the assertion is weaker against
a hypothetical "renamed with the old string still embedded" mutation than a reader might assume
from "mutation-proved" language. Not blocking — the realistic regression (key removed or
retyped) is caught — but worth noting for anyone re-using this idiom.

**RC-1 (`releaseWorkflow.test.ts`) — `toHaveLength(4)` → `toHaveLength(3)`.**
Verified via commit diff, not reasoning: `sidecar_triple: '` count in `release-tauri.yml` is
`4` at `763faa239^` (pre-sweep) and `3` at HEAD. The new test's `toHaveLength(3)` would fail
against the pre-sweep count (RED before) and passes against HEAD (GREEN after).

**RC-3 (`buildSidecarSea.test.ts` / `buildSidecarSea.ts`) — `NATIVE_LZMA_REQUIRED_TRIPLES`
`toHaveLength(4)` → `toHaveLength(3)`, `x86_64-apple-darwin` dropped from the array.**
Verified via `git show 763faa239^:...` vs HEAD: the array held `x86_64-apple-darwin` before,
does not after. `toHaveLength(3)` would fail (actual 4) before, passes (actual 3) after.

**`downloadHelperBinaries.test.ts` negative — `not.toContain('comet-x86_64-apple-darwin')`.**
Verified via diff: `darwin: 'comet-x86_64-apple-darwin'` present in
`meta/downloadHelperBinaries.ts` before the sweep, absent after. RED before / GREEN after.

**`releaseWorkflow.test.ts` negatives — `not.toContain("sidecar_triple: 'x86_64-apple-darwin'")`
and `not.toContain('--target x86_64-apple-darwin')`.** Verified via grep against
`763faa239^:.github/workflows/release-tauri.yml` (1 and 3 occurrences respectively) vs HEAD (0
and 0). RED before / GREEN after both.

**`packagingConfig.test.ts` — `platformShipsBinPath('macos','x64/darwin')` → `false`.**
Verified via diff of `src-tauri/tauri.macos.conf.json`: `bundle.macOS.files` held the
`Resources/build/bin/x64/darwin` key before, does not after; `platformShipsBinPath` consults
that map, so this assertion's polarity matches the removal directly.

**Verdict: every new/changed gate checked is non-vacuous** — each was RED against the pre-sweep
state and is GREEN against the post-sweep state, either by direct working-tree mutation or by
comparing against the actual pre-sweep commit content (not narrated reasoning).

## 3. Test-count honesty — reconciled, both suites re-run independently

Ran both full suites myself, fresh, rather than trusting the SUMMARY/STATE numbers:

```
$ pnpm exec jest --config meta/jest.config.js
Test Suites: 34 passed, 34 total
Tests:       1 skipped, 695 passed, 696 total
```

```
$ pnpm exec jest --config src/backend/jest.config.js
Test Suites: 1 failed, 188 passed, 189 total
Tests:       3 failed, 2 skipped, 4386 passed, 4391 total
```

Both exactly match the SUMMARY/STATE claims (34/34 suites, 695/696 tests; 188/189 suites,
4386/4391 tests).

**Arithmetic reconciliation (this is what the task flagged as unreconciled):**
Meta: `696 − 695 = 1` → the 1 non-passing is a `skipped` test (`meta/jest.config.js` run shows
`1 skipped`, not a failure). Consistent with the SUMMARY's "(1 skipped)" note.
Backend: `4391 − 4386 = 5`, not 3. The SUMMARY/STATE prose only names 3 (the decompressPool
failures) without accounting for the other 2. I traced them: they are 2 **pre-existing,
already-skipped** tests in `src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts`
(`○ skipped ... KNOWN FAILING ... do not un-skip without a real fix`), an unrelated file this
task's commits never touched. So `4391 = 4386 passed + 3 failed (decompressPool) + 2 skipped
(lzmaNativeSeaRealBuild)` — fully reconciled and not attributable to this task. **The numbers
themselves are accurate; the prose is merely incomplete** (it states "3 pre-existing failures"
without also naming the 2 pre-existing skips that make up the rest of the 5-count gap). This is
a minor documentation completeness gap, not a false claim — flagged as non-blocking below.

**decompressPool.test.ts flake attribution — verified, not accepted on faith.**
- The file is byte-identical between `763faa239^` (pre-task parent) and HEAD (`diff` empty) —
  confirmed no commit in this task touched it.
- Re-ran the file directly: `3 failed, 38 passed, 41 total`, all three
  `Expected: "native"` / `Received: "pure-js"` — matches the SUMMARY's description exactly.
- Found an existing todo, `.planning/todos/pending/2026-08-31-decompresspool-native-lzma-tests-fail-3-of-41.md`,
  dated **2026-08-31 — the day before this task ran**, documenting the identical 3 failing test
  names and the identical failure mode, already ruled unrelated to a prior phase's diff. This is
  independent, pre-dated evidence the flake existed before this task touched anything.
- **Verdict: the attribution is genuine, not a rationalization.** The failure is a real,
  previously-known, previously-filed environmental gap (native lzma addon resolves `pure-js`
  inside Jest despite loading fine outside it) unrelated to the x64/darwin removal.

## 4. Record accuracy — both size bases

Checked every location the plan required to carry both labelled bases:

| Location | Dev-machine (46,423,272 B) | Fresh-CI (11,213,032 B) | Labelled? |
| --- | --- | --- | --- |
| `260901-i8i-MEASUREMENTS.md` | present | present | Yes, explicit table + prose warning against headlining 46.4MB |
| `260901-i8i-SUMMARY.md` | present | present | Yes |
| `.planning/STATE.md` row | present | present | Yes |
| Todo `2026-08-28-...786mb...md`, item-5 (`x64/darwin`) row | present | present | Yes — "DONE 2026-09-01 ... Dev-machine basis 46,423,272 B ... fresh-CI basis 11,213,032 B" |
| `260901-8rm-MEASUREMENTS.md:166` annotation | original 44/44.3 MiB figure left intact, dated annotation added | fresh-CI figure stated in the annotation | Yes — annotated, not rewritten |
| `260901-e7o-RESEARCH.md:18` annotation | N/A (mischaracterization fix, not a size claim) | N/A | Correction is about attribution ("Steam-bridge shim leg" → helper-binary set), not a size relabel — appropriately scoped |
| `34.18-VALIDATION.md` annotation | N/A | N/A | Provenance note, not a size claim |

No unlabelled "46 MB" instance found anywhere in the touched records.

**34.18 provenance claim — verified against actual commit dates:**
```
1969bd3a1 (Tauri packaging surface, phase 34.9-07)  2026-08-10
0f6180d49 (Intel release leg, phase 34-06)           2026-07-24
34.18 sub-plans (01-07) completed:                   2026-08-27
```
`2026-08-27 − 2026-08-10 = 17 days`, `2026-08-27 − 2026-07-24 = 34 days` — both figures in the
annotation are correct. `grep -rn "release-tauri" .planning/phases/34.18-*/` returns zero hits,
confirming the surface was never in 34.18's scope table. The annotation correctly attributes
the mechanism to `34.18-02-PLAN.md:149`'s over-broad negative and explicitly states "34.18 is
not being re-opened" — it does **not** blame `quick-260901-e7o` or a `census-by-wrong-namespace`
failure anywhere in the added text. Confirmed clean on this point.

## 5. Nothing deleted that shouldn't have been

`git show --stat` on all 4 commits reviewed. Specific checks:

- **The two W3-preserved bridge-arch tests survive verbatim.** Diffed
  `src/backend/__tests__/releaseWorkflow.test.ts` at `7d84fc0d1`: the `describe` block shows the
  two ternary-parsing helper functions and 3 dependent tests deleted/replaced (as the plan
  directed via RC-5), while `'the env var the workflow sets is the one the build script
  actually reads'` and `'the arch env wiring belongs to the steam-bridge step...'` do not appear
  in the diff at all — i.e., untouched. Direct read of the current file confirms both are present
  verbatim and the describe reports exactly 4 tests.
- **`src/backend/utils.ts` (D-3) is untouched.** `git diff 763faa239^ 0fe3287e6 -- src/backend/utils.ts`
  is empty.
- **`meta/buildSteamBridgeShims.ts` (item 6 / D-5) is untouched.** `git diff 763faa239^ 0fe3287e6 --
  meta/buildSteamBridgeShims.ts` is empty — confirmed the `steam_api.pdb`/`steam_api_shim.lib`
  emission logic was not folded in despite the file being in the neighbourhood of the other
  Task 2 edits.
- **No other workflow ships an Intel macOS leg.** Grepped every file in `.github/workflows/` for
  `macos-13`, `macos-12`, `x86_64-apple-darwin`: only `release-tauri.yml` matches (the file this
  task edited); `build-runners-onedir-macos.yml` and the rest do not reference Intel Mac at all.
- No `TBD`/`FIXME`/`XXX` debt markers found in any of the 9 source/test files this task modified.

## 6. Todo state statement

Confirmed by direct read of `.planning/todos/pending/2026-08-28-tauri-macos-bundle-is-786mb-frontenddist-embeds-build-bin-in.md`:
the file remains in `pending/` (not moved to `done/`), and the body explicitly states, in the
fix-(1) table's `x64/darwin` row and the annotation immediately below it, that the row is
**"DONE 2026-09-01 (quick-260901-i8i): removed"** with both size bases, while **"Item 6
(`steam_api.pdb` / `steam_api_shim.lib`, ~2.7 MB) remains OPEN — explicitly out of scope..."**
This is exactly the "say so explicitly in the todo body rather than moving the file" instruction
the plan gave, correctly followed.

## Additional checks performed

- Confirmed no other consumer of `x64/darwin`/`x86_64-apple-darwin` was missed: the only
  remaining live-code hits are the deliberately-preserved `meta/buildSidecarSea.ts` capability
  sites (5 occurrences, matching the plan's exact gate) and the historical prose comments in
  `release-tauri.yml` and `buildSteamBridgeShims.ts` (both explicitly scoped as out-of-scope /
  historical by the plan).
- Verified the RC-5 describe block (`release-tauri.yml steam-bridge target arch`) reports
  exactly 4 tests by direct read of the current file (`src/backend/__tests__/releaseWorkflow.test.ts:359-389`).
- All 9 modified source/test files pass an anti-pattern debt-marker scan (no `TBD`/`FIXME`/`XXX`).
- Working tree confirmed clean (`git status --short`) both before and after all mutation testing
  performed for this verification — no residual changes left behind.

## Gaps

None blocking. One non-blocking documentation-completeness note (see §3): the SUMMARY/STATE
prose names only the 3 decompressPool failures when accounting for the backend suite's
4391-4386=5 delta, omitting that the other 2 are pre-existing skipped tests in an unrelated
file. The underlying numbers reported are accurate and independently reproduced; only the
prose's explicit accounting is incomplete. Not required to be fixed — flagged for completeness.

---

## VERIFICATION PASSED

All 6 requested audit areas hold up under independent, adversarial re-verification:

1. **CR-01 deviation is a sound, narrowly-scoped resolution** — the split-backtick phrasing
   evades only the literal-substring form of the negative assertion, not its ability to catch a
   real re-introduction of the Intel leg (which would require the actual YAML key or CLI arg,
   unaffected by markdown formatting).
2. **Every new/changed gate is non-vacuous** — confirmed by live mutation on the actual working
   tree (restored cleanly afterward) or by direct commit-content comparison, not narration. One
   caveat noted (a `toContain` substring-match idiom is weaker against append-style mutations)
   but the realistic regression is correctly caught.
3. **Test counts are accurate and independently reproduced**; the decompressPool flake
   attribution is genuine and pre-dated (filed 2026-08-31, before this task ran); the
   4391-vs-4386 arithmetic gap is fully explained by 2 pre-existing skipped tests in an unrelated
   file, though the SUMMARY/STATE prose could have named them explicitly (non-blocking).
4. **Every size record correctly labels both bases**; the 34.18 provenance dates check out
   exactly and do not misattribute the residue to `e7o` or `census-by-wrong-namespace`.
5. **Nothing was silently deleted** — the two W3-preserved tests survive verbatim,
   `src/backend/utils.ts` and `buildSteamBridgeShims.ts` are byte-identical to pre-task, and no
   other workflow carries a stray Intel Mac leg.
6. **The todo's state statement is accurate** — item rows marked DONE with real numbers, item 6
   explicitly called out as still open, file correctly left in `pending/`.
