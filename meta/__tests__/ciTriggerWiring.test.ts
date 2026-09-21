/**
 * Gates the WIRING of the push trigger added to the three quality workflows
 * (quick task 260922-avw). The finding this closes: nothing in
 * `.github/workflows/` fired on a push to `main` -- `main` went 226 commits
 * since the last `pull_request`-triggered run with no automatic evaluation,
 * and the only reason CI ran at all on 2026-09-21 was a hand dispatch.
 *
 * There is no way to execute a GitHub Actions workflow from jest, so the
 * honest thing is to pin the parsed trigger structure and say so, rather
 * than dress this up as a behavioural test that proves a push actually
 * schedules a run.
 */

import { load } from 'js-yaml'
import { readFileSync } from 'fs'
import { join } from 'path'

const REPO_ROOT = join(__dirname, '..', '..')
const WORKFLOW_NAMES = ['test.yml', 'lint.yml', 'codecheck.yml'] as const

interface ParsedWorkflow {
  name?: string
  on?: Record<string, unknown>
  concurrency?: { group?: unknown; 'cancel-in-progress'?: unknown }
  permissions?: { contents?: unknown }
  jobs?: unknown
}

function loadWorkflow(fileName: string): ParsedWorkflow {
  const path = join(REPO_ROOT, '.github', 'workflows', fileName)
  return load(readFileSync(path, 'utf-8')) as ParsedWorkflow
}

// Factored out so the near-miss arm below can prove it actually rejects
// something -- an assertion that never fails is not a pin.
function hasWiredPushTrigger(doc: ParsedWorkflow): boolean {
  const on = doc.on
  if (!on || typeof on !== 'object') return false
  const keys = Object.keys(on)
  if (!keys.includes('push')) return false
  if (!keys.includes('pull_request')) return false
  if (!keys.includes('workflow_dispatch')) return false
  const push = on.push as { branches?: unknown; 'paths-ignore'?: unknown }
  if (!push || typeof push !== 'object') return false
  if (!Array.isArray(push.branches) || !push.branches.includes('main'))
    return false
  if (!Array.isArray(push['paths-ignore']) || push['paths-ignore'].length === 0)
    return false
  const concurrency = doc.concurrency
  if (!concurrency || typeof concurrency !== 'object') return false
  if (concurrency['cancel-in-progress'] !== true) return false
  return true
}

describe.each(WORKFLOW_NAMES)('CI trigger wiring: %s', (fileName) => {
  const workflow = loadWorkflow(fileName)

  it('self-test: the workflow file is really being read and is the right one', () => {
    // A path typo would make every assertion below vacuous against an
    // undefined parse, so prove the file has the content we think it has.
    expect(typeof workflow.name).toBe('string')
    expect((workflow.name as string).length).toBeGreaterThan(0)
  })

  it('declares push on main (and stable)', () => {
    const on = workflow.on ?? {}
    expect(Object.keys(on)).toContain('push')
    const push = on.push as { branches?: unknown }
    expect(push.branches).toContain('main')
    expect(push.branches).toContain('stable')
  })

  it('push is filtered by a non-empty paths-ignore', () => {
    const on = workflow.on ?? {}
    const push = on.push as { 'paths-ignore'?: unknown }
    expect(Array.isArray(push['paths-ignore'])).toBe(true)
    expect((push['paths-ignore'] as unknown[]).length).toBeGreaterThan(0)
  })

  it('declares a top-level concurrency group with cancel-in-progress', () => {
    expect(workflow.concurrency).toBeDefined()
    expect(workflow.concurrency?.['cancel-in-progress']).toBe(true)
  })

  it('the old triggers survive -- pull_request and workflow_dispatch are not replaced', () => {
    const on = workflow.on ?? {}
    const keys = Object.keys(on)
    // workflow_dispatch: parses to `null` -- assert key presence, never
    // truthiness, or a future edit that deletes the trigger still passes.
    expect(keys).toContain('pull_request')
    expect(keys).toContain('workflow_dispatch')
  })

  it('pull_request stays unfiltered -- no paths-ignore under it', () => {
    const on = workflow.on ?? {}
    const pullRequest = (on.pull_request ?? {}) as Record<string, unknown>
    expect(Object.keys(pullRequest)).not.toContain('paths-ignore')
    expect(pullRequest.branches).toContain('main')
    expect(pullRequest.branches).toContain('stable')
  })

  it('permissions stay read-only -- the new push trigger gains no write scope', () => {
    expect(workflow.permissions?.contents).toBe('read')
  })

  it('the wiring predicate accepts this workflow as written', () => {
    expect(hasWiredPushTrigger(workflow)).toBe(true)
  })
})

describe('anti-vacuity: the wiring predicate rejects near-misses', () => {
  it('rejects an object carrying only a pull_request trigger', () => {
    expect(
      hasWiredPushTrigger({ on: { pull_request: { branches: ['main'] } } })
    ).toBe(false)
  })

  it('rejects an empty object', () => {
    expect(hasWiredPushTrigger({})).toBe(false)
  })

  it('rejects push without paths-ignore', () => {
    expect(
      hasWiredPushTrigger({
        on: {
          push: { branches: ['main'] },
          pull_request: { branches: ['main'] },
          workflow_dispatch: null
        },
        concurrency: { 'cancel-in-progress': true }
      })
    ).toBe(false)
  })

  it('rejects push without a wired concurrency block', () => {
    expect(
      hasWiredPushTrigger({
        on: {
          push: { branches: ['main'], 'paths-ignore': ['**.md'] },
          pull_request: { branches: ['main'] },
          workflow_dispatch: null
        }
      })
    ).toBe(false)
  })
})
