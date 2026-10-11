import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WinetricksComponent } from 'common/types'
import GroupHeader from '../GroupHeader'
import type { RenderWinetricksRow } from '../Row'

type Props = {
  // Rows the game's own signals named (known fixes, then Direct3D), already
  // resolved against the visible catalog (D-06, T-45-21).
  gameSpecific: WinetricksComponent[]
  // The curated 8 minus anything already shown game-specifically.
  curated: WinetricksComponent[]
  renderRow: RenderWinetricksRow
}

// D-05/D-06: expanded by default and collapsible like the other groups
// (operator request, live gate 45-12, todo item 6); never empty while the
// curated verbs resolve. Expanded state is local, so the tab remounting
// resets it to open (mirrors TaskGroup). Game-specific rows still prepend
// with no heading of their own, so the common no-signal case reads
// identically and shows no seam marking the curated 8 as a fallback.
export default function SuggestedGroup({
  gameSpecific,
  curated,
  renderRow
}: Props) {
  const { t: tGamelib } = useTranslation('gamelib')
  const [expanded, setExpanded] = useState(true)

  const bodyId = 'winetricks-group-suggested'

  return (
    <section className="WinetricksSuggested">
      <GroupHeader
        label={tGamelib(
          'winetricksBrowse.suggestedHeading',
          'Suggested for this game'
        )}
        count={gameSpecific.length + curated.length}
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
        controlsId={bodyId}
      />
      <div id={bodyId} className="WinetricksSuggested__body" hidden={!expanded}>
        {expanded && (
          <>
            {gameSpecific.map((component) =>
              renderRow(component, 'twoLine', false)
            )}
            {curated.length > 0 && (
              <>
                <div className="WinetricksSuggested__sub">
                  <h4 className="WinetricksSuggested__subHeading">
                    {tGamelib(
                      'winetricksBrowse.curatedGroup',
                      'Commonly needed'
                    )}
                  </h4>
                  <p className="WinetricksSuggested__hint">
                    {tGamelib(
                      'winetricksBrowse.curatedGroupHint',
                      "Components many Windows games rely on. Start here if a game won't launch."
                    )}
                  </p>
                </div>
                {curated.map((component) =>
                  renderRow(component, 'twoLine', false)
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  )
}
