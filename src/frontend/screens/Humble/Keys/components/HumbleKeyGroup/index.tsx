import { useTranslation } from 'react-i18next'

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

export default function HumbleKeyGroup({ state, keys }: Props) {
  const { t } = useTranslation()

  // Parent already filters empty groups out before rendering; this guard is
  // defensive only (never rely solely on the caller).
  if (!keys.length) {
    return null
  }

  const [labelKey, labelDefault] = STATE_LABEL_KEYS[state]

  return (
    <section className="humbleKeyGroup">
      <h5 className="humbleKeyGroupHeading">
        {t(labelKey, labelDefault)}
        <span className="humbleKeyGroupCount">{keys.length}</span>
      </h5>
      <ul className="humbleKeyGroupList">
        {keys.map((key) => (
          <HumbleKeyRow key={key.machineName} humbleKey={key} />
        ))}
      </ul>
    </section>
  )
}
