import { FocusRowSelection } from 'common/types'

// RED-phase stub (48-05): deliberately wrong so the test suite fails on its
// assertions rather than on module resolution. Replaced in the GREEN commit.
export function isValidFocusRowSelection(
  _value: unknown
): _value is NonNullable<FocusRowSelection> {
  return false
}

export function migrateFocusRowSelection(
  _stored:
    | { focusRow?: unknown; libraryTopSection?: unknown }
    | null
    | undefined
): FocusRowSelection {
  return null
}
