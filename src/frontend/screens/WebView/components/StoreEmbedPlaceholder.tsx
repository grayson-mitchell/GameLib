import { useTranslation } from 'react-i18next'

interface Props {
  /**
   * WHY the caller is showing this placeholder -- `'suppressed'` (D-19),
   * `'epic-surface'` (D-06), or `'suppressed-and-epic-surface'` when both apply.
   * Computed by the one call site (`StoreEmbedSlotContents.tsx`) and
   * surfaced verbatim as a `data-placeholder-reason` attribute on the root
   * div below, which stays diagnostic-only (Web Inspector / AX tree). Added
   * to close `.planning/debug/resolved/embed-suppression-sticks.md`: that
   * session's entire misdiagnosis was possible because this exact
   * component, with this exact copy, rendered for two mechanistically
   * unrelated reasons (an active suppression refcount, or simply being on
   * the Epic surface before/after a paint) and nothing distinguished which
   * one was live.
   *
   * As of the `2026-10-14-paused-while-a-window-is-open-...` todo (option 3,
   * operator-locked 2026-10-14), this value ALSO gates the visible message
   * paragraph below: it renders for every value except exactly
   * `'epic-surface'`, where no window is open and the sentence would be
   * false. The attribute itself is still diagnostic-only and adds no
   * interactive control, so the "props-less and button-less by design"
   * intent below is untouched -- only the invisibility claim changes.
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
 * On the Epic surface (D-06) the same fill exists to be seen THROUGH a
 * transparent subview rather than read as a message -- no window is open
 * there, so the copy is withheld (option 3, operator-locked 2026-10-14; see
 * `reason` below). The styled fill itself is unchanged in that case, so the
 * slot is never actually an empty hole; only the text goes.
 *
 * Button-less by design (T-40-06-05's `accept` disposition covers only
 * hard-coded colours, not extra chrome): D-19's whole point is that hiding
 * should look like unremarkable dimming, not draw attention to itself with
 * an interactive control competing with whatever overlay caused the hide in
 * the first place. The one prop it takes (`reason`, above) is optional and
 * mostly diagnostic -- calling it with zero arguments still works and still
 * renders identically to today, so this stays props-less in every way that
 * matters to that intent. (It is no longer invisible for every value: see
 * `reason`'s doc comment.)
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

  // Option 3 of the todo, operator-locked 2026-10-14: the Epic-surface-only
  // reason is the sole call shape with no window open, so it is the sole
  // shape that withholds the copy. Every other reason (including no reason
  // at all) keeps rendering the paragraph unchanged.
  const showMessage = reason !== 'epic-surface'

  return (
    <div className="WebView__embedPlaceholder" data-placeholder-reason={reason}>
      {showMessage && (
        <p className="WebView__embedPlaceholder-message">{message}</p>
      )}
    </div>
  )
}

export default StoreEmbedPlaceholder
