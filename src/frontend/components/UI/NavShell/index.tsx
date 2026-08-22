import { ReactNode, useContext, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import classNames from 'classnames'

import { Tier2PortalContext } from './Tier2PortalContext'
import { resolveActiveTab } from './navTabs'
import NavTabs from './components/NavTabs'
import DownloadsRing from './components/DownloadsRing'
import GamesPanel from './components/GamesPanel'
import StoresPanel from './components/StoresPanel'
import SettingsPanel from './components/SettingsPanel'
import HeroicVersion from './components/HeroicVersion'
import NavShellTour from './components/NavShellTour'
import './index.scss'

/**
 * The app-level navigation shell root (34.10-07, REQ-34.10-01/11/12/13).
 * Everything this replaces used to live in the retired left navigation
 * (`Sidebar/index.tsx`).
 *
 * Returns a FRAGMENT, not a wrapper element -- `.NavShell__navbar` and
 * `.NavShell__tier2` (plan 34.10-02) must both be direct grid items of
 * `.App` for their `grid-area` to resolve. A wrapper element here would
 * break grid placement.
 */
export default function NavShell() {
  const location = useLocation() as { pathname: string }
  const navigate = useNavigate()
  const { filled } = useContext(Tier2PortalContext)

  const activeTab = resolveActiveTab(location.pathname)

  // Ported from the retired left navigation (`Sidebar/index.tsx:58-63`).
  // Losing this subscription would silently break tray and deeplink
  // navigation -- nothing else in the app listens on this channel. Unlike
  // the sidebar's version, the unsubscribe is returned from the effect so
  // the listener doesn't leak.
  useEffect(() => {
    return window.api.handleGoToScreen((e, screen) => {
      navigate(screen, { state: { fromGameCard: false } })
    })
  }, [navigate])

  // Manage Accounts collapses by settled design (REQ-34.10-03 § Design
  // Decisions #5); `games` collapses only when the portal context reports
  // no content, i.e. on routes like `/gamepage/*` where `Library` (and
  // therefore its portalled `<Header>`) isn't mounted. Collapse is a CSS
  // width transition on a permanently-mounted element (plan 34.10-02), not
  // an unmount -- that is what lets the version slot below survive it.
  const tier2Collapsed =
    activeTab === null ||
    activeTab === 'accounts' ||
    (activeTab === 'games' && !filled)

  let tier2Panel: ReactNode = null
  if (activeTab === 'games') {
    tier2Panel = <GamesPanel />
  } else if (activeTab === 'stores') {
    tier2Panel = <StoresPanel />
  } else if (activeTab === 'settings') {
    tier2Panel = <SettingsPanel />
  }

  return (
    <>
      <header className="NavShell__navbar">
        <NavTabs />
        <div className="NavShell__navRight">
          <DownloadsRing />
        </div>
      </header>
      <aside
        className={classNames('NavShell__tier2', {
          'NavShell__tier2--collapsed': tier2Collapsed
        })}
      >
        {tier2Panel}
        {/*
          REQ-34.10-12. HeroicVersion's cache-clear-on-version-change and
          startup ChangelogModal effects are mount-triggered, not
          render-triggered -- mounting this component only inside the
          Settings panel's conditional would move both from "every launch"
          to "the first time the user opens Settings", a silent regression
          from the retired sidebar's always-mounted footer. It is therefore
          the last child of the tier-2 column, outside every panel
          conditional above, and stays mounted across every tab switch
          (including the collapse case, which is width-only -- see the
          comment on `.NavShell__tier2--collapsed`). `hidden` only affects
          the visual block; the changelog itself renders through MUI's
          Dialog portal at document level and is unaffected by it.
        */}
        <div
          className="NavShell__versionSlot"
          hidden={activeTab !== 'settings'}
        >
          <HeroicVersion />
        </div>
      </aside>
      {/*
        34.12-04 Task 3. Mounted AFTER the closing </aside>, never between
        the navbar and tier2 grid items -- `.NavShell__navbar` and
        `.NavShell__tier2` must stay direct grid items of `.App` (see the
        docstring above), and introducing an element between them would
        break grid placement even though `intro.js-react`'s `Steps` itself
        renders nothing into the tree. Mounted unconditionally, matching
        `LibraryTour`'s mount idiom at `Library/index.tsx` -- the component
        gates itself on `isTourActive(NAV_TOUR_ID)`, so it is never
        auto-started (D-02) and reachable only via an explicit user click on
        plan 34.12-05's launcher row.
      */}
      <NavShellTour />
    </>
  )
}
