import React, { useLayoutEffect } from 'react'

import { bootSequenceEffect } from './initStateSubscriptions'

/**
 * Stateless root wrapper that fires the post-mount boot tail
 * (`runPostMountBoot`, the former GlobalState.componentDidMount).
 *
 * Timing rule: componentDidMount ran in the first commit's layout phase,
 * after children's layout effects and before passive effects. A
 * `useLayoutEffect` here reproduces that exactly. Calling the boot right
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
    bootSequenceEffect()
  }, [])
  return <>{children}</>
}
