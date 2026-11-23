/**
 * The caller-side half of the Rust fallback bottle creation (Phase 87, 87-42, D-03): the creation itself is one typed
 * call (`enginewine/bottles.ts` `createFallbackBottle`); the TS `AbortSignal` the callers hold becomes the creation's
 * cancel id, which a second typed call ends. A cancel that lands before Rust has registered the id is lost: the
 * creation then runs to its end and its result stands (callers check the signal after the call, as they did).
 */
import { randomUUID } from 'node:crypto'
import type { GameSettings } from 'common/types'
import {
  cancelFallbackBottle,
  createFallbackBottle
} from 'backend/enginewine/bottles'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import type { NonCrossoverEngine } from './engineTypes'

/** What the creation answers: `status`, and on an error its message, code and whether this call made the bottle. */
export interface FallbackBottleOutcome {
  status: 'done' | 'error'
  error?: string
  errorCode?: string
  createdHere?: boolean
}

export async function createFallbackBottleCancellable(
  rust: RustInvokeDeps,
  request: {
    bottleName: string
    engine: NonCrossoverEngine
    fallbackSettings: GameSettings
    signal?: AbortSignal
  }
): Promise<FallbackBottleOutcome> {
  const cancelId = randomUUID()
  const onAbort = () => {
    void cancelFallbackBottle(rust, cancelId).catch(() => undefined)
  }
  request.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    return (await createFallbackBottle(rust, {
      bottleName: request.bottleName,
      engine: request.engine,
      fallbackSettings: request.fallbackSettings,
      cancelId
    })) as FallbackBottleOutcome
  } finally {
    request.signal?.removeEventListener('abort', onAbort)
  }
}
