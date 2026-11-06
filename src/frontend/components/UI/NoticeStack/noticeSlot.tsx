import { useEffect } from 'react'
import type { AnimationEvent, ReactNode } from 'react'

// in -> leaving (exit animation) -> collapsing (slot closes) -> removed.
export type NoticePhase = 'in' | 'leaving' | 'collapsing'

// Safety net when an animationend never arrives (hidden window, a theme that
// kills animations): comfortably above the 180ms exit and 200ms slot close.
// ts-prune-ignore-next
export const PHASE_FALLBACK_MS = 500

const NOTICE_EXIT_ANIMATIONS = [
  'noticeStackToastOut',
  'noticeStackToastFadeOut'
]
const NOTICE_SLOT_CLOSE_ANIMATION = 'noticeStackSlotClose'

// Phase fallback (T-vvz-02): never get stuck if animationend is lost.
// `key` identifies the notice instance (seq / show count) so a replacement
// restarts the timer.
export function useNoticePhaseFallback(
  phase: NoticePhase | null,
  key: unknown,
  toCollapsing: () => void,
  remove: () => void
) {
  useEffect(() => {
    if (!phase || phase === 'in') return
    const id = setTimeout(
      () => (phase === 'leaving' ? toCollapsing() : remove()),
      PHASE_FALLBACK_MS
    )
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on key/phase; the callbacks close over the current notice
  }, [key, phase])
}

// A plain (non-hook, non-component) helper: one slot + toast. It must stay a
// function returning JSX so tree-walking tests see the toast, not an
// unexpanded component element.
export function renderNoticeSlot(o: {
  slotKey: string
  toastKey: string | number
  phase: NoticePhase
  toastClassName?: string
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  toCollapsing: () => void
  remove: () => void
  children: ReactNode
}) {
  const toastClass = [
    'noticeStackToast',
    o.phase !== 'in' ? 'noticeStackToast--leaving' : '',
    o.toastClassName ?? ''
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div
      key={o.slotKey}
      className={
        'noticeStackSlot' +
        (o.phase === 'collapsing' ? ' noticeStackSlot--collapsing' : '')
      }
      onAnimationEnd={(e: AnimationEvent) => {
        if (
          e.target === e.currentTarget &&
          e.animationName === NOTICE_SLOT_CLOSE_ANIMATION &&
          o.phase === 'collapsing'
        )
          o.remove()
      }}
    >
      <div>
        <div
          key={o.toastKey}
          className={toastClass}
          role="status"
          onMouseEnter={o.onMouseEnter}
          onMouseLeave={o.onMouseLeave}
          onAnimationEnd={(e: AnimationEvent) => {
            if (
              e.target === e.currentTarget &&
              NOTICE_EXIT_ANIMATIONS.includes(e.animationName) &&
              o.phase === 'leaving'
            )
              o.toCollapsing()
          }}
        >
          {o.children}
        </div>
      </div>
    </div>
  )
}
