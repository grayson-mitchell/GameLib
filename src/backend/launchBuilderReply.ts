/**
 * Narrows Rust's answers to the launch builders (Phase 88.1, 88.1-07).
 *
 * The shims in `launchrust/builders.ts` are one typed call each and answer `unknown`, because the transport is
 * untyped. `createLauncher` runs each answer through one of these before a store manager spreads it into a game's
 * environment or joins it into a `--wrapper` flag, so a reply of the wrong shape is an error at the call and never
 * a malformed variable in a game's environment.
 */

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
