import React, { useEffect, useState } from 'react'
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

  const [useCache, setUseCache] = useState(
    props.src?.startsWith('http') || false
  )
  const [loaded, setLoaded] = useState(false)
  // -1 means "showing the primary src"; 0..n-1 indexes into `fallbacks`.
  const [fallbackIndex, setFallbackIndex] = useState(-1)

  useEffect(() => {
    setLoaded(false)
    setFallbackIndex(-1)
    setUseCache(props.src?.startsWith('http') || false)
  }, [props.src])

  const onError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // if not cached, tried with the real
    if (useCache) {
      setUseCache(false)
    } else {
      // if not cached and can't access real, advance to the next fallback in
      // the chain (bounded — stops at the last entry, never loops).
      const nextIndex = fallbackIndex + 1
      if (nextIndex < fallbacks.length) {
        setFallbackIndex(nextIndex)
        setUseCache(fallbacks[nextIndex].startsWith('http'))
      }
    }
    props.onError?.(e)
  }

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setLoaded(true)
    props.onLoad?.(e)
  }

  const currentSource =
    fallbackIndex < 0 ? props.src : fallbacks[fallbackIndex]
  const src =
    useCache && currentSource
      ? `imagecache://${encodeURIComponent(currentSource)}`
      : currentSource

  return (
    <img
      loading="lazy"
      {...props}
      src={src}
      onLoad={handleLoad}
      onError={onError}
      className={classNames(props.className, {
        loaded,
        loading: !loaded
      })}
    />
  )
}

export default CachedImage
