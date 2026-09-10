import { HumbleKeyState } from 'common/types/humble'

/**
 * Shared i18n label pairs for the 5 key states — read by HumbleKeyRow's
 * KEY-column state badge.
 *
 * WR-09: lives in its own leaf module rather than inside a component file, so
 * no component ever has to import this constant through another component.
 * That discipline mattered concretely once already: an earlier grouped
 * presentation imported this table while also being imported BY the row
 * component, and a circular import between the two only worked because the
 * binding was read at render time — any module-scope read would have hit the
 * ES-module TDZ. Keeping the table in its own leaf module means no future
 * consumer can reintroduce that hazard.
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
