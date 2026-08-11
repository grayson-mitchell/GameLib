/**
 * Task 1 (34.5-48, F-34.5-G6 cluster 4): `callOrDeclare()` -- the ONE sanctioned way for the
 * renderer to call a channel this phase deferred (D-03/D-05: 8 EOS overlay, 5 SteamGridDB
 * artwork, 3 winetricks).
 *
 * THE DEFECT THIS CLOSES
 *
 * A deferred channel is unregistered on the sidecar, so under Tauri it always rejects with
 * `UNPORTED_CHANNEL_MARKER` (`common/types/sidecarTransport.ts`, written by
 * `sidecarRpc.ts:113-120` into the response frame only -- nothing is ever logged there). The
 * old assumption ("the marker machinery already declares it honestly",
 * `34.5-PORTED-CHANNELS.md`) is FALSE at the UI layer: a call site with no `.catch` produces an
 * *unhandled* rejection, which `bootErrorSurface.ts:49` recognises and routes to
 * `console.warn` only -- invisible outside an open devtools pane, and never written to
 * `gamelib.log`. The 8 EOS channels rejected 8 times in one UAT session with ZERO lines in the
 * log to show for it, while the UI kept asserting confident, false backend state ("not
 * installed", "installing...", offering a real-looking Cancel). See `34.5-CYCLE6-ROUTING.md`
 * cluster 4 for the full diagnosis this module fixes.
 *
 * The renderer's `api.logError` bridge (attached to `window` by the preload layer) is the ONLY
 * renderer -> `gamelib.log` path in this app (`frontend/index.tsx:41` bridges `window.error`
 * only, never `unhandledrejection`) -- so a deferred channel can only ever declare itself where
 * a call site explicitly catches and routes through it. This module is that one call site,
 * factored out so every deferred-channel caller in the app can share it instead of
 * re-inventing a `.catch` shape per component.
 *
 * CONTRACT
 *
 * `callOrDeclare` NEVER throws and NEVER returns a rejected promise -- a decline must always be
 * a decline, never a second failure on top of the first. On success it resolves the ok branch
 * with the real value; on rejection it logs ONE durable line (deduped per channel per session,
 * mirroring `tauriTransport.ts`'s `lazyMissWarned` discipline so a hot render loop cannot flood
 * the log) and resolves the not-ok branch instead of rethrowing.
 */

/**
 * Distinct from `UNPORTED_CHANNEL_MARKER` on purpose (mirrors `useTauriOAuthLogin.ts`'s "a
 * distinct literal on purpose" precedent and plan 34.5-47's per-call-site fixed-literal
 * convention): that marker classifies a *transport rejection*; this one records a *product
 * decision to decline visibly*. The live gate greps for this marker specifically, and must
 * never accidentally match the transport-level one.
 */
export const DECLARED_UNAVAILABLE_MARKER = '[GAMELIB_DECLARED_UNAVAILABLE]' as const

/**
 * The 8 deferred EOS overlay channels (D-03), verified against
 * `.planning/IPC-PORT-INVENTORY.md`'s deferred bucket by this module's own test. If the
 * inventory ever disagrees with this list, the inventory wins -- plan 34.5-49 owns that file,
 * not this one.
 */
export const EOS_OVERLAY_CHANNELS = [
  'getEosOverlayStatus',
  'getLatestEosOverlayVersion',
  'installEosOverlay',
  'removeEosOverlay',
  'updateEosOverlayInfo',
  'enableEosOverlay',
  'disableEosOverlay',
  'isEosOverlayEnabled'
] as const

export type DeclaredResult<T> =
  | { ok: true; value: T }
  | { ok: false; channel: string; reason: string }

interface CallOrDeclareSpec<T> {
  /** The exact IPC channel name, used as the dedupe key and in the log line. */
  channel: string
  /** Human-readable feature name for the log line, e.g. `'EOS Overlay'`. */
  feature: string
  /** The deferral/decision id that explains WHY this channel is unavailable, e.g. `'D-03'`. */
  deferral: string
  /** The actual (rejecting) IPC call. Never invoked more than once per `callOrDeclare` call. */
  call: () => Promise<T>
}

/**
 * D-04-shaped (mirrors `tauriTransport.ts`'s `lazyMissWarned`): warn/log at most once per
 * channel per session, so a re-render or a repeated probe cannot flood `gamelib.log`.
 */
const declaredOnce = new Set<string>()

/**
 * Test-only. Clears the dedupe set so per-test assertions on "logs exactly once" are
 * independent of test execution order -- the Frontend jest config's `resetMocks: true` resets
 * mock call history but never resets a module's own closed-over state.
 */
export function resetDeclaredOnce(): void {
  declaredOnce.clear()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The one sanctioned way to call a deferred IPC channel from the renderer. See the module
 * header for the full contract. `spec` deliberately carries no `args` field: the message
 * composed on rejection contains only the marker, feature, channel, deferral id and the
 * error's own message -- never any argument passed to the underlying call (T-34.5-48-04;
 * `enableEosOverlay('')`/`disableEosOverlay('')` carry app names, and this is a public fork
 * whose developers paste log/console output, `src-tauri/src/main.rs:508-518`).
 */
export async function callOrDeclare<T>(
  spec: CallOrDeclareSpec<T>
): Promise<DeclaredResult<T>> {
  try {
    const value = await spec.call()
    return { ok: true, value }
  } catch (error) {
    const reason = errorMessage(error)
    if (!declaredOnce.has(spec.channel)) {
      declaredOnce.add(spec.channel)
      const message =
        `${DECLARED_UNAVAILABLE_MARKER} ${spec.feature} unavailable under Tauri ` +
        `(channel=${spec.channel}) -- tracked as its own deferral (${spec.deferral}): ${reason}`
      try {
        window.api.logError(message)
      } catch {
        // A decline must never become a second failure -- if the log bridge itself is
        // missing or throws, the decline still resolves normally below.
      }
    }
    return { ok: false, channel: spec.channel, reason }
  }
}
