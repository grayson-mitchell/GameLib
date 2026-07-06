import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronRight } from '@fortawesome/free-solid-svg-icons'
import classNames from 'classnames'

import { HumbleKey, HumbleKeyState } from 'common/types/humble'
import { HumbleKeyGroupId } from 'common/humble/groupKeys'
import HumbleKeyRow from '../HumbleKeyRow'

type Props = {
  /** One of the 5 states (D-30) or the round-7 'other' display bucket. */
  group: HumbleKeyGroupId
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

// Group headings: the 5 state groups reuse the badge labels above; the
// round-7 'other' bucket (generic-platform entries) has its own heading key
// in the same consumed `humbleKeys` namespace (WR-08).
const GROUP_LABEL_KEYS: Record<HumbleKeyGroupId, [string, string]> = {
  ...STATE_LABEL_KEYS,
  other: ['humbleKeys.group.other', 'Other']
}

// The terminal "Expired" group and the round-7 "Other" bucket start collapsed
// (their key counts stay visible in the always-rendered heading so users know
// they exist). Every other group starts expanded. Collapse state is per-mount
// only — nothing persisted (Phase 13 owns real saved views).
function defaultExpanded(group: HumbleKeyGroupId): boolean {
  return group !== 'UNREDEEMABLE' && group !== 'other'
}

export default function HumbleKeyGroup({ group, keys }: Props) {
  const { t } = useTranslation()
  const listId = useId()
  const [expanded, setExpanded] = useState(() => defaultExpanded(group))

  // Parent already filters empty groups out before rendering; this guard is
  // defensive only (never rely solely on the caller).
  if (!keys.length) {
    return null
  }

  const [labelKey, labelDefault] = GROUP_LABEL_KEYS[group]

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
          {/* WR-08: machine_name is per-PRODUCT, not per-order — the same
              game key type owned via two bundles yields two rows with the
              same machineName in one group. The gamekey:machineName pair is
              the guaranteed-unique identity for a rendered row. */}
          {keys.map((key) => (
            <HumbleKeyRow
              key={`${key.gamekey}:${key.machineName}`}
              humbleKey={key}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
