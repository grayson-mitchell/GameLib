/**
 * The stale engine temp sweep is Rust-owned (87-48, D-17): the Rust shell starts it at boot as a bounded
 * task holding a shutdown registrant (`gamelib_engine::fallback::prune::spawn_engine_sweep`, started from
 * `engine_dispatch::install`), and the sidecar's boot no longer carries the step. Boot work has one owner
 * at every commit, so this file used to assert the sidecar called the sweep exactly once and now asserts
 * it does not call it at all.
 *
 * It boots nothing and carries no jest.mock: it reads source text, like bootSourceShape.test.ts.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const stripped = stripSourceComments(
  readFileSync(join(__dirname, '..', 'bootstrap.ts'), 'utf-8')
)

describe('the engine temp sweep has one owner, Rust (87-48, D-17)', () => {
  it('the sidecar boot has no engine temp sweep step', () => {
    const stepName = ['engine', 'temp', 'sweep'].join('-')
    expect(stripped).not.toContain(`'${stepName}'`)
  })

  it('the sidecar boot never calls sweepStaleEngineTemps', () => {
    expect(stripped).not.toContain('sweepStaleEngineTemps')
  })
})
