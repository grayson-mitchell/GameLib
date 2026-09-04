import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog, DialogContent, DialogHeader } from '../Dialog'
import GameLibIcon from 'frontend/assets/gamelib-icon.png'
import './index.scss'

const PROJECT_URL = 'https://github.com/grayson-mitchell/GameLib'

interface AboutDialogProps {
  onClose: () => void
}

/**
 * The About surface (quick `260905-d33`). Replaces the 420x380 OS
 * `WebviewWindow` that Settings -> About opened until now -- a window backed by
 * the static, capability-free `public/about.html`, which carried its own
 * hardcoded `#1a1a1a`/`#e6e6e6` palette and so could not participate in the
 * app's theming at all.
 *
 * Consuming the shared `Dialog` primitive is what delivers the animation this
 * surface was asked for: the 500ms directional Slide entrance lives inside
 * `Dialog.tsx` (`TransitionComponent={SlideUpTransition}` +
 * `transitionDuration={500}`, pinned by `dialogWindowChrome.test.ts`), so
 * matching the rest of the app's modals costs no animation code here.
 *
 * The behind-content crossfade at `screens/Login/index.scss` is deliberately
 * NOT ported. That rule slides the login page's own content away behind its
 * overlay; About opens from a tier-2 nav panel with no equivalent
 * behind-content, and animating the app body on About-open would be a new
 * visual effect rather than a port of an existing one.
 *
 * The version arrives asynchronously and is allowed to render as `unknown`
 * first. The retired window needed a 1s bounded race against
 * `getHeroicVersion()` because a wedged sidecar delayed WINDOW CONSTRUCTION for
 * up to the 60s invoke timeout, making the menu item look dead. A dialog is on
 * screen immediately, so there is nothing to bound -- the same unbounded call
 * `HeroicVersion` and `ChangelogModal` already make.
 */
export default function AboutDialog({ onClose }: AboutDialogProps) {
  const { t } = useTranslation('gamelib')
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void window.api
      .getHeroicVersion()
      .then((resolved) => {
        if (!cancelled) setVersion(resolved)
      })
      .catch(() => {
        if (!cancelled) setVersion(null)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Dialog onClose={onClose} showCloseButton className="AboutDialog">
      <DialogHeader>{t('about.title', 'About GameLib')}</DialogHeader>
      <DialogContent className="AboutDialog__body">
        {/* Decorative: the product name is rendered as text directly below, so
            an alt here would be redundant for a screen reader. */}
        <img src={GameLibIcon} alt="" className="AboutDialog__icon" />
        <p className="AboutDialog__version">
          {t('about.version', 'Version: {{version}}', {
            version: version ?? t('about.versionUnknown', 'unknown')
          })}
        </p>
        <p className="AboutDialog__meta">
          {t('about.license', 'License: GPL V3')}
        </p>
        <p className="AboutDialog__meta">{PROJECT_URL}</p>
      </DialogContent>
    </Dialog>
  )
}
