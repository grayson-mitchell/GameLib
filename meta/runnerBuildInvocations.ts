/**
 * F-34.16-D gap closure (34.16-08 Task 1) -- Layer 1 of two: the checked-in
 * per-runner extraction-contract record. For each of the three
 * `ONEDIR_RUNNERS` (legendary, gogdl, nile) this records the exact upstream
 * `run:` value `meta/buildRunnersOnedir.ts`'s `extractUpstreamPyinstallerCommand`
 * found at the pinned tag, the workflow file it came from, its
 * `working-directory:` sibling (or null), and the recognised invocation
 * `form`.
 *
 * Why this exists: commit `0034ad265` (2026-08-22) bumped legendary to
 * 0.21.0 and nothing verified that the bumped version's upstream Build step
 * still satisfied the extractor -- it had silently migrated from a bare
 * `pyinstaller` invocation to `uv run --module PyInstaller`. The break
 * surfaced three days later, in CI, on the first-ever execution of that
 * build path (34.16-LIVE-GATE.md), costing a whole live-gate attempt. This
 * record makes the NEXT such migration loud on the bump commit itself.
 *
 * WHAT THIS LAYER DETECTS:
 *   - a `meta/releaseTags.ts` bump for legendary/gogdl/nile whose recorded
 *     invocation here was not re-captured to match (Test 1: tag coupling --
 *     each recorded `tag` is asserted equal to `RELEASE_TAGS[runner]`).
 *   - a recorded invocation the REAL widened extractor or the REAL onedir
 *     derivation cannot handle (Test 2: extractor round-trip; Test 3:
 *     derivation round-trip).
 *   - a runner added to or removed from `ONEDIR_RUNNERS` without a matching
 *     record update (Test 4: key-set equality). A record that silently
 *     omits a runner is a blind spot shaped exactly like the one this plan
 *     exists to remove.
 *
 * WHAT THIS LAYER CANNOT DETECT:
 *   - upstream force-moving an already-pinned tag (same tag, different
 *     workflow content) -- this layer never touches the network. That is
 *     `meta/checkRunnerInvocations.ts`'s (Layer 2's) whole job.
 *   - any upstream change that does not move `RELEASE_TAGS` at all.
 *
 * DETECTION LATENCY: the very commit that edits `meta/releaseTags.ts`, at
 * that commit's own `pnpm jest --selectProjects Meta` run. Applied to the
 * real history: commit `0034ad265` (2026-08-22, "feat(runners): bump
 * legendary 0.21.0, gogdl 1.3.0, nile 1.2.0") could not have been made green
 * without either re-capturing legendary's new "uv run --module PyInstaller"
 * value here, or this record's Test 2/Test 3 rejecting it -- days before CI
 * actually found the break.
 *
 * DELIBERATE BOUNDED CIRCULARITY: Test 2 builds its fixture FROM this
 * record (a temp `.github/workflows/` tree assembled out of `runValue` +
 * `workingDirectory`), so it proves the recorded shape is machine-acceptable
 * to the real extractor -- NOT that it still matches live upstream. Closing
 * that second gap is `meta/checkRunnerInvocations.ts`'s (Layer 2's) whole
 * job: `pnpm check:runner-invocations` re-derives from live upstream and
 * refuses to agree with a recorded value that no longer matches.
 *
 * Populated by MEASUREMENT, not transcription: for each runner, the repo
 * slug (`ONEDIR_RUNNERS[runner].repo`) and tag (`RELEASE_TAGS[runner]`) were
 * used to list and fetch `.github/workflows/*.yml` at that tag via
 * `gh api "repos/<slug>/contents/.github/workflows?ref=<tag>"`, and the
 * fetched text was run through the REAL widened
 * `extractUpstreamPyinstallerCommand` -- the extractor's OWN output was
 * pasted below, never hand-typed. See `34.16-08-SUMMARY.md` for the exact
 * capture commands and their output per runner.
 */

import type { InvocationForm, OnedirRunnerName } from './buildRunnersOnedir'

export interface RecordedInvocation {
  // The tag this invocation was captured at. Asserted equal to
  // RELEASE_TAGS[runner] by Test 1 -- a literal so that assertion is a real
  // comparison, never a tautology against the same import.
  tag: string
  // The upstream workflow file this run: value was read from, relative to
  // .github/workflows/.
  workflowFile: string
  // The verbatim folded run: value, exactly as
  // extractUpstreamPyinstallerCommand's own `command` field returned it.
  runValue: string
  // The step's own working-directory: sibling, or null when the step
  // declares none (GitHub Actions' own default: repo root).
  workingDirectory: string | null
  form: InvocationForm
}

export const RECORDED_RUNNER_INVOCATIONS: Record<
  OnedirRunnerName,
  RecordedInvocation
> = {
  legendary: {
    tag: '0.21.0',
    workflowFile: 'build-base.yml',
    runValue:
      'uv run --module PyInstaller --onefile --name legendary ${{ steps.strip.outputs.option }} -i ../assets/windows_icon.ico cli.py',
    workingDirectory: 'legendary',
    form: 'uv-run-module'
  },
  gogdl: {
    tag: 'v1.3.0',
    workflowFile: 'build.yaml',
    runValue:
      'pyinstaller --onefile --name gogdl ${{ steps.strip.outputs.option }} gogdl/cli.py',
    workingDirectory: null,
    form: 'bare'
  },
  nile: {
    tag: 'v1.2.0',
    workflowFile: 'build.yaml',
    runValue:
      'pyinstaller --onefile --name nile ${{ steps.strip.outputs.option }} nile/cli.py',
    workingDirectory: null,
    form: 'bare'
  }
}
