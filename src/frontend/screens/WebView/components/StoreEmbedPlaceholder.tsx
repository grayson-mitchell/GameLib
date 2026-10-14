import { useTranslation } from 'react-i18next'

interface Props {
  /**
   * Diagnostic only, optional: WHY the caller is showing this placeholder --
   * `'suppressed'` (D-19), `'epic-surface'` (D-06), or `'suppressed+epic-surface'`
   * when both apply. Computed by the one call site
   * (`StoreEmbedSlotContents.tsx`) and surfaced verbatim as a
   * `data-placeholder-reason` attribute on the root div below. Added to close
   * `.planning/debug/resolved/embed-suppression-sticks.md`: that session's
   * entire misdiagnosis was possible because this exact component, with this
   * exact copy, renders for two mechanistically unrelated reasons (an active
   * suppression refcount, or simply being on the Epic surface before/after a
   * paint) and nothing distinguished which one was live. Dev/live-gate
   * inspection only (Web Inspector / AX tree) -- never rendered as visible
   * text, so it adds no pixel and no interactive control, and does not
   * reopen the "props-less and button-less by design" intent below.
   */
  reason?: string
}

/**
 * D-19 (Phase 40 Plan 06 Task 2): the styled slot filler shown in place of
 * the Steam store/wiki embed while `StoreEmbedSuppressionContext` reports
 * it suppressed. The embed is a native subview (see that context file's
 * doc comment) -- hiding it leaves a visually empty hole unless something
 * fills the slot, and an empty hole reads as a rendering glitch rather than
 * the intended "the store is dimmed behind your open dialog". This
 * component is that fill.
 *
 * Button-less by design (T-40-06-05's `accept` disposition covers only
 * hard-coded colours, not extra chrome): D-19's whole point is that hiding
 * should look like unremarkable dimming, not draw attention to itself with
 * an interactive control competing with whatever overlay caused the hide in
 * the first place. The one prop it takes (`reason`, above) is optional,
 * diagnostic-only and invisible -- calling it with zero arguments still
 * works and still renders identically, so this stays props-less in every
 * way that matters to that intent.
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
const StoreEmbedPlaceholder = ({ reason }: Props = {}) => {
  const { t: tGamelib } = useTranslation('gamelib')

  const message = tGamelib(
    'webview.embedPlaceholder.message',
    'Paused while a window is open'
  )

  return (
    <div className="WebView__embedPlaceholder" data-placeholder-reason={reason}>
      <p className="WebView__embedPlaceholder-message">{message}</p>
    </div>
  )
}

export default StoreEmbedPlaceholder
