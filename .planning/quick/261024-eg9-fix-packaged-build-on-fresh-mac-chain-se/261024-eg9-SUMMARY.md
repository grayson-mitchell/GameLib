# Quick 261024-eg9 Summary

Packaged build on a fresh Mac: `tauri:dev:packaged` now chains `build:sidecar-sea`; the SEA build falls back to the SHA-256-verified official Node when `process.execPath` is a Homebrew shared-libnode launcher; the lzma R6/S11 failures were a test-harness defect (Node rimraf capturing a jest spy) and are fixed.

## Commits
- 4ff4b2719 Task 1: classifyNodeBase, obtainOfficialNodeBinary rename, formatPostjectFailure (meta/buildSidecarSea.ts + test)
- c93c35648 Task 2: package.json chain
- e18994e2a Task 3: lzmaNativeBinding.test.ts rimraf warm-up; todo moved to completed/ with `## Closed`

## Results
- buildSidecarSea.test.ts: 90/90 (new classifier, postject-message and wiring tests added). `pnpm codecheck` clean, prettier clean (codecheck is the repo typecheck; it covers meta via tsconfig.meta.json).
- `pnpm build:sidecar-sea` under /opt/homebrew/bin/node: logged the shared-libnode line, used the official v22.23.4 build, "SEA sidecar arch verified: arm64", output ~140 MB.
- lzmaNativeSeaRealBuild.test.ts: 3/3 pass. Before count (3 failing) is from the todo; I did not re-measure at the pre-fix HEAD.
- lzmaNativeBinding.test.ts: 40/40 (was 2 failed / 38 passed at HEAD).
- Combined run of buildSidecarSea, lzmaNativeBinding, lzmaNativeSeaRealBuild and fakeHomeIsolation: 140/140. `pnpm planning-gates`: 12/12.

## Exit-0 question (measured)
`pnpm exec tauri build --debug` with the sidecar missing exits 1 ("resource path ... doesn't exist"). The npm script is a plain `&&` chain; `.npmrc` is only `node-linker=hoisted`. So the repo does not swallow it; the 0 in 51-19 came from the operator's wrapper. No file changed for this.

## Task 3 diagnosis
Hypothesis confirmed. On Node v22.23.4 `fs.rmSync` is JS and lazily loads `internal/fs/rimraf`, which captures `fs.readdirSync` at load. Standalone probe: with `fs.readdirSync` stubbed to return undefined before the first `rmSync`, every later `rmSync` throws `Array.prototype.forEach called on null or undefined`, even after the stub is restored; without the stub it is fine. In the test, R6 installs a `readdirSync` spy before the process's first real `rmSync` (R6 alone fails; S11 alone passes, so S11 is collateral from the shared process). Fix: a module-scope warm-up `rmSync` of a nested mkdtemp dir before any spy, with a cause comment. No assertions weakened. Production is unaffected (no such spies in the sidecar).

## Deviations
None of substance. Notes: the win32 refusal message in obtainOfficialNodeBinary was reworded to be actionable for native builds, as the plan asked. The leftover 66 KB Homebrew-copy sidecar was moved (not deleted) to `/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/f4abbd69-ffa7-4d1d-95b9-8cd918abf931/scratchpad/gamelib-sidecar-aarch64-apple-darwin`. The freshly built 140 MB sidecar now sits in `src-tauri/binaries/` (gitignored). The full `pnpm tauri:dev:packaged` was not run end to end.

## Known stubs / threat flags
None.

## Self-Check: PASSED
Commits 4ff4b2719, c93c35648, e18994e2a exist; todo is in completed/ and absent from pending/.
