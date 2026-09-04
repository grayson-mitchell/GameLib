import { useTranslation } from 'react-i18next'

/**
 * D-19 (Phase 40 Plan 06 Task 2): the styled slot filler shown in place of
 * the Steam store/wiki embed while `StoreEmbedSuppressionContext` reports
 * it suppressed. The embed is a native subview (see that context file's
 * doc comment) -- hiding it leaves a visually empty hole unless something
 * fills the slot, and an empty hole reads as a rendering glitch rather than
 * the intended "the store is dimmed behind your open dialog". This
 * component is that fill.
 *
 * Props-less and button-less by design (T-40-06-05's `accept` disposition
 * covers only hard-coded colours, not extra chrome): D-19's whole point is
 * that hiding should look like unremarkable dimming, not draw attention to
 * itself with an interactive control competing with whatever overlay
 * caused the hide in the first place.
 *
 * No hooks of its own besides `useTranslation`, mirroring
 * `WebviewUnavailablePanel.tsx`'s convention in this same directory --
 * invoked directly as a plain function in its own test, no jsdom /
 * react-test-renderer required (see `src/frontend/jest.config.js`'s
 * docstring for why).
 *
 * Styled entirely with CSS custom properties (`WebView/index.css`), never
 * literal colours -- a hard-coded colour looks correct in the default
 * theme and wrong in every other theme this app ships (sketch findings'
 * multi-theme survival rule).
 */
const StoreEmbedPlaceholder = () => {
  const { t: tGamelib } = useTranslation('gamelib')

  const message = tGamelib(
    'webview.embedPlaceholder.message',
    'Paused while a window is open'
  )

  return (
    <div className="WebView__embedPlaceholder">
      <p className="WebView__embedPlaceholder-message">{message}</p>
    </div>
  )
}

export default StoreEmbedPlaceholder
