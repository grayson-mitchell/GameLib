/**
 * Phase 82 (FND-02): a jest-mock-free fake of the two safety rustInvoke channels, so a guard
 * site's test can drive `rustSafety.ts` end to end without the Rust shell and without spending
 * the jestMock ratchet (which has no headroom).
 *
 * `check` answers one item per target with the configured verdict (an absent path reads
 * `absent: true`). `remove` deletes the test's own tmp files when the verdict is `yes` and replies
 * `removed`; any other verdict deletes nothing and replies `refused`. Every other channel goes to
 * `base`, or rejects. All state lives in the returned closure.
 *
 * The delete is confined to the OS temp dir: a test that hands this fake a real path with a `yes`
 * verdict is a test bug, and it fails loudly instead of deleting it.
 */
import { existsSync, realpathSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { isAbsolute, relative, resolve } from 'path'
import type { RequestRustInvoke } from 'backend/host'
import type {
  SafetyItem,
  SafetyReason,
  SafetyRequest,
  SafetyVerdict
} from 'common/types/safety'
import {
  RUST_SAFETY_CHECK_REMOVAL,
  RUST_SAFETY_REMOVE_TREE
} from 'common/types/sidecarTransport'

export interface FakeSafetyOptions {
  /** Verdict for every target. Default `yes`. */
  checkVerdict?: SafetyVerdict
  /** Reason on a non-`yes` item. Default: `nested-known-install` for `no`, `canonicalize-failed` for `unknown`. */
  reason?: SafetyReason
  rejectCheck?: boolean
  rejectRemove?: boolean
  /** Both safety channels reply with a body that is not a reply. */
  malformed?: boolean
  /** Answers every channel that is not a safety channel. */
  base?: RequestRustInvoke
}

export interface FakeSafetyCall {
  channel: string
  args: unknown[]
}

function insideTmp(path: string): boolean {
  const roots = [tmpdir(), realpathSync(tmpdir())]
  return roots.some((root) => {
    const rel = relative(root, resolve(path))
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
  })
}

function foldVerdicts(items: SafetyItem[]): SafetyVerdict {
  let out: SafetyVerdict = 'yes'
  for (const { verdict } of items) {
    if (verdict === 'no') return 'no'
    if (verdict === 'unknown') out = 'unknown'
  }
  return out
}

export function fakeSafetyRustInvoke(options: FakeSafetyOptions = {}): {
  requestRustInvoke: RequestRustInvoke
  calls: FakeSafetyCall[]
} {
  const calls: FakeSafetyCall[] = []
  const verdict = options.checkVerdict ?? 'yes'
  const reasonFor = (): SafetyReason =>
    verdict === 'yes'
      ? 'ok'
      : (options.reason ??
        (verdict === 'no' ? 'nested-known-install' : 'canonicalize-failed'))

  const check = (req: SafetyRequest) => {
    const items: SafetyItem[] = req.targets.map((t) => ({
      id: t.id,
      verdict,
      reason: reasonFor(),
      isLink: false,
      absent: !existsSync(t.path)
    }))
    return { overall: foldVerdicts(items), items }
  }

  const requestRustInvoke: RequestRustInvoke = (channel, args) => {
    const list = args as unknown as unknown[]
    calls.push({ channel, args: list })
    if (
      channel !== RUST_SAFETY_CHECK_REMOVAL &&
      channel !== RUST_SAFETY_REMOVE_TREE
    ) {
      return options.base
        ? options.base(channel, args)
        : Promise.reject(
            new Error(`fakeSafetyRustInvoke: unexpected channel ${channel}`)
          )
    }
    const isCheck = channel === RUST_SAFETY_CHECK_REMOVAL
    if (isCheck ? options.rejectCheck : options.rejectRemove) {
      return Promise.reject(new Error(`fake rustInvoke rejected: ${channel}`))
    }
    if (options.malformed) return Promise.resolve({ not: 'a reply' })
    const req = list[0] as SafetyRequest
    const reply = check(req)
    if (isCheck) return Promise.resolve(reply)
    if (reply.overall !== 'yes') {
      return Promise.resolve({ ...reply, outcome: 'refused' })
    }
    for (const item of reply.items) {
      if (item.absent) continue
      const target = req.targets.find((t) => t.id === item.id)
      if (!target) continue
      if (!insideTmp(target.path)) {
        throw new Error(
          'fakeSafetyRustInvoke: refusing to delete a path outside the OS temp dir'
        )
      }
      rmSync(target.path, { recursive: true, force: true })
    }
    return Promise.resolve({ ...reply, outcome: 'removed' })
  }
  return { requestRustInvoke, calls }
}
