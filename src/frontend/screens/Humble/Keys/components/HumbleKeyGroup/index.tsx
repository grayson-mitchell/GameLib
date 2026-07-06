import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronRight } from '@fortawesome/free-solid-svg-icons'
import classNames from 'classnames'

import { HumbleKey, HumbleKeyState } from 'common/types/humble'
import HumbleKeyRow from '../HumbleKeyRow'

type Props = {
  state: HumbleKeyState
  keys: HumbleKey[]
}

// Shared with HumbleKeyRow (badge text reuses the same label). The internal
// 5-state name UNREDEEMABLE is locked (D-30 precedence), but its user-visible
// label is "Expired" — matching Humble's own UI copy ("This key has expired and
// can no longer be redeemed"); the i18n key stays `state.unredeemable`.
export const STATE_LABEL_KEYS: Record<HumbleKeyState, [string, string]> = {
  UNPICKED: ['humbleKeys.state.unpicked', 'Unpicked'],
  UNREVEALED: ['humbleKeys.state.unrevealed', 'Unrevealed'],
  REVEALED: ['humbleKeys.state.revealed', 'Revealed'],
  REDEEMED: ['humbleKeys.state.redeemed', 'Redeemed'],
  UNREDEEMABLE: ['humbleKeys.state.unredeemable', 'Expired']
}

// Only the terminal "Expired" group starts collapsed (its key count stays
// visible in the always-rendered heading so users know it exists). Every other
// group starts expanded. Collapse state is per-mount only — nothing persisted
// (Phase 13 owns real saved views).
function defaultExpanded(state: HumbleKeyState): boolean {
  return state !== 'UNREDEEMABLE'
}

export default function HumbleKeyGroup({ state, keys }: Props) {
  const { t } = useTranslation()
  const listId = useId()
  const [expanded, setExpanded] = useState(() => defaultExpanded(state))

  // Parent already filters empty groups out before rendering; this guard is
  // defensive only (never rely solely on the caller).
  if (!keys.length) {
    return null
  }

  const [labelKey, labelDefault] = STATE_LABEL_KEYS[state]

  return (
    <section className="humbleKeyGroup">
      {/* D-22: ONLY the group header is interactive — the key rows below stay
          strictly read-only. A native <button> gives Enter/Space + focus ring
          for free (keyboard operable); aria-expanded/aria-controls describe the
          collapsible list to assistive tech. */}
      <button
        type="button"
        className="humbleKeyGroupHeading"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded((v) => !v)}
      >
        <FontAwesomeIcon
          icon={faChevronRight}
          className={classNames('humbleKeyGroupChevron', {
            'humbleKeyGroupChevron--open': expanded
          })}
        />
        <span className="humbleKeyGroupLabel">{t(labelKey, labelDefault)}</span>
        <span className="humbleKeyGroupCount">{keys.length}</span>
      </button>
      {expanded && (
        <ul id={listId} className="humbleKeyGroupList">
          {keys.map((key) => (
            <HumbleKeyRow key={key.machineName} humbleKey={key} />
          ))}
        </ul>
      )}
    </section>
  )
}
