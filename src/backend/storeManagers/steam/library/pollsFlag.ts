/**
 * Dev-only flag choosing which implementation runs the install, uninstall and running-game polls
 * (D-16). `GAMELIB_STEAM_POLLS=rust|ts`; any other value falls back to the default.
 *
 * Must equal `DEFAULT_POLLS_IMPL` in `src-tauri/src/steampoll_dispatch.rs`, which owns the same flag
 * for boot resume (a test reads that file). Plan 80-26 flips both after parity approval; plan 80-31
 * deletes this flag together with the TS loops.
 */
export type PollsImpl = 'rust' | 'ts'

export const DEFAULT_POLLS_IMPL: PollsImpl = 'ts'

export function pollsImpl(env: NodeJS.ProcessEnv = process.env): PollsImpl {
  const v = env.GAMELIB_STEAM_POLLS
  if (v === 'rust' || v === 'ts') return v
  return DEFAULT_POLLS_IMPL
}
