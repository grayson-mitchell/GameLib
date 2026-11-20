import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { checkRemoval, guardedRemoveTree } from 'backend/safety/rustSafety'
import type { SafetyRequest } from 'common/types/safety'
import {
  RUST_SAFETY_CHECK_REMOVAL,
  RUST_SAFETY_REMOVE_TREE,
  RUST_STEAMPOLL_STATUS
} from 'common/types/sidecarTransport'
import { fakeSafetyRustInvoke } from '../fakeSafetyRust'

describe('fakeSafetyRustInvoke', () => {
  const root = mkdtempSync(join(tmpdir(), 'gamelib-fakesafety-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  const game = (name: string): string => {
    const dir = join(root, name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'a.bin'), 'a')
    return dir
  }
  const request = (path: string): SafetyRequest => ({
    targets: [{ id: 't', path, kind: 'game-install', trustRoot: root }],
    knownInstalls: [],
    protectedRoots: []
  })

  it('a yes verdict removes the tmp files and records both calls', async () => {
    const dir = game('yes')
    const fake = fakeSafetyRustInvoke()
    const out = await guardedRemoveTree(
      { requestRustInvoke: fake.requestRustInvoke },
      request(dir)
    )
    expect(out.outcome).toBe('removed')
    expect(existsSync(dir)).toBe(false)
    expect(fake.calls.map((c) => c.channel)).toEqual([
      RUST_SAFETY_CHECK_REMOVAL,
      RUST_SAFETY_REMOVE_TREE
    ])
  })

  it.each(['no', 'unknown'] as const)(
    'a %s verdict never deletes and the remove channel is never asked',
    async (checkVerdict) => {
      const dir = game(`verdict-${checkVerdict}`)
      const fake = fakeSafetyRustInvoke({ checkVerdict })
      const out = await guardedRemoveTree(
        { requestRustInvoke: fake.requestRustInvoke },
        request(dir)
      )
      expect(out.outcome).toBe('refused')
      expect(existsSync(join(dir, 'a.bin'))).toBe(true)
      expect(fake.calls.map((c) => c.channel)).toEqual([
        RUST_SAFETY_CHECK_REMOVAL
      ])
    }
  )

  it('a no verdict asked to remove directly still deletes nothing', async () => {
    const dir = game('direct-no')
    const fake = fakeSafetyRustInvoke({ checkVerdict: 'no' })
    const reply = (await fake.requestRustInvoke(RUST_SAFETY_REMOVE_TREE, [
      request(dir)
    ])) as { outcome: string }
    expect(reply.outcome).toBe('refused')
    expect(existsSync(dir)).toBe(true)
  })

  it('a target outside its trust root is refused with outside-trust-root and deletes nothing', async () => {
    const dir = game('outside-root')
    const other = join(root, 'other-root')
    mkdirSync(other, { recursive: true })
    const fake = fakeSafetyRustInvoke()
    const req: SafetyRequest = {
      targets: [{ id: 't', path: dir, kind: 'game-install', trustRoot: other }],
      knownInstalls: [],
      protectedRoots: []
    }
    const reply = (await fake.requestRustInvoke(RUST_SAFETY_REMOVE_TREE, [
      req
    ])) as { outcome: string; items: { reason: string }[] }
    expect(reply.outcome).toBe('refused')
    expect(reply.items[0]?.reason).toBe('outside-trust-root')
    expect(existsSync(join(dir, 'a.bin'))).toBe(true)
  })

  it('a target with no trustRoot still gets the configured verdict', async () => {
    const fake = fakeSafetyRustInvoke({
      checkVerdict: 'no',
      reason: 'is-protected-root'
    })
    const req: SafetyRequest = {
      targets: [{ id: 't', path: game('no-root'), kind: 'game-install' }],
      knownInstalls: [],
      protectedRoots: []
    }
    const out = await checkRemoval(
      { requestRustInvoke: fake.requestRustInvoke },
      req
    )
    expect(out.items[0]?.reason).toBe('is-protected-root')
  })

  it('reads an absent path as absent', async () => {
    const fake = fakeSafetyRustInvoke()
    const out = await checkRemoval(
      { requestRustInvoke: fake.requestRustInvoke },
      request(join(root, 'never-existed'))
    )
    expect(out.overall).toBe('yes')
    expect(out.items[0]?.absent).toBe(true)
  })

  it('honours the configured reason', async () => {
    const fake = fakeSafetyRustInvoke({
      checkVerdict: 'no',
      reason: 'is-protected-root'
    })
    const out = await checkRemoval(
      { requestRustInvoke: fake.requestRustInvoke },
      request(game('reason'))
    )
    expect(out.items[0]?.reason).toBe('is-protected-root')
  })

  it('rejectCheck makes the adapter read unknown', async () => {
    const fake = fakeSafetyRustInvoke({ rejectCheck: true })
    const out = await checkRemoval(
      { requestRustInvoke: fake.requestRustInvoke },
      request(game('rej-check'))
    )
    expect(out.overall).toBe('unknown')
    expect(out.items[0]?.reason).toBe('rust-invoke-failed')
  })

  it('rejectRemove leaves the files and the adapter reads failed', async () => {
    const dir = game('rej-remove')
    const fake = fakeSafetyRustInvoke({ rejectRemove: true })
    const out = await guardedRemoveTree(
      { requestRustInvoke: fake.requestRustInvoke },
      request(dir)
    )
    expect(out.outcome).toBe('failed')
    expect(existsSync(join(dir, 'a.bin'))).toBe(true)
  })

  it('malformed replies read as bad-reply and delete nothing', async () => {
    const dir = game('malformed')
    const fake = fakeSafetyRustInvoke({ malformed: true })
    const out = await guardedRemoveTree(
      { requestRustInvoke: fake.requestRustInvoke },
      request(dir)
    )
    expect(out.outcome).toBe('refused')
    expect(out.reason).toBe('bad-reply')
    expect(existsSync(join(dir, 'a.bin'))).toBe(true)
  })

  it('delegates other channels to base, and rejects them without one', async () => {
    const withBase = fakeSafetyRustInvoke({
      base: () => Promise.resolve('from-base')
    })
    await expect(
      withBase.requestRustInvoke(RUST_STEAMPOLL_STATUS, [] as never)
    ).resolves.toBe('from-base')
    const bare = fakeSafetyRustInvoke()
    await expect(
      bare.requestRustInvoke(RUST_STEAMPOLL_STATUS, [] as never)
    ).rejects.toThrow(/unexpected channel/)
    expect(bare.calls).toHaveLength(1)
  })

  it('refuses to delete a path outside the OS temp dir, even on a yes verdict', () => {
    const fake = fakeSafetyRustInvoke()
    // The repo's own src folder exists, so the fake reaches its delete and must refuse it.
    const srcDir = join(process.cwd(), 'src')
    expect(existsSync(srcDir)).toBe(true)
    // The trust root is the repo itself, so the trust-root model passes and the temp-dir
    // confinement is what stops the delete.
    const req: SafetyRequest = {
      ...request(srcDir),
      targets: [
        {
          id: 't',
          path: srcDir,
          kind: 'game-install',
          trustRoot: process.cwd()
        }
      ]
    }
    expect(() =>
      fake.requestRustInvoke(RUST_SAFETY_REMOVE_TREE, [req])
    ).toThrow(/outside the OS temp dir/)
    expect(existsSync(srcDir)).toBe(true)
  })
})
