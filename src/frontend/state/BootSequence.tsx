import React, { useLayoutEffect } from 'react'

import { bootSequenceEffectWhenI18nReady } from './initStateSubscriptions'

/**
 * Stateless root wrapper that fires the post-mount boot tail
 * (`runPostMountBoot`, the former GlobalState.componentDidMount).
 *
 * Timing rule: componentDidMount ran in the first commit's layout phase,
 * after children's layout effects and before passive effects, and only once
 * i18next had loaded (the class sat under withTranslation's Suspense). A
 * `useLayoutEffect` reproduces the first part; the second is reproduced by
 * waiting for i18next's `initialized` event (it fires even when a resource
 * load fails, so this cannot hang on a backend error). Calling the boot right
 * after `root.render(...)` would run BEFORE the first commit, and
 * frontendReady (the backend's "renderer listeners mounted" signal) would
 * fire too early.
 */
export default function BootSequence({
  children
}: {
  children: React.ReactNode
}) {
  useLayoutEffect(() => {
    bootSequenceEffectWhenI18nReady()
  }, [])
  return <>{children}</>
}
