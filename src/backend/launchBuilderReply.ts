/**
 * Narrows Rust's answers to the launch builders (Phase 88.1, 88.1-07).
 *
 * The shims in `launchrust/builders.ts` are one typed call each and answer `unknown`, because the transport is
 * untyped. `createLauncher` runs each answer through one of these before a store manager spreads it into a game's
 * environment or joins it into a `--wrapper` flag, so a reply of the wrong shape is an error at the call and never
 * a malformed variable in a game's environment.
 */
import type { ExecResult, StatusPromise } from 'common/types'

/** A string-to-string map: a plain object whose every value is a string. */
export function settleEnvMap(
  reply: unknown,
  builder: string
): Record<string, string> {
  if (
    typeof reply === 'object' &&
    reply !== null &&
    !Array.isArray(reply) &&
    Object.values(reply).every((value) => typeof value === 'string')
  ) {
    return { ...(reply as Record<string, string>) }
  }
  throw new Error(`${builder}: the reply was not a string map`)
}

/** The wrapper words: an array of strings. */
export function settleWordList(reply: unknown, builder: string): string[] {
  if (Array.isArray(reply) && reply.every((word) => typeof word === 'string')) {
    return [...reply]
  }
  throw new Error(`${builder}: the reply was not a list of words`)
}

/**
 * The tier-1 known-fix env. The TypeScript it replaced returned the fix's `envVariables` as the file held them
 * (`knownFixes?.envVariables || {}`), a value it did not check either, so this keeps that: no fix is `{}` and
 * anything else is handed on as it came, which keeps a game's environment what the goldens record.
 */
export function settleKnownFixEnv(reply: unknown): Record<string, string> {
  return reply === null || reply === undefined
    ? {}
    : (reply as Record<string, string>)
}

/**
 * The reply of the wine prefix check: `{ res: { stdout, stderr } }`, with the exit `code` of a command that ran. The
 * TypeScript it replaced answered `{ res }` and callers read nothing but its arrival, so this checks the shape and
 * hands on the object as it came.
 */
export function settleVerifyPrefixReply(
  reply: unknown,
  builder: string
): { res: ExecResult } {
  if (typeof reply === 'object' && reply !== null && 'res' in reply) {
    const { res } = reply
    if (
      typeof res === 'object' &&
      res !== null &&
      'stdout' in res &&
      typeof res.stdout === 'string' &&
      'stderr' in res &&
      typeof res.stderr === 'string'
    ) {
      return reply as { res: ExecResult }
    }
  }
  throw new Error(`${builder}: the reply was not a command result`)
}

/** The three words a launch can end with, as the `StatusPromise` of `common/types` names them. */
const LAUNCH_STATUSES = ['done', 'error', 'abort'] as const

/**
 * The reply of one Play through the Rust launch funnel (88.3-10): the `{ status }` a `StatusPromise` resolves to. Anything
 * else (not an object, no `status`, a word outside the three) throws by name, so a drifted reply fails the Play loudly instead
 * of passing as a launch that ended.
 */
export function settleLaunchStatus(reply: unknown): Awaited<StatusPromise> {
  if (typeof reply === 'object' && reply !== null && 'status' in reply) {
    const { status } = reply
    const word = LAUNCH_STATUSES.find((s) => s === status)
    if (word) return { status: word }
  }
  throw new Error('launchRun: the reply was not a launch status')
}
