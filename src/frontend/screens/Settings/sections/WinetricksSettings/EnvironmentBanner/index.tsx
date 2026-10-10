import type { WinetricksEnvironmentReport } from 'common/types'

type Props = {
  environment: WinetricksEnvironmentReport
  platform: string
}

// RED stub (Phase 45 Plan 08, Task 2): inert and type-correct so the failing
// tests compile and fail on their assertions. The real banner replaces this.
export default function EnvironmentBanner(_props: Props) {
  void _props
  return <div className="WinetricksEnvironmentBanner" />
}
