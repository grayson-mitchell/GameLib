/**
 * The Steam side of the pinned engine (Phase 87, 87-56a, D-24): what a Steam path reads about the built-in Wine engine
 * without asking Rust. The download is Rust's; this file only answers the two questions the synchronous Steam checks
 * (the offline pre-check, the Wine-tool marker read) put about it, over the twin's pure `isPinnedEngineInstalled`, and
 * (below) wraps the first-need download.
 *
 * Sidecar exit contract: nothing runs at import, no timers.
 */
import { join } from 'path'
import type { AppPaths } from 'backend/process/context'
import {
  isPinnedEngineInstalled,
  type BottleReadContext
} from 'backend/enginewine/twin'

/**
 * The pinned-engine owner's two answers, as the read-only marker views take them (`BottleReadContext['fallback']`): the
 * root every pin lives under (`<toolsPath>/steam-engines`, the one root Rust and the TS fallback engine share) and
 * whether a pin's wine and DXVK are installed and carry the pin's own sha256. Both are the twin's, so the answer equals
 * Rust's `engines::is_pinned_engine_installed` (pinned by the twin vectors).
 */
export function pinnedEngineReader(
  paths: Pick<AppPaths, 'toolsPath'>
): BottleReadContext['fallback'] {
  const pinnedEngineRoot = (): string => join(paths.toolsPath, 'steam-engines')
  return {
    pinnedEngineRoot,
    isPinnedEngineInstalled: (pin) =>
      isPinnedEngineInstalled(pinnedEngineRoot(), pin)
  }
}
