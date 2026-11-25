import type { GameSettings, Runner } from 'common/types'
import { RUST_WINE_WINETRICKS_INSTALL } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * Installs Winetricks verbs for a game one after another, as the launcher's known-fix step and the Steam
 * bridge's known fixes did (87-35): never a batch, never parallel, a failed verb does not stop the rest. Its
 * body is one typed call (D-06); the shim schedule pins that and the phase that deletes it. The renderer's apply
 * is the scheduled `winetricksApply` resolver over the Rust queue, a different channel: these callers send no
 * queue events and own their own game status.
 *
 * `settings` are the tool settings the caller already holds (the launcher's launch settings, the Steam bridge
 * bottle's), so no Game object crosses and Rust never resolves a game's environment from the library. Resolves
 * one outcome word per verb, in order: `installed`, `failed`, or `refused` (another component was already
 * installing). A verb that is not the shape of a real one is `failed` and never reaches an argv. Rejects with
 * Rust's category word when the call could not be made. The wine host facts are the shell's, never sent here.
 */
export async function winetricksInstallVerbs(
  deps: RustInvokeDeps,
  {
    settings,
    runner,
    appName,
    verbs
  }: {
    settings: GameSettings
    runner: Runner
    appName: string
    verbs: string[]
  }
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_WINE_WINETRICKS_INSTALL, [
    { runner, appName, settings },
    verbs
  ])
}
