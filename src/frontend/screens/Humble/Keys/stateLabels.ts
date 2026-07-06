import { HumbleKeyState } from 'common/types/humble'

/**
 * Shared i18n label pairs for the 5 key states — used by HumbleKeyGroup
 * (group headings) and HumbleKeyRow (state badges).
 *
 * WR-09: lives in its own leaf module so neither component imports the other
 * for a constant. Previously HumbleKeyRow imported this back from
 * HumbleKeyGroup while HumbleKeyGroup imported the row component — a
 * circular import that only worked because the binding was read at render
 * time; any module-scope read would have hit the ES-module TDZ.
 *
 * The internal 5-state name UNREDEEMABLE is locked (D-30 precedence), but its
 * user-visible label is "Expired" — matching Humble's own UI copy ("This key
 * has expired and can no longer be redeemed"); the i18n key stays
 * `state.unredeemable`.
 */
export const STATE_LABEL_KEYS: Record<HumbleKeyState, [string, string]> = {
  UNPICKED: ['humbleKeys.state.unpicked', 'Unpicked'],
  UNREVEALED: ['humbleKeys.state.unrevealed', 'Unrevealed'],
  REVEALED: ['humbleKeys.state.revealed', 'Revealed'],
  REDEEMED: ['humbleKeys.state.redeemed', 'Redeemed'],
  UNREDEEMABLE: ['humbleKeys.state.unredeemable', 'Expired']
}
