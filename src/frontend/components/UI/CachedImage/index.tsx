import React, { useEffect, useState } from 'react'
import classNames from 'classnames'
// Relative, not the bare `preload/...` specifier: electron.vite.config.ts's
// srcAliases only aliases backend/frontend/common, so a `preload/` alias
// resolves under tsc and Jest but fails Rollup at build time. Every other
// frontend->preload import in this tree is relative for the same reason.
import { imageCacheSchemeAvailable } from '../../../../preload/tauriTransport'

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

// Wrapping an http(s) source in imagecache:// only makes sense on a shell
// that actually serves that scheme (src/backend/images_cache.ts's
// Electron-only protocol.handle registration -- see
// imageCacheSchemeAvailable's doc comment in preload/tauriTransport.ts).
// Requesting it anywhere else guarantees an `unsupported URL` failure --
// measured at ~150 per library render under Tauri, each recovered by
// onError's retry below at the cost of a doubled request and a load flash.
// This is a capability check consumed from one named predicate, never a
// direct platform sniff repeated per consumer.
const shouldUseCache = (source: string | undefined): boolean =>
  imageCacheSchemeAvailable() && (source?.startsWith('http') ?? false)

const CachedImage = (props: Props) => {
  // Normalize the fallback prop to an ordered array so a single string and a
  // string[] share one code path. Undefined -> [].
  const fallbacks = Array.isArray(props.fallback)
    ? props.fallback
    : props.fallback !== undefined
      ? [props.fallback]
      : []

  const [useCache, setUseCache] = useState(shouldUseCache(props.src))
  const [loaded, setLoaded] = useState(false)
  // -1 means "showing the primary src"; 0..n-1 indexes into `fallbacks`.
  const [fallbackIndex, setFallbackIndex] = useState(-1)

  useEffect(() => {
    setLoaded(false)
    setFallbackIndex(-1)
    setUseCache(shouldUseCache(props.src))
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
        setUseCache(shouldUseCache(fallbacks[nextIndex]))
      }
    }
    props.onError?.(e)
  }

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setLoaded(true)
    props.onLoad?.(e)
  }

  const currentSource = fallbackIndex < 0 ? props.src : fallbacks[fallbackIndex]
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
        loading: !loaded,
        // Lets callers style placeholder/fallback art differently from real
        // cover art (e.g. fit-to-tile instead of crop-to-fill).
        usingFallback: fallbackIndex >= 0
      })}
    />
  )
}

export default CachedImage
