import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WinetricksComponent } from 'common/types'
import GroupHeader from '../GroupHeader'
import type { RenderWinetricksRow } from '../Row'

type Props = {
  // Already-installed members resolved against the visible catalog, in
  // catalog order (pre-existing on the bottle, plus any installed by this
  // run). The same objects also appear in whichever other tier(s) show them.
  components: WinetricksComponent[]
  renderRow: RenderWinetricksRow
}

// Operator request from live gate 45-12 (todo 2026-10-11 item 5): everything
// installed on the bottle in one place, pre-existing and installed by this
// run (`installedForRows`). A status VIEW, not a partition (D-07's shortcut-
// view shape) -- its verbs still appear in their other tiers (Suggested, a
// task group, Everything else). Collapsed by default, like the task groups.
// Renders nothing at all (not a header with a `0` badge) when nothing is
// installed (A-45-01).
export default function InstalledGroup({ components, renderRow }: Props) {
  const { t: tGamelib } = useTranslation('gamelib')
  const [expanded, setExpanded] = useState(false)

  if (components.length === 0) {
    return null
  }

  const bodyId = 'winetricks-group-installed'

  return (
    <section className="WinetricksInstalled">
      <GroupHeader
        label={tGamelib('winetricksBrowse.installedHeading', 'Installed')}
        count={components.length}
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
        controlsId={bodyId}
      />
      <div id={bodyId} className="WinetricksInstalled__body" hidden={!expanded}>
        {expanded &&
          components.map((component) => renderRow(component, 'twoLine', false))}
      </div>
    </section>
  )
}
