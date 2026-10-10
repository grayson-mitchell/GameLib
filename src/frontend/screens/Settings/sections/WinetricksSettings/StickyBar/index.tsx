import type { WinetricksQueueRun } from 'common/types'

type Props = {
  mode: 'rest' | 'inFlight' | 'done'
  selectedCount: number
  run: WinetricksQueueRun | null
  titleOf: (verb: string) => string
  applyDisabled: boolean
  onApply: () => void
  onCancelRemaining: () => void
}

// RED stub (Phase 45 Plan 08, Task 1): inert and type-correct so the failing
// tests compile and fail on their assertions. The real bar replaces this.
export default function StickyBar(_props: Props) {
  void _props
  return <div className="WinetricksStickyBar" />
}
