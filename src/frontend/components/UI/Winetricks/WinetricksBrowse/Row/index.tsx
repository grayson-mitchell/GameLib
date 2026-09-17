import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import classNames from 'classnames'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faDownload,
  faSpinner,
  faCircleCheck,
  faCircleExclamation,
  faCircleInfo,
  faArrowsRotate,
  faArrowUpRightFromSquare
} from '@fortawesome/free-solid-svg-icons'
import type { WinetricksComponent } from 'common/types'
import {
  deriveRowState,
  type VerbErrorMap
} from 'common/winetricks/deriveRowState'
import './index.scss'

type Props = {
  component: WinetricksComponent
  installed: readonly string[]
  installing: boolean
  installingComponent: string
  erroredVerbs: VerbErrorMap
  onInstall: (verb: string) => void
  onOpenGui: () => void
}

// Phase 44, plan 03. The per-row component for the Winetricks Browse UI
// (replaces `WinetricksSearch`, which plan 44-05 deletes). No `selectedVerb`,
// no `isSelected`, no index prop -- C-2 (ROADMAP fence 2) is satisfied
// structurally: every handler below closes over `component.verb`, so there
// is no "current selection" concept anywhere in this file that could ever
// drift out of sync with what the user clicked.
export default function WinetricksBrowseRow({
  component,
  installed,
  installing,
  installingComponent,
  erroredVerbs,
  onInstall,
  onOpenGui
}: Props) {
  const { t } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')

  // MOUSE-CLICK RACE FIX, ported from `WinetricksSearch/index.tsx:52-104`
  // (D-19). Root cause, condensed from that file's full 27-line comment
  // (Phase 35 Plan 25, commit `366e719bb`, closing REQ-35-16 / the
  // `35-VERIFICATION.md` gap-2 finding): a live-measured `pnpm tauri:dev`
  // trace showed a real mouse click's `mousedown` correctly targets a list
  // button while the surrounding list is still mounted, but a parent-driven
  // remount (here: the post-install refetch swapping this row's action-slot
  // contents) can remove that button from the DOM within the same ~4-64ms
  // window before `mouseup`/`click` fire, so `click` is never synthesized
  // and the action handler never runs. Keyboard activation (Tab +
  // Enter/Space) is unaffected -- it dispatches `click` directly against the
  // still-focused element with no positional hit-test, so it cannot be
  // raced out by an intervening remount the way a mouse `mousedown` ->
  // `mouseup` pair can.
  //
  // Fix (UI-SPEC Interaction Contract §5): capture the action on
  // `mousedown`, before a remount has a chance to occur, instead of waiting
  // for `click`. `onClick` is kept (so keyboard activation still works) and
  // suppressed once via `suppressNextClick` so a real click that DOES land
  // (no race this time) does not invoke the action a second time. Kept as
  // one shared helper -- not three copies -- because every clickable row
  // action (Install, Retry, Open GUI) needs the identical guard; the
  // technique is free and correct for any clickable list row regardless of
  // whether this exact remount path is still reachable after this phase
  // ships.
  const suppressNextClick = useRef(false)

  const activate = (action: () => void) => ({
    onMouseDown: (event: React.MouseEvent) => {
      event.preventDefault()
      suppressNextClick.current = true
      action()
    },
    onClick: () => {
      if (suppressNextClick.current) {
        suppressNextClick.current = false
        return
      }
      action()
    }
  })

  const rowState = deriveRowState({
    verb: component.verb,
    installed,
    installing,
    installingComponent,
    erroredVerbs
  })

  const titleId = `wtb-title-${component.verb}`

  // Accessible names without a new locale key. Every action button's visible
  // label stays the bare verb ("Install"/"Retry"/"Open GUI", per the
  // UI-SPEC's CTA note); `aria-labelledby` then concatenates that label's own
  // `<span>` id with `titleId` so assistive tech announces e.g. "Install
  // Visual C++ 2019 libraries" from two already-localised fragments. This is
  // why plan 44-02 declined `44-PATTERNS.md`'s proposed 12th
  // `installAriaLabel` key -- the composition needs zero new strings.
  let actionSlotContent: React.ReactNode

  switch (rowState) {
    case 'needsGui': {
      // C-4 / ROADMAP fence 3, unconditional: no Install button for a
      // Needs-GUI verb in any state, ever. Neutral (`--text-secondary`
      // family), not accent, not danger -- this is routing to the right
      // tool, not a failure.
      const guiLabelId = `wtb-gui-label-${component.verb}`
      actionSlotContent = (
        <>
          <span className="WinetricksBrowse__tag WinetricksBrowse__tag--needsGui">
            <FontAwesomeIcon icon={faCircleInfo} />
            {tGamelib(
              'winetricksBrowse.needsGuiTag',
              'Needs the Winetricks GUI'
            )}
          </span>
          <button
            type="button"
            className="WinetricksBrowse__guiButton"
            aria-labelledby={`${guiLabelId} ${titleId}`}
            {...activate(onOpenGui)}
          >
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
            <span id={guiLabelId}>
              {t('winetricks.openGUI', 'Open Winetricks GUI')}
            </span>
          </button>
        </>
      )
      break
    }

    case 'installing': {
      actionSlotContent = (
        <span className="WinetricksBrowse__tag WinetricksBrowse__tag--installing">
          <FontAwesomeIcon icon={faSpinner} className="fa-spin-pulse" />
          {tGamelib('winetricksBrowse.installingRow', 'Installing…')}
        </span>
      )
      break
    }

    case 'installingElsewhere': {
      // A guarded no-op with an explanation, never a silent dead button --
      // the `title` attribute reuses the already-shipped
      // `translation.json` `winetricks.installing` key (D-20 flagged this as
      // a likely surviving consumer; this row is that consumer).
      const installLabelId = `wtb-install-label-${component.verb}`
      actionSlotContent = (
        <button
          type="button"
          className="WinetricksBrowse__installButton"
          disabled
          title={t(
            'winetricks.installing',
            'Installation in progress: {{component}}',
            { component: installingComponent }
          )}
          aria-labelledby={`${installLabelId} ${titleId}`}
        >
          <FontAwesomeIcon icon={faDownload} />
          <span id={installLabelId}>{t('winetricks.install', 'Install')}</span>
        </button>
      )
      break
    }

    case 'installed': {
      // D-12: badge only, no reinstall affordance. `winetricksInstall` is
      // technically re-invocable; withholding the button is a product
      // decision, not a capability limit.
      actionSlotContent = (
        <span className="WinetricksBrowse__tag WinetricksBrowse__tag--installed">
          <FontAwesomeIcon icon={faCircleCheck} />
          {tGamelib('winetricksBrowse.installedTag', 'Installed')}
        </span>
      )
      break
    }

    case 'errored': {
      const retryLabelId = `wtb-retry-label-${component.verb}`
      actionSlotContent = (
        <>
          <span className="WinetricksBrowse__tag WinetricksBrowse__tag--errored">
            <FontAwesomeIcon icon={faCircleExclamation} />
            {tGamelib('winetricksBrowse.installFailedTag', 'Install failed')}
          </span>
          <button
            type="button"
            className="WinetricksBrowse__retryButton"
            aria-labelledby={`${retryLabelId} ${titleId}`}
            {...activate(() => onInstall(component.verb))}
          >
            <FontAwesomeIcon icon={faArrowsRotate} />
            <span id={retryLabelId}>
              {tGamelib('winetricksBrowse.retry', 'Retry')}
            </span>
          </button>
        </>
      )
      break
    }

    case 'available': {
      const installLabelId = `wtb-install-label-${component.verb}`
      actionSlotContent = (
        <button
          type="button"
          className="WinetricksBrowse__installButton"
          aria-labelledby={`${installLabelId} ${titleId}`}
          {...activate(() => onInstall(component.verb))}
        >
          <FontAwesomeIcon icon={faDownload} />
          <span id={installLabelId}>{t('winetricks.install', 'Install')}</span>
        </button>
      )
      break
    }

    default: {
      // Exhaustiveness guard: a future seventh `WinetricksRowState` member
      // is a compile error here, not a silent fall-through.
      const exhaustive: never = rowState
      throw new Error(`Unhandled WinetricksRowState: ${String(exhaustive)}`)
    }
  }

  return (
    <div className="WinetricksBrowse__row">
      <span id={titleId} className="WinetricksBrowse__rowTitle">
        {component.title}
      </span>
      <span className="WinetricksBrowse__rowVerb">{component.verb}</span>
      {component.cached === true && (
        <span
          className={classNames(
            'WinetricksBrowse__tag',
            'WinetricksBrowse__tag--cached'
          )}
        >
          <FontAwesomeIcon icon={faCircleCheck} />
          {tGamelib('winetricksBrowse.cachedTag', 'Cached (installs offline)')}
        </span>
      )}
      <div className="WinetricksBrowse__actionSlot">{actionSlotContent}</div>
    </div>
  )
}
