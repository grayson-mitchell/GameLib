import type { ReactNode } from 'react'
import type { WinetricksComponent } from 'common/types'
import type { WinetricksRowState } from 'common/winetricks/deriveRowState'

export type WinetricksRowTemplate = 'twoLine' | 'oneLine'

export type RenderWinetricksRow = (
  component: WinetricksComponent,
  template: WinetricksRowTemplate,
  showCategory: boolean
) => ReactNode

type Props = {
  component: WinetricksComponent
  rowState: WinetricksRowState
  template: WinetricksRowTemplate
  locked: boolean
  percent?: number
  showDone: boolean
  showCategory: boolean
  onToggle: (verb: string) => void
  onRetry: (verb: string) => void
}

// RED-phase stub: renders nothing useful on purpose. Replaced by the real row
// in the GREEN commit.
export default function WinetricksRow(_props: Props) {
  return <div className="WinetricksRow" />
}
