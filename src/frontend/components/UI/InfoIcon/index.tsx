import './index.css'

import InfoBox from '../InfoBox'

interface Props {
  text: string
}

export default function InfoIcon({ text }: Props) {
  // The trigger is a sibling of the toggle's label at every call site, so it
  // deliberately has no stopPropagation: PopoverComponent's document click
  // listener must still close other open popovers.
  return (
    <span className="InfoIcon">
      <InfoBox iconOnly text="infobox.help">
        {text}
      </InfoBox>
    </span>
  )
}
