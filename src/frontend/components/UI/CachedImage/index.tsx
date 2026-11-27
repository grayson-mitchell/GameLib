import React, { useState } from 'react'
import classNames from 'classnames'

interface CachedImageProps {
  src: string
  // A single string keeps the historical one-level fallback; a string[] is an
  // ordered chain tried left-to-right (e.g. portrait capsule -> header art ->
  // generic placeholder).
  fallback?: string | string[]
  className?: string
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement, Event>) => void
  onError?: (e: React.SyntheticEvent<HTMLImageElement, Event>) => void
}

type Props = React.ImgHTMLAttributes<HTMLImageElement> & CachedImageProps

const CachedImage = (props: Props) => {
  // Normalize the fallback prop to an ordered array so a single string and a
  // string[] share one code path. Undefined -> [].
  const fallbacks = Array.isArray(props.fallback)
    ? props.fallback
    : props.fallback !== undefined
      ? [props.fallback]
      : []

  const [loaded, setLoaded] = useState(false)
  // -1 means "showing the primary src"; 0..n-1 indexes into `fallbacks`.
  const [fallbackIndex, setFallbackIndex] = useState(-1)
  const [stateSrc, setStateSrc] = useState(props.src)

  // Reset per-src state DURING render, not in an effect. A tile that is
  // reused with a new src (the recently-played row reorders and the same
  // CachedImage instance flips between cover and justPlayed art) would
  // otherwise commit the new src with `loaded` still true, and a passive
  // effect resetting it afterwards can run AFTER the new image's load event
  // already fired -- leaving `loaded` false forever (opacity 0, black tile).
  if (stateSrc !== props.src) {
    setStateSrc(props.src)
    setLoaded(false)
    setFallbackIndex(-1)
  }

  const onError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // Advance to the next fallback in the chain (bounded: stops at the last
    // entry, never loops).
    const nextIndex = fallbackIndex + 1
    if (nextIndex < fallbacks.length) {
      setFallbackIndex(nextIndex)
    }
    props.onError?.(e)
  }

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setLoaded(true)
    props.onLoad?.(e)
  }

  const src = fallbackIndex < 0 ? props.src : fallbacks[fallbackIndex]

  return (
    <img
      loading="lazy"
      {...props}
      src={src}
      onLoad={handleLoad}
      onError={onError}
      className={classNames(props.className, {
        loaded,
        loading: !loaded,
        // Lets callers style placeholder/fallback art differently from real
        // cover art (e.g. fit-to-tile instead of crop-to-fill).
        usingFallback: fallbackIndex >= 0
      })}
    />
  )
}

export default CachedImage
