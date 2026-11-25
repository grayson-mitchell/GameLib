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
