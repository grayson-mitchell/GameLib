import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import type {
  SafetyItem,
  SafetyRemoveReply,
  SafetyReply,
  SafetyRequest
} from 'common/types/safety'
import {
  RUST_SAFETY_CHECK_REMOVAL,
  RUST_SAFETY_REMOVE_TREE
} from 'common/types/sidecarTransport'
import {
  checkRemoval,
  firstBlockingItem,
  guardedRemoveTree,
  removeTree
} from '../rustSafety'

const req: SafetyRequest = {
  targets: [
    { id: 'a', path: '/g/a', kind: 'game-install', trustRoot: '/g' },
    { id: 'b', path: '/g/b', kind: 'game-install', trustRoot: '/g' }
  ],
  knownInstalls: [],
  protectedRoots: []
}

const item = (id: string, over: Partial<SafetyItem> = {}): SafetyItem => ({
  id,
  verdict: 'yes',
  reason: 'ok',
  isLink: false,
  absent: false,
  ...over
})

const yesReply: SafetyReply = {
  overall: 'yes',
  items: [item('a'), item('b')]
}

type Handler = (channel: string, args: unknown[]) => Promise<unknown>

function depsFor(handler: Handler): {
  deps: RustInvokeDeps
  channels: string[]
} {
  const channels: string[] = []
  return {
    channels,
    deps: {
      requestRustInvoke: (channel, args) => {
        channels.push(channel)
        return handler(channel, args as unknown[])
      }
    }
  }
}

describe('checkRemoval', () => {
  it('passes a well-formed yes reply through', async () => {
    const { deps, channels } = depsFor(async () => yesReply)
    expect(await checkRemoval(deps, req)).toEqual(yesReply)
    expect(channels).toEqual([RUST_SAFETY_CHECK_REMOVAL])
  })

  it('passes a no reply through with its reason and otherKey', async () => {
    const reply: SafetyReply = {
      overall: 'no',
      items: [
        item('a', {
          verdict: 'no',
          reason: 'nested-known-install',
          otherKey: 'steam:1'
        }),
        item('b')
      ]
    }
    const { deps } = depsFor(async () => reply)
    expect(await checkRemoval(deps, req)).toEqual(reply)
  })

  it('a rejected rustInvoke reads as unknown / rust-invoke-failed for every target', async () => {
    const { deps } = depsFor(() => Promise.reject(new Error('timed out')))
    const out = await checkRemoval(deps, req)
    expect(out.overall).toBe('unknown')
    expect(out.items.map((i) => [i.id, i.verdict, i.reason])).toEqual([
      ['a', 'unknown', 'rust-invoke-failed'],
      ['b', 'unknown', 'rust-invoke-failed']
    ])
  })

  it('a synchronous throw from the transport also reads as unknown', async () => {
    const { deps } = depsFor(() => {
      throw new Error('boom')
    })
    expect((await checkRemoval(deps, req)).overall).toBe('unknown')
  })

  it.each([
    ['missing items', { overall: 'yes' }],
    ['a non-object reply', 'yes'],
    ['null', null],
    [
      'an unknown reason string',
      {
        overall: 'no',
        items: [item('a', { reason: 'bogus' as never }), item('b')]
      }
    ],
    ['a wrong verdict', { overall: 'maybe', items: [item('a'), item('b')] }],
    [
      'an item verdict outside the set',
      {
        overall: 'yes',
        items: [item('a', { verdict: 'ok' as never }), item('b')]
      }
    ],
    ['too few items for the request', { overall: 'yes', items: [item('a')] }],
    [
      'items for the wrong ids',
      { overall: 'yes', items: [item('a'), item('zzz')] }
    ],
    [
      'an overall yes over a no item',
      { overall: 'yes', items: [item('a', { verdict: 'no' }), item('b')] }
    ]
  ])('a malformed reply (%s) reads as unknown / bad-reply', async (_n, raw) => {
    const { deps } = depsFor(async () => raw)
    const out = await checkRemoval(deps, req)
    expect(out.overall).toBe('unknown')
    expect(out.items.every((i) => i.reason === 'bad-reply')).toBe(true)
    expect(out.items).toHaveLength(2)
  })

  it('an adapter-only reason from the wire is not accepted as a Rust reason', async () => {
    const raw = {
      overall: 'unknown',
      items: [item('a', { verdict: 'unknown', reason: 'bad-reply' }), item('b')]
    }
    const { deps } = depsFor(async () => raw)
    const out = await checkRemoval(deps, req)
    expect(out.items.every((i) => i.reason === 'bad-reply')).toBe(true)
    expect(out.items.every((i) => i.verdict === 'unknown')).toBe(true)
  })
})

describe('removeTree', () => {
  const removed: SafetyRemoveReply = { ...yesReply, outcome: 'removed' }

  it('passes a removed reply through', async () => {
    const { deps, channels } = depsFor(async () => removed)
    expect(await removeTree(deps, req)).toEqual(removed)
    expect(channels).toEqual([RUST_SAFETY_REMOVE_TREE])
  })

  it('a rejection is outcome failed with unknown / rust-invoke-failed (effect unconfirmed)', async () => {
    const { deps } = depsFor(() => Promise.reject(new Error('gone')))
    const out = await removeTree(deps, req)
    expect(out.outcome).toBe('failed')
    expect(out.overall).toBe('unknown')
    expect(out.items.every((i) => i.reason === 'rust-invoke-failed')).toBe(true)
  })

  it.each([
    ['missing outcome', yesReply],
    ['an outcome outside the set', { ...yesReply, outcome: 'done' }],
    [
      'removed over a non-yes overall',
      {
        overall: 'no',
        items: [
          item('a', { verdict: 'no', reason: 'is-trust-root' }),
          item('b')
        ],
        outcome: 'removed'
      }
    ],
    ['refused over a yes overall', { ...yesReply, outcome: 'refused' }]
  ])(
    'a malformed reply (%s) is outcome failed / bad-reply',
    async (_n, raw) => {
      const { deps } = depsFor(async () => raw)
      const out = await removeTree(deps, req)
      expect(out.outcome).toBe('failed')
      expect(out.items.every((i) => i.reason === 'bad-reply')).toBe(true)
    }
  )
})

describe('firstBlockingItem', () => {
  it('returns the first non-yes item, else undefined', () => {
    const blocked = item('b', {
      verdict: 'unknown',
      reason: 'canonicalize-failed'
    })
    expect(
      firstBlockingItem({ overall: 'unknown', items: [item('a'), blocked] })
    ).toBe(blocked)
    expect(firstBlockingItem(yesReply)).toBeUndefined()
  })
})

describe('guardedRemoveTree', () => {
  it('never requests the remove channel when the check is not yes', async () => {
    const nested: SafetyReply = {
      overall: 'no',
      items: [
        item('a', {
          verdict: 'no',
          reason: 'nested-known-install',
          otherKey: 'gog:2'
        }),
        item('b')
      ]
    }
    const { deps, channels } = depsFor(async () => nested)
    const out = await guardedRemoveTree(deps, req)
    expect(out.outcome).toBe('refused')
    expect(out.reason).toBe('nested-known-install')
    expect(out.otherKey).toBe('gog:2')
    expect(channels).toEqual([RUST_SAFETY_CHECK_REMOVAL])
    expect(channels).not.toContain(RUST_SAFETY_REMOVE_TREE)
  })

  it('a failed check (rejection) refuses and never requests the remove channel', async () => {
    const { deps, channels } = depsFor(() => Promise.reject(new Error('x')))
    const out = await guardedRemoveTree(deps, req)
    expect(out.outcome).toBe('refused')
    expect(out.reason).toBe('rust-invoke-failed')
    expect(channels).toEqual([RUST_SAFETY_CHECK_REMOVAL])
  })

  it('removes after a yes check and reports removed', async () => {
    const { deps, channels } = depsFor(async (c) =>
      c === RUST_SAFETY_CHECK_REMOVAL
        ? yesReply
        : ({ ...yesReply, outcome: 'removed' } satisfies SafetyRemoveReply)
    )
    const out = await guardedRemoveTree(deps, req)
    expect(out.outcome).toBe('removed')
    expect(out.reason).toBeUndefined()
    expect(channels).toEqual([
      RUST_SAFETY_CHECK_REMOVAL,
      RUST_SAFETY_REMOVE_TREE
    ])
  })

  it('maps a delete that fails after a yes check to outcome failed with its reason', async () => {
    const failed: SafetyRemoveReply = {
      overall: 'no',
      items: [item('a', { verdict: 'no', reason: 'delete-failed' }), item('b')],
      outcome: 'failed'
    }
    const { deps } = depsFor(async (c) =>
      c === RUST_SAFETY_CHECK_REMOVAL ? yesReply : failed
    )
    const out = await guardedRemoveTree(deps, req)
    expect(out.outcome).toBe('failed')
    expect(out.reason).toBe('delete-failed')
  })

  it('a rejected remove after a yes check is outcome failed, not refused', async () => {
    const { deps } = depsFor((c) =>
      c === RUST_SAFETY_CHECK_REMOVAL
        ? Promise.resolve(yesReply)
        : Promise.reject(new Error('lost'))
    )
    const out = await guardedRemoveTree(deps, req)
    expect(out.outcome).toBe('failed')
    expect(out.reason).toBe('rust-invoke-failed')
  })
})
