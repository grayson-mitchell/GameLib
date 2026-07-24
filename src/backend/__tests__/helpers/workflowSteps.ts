/**
 * Shared helpers for asserting on -- and EXECUTING -- GitHub Actions workflow
 * steps.
 *
 * 34-REVIEW.md (gap cycle 2) WR-04/WR-05 found that this phase's workflow
 * tests asserted only on string shape against the UNSTRIPPED file, so a step
 * comment describing a behavior could satisfy a test of that behavior, and no
 * test ever executed a step. These helpers exist so a test can extract a
 * step's literal `run:` body and run it the way GitHub does, against a
 * synthetic working directory with stubbed CLIs.
 *
 * Every helper FAILS LOUDLY (throws) rather than returning an empty/default
 * value when it cannot find what it was asked for -- a silently-empty script
 * would make its caller's assertions vacuous, which is the exact defect class
 * this module was created to fix.
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Drops lines whose first non-whitespace character is `#`, so a workflow's own
 * explanatory prose can neither satisfy nor invalidate an assertion made
 * against its actual instructions.
 */
export function stripHashComments(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n')
}

/**
 * Extracts a step's literal `run: |` block body, dedented, so a test can
 * execute the workflow's real shell instructions instead of pattern-matching
 * their text.
 */
export function extractRunBlock(workflow: string, stepName: string): string {
  const lines = workflow.split('\n')
  const stepIndex = lines.findIndex(
    (line) => line.trim() === `- name: ${stepName}`
  )
  if (stepIndex < 0) {
    throw new Error(`workflow has no step named "${stepName}"`)
  }

  const runIndex = lines.findIndex(
    (line, index) => index > stepIndex && line.trim() === 'run: |'
  )
  if (runIndex < 0) {
    throw new Error(`step "${stepName}" has no multi-line run: | block`)
  }
  // Guard against matching a LATER step's run block if this step has none.
  const nextStepIndex = lines.findIndex(
    (line, index) => index > stepIndex && line.trim().startsWith('- name: ')
  )
  if (nextStepIndex >= 0 && runIndex > nextStepIndex) {
    throw new Error(`step "${stepName}" has no multi-line run: | block`)
  }

  const runIndent = lines[runIndex].length - lines[runIndex].trimStart().length
  const body: string[] = []
  for (let index = runIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') {
      body.push('')
      continue
    }
    const indent = line.length - line.trimStart().length
    if (indent <= runIndent) {
      break
    }
    body.push(line.slice(runIndent + 2))
  }
  if (body.join('').trim().length === 0) {
    throw new Error(`step "${stepName}" has an empty run block`)
  }
  return body.join('\n')
}

/**
 * Substitutes the `${{ ... }}` GitHub expressions a run block embeds so the
 * remaining text is executable bash. Throws if any `${{ ... }}` survives -- an
 * unsubstituted expression would otherwise be executed as literal text and
 * make the caller's assertions vacuous.
 */
export function substituteExpressions(
  script: string,
  values: Record<string, string>
): string {
  let result = script
  for (const [expression, value] of Object.entries(values)) {
    result = result.split(`\${{ ${expression} }}`).join(value)
  }
  if (result.includes('${{')) {
    throw new Error(
      `unsubstituted GitHub expression left in the extracted run block: ` +
        `${result.slice(result.indexOf('${{'), result.indexOf('${{') + 60)}`
    )
  }
  return result
}

export interface StepRunResult {
  status: number | null
  stdout: string
  stderr: string
}

/**
 * Runs an extracted run block exactly the way GitHub's `shell: bash` does
 * (`bash --noprofile --norc -eo pipefail {0}`), in a throwaway working
 * directory, so a failing guard inside the script surfaces as a non-zero
 * status here too.
 */
export function runStepScript(
  script: string,
  cwd: string,
  env: Record<string, string> = {}
): StepRunResult {
  const scriptPath = join(cwd, `step-${Math.random().toString(36).slice(2)}.sh`)
  writeFileSync(scriptPath, script)
  const result = spawnSync(
    'bash',
    ['--noprofile', '--norc', '-eo', 'pipefail', scriptPath],
    { cwd, env: { ...process.env, ...env }, encoding: 'utf-8' }
  )
  if (result.error) {
    throw result.error
  }
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  }
}

/**
 * Writes an executable stub onto a directory that callers put first on PATH,
 * so a workflow step's `gh` (or any other CLI) calls are observable and
 * scriptable without network access or credentials.
 */
export function writeStubExecutable(
  binDir: string,
  name: string,
  script: string
): void {
  const stubPath = join(binDir, name)
  writeFileSync(stubPath, script, { mode: 0o755 })
}
