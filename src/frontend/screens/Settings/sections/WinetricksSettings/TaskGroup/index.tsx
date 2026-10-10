import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WinetricksComponent } from 'common/types'
import type { WinetricksTaskGroupId } from 'common/winetricks/verbs'
import GroupHeader from '../GroupHeader'
import { taskGroupName } from '../labels'
import type { RenderWinetricksRow } from '../Row'

type Props = {
  id: WinetricksTaskGroupId
  // This group's members resolved against the visible catalog, in membership
  // order (D-07). The same objects also appear in Everything else.
  components: WinetricksComponent[]
  renderRow: RenderWinetricksRow
}

// D-05/D-07: one of the five task-shaped shortcut views, collapsed by default.
// Expanded state is local, so the tab remounting resets it (Phase 44 D-04).
// Rows are rendered only while open: a collapsed group costs one header.
export default function TaskGroup({ id, components, renderRow }: Props) {
  const { t: tGamelib } = useTranslation('gamelib')
  const [expanded, setExpanded] = useState(false)

  // A-45-01: a group with no resolved members renders nothing at all, not a
  // header with a `0` badge. This follows every hook above.
  if (components.length === 0) {
    return null
  }

  const bodyId = `winetricks-group-${id}`

  return (
    <section className="WinetricksTaskGroup" data-group={id}>
      <GroupHeader
        label={taskGroupName(tGamelib, id)}
        count={components.length}
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
        controlsId={bodyId}
      />
      <div id={bodyId} className="WinetricksTaskGroup__body" hidden={!expanded}>
        {expanded &&
          components.map((component) => renderRow(component, 'twoLine', false))}
      </div>
    </section>
  )
}
