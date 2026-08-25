/**
 * F-34.16-D gap closure (34.16-08 Task 2) -- Layer 2 of two: the networked
 * tripwire. `pnpm check:runner-invocations` re-derives each pinned runner's
 * (legendary/gogdl/nile) upstream pyinstaller invocation from LIVE GitHub at
 * the pinned `RELEASE_TAGS` tag and refuses to agree with
 * `meta/runnerBuildInvocations.ts`'s `RECORDED_RUNNER_INVOCATIONS` when they
 * disagree.
 *
 * WHAT THIS LAYER DETECTS: upstream force-moving an already-pinned tag (same
 * tag string, different `.github/workflows` content) -- the one blind spot
 * `meta/runnerBuildInvocations.ts`'s (Layer 1's) own header names as out of
 * its reach, because Layer 1 never touches the network. It also catches a
 * recorded invocation that has simply gone stale for any other reason, by
 * re-running the same real `extractUpstreamPyinstallerCommand` Layer 1 uses,
 * against live text instead of a fixture built from the record itself.
 *
 * LATENCY: ONLY WHEN INVOKED. This script is wired to no workflow,
 * deliberately -- `34.16-LIVE-GATE.md` §12 criterion 5 scores REQ-34.16-02
 * by asserting that `build-base.yml`, `.github/actions/install-deps/action.yml`,
 * `build-main.yml` and `build-prs.yml` are unchanged across this phase, and
 * `build-runners-onedir-macos.yml`'s sha256 is live-gate Precondition 6.
 * Adding a step to any of those would fail a scored item, so wiring this
 * into a scheduled or release workflow is a follow-up to RECORD, not to do
 * in this plan. A tripwire nobody runs detects nothing: Layer 1 (the jest
 * suite in `meta/__tests__/runnerBuildInvocations.test.ts`) is the automatic
 * one; this is the manual, ground-truth one, run on demand
 * (`pnpm check:runner-invocations`).
 *
 * READ-ONLY BY CONSTRUCTION: this script only compares. It never writes
 * `meta/runnerBuildInvocations.ts`, never writes anything under
 * `public/bin`, `meta/`, or `.build-tools/`, and offers no `--fix`/`--write`
 * mode -- every `writeFileSync`/`rmSync` call in this file targets a path
 * under `os.tmpdir()`, nowhere else. Its whole value is that it can only
 * disagree, never silently re-baseline (T-34.16G-08).
 *
 * INPUTS ARE MODULE CONSTANTS, NEVER argv/env: the repo slug and tag for
 * each runner come from `ONEDIR_RUNNERS` (which itself reads
 * `RELEASE_TAGS`) -- never from a CLI argument, never from an environment
 * variable (T-34.16G-06). `GH_TOKEN`/`GITHUB_TOKEN`, if present, are read
 * ONLY to raise the anonymous GitHub REST API rate limit via an
 * `Authorization` header; the check still works without one, the token
 * value is never printed, and it never appears in an error message.
 *
 * RESIDUAL (T-34.16G-07, accepted): a spoofed/MITM'd response could in
 * principle produce a false agreement. This script is early warning, not an
 * authentication mechanism -- a false agreement grants no privilege,
 * because the real build re-clones and re-extracts from the same pinned tag
 * at build time. Do not over-trust a green run of this script as proof
 * upstream cannot have changed since it ran.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  ONEDIR_RUNNERS,
  extractUpstreamPyinstallerCommand,
  type OnedirRunnerName
} from './buildRunnersOnedir'
import { RECORDED_RUNNER_INVOCATIONS } from './runnerBuildInvocations'

const GITHUB_API_BASE = 'https://api.github.com'

// Never printed, never placed in an error message -- read purely to raise
// the anonymous GitHub API rate limit (T-34.16G-09).
function authHeaders(): Record<string, string> {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  const headers: Record<string, string> = {
    'User-Agent': 'HeroicBinaryUpdater/1.0',
    Accept: 'application/vnd.github+json'
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

interface ContentsEntry {
  name: string
  download_url: string | null
  type: string
}

// Over https only -- both the GitHub REST Contents API and every
// download_url it returns (raw.githubusercontent.com) are https.
async function listWorkflowFiles(
  repo: string,
  tag: string
): Promise<ContentsEntry[]> {
  const url = `${GITHUB_API_BASE}/repos/${repo}/contents/.github/workflows?ref=${encodeURIComponent(tag)}`
  const response = await fetch(url, { headers: authHeaders() })
  if (response.status !== 200) {
    throw new Error(
      `checkRunnerInvocations: failed to list ".github/workflows" for ` +
        `${repo}@${tag}: HTTP ${response.status} from ${url}`
    )
  }
  const entries = (await response.json()) as ContentsEntry[]
  return entries.filter(
    (entry) =>
      entry.type === 'file' &&
      (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml'))
  )
}

async function fetchFileText(
  entry: ContentsEntry,
  repo: string,
  tag: string
): Promise<string> {
  if (!entry.download_url) {
    throw new Error(
      `checkRunnerInvocations: ${repo}@${tag}'s workflow file ` +
        `"${entry.name}" has no download_url in the GitHub API response`
    )
  }
  const response = await fetch(entry.download_url, { headers: authHeaders() })
  if (response.status !== 200) {
    throw new Error(
      `checkRunnerInvocations: failed to fetch ${repo}@${tag}'s ` +
        `"${entry.name}": HTTP ${response.status}`
    )
  }
  return response.text()
}

interface RunnerCheckResult {
  runner: OnedirRunnerName
  ok: boolean
  message: string
}

// Fetches every *.yml/*.yaml workflow file for one runner at its pinned tag
// into a throwaway temp dir, re-derives its invocation with the SAME real
// extractUpstreamPyinstallerCommand meta/buildRunnersOnedir.ts uses, and
// compares it against RECORDED_RUNNER_INVOCATIONS[runner]. Never throws --
// every failure mode (fetch failure, extraction throw, or a field mismatch)
// is captured into the returned result so main() can report all three
// runners in one run rather than stopping at the first.
async function checkRunner(
  runner: OnedirRunnerName
): Promise<RunnerCheckResult> {
  const { repo, tag } = ONEDIR_RUNNERS[runner]
  const recorded = RECORDED_RUNNER_INVOCATIONS[runner]

  let tempDir: string | undefined
  try {
    const files = await listWorkflowFiles(repo, tag)
    tempDir = mkdtempSync(join(tmpdir(), `check-runner-invocations-${runner}-`))
    const workflowsDir = join(tempDir, '.github', 'workflows')
    mkdirSync(workflowsDir, { recursive: true })
    for (const entry of files) {
      const text = await fetchFileText(entry, repo, tag)
      writeFileSync(join(workflowsDir, entry.name), text)
    }

    const live = extractUpstreamPyinstallerCommand(tempDir)
    const liveWorkingDirectory = live.workingDirectory ?? null

    const comparison =
      `  recorded: command="${recorded.runValue}" ` +
      `workingDirectory=${JSON.stringify(recorded.workingDirectory)} ` +
      `form="${recorded.form}"\n` +
      `  live:     command="${live.command}" ` +
      `workingDirectory=${JSON.stringify(liveWorkingDirectory)} ` +
      `form="${live.form}"`

    const agrees =
      live.command === recorded.runValue &&
      liveWorkingDirectory === recorded.workingDirectory &&
      live.form === recorded.form

    if (!agrees) {
      return {
        runner,
        ok: false,
        message: `MISMATCH "${runner}" (${repo}@${tag}):\n${comparison}`
      }
    }

    return {
      runner,
      ok: true,
      message: `OK "${runner}" (${repo}@${tag}):\n${comparison}`
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return {
      runner,
      ok: false,
      message: `FAILED "${runner}" (${repo}@${tag}): ${reason}`
    }
  } finally {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  }
}

export async function main(): Promise<void> {
  const runners = Object.keys(ONEDIR_RUNNERS) as OnedirRunnerName[]
  const results: RunnerCheckResult[] = []
  for (const runner of runners) {
    results.push(await checkRunner(runner))
  }

  for (const result of results) {
    console.log(result.message)
  }

  const failed = results.filter((result) => !result.ok)
  if (failed.length > 0) {
    console.error(
      `\ncheckRunnerInvocations: ${failed.length} of ${results.length} ` +
        `runner(s) disagree with live upstream: ` +
        failed.map((result) => result.runner).join(', ')
    )
    process.exitCode = 1
  } else {
    console.log(
      `\ncheckRunnerInvocations: all ${results.length} runner(s) agree ` +
        `with live upstream.`
    )
  }
}

// Guard main() so importing this module (e.g. from its jest suite) never
// performs any network I/O. Mirrors meta/pinRunnerDigests.ts's idiom (NOT
// meta/buildRunnersOnedir.ts's variant, which ANDs in an extra `--arch=`
// argv check that exists only to defuse a co-bundling collision this script
// does not have -- this script's own invocation, `pnpm check:runner-invocations`,
// never supplies `--arch=`, so buildRunnersOnedir.ts's own bottom guard,
// co-bundled in by the `extractUpstreamPyinstallerCommand`/`ONEDIR_RUNNERS`
// import, stays inert here regardless): `JEST_WORKER_ID` (set by Jest for
// every worker) reliably distinguishes "imported under test" from "run as a
// CLI".
if (!process.env.JEST_WORKER_ID) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
