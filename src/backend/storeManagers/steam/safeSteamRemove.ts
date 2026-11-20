/**
 * Phase 82 (FND-02): the Steam-side half of the shared removal guard. Every Steam destructive site
 * (the bridge uninstall and bottle removal of plan 82-08, the direct and copy removals of plan
 * 82-09) builds its Rust request here and reports a refusal here, so the request shape and the
 * refusal wording cannot drift between sites.
 *
 * Kept out of gameUninstall.ts so that file stays under the steam-line-ceiling.
 *
 * Exit contract: no timers, no handles, no work at import, no module-level mutable state.
 */
import type { ExecResult } from 'common/types'
import type { ManagerDeps } from 'backend/services/types'
import {
  collectKnownInstalls,
  knownInstallKey,
  titleForKnownKey
} from 'backend/safety/knownInstalls'
import {
  protectedRootsFor,
  type ProtectedRootsDeps
} from 'backend/safety/protectedRoots'
import { pushRemovalRefusal } from 'backend/safety/refusal'
import type { RemovalRefusalKind } from 'common/types/removalRefusal'
import type {
  RemovalReason,
  SafetyRequest,
  SafetyTarget
} from 'common/types/safety'

/** What a request needs: the settings and app paths for protected roots, and every store's library. */
export interface SteamSafetyDeps extends ProtectedRootsDeps {
  libraryManagers: ManagerDeps['libraryManagers']
}

/** A Steam game as the guard sees it: its id and the deps that carry the request inputs. */
export interface SteamSafetySource {
  appId: string
  deps: SteamSafetyDeps
}

/**
 * The request for removing `targets` on behalf of one Steam game. `knownInstalls` is the cross-store
 * list without this game (`null` when a manager could not be read, which the guard answers as
 * `unknown`); `selfKey` is this game's own key; protected roots come from settings and app paths
 * only (D-08), never from a target.
 */
export function steamSafetyRequest(
  source: SteamSafetySource,
  targets: SafetyTarget[]
): SafetyRequest {
  const { deps, appId } = source
  return {
    targets,
    knownInstalls: collectKnownInstalls(deps, {
      runner: 'steam',
      appName: appId
    }),
    selfKey: knownInstallKey('steam', appId),
    protectedRoots: protectedRootsFor(deps)
  }
}

/** The slice the refusal notice needs on top of the request inputs. */
export interface SteamRefusalSource {
  appId: string
  deps: SteamSafetyDeps &
    Pick<ManagerDeps, 'sendFrontendMessage' | 'steamSession'>
}

export interface SteamRefusal {
  /** `refused`: nothing was deleted. `failed`: a delete ran and its effect is unconfirmed. */
  outcome: 'refused' | 'failed'
  reason?: RemovalReason
  /** The other game's key on a nested or inside known install. */
  otherKey?: string
}

/**
 * Report a guarded removal that did not complete, and settle the tile.
 *
 * Pushes the generic removal notice (not `steamRequestNotice`, so the user does not also get a
 * second failure toast), sends the terminal `done` (uninstaller.ts suppresses the tail `done` for
 * Steam because `installManagedExternally` is set) and returns the `ExecResult` the callback keys
 * on. The title comes from the raw library Map, never `getGameInfo()`, whose lazy metadata fetch is
 * forbidden on this path.
 */
export function refuseWithRemovalNotice(
  steamGame: SteamRefusalSource,
  refusal: SteamRefusal,
  kind: RemovalRefusalKind = 'uninstall'
): ExecResult {
  const { deps, appId } = steamGame
  const reason: RemovalReason = refusal.reason ?? 'bad-reply'
  const title = deps.steamSession.libraryState.library.get(appId)?.title
  const otherTitle =
    refusal.otherKey !== undefined
      ? titleForKnownKey(deps, refusal.otherKey)
      : undefined
  pushRemovalRefusal(deps, {
    kind,
    outcome: refusal.outcome,
    reason,
    ...(title ? { title } : {}),
    appName: appId,
    runner: 'steam',
    ...(otherTitle ? { otherTitle } : {})
  })
  deps.sendFrontendMessage('gameStatusUpdate', {
    appName: appId,
    runner: 'steam',
    status: 'done'
  })
  return refusal.outcome === 'failed'
    ? { stdout: '', stderr: reason, failed: true }
    : { stdout: '', stderr: reason, refused: true }
}
