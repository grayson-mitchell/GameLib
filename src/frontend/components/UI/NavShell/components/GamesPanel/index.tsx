import { useContext } from 'react'

import { Tier2PortalContext } from '../../Tier2PortalContext'

/**
 * The Games tier-2 portal target (REQ-34.10-09). Renders no children of its
 * own -- it is a target, not a panel with content. `Library`'s side (plan
 * 34.10-06) portals `<Header>` into the DOM node this component registers
 * via the callback ref; plan 34.10-07's shell reads the context's `filled`
 * flag to decide whether to collapse the column.
 */
export default function GamesPanel() {
  const { setTarget } = useContext(Tier2PortalContext)

  return <div className="NavShell__tier2Portal" ref={setTarget} />
}
