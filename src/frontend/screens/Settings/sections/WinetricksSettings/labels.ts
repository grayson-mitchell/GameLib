import type { TFunction } from 'i18next'
import type {
  WinetricksFamilyKey,
  WinetricksTaskGroupId
} from 'common/winetricks/verbs'

// RED-phase stub: inert on purpose. Replaced by the real exhaustive switches in
// the GREEN commit.
export function familySentence(
  _t: TFunction,
  _family: WinetricksFamilyKey
): string {
  return ''
}

export function taskGroupName(
  _t: TFunction,
  _id: WinetricksTaskGroupId
): string {
  return ''
}
