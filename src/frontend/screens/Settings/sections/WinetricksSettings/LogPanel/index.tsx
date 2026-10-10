import type { WinetricksLogLine } from 'common/types'

type Props = {
  lines: WinetricksLogLine[]
}

// RED stub (Phase 45 Plan 08, Task 2): inert and type-correct so the failing
// tests compile and fail on their assertions. The real panel replaces this.
export default function LogPanel(_props: Props) {
  void _props
  return <div className="WinetricksLogPanel" />
}
