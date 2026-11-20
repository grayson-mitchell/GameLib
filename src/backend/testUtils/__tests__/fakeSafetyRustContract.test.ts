/**
 * The trust-root contract, TS side: every row of the shared fixture answers through
 * `fakeSafetyRustInvoke`. Its crate twin is
 * src-tauri/crates/gamelib-safety/tests/trust_root_contract.rs, which runs the same rows against
 * the real crate. Both sides carry a floor, so a change to either trust-root implementation turns
 * one of the two red, and the CR-01 class (a fake answering yes to what the crate refuses) cannot
 * hide again.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import type {
  SafetyReply,
  SafetyRequest,
  SafetyTargetKind
} from 'common/types/safety'
import { RUST_SAFETY_CHECK_REMOVAL } from 'common/types/sidecarTransport'
import { assertAtOrAboveFloor } from '../censusFloor'
import { fakeSafetyRustInvoke } from '../fakeSafetyRust'

const TRUST_ROOT_CONTRACT_FLOOR = 12

interface ContractRow {
  name: string
  kind: SafetyTargetKind
  dirs?: string[][]
  files?: string[][]
  target: string[]
  /** A segment array is joined onto the test dir; a string is used verbatim. */
  trustRoot: string[] | string
  protectedRoots?: string[][]
  expect: { verdict: string; reason: string; absent: boolean }
}

const FIXTURE = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'src-tauri',
  'crates',
  'gamelib-safety',
  'tests',
  'fixtures',
  'trust-root-contract.json'
)

const rows: ContractRow[] = (
  JSON.parse(readFileSync(FIXTURE, 'utf-8')) as { rows: ContractRow[] }
).rows

describe('fakeSafetyRustInvoke answers the shared trust-root contract', () => {
  let dir = ''
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = ''
  })

  it('the contract has at least the floor of rows', () => {
    assertAtOrAboveFloor(
      'trustRootContract',
      rows.length,
      TRUST_ROOT_CONTRACT_FLOOR
    )
    expect(() =>
      assertAtOrAboveFloor('trustRootContract', 0, TRUST_ROOT_CONTRACT_FLOOR)
    ).toThrow(/below the floor/)
  })

  it.each(rows.map((r) => [r.name, r] as const))('%s', async (_name, row) => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-fakesafety-contract-'))
    const at = (segs: string[]): string => join(dir, ...segs)
    for (const d of row.dirs ?? []) mkdirSync(at(d), { recursive: true })
    for (const f of row.files ?? []) {
      mkdirSync(dirname(at(f)), { recursive: true })
      writeFileSync(at(f), 'x')
    }
    const req: SafetyRequest = {
      targets: [
        {
          id: 't',
          path: at(row.target),
          kind: row.kind,
          trustRoot:
            typeof row.trustRoot === 'string'
              ? row.trustRoot
              : at(row.trustRoot)
        }
      ],
      knownInstalls: [],
      protectedRoots: (row.protectedRoots ?? []).map(at)
    }
    const reply = (await fakeSafetyRustInvoke().requestRustInvoke(
      RUST_SAFETY_CHECK_REMOVAL,
      [req]
    )) as SafetyReply
    const item = reply.items[0]
    expect({ verdict: item?.verdict, reason: item?.reason }).toEqual({
      verdict: row.expect.verdict,
      reason: row.expect.reason
    })
    if (row.expect.verdict === 'yes') {
      expect(item?.absent).toBe(row.expect.absent)
    }
  })
})
