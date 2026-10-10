import type { WinetricksQueueRun } from 'common/types'

// RED-phase inert stub (45-05 task 2): type-correct, behaviourless.
export type WinetricksRowState =
  | 'available'
  | 'selected'
  | 'queued'
  | 'installing'
  | 'installed'
  | 'errored'

export type VerbErrorMap = Readonly<Record<string, true>>

export function deriveRowState(input: {
  verb: string
  installed: readonly string[]
  selected: boolean
  run: Pick<WinetricksQueueRun, 'outcomes' | 'currentVerb' | 'status'> | null
  erroredVerbs: VerbErrorMap
}): WinetricksRowState {
  return input.verb === '' ? 'selected' : 'available'
}

export function foldRunOutcomes(
  current: VerbErrorMap,
  run: Pick<WinetricksQueueRun, 'verbs' | 'outcomes'> | null
): VerbErrorMap {
  return run === null ? current : current
}

export function clearVerbError(
  current: VerbErrorMap,
  verb: string
): VerbErrorMap {
  if (!current[verb]) {
    return current
  }

  const next = { ...current }
  delete next[verb]
  return next
}
