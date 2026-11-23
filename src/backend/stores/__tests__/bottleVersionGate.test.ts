/**
 * Phase 85 (D-17): the sidecar's side of the bottle-file version gate. The Rust decision itself is
 * proven in `gamelib-store` (`version_gate`) and the shell (`store_gate_*`); this proves what the
 * sidecar does with the answer: it asks by path and chain, remembers it for the synchronous
 * writers, treats a gate it could not ask as unprimed (never as writable), and backs a file up
 * through Rust.
 */
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  BOTTLE_FILE_VERSION,
  SHARED_REDIST_LEDGER_CHAIN,
  backupBottleFile,
  createBottleVersionGate,
  gateAllowsWrite
} from '../bottleVersionGate'
import type { GateState } from '../bottleVersionGate'
import { createFakeBottleGateRust } from 'backend/testUtils/fakeBottleGateRust'
import type { RequestRustInvoke } from 'backend/host'

let root: string
let marker: string
let ledger: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gamelib-bottle-gate-'))
  marker = join(root, 'other-bottle-file.json')
  ledger = join(root, 'gamelib-shared-redists.json')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const reply =
  (value: unknown): RequestRustInvoke =>
  () =>
    Promise.resolve(value)

describe('createBottleVersionGate', () => {
  it('asks Rust by path and chain, and remembers each state the file can be in', async () => {
    const rust = createFakeBottleGateRust()
    const gate = createBottleVersionGate()
    expect(gate.state(marker)).toBeUndefined()

    expect(await gate.prime(rust, marker, SHARED_REDIST_LEDGER_CHAIN)).toBe(
      'absent'
    )
    expect(gate.state(marker)).toBe('absent')

    writeFileSync(marker, JSON.stringify({ version: 1, kind: 'pinned' }))
    expect(await gate.prime(rust, marker, SHARED_REDIST_LEDGER_CHAIN)).toBe(
      'ok'
    )

    writeFileSync(marker, JSON.stringify({ kind: 'pinned' }))
    expect(await gate.prime(rust, marker, SHARED_REDIST_LEDGER_CHAIN)).toBe(
      'ok'
    )

    writeFileSync(ledger, '{torn')
    expect(await gate.prime(rust, ledger, SHARED_REDIST_LEDGER_CHAIN)).toBe(
      'unreadable'
    )

    writeFileSync(marker, JSON.stringify({ version: 2, kind: 'pinned' }))
    expect(await gate.prime(rust, marker, SHARED_REDIST_LEDGER_CHAIN)).toBe(
      'newer'
    )
    expect(gate.state(marker)).toBe('newer')
    // One memo entry per path: the ledger's answer was not disturbed.
    expect(gate.state(ledger)).toBe('unreadable')

    expect(rust.calls.at(-1)).toEqual({
      channel: 'store_version_gate',
      args: [{ path: marker, chain: 'steam_bridge/shared-redists' }]
    })
    expect(rust.calls.at(-2)).toEqual({
      channel: 'store_version_gate',
      args: [{ path: ledger, chain: 'steam_bridge/shared-redists' }]
    })
  })

  it('asks again on every prime, so a file a newer build replaced since is noticed', async () => {
    const rust = createFakeBottleGateRust()
    const gate = createBottleVersionGate()
    writeFileSync(marker, JSON.stringify({ version: 1 }))
    expect(await gate.prime(rust, marker, SHARED_REDIST_LEDGER_CHAIN)).toBe(
      'ok'
    )
    writeFileSync(marker, JSON.stringify({ version: 3 }))
    expect(gate.state(marker)).toBe('ok')
    expect(await gate.prime(rust, marker, SHARED_REDIST_LEDGER_CHAIN)).toBe(
      'newer'
    )
    expect(rust.calls).toHaveLength(2)
  })

  it('treats a gate Rust cannot answer as unprimed and drops the old answer', async () => {
    const gate = createBottleVersionGate()
    writeFileSync(marker, JSON.stringify({ version: 1 }))
    const ok = createFakeBottleGateRust().requestRustInvoke
    expect(
      await gate.prime(
        { requestRustInvoke: ok },
        marker,
        SHARED_REDIST_LEDGER_CHAIN
      )
    ).toBe('ok')

    const rejecting = createFakeBottleGateRust({ rejectGate: true })
    expect(
      await gate.prime(rejecting, marker, SHARED_REDIST_LEDGER_CHAIN)
    ).toBeUndefined()
    expect(gate.state(marker)).toBeUndefined()
    expect(gateAllowsWrite(gate.state(marker))).toBe(false)
  })

  it.each([
    ['null', null],
    ['a string', 'ok'],
    ['an object with no state', { version: 1 }],
    ['an unknown state', { state: 'maybe' }],
    ['a numeric state', { state: 1 }]
  ])('treats %s from Rust as unprimed', async (_name, body) => {
    const gate = createBottleVersionGate()
    expect(
      await gate.prime(
        { requestRustInvoke: reply(body) },
        marker,
        SHARED_REDIST_LEDGER_CHAIN
      )
    ).toBeUndefined()
    expect(gate.state(marker)).toBeUndefined()
  })

  it('forget drops the memo for one path only', async () => {
    const rust = createFakeBottleGateRust({ answer: 'newer' })
    const gate = createBottleVersionGate()
    await gate.prime(rust, marker, SHARED_REDIST_LEDGER_CHAIN)
    await gate.prime(rust, ledger, SHARED_REDIST_LEDGER_CHAIN)
    gate.forget(marker)
    expect(gate.state(marker)).toBeUndefined()
    expect(gate.state(ledger)).toBe('newer')
  })

  it('keeps no state between gates: two boots never share an answer', async () => {
    const rust = createFakeBottleGateRust({ answer: 'newer' })
    const a = createBottleVersionGate()
    const b = createBottleVersionGate()
    await a.prime(rust, marker, SHARED_REDIST_LEDGER_CHAIN)
    expect(b.state(marker)).toBeUndefined()
  })
})

describe('gateAllowsWrite', () => {
  it.each<[GateState | undefined, boolean]>([
    ['absent', true],
    ['ok', true],
    // TS never marked an unparseable bottle file read-only.
    ['unreadable', true],
    ['newer', false],
    // Nobody asked: a possibly-newer file is never overwritten on a guess.
    [undefined, false]
  ])('%s -> %s', (state, allowed) => {
    expect(gateAllowsWrite(state)).toBe(allowed)
  })
})

describe('the constants the two consumers write with', () => {
  it('names the chain Rust knows and the baseline version the ledger is written at', () => {
    expect(SHARED_REDIST_LEDGER_CHAIN).toBe('steam_bridge/shared-redists')
    expect(BOTTLE_FILE_VERSION).toBe(1)
  })
})

describe('backupBottleFile', () => {
  it('has Rust back the file up by path and version, and resolves the new file name', async () => {
    const rust = createFakeBottleGateRust()
    writeFileSync(ledger, '{torn')
    const name = await backupBottleFile(rust, ledger, 0)
    expect(name).toMatch(/^gamelib-shared-redists\.v0\..+\.bak\.json$/)
    expect(rust.calls).toEqual([
      {
        channel: 'store_backup_file',
        args: [{ path: ledger, fromVersion: 0 }]
      }
    ])
    expect(readFileSync(join(root, name ?? ''), 'utf8')).toBe('{torn')
    // The ledger itself is not touched by the backup.
    expect(readFileSync(ledger, 'utf8')).toBe('{torn')
  })

  it('resolves null when the file is gone', async () => {
    const rust = createFakeBottleGateRust()
    expect(await backupBottleFile(rust, ledger, 1)).toBeNull()
    expect(readdirSync(root)).toEqual([])
  })

  it('rejects when Rust could not make the copy, so a caller can tell', async () => {
    writeFileSync(ledger, '{torn')
    await expect(
      backupBottleFile(
        createFakeBottleGateRust({ rejectBackup: true }),
        ledger,
        0
      )
    ).rejects.toThrow('rejected')
  })

  it('reads a reply that is not a file name as no backup', async () => {
    expect(
      await backupBottleFile(
        { requestRustInvoke: reply({ nope: true }) },
        ledger,
        0
      )
    ).toBeNull()
  })
})

describe('the fake answers as the crate does', () => {
  it.each<[string, string | undefined, GateState]>([
    ['no file', undefined, 'absent'],
    ['version 1', '{"version":1}', 'ok'],
    ['no version', '{"kind":"x"}', 'ok'],
    ['an invalid version', '{"version":"2"}', 'ok'],
    ['version 2', '{"version":2}', 'newer'],
    ['a torn file', '{torn', 'unreadable'],
    ['an array', '[1]', 'unreadable'],
    ['an empty file', '', 'unreadable']
  ])('%s is %s', async (_name, body, expected) => {
    if (body !== undefined) writeFileSync(marker, body)
    const state = await createBottleVersionGate().prime(
      createFakeBottleGateRust(),
      marker,
      SHARED_REDIST_LEDGER_CHAIN
    )
    expect(state).toBe(expected)
  })
})
