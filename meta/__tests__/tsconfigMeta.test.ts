/**
 * Drift guard for `tsconfig.meta.json` (quick 260923-814).
 *
 * `meta/` holds ~60 build/release/gate scripts that nothing compiled until
 * this config landed -- 12 real type errors were sitting in release tooling,
 * and `ts-jest` was not a substitute gate (`machineFillGamelib.test.ts`
 * carried a TS2352 while its suite passed 48/48). The fix is a SECOND tsc
 * project rather than widening `tsconfig.json`'s `include` to `["src","meta"]`,
 * because that would drag every meta/ script into ts-prune's population and
 * reopen the dead-code ledger (measured at 73 newly-exposed used-in-module
 * identities, against a ledger closed at 0 the day before).
 *
 * Option 2's one structural weakness is that two configs can diverge. This
 * test is what closes it: the meta project declares NO `compilerOptions`, so
 * divergence is not even expressible, and that property is asserted here.
 *
 * ## WHAT THIS TEST DOES NOT PROVE
 *
 * It never runs `tsc`. It cannot tell you whether `meta/` typechecks, whether
 * the include set resolves to the files you expect, or whether a compiler
 * setting is right. `pnpm codecheck` is what does that -- and it was proven
 * able to go red by a negative control (reintroducing the `/s` regex flag in
 * `rebrandUpstreamCatalogs.ts` made it exit 2 with TS1501). All this test
 * prevents is the config silently drifting away from the app project, or
 * silently falling out of the script CI and `.husky/pre-push` actually run.
 * These are deliberately source-text/JSON assertions and are described as such
 * rather than dressed up as behavioural ones.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const REPO_ROOT = join(__dirname, '..', '..')
const META_TSCONFIG_PATH = join(REPO_ROOT, 'tsconfig.meta.json')
const PACKAGE_JSON_PATH = join(REPO_ROOT, 'package.json')

describe('tsconfig.meta.json cannot drift from tsconfig.json', () => {
  // Plain `JSON.parse`, deliberately: this config is pure JSON (no JSONC
  // comments) precisely so that this guard needs no tolerant parser, and a
  // comment added later would fail here rather than be silently skipped.
  const metaTsconfig = JSON.parse(
    readFileSync(META_TSCONFIG_PATH, 'utf-8')
  ) as Record<string, unknown>

  it('declares EXACTLY `extends` and `include` -- no `compilerOptions`', () => {
    // The whole anti-drift property. With no compilerOptions block there is
    // no way to relax `strict`/`strictNullChecks`, and no way to bump
    // `target` to es2018 to silence a TS1501 instead of fixing the source.
    expect(Object.keys(metaTsconfig).sort()).toEqual(['extends', 'include'])
    expect(metaTsconfig).not.toHaveProperty('compilerOptions')
  })

  it('inherits from the app project', () => {
    expect(metaTsconfig.extends).toBe('./tsconfig.json')
  })

  it('includes `meta`', () => {
    expect(metaTsconfig.include).toContain('meta')
  })

  it('includes `src/common/typedefs/*.d.ts`, and as a GLOB not a directory', () => {
    // Both halves of this entry are MEASURED, not stylistic:
    //
    //  - Without it, the program drops the repo's ambient module
    //    declarations and meta/ code importing an untyped package fails with
    //    a FABRICATED `TS7016: Could not find a declaration file for module
    //    'js-yaml'` (meta/__tests__/ciTriggerWiring.test.ts) -- an artefact
    //    of the config, not a defect in the source.
    //
    //  - As the bare directory `src/common/typedefs`, the program also picks
    //    up that directory's two NON-declaration files, and
    //    `extra-mock-function.ts` augments `backend/config`, which is not in
    //    this program -- yielding a fabricated `TS2664: Invalid module name
    //    in augmentation`.
    //
    // Either variant produces 13 errors where the correct config produces 12.
    // 13 is the named negative signal that the CONFIG is wrong.
    expect(metaTsconfig.include).toContain('src/common/typedefs/*.d.ts')
    expect(metaTsconfig.include).not.toContain('src/common/typedefs')
  })
})

describe('the meta project is actually wired into the gate', () => {
  const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8')) as {
    scripts: Record<string, string>
  }
  const codecheck = packageJson.scripts.codecheck

  it('`codecheck` still runs the app project', () => {
    expect(codecheck).toMatch(/tsc --noEmit/)
  })

  it('`codecheck` also runs the meta project', () => {
    // `.husky/pre-push:2` and `.github/workflows/codecheck.yml:26` both call
    // `pnpm codecheck`, so wiring the SCRIPT is what reaches CI and pre-push;
    // there is no YAML or husky edit to keep in sync. `.vscode/tasks.json:38`
    // reaches it the same way.
    expect(codecheck).toMatch(/tsc -p tsconfig\.meta\.json --noEmit/)
  })
})
