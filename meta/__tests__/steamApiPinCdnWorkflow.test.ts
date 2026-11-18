/**
 * Quick 261119-a23. Pins the parsed trigger structure of steam-api-pin-cdn.yml (a workflow cannot
 * be executed from jest, so this is wiring, not behaviour) and proves the workflow and the script
 * carry none of the pin values, which are read from steam_api_pin.rs at run time.
 */
import { load } from 'js-yaml'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/* eslint-disable @typescript-eslint/no-require-imports */
const { PIN_FILE, parsePin } = require('../steamApiPinCdnCheck.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

const REPO_ROOT = join(__dirname, '..', '..')
const WORKFLOW = '.github/workflows/steam-api-pin-cdn.yml'
const SCRIPT = 'meta/steamApiPinCdnCheck.cjs'

interface Trigger {
  paths?: string[]
}
interface ParsedWorkflow {
  name?: unknown
  on?: {
    schedule?: Array<{ cron?: unknown }>
    workflow_dispatch?: unknown
    push?: Trigger
    pull_request?: Trigger
  }
  permissions?: { contents?: unknown }
  jobs?: Record<string, { steps?: Array<{ run?: string }> }>
}

const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8')
const rawWorkflow = read(WORKFLOW)
const doc = load(rawWorkflow) as ParsedWorkflow

// Factored out so the near-miss arm proves it rejects something.
function pathsCoverPin(d: ParsedWorkflow): boolean {
  const lists = [d.on?.push?.paths, d.on?.pull_request?.paths]
  return lists.every(
    (l) =>
      Array.isArray(l) &&
      [PIN_FILE as string, SCRIPT, WORKFLOW].every((p) => l.includes(p))
  )
}

describe('steam-api-pin-cdn.yml wiring', () => {
  test('self-test: the right file is being read', () => {
    expect(typeof doc.name).toBe('string')
    expect((doc.name as string).length).toBeGreaterThan(0)
  })

  test('schedule and workflow_dispatch', () => {
    expect(typeof doc.on?.schedule?.[0]?.cron).toBe('string')
    expect(doc.on).toHaveProperty('workflow_dispatch')
  })

  test('push and pull_request paths cover the pin file, script and workflow', () => {
    expect(pathsCoverPin(doc)).toBe(true)
  })

  test('near-miss: paths lacking the pin file are rejected', () => {
    const copy = JSON.parse(JSON.stringify(doc)) as ParsedWorkflow
    copy.on!.pull_request!.paths = [SCRIPT, WORKFLOW]
    expect(pathsCoverPin(copy)).toBe(false)
  })

  test('every paths entry is a literal that exists on disk', () => {
    for (const p of [
      ...(doc.on?.push?.paths ?? []),
      ...(doc.on?.pull_request?.paths ?? [])
    ]) {
      expect(p).not.toContain('*')
      expect(existsSync(join(REPO_ROOT, p))).toBe(true)
    }
  })

  test('read-only token and no secrets', () => {
    expect(doc.permissions?.contents).toBe('read')
    expect(rawWorkflow).not.toContain('secrets.')
  })

  test('a step runs the pnpm script, which runs the checker', () => {
    const runs = Object.values(doc.jobs ?? {}).flatMap((j) =>
      (j.steps ?? []).map((s) => s.run ?? '')
    )
    expect(runs.some((r) => r.includes('pnpm check:steam-api-pin-cdn'))).toBe(
      true
    )
    const pkg = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts['check:steam-api-pin-cdn']).toBe(`node ${SCRIPT}`)
  })
})

describe('no copied pin literals', () => {
  const real = read(PIN_FILE)
  const pin = parsePin(real) as {
    package: string
    packageSize: number
    hosts: string[]
  }
  const grouped = String(pin.packageSize).replace(/\B(?=(\d{3})+(?!\d))/g, '_')
  const values = [pin.package, String(pin.packageSize), grouped, ...pin.hosts]

  test('self-test: the real pin file does contain each value', () => {
    for (const v of values) expect(real).toContain(v)
  })

  test.each([WORKFLOW, SCRIPT])('%s contains none of them', (rel) => {
    const text = read(rel)
    for (const v of values) expect(text).not.toContain(v)
  })
})
