/**
 * Phase 82 (FND-02): a jest-mock-free fake of the two safety rustInvoke channels, so a guard
 * site's test can drive `rustSafety.ts` end to end without the Rust shell and without spending
 * the jestMock ratchet (which has no headroom).
 *
 * It models the crate's trust-root rule and target location (`absent`, `isLink`), and nothing
 * else of the crate's judgement. A target that carries a `trustRoot` is answered the way
 * `gamelib-safety` answers it: a root that does not exist is judged at its nearest existing
 * ancestor, equal to the root is `is-trust-root`, outside is `outside-trust-root`, an empty root
 * is `no-trust-root`, a relative one `not-absolute`, an unresolvable one `canonicalize-failed`.
 * That is pinned to the crate by the shared fixture
 * src-tauri/crates/gamelib-safety/tests/fixtures/trust-root-contract.json, which
 * `fakeSafetyRustContract.test.ts` runs here and the crate's `trust_root_contract.rs` runs there,
 * each with a floor. The lexical checks, protected roots, known installs, the may-skip rule for
 * an omitted trust root and prefix/sideload content are NOT modelled: those stay the configured
 * verdict. There is no option that turns the trust-root model off; a test whose request breaks
 * the model has found a request bug or a fixture bug.
 *
 * `check` answers one item per target. `remove` deletes the test's own tmp files when the overall
 * verdict is `yes` and replies `removed`; any other verdict deletes nothing and replies
 * `refused`. Every other channel goes to `base`, or rejects. All state lives in the returned
 * closure.
 *
 * The delete is confined to the OS temp dir: a test that hands this fake a real path with a `yes`
 * verdict is a test bug, and it fails loudly instead of deleting it.
 */
import { lstatSync, realpathSync, rmSync, statSync } from 'fs'
import { tmpdir } from 'os'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep
} from 'path'
import type { RequestRustInvoke } from 'backend/host'
import type {
  SafetyItem,
  SafetyReason,
  SafetyRequest,
  SafetyTarget,
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

interface Located {
  /** The path's canonical location, or its nearest existing ancestor plus the missing names. */
  parts: string[]
  absent: boolean
  isLink: boolean
}

const components = (p: string): string[] => p.split(sep).filter(Boolean)

const fold = (c: string): string =>
  process.platform === 'win32' || process.platform === 'darwin'
    ? c.normalize('NFC').toLowerCase()
    : c

const errCode = (e: unknown): string | undefined =>
  (e as NodeJS.ErrnoException).code

/** Nothing exists at `path`: judge it at its nearest existing ancestor. `null` is canonicalize-failed. */
function locateAbsent(path: string): Located | null {
  const missing: string[] = []
  let cur = resolve(path)
  for (;;) {
    try {
      lstatSync(cur)
      break
    } catch (e) {
      if (errCode(e) !== 'ENOENT') return null
      const up = dirname(cur)
      if (up === cur) return null
      missing.unshift(basename(cur))
      cur = up
    }
  }
  try {
    if (!statSync(cur).isDirectory()) return null
    return {
      parts: [...components(realpathSync.native(cur)), ...missing],
      absent: true,
      isLink: false
    }
  } catch {
    return null
  }
}

/** Mirrors the crate's canonical_location. `null` is canonicalize-failed. */
function locate(path: string, followLink: boolean): Located | null {
  let isLink: boolean
  try {
    isLink = lstatSync(path).isSymbolicLink()
  } catch (e) {
    return errCode(e) === 'ENOENT' ? locateAbsent(path) : null
  }
  try {
    if (isLink && !followLink) {
      const parent = realpathSync.native(dirname(resolve(path)))
      return {
        parts: components(join(parent, basename(path))),
        absent: false,
        isLink: true
      }
    }
    return {
      parts: components(realpathSync.native(path)),
      absent: false,
      isLink
    }
  } catch {
    return null
  }
}

/** Judges one target against its trust root the way the crate does; `null` means no objection. */
function trustRootObjection(
  target: SafetyTarget,
  located: Located | null
): { verdict: SafetyVerdict; reason: SafetyReason } | null {
  const root = target.trustRoot
  if (typeof root !== 'string') return null
  const unknown = (reason: SafetyReason) => ({
    verdict: 'unknown' as const,
    reason
  })
  if (root === '') return unknown('no-trust-root')
  if (!isAbsolute(root)) return unknown('not-absolute')
  const rootLoc = locate(root, true)
  if (!rootLoc || !located) return unknown('canonicalize-failed')
  const r = rootLoc.parts.map(fold)
  const t = located.parts.map(fold)
  const inside = t.length >= r.length && r.every((c, i) => c === t[i])
  if (!inside) return { verdict: 'no', reason: 'outside-trust-root' }
  if (t.length === r.length) return { verdict: 'no', reason: 'is-trust-root' }
  return null
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
    const items: SafetyItem[] = req.targets.map((t) => {
      const located = locate(t.path, false)
      const objection = trustRootObjection(t, located)
      return {
        id: t.id,
        verdict: objection?.verdict ?? verdict,
        reason: objection?.reason ?? reasonFor(),
        isLink: located?.isLink ?? false,
        absent: located?.absent ?? false
      }
    })
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
