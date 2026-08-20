import React, {
  ReactNode,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useState
} from 'react'
import {
  Dialog as MuiDialog,
  DialogContent,
  IconButton,
  Paper,
  Slide,
  styled
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'

import ContextProvider from 'frontend/state/ContextProvider'

interface DialogProps {
  className?: string
  children: ReactNode
  showCloseButton: boolean
  onClose: () => void
}

// quick-260820-kq0 round 3: MuiDialog's `TransitionProps` type is the bare
// react-transition-group `TransitionProps` (no `direction`), so `direction`
// can't be passed via `TransitionProps` on MuiDialog itself -- it has to be
// bound on the TransitionComponent. This forwardRef wrapper is MUI's own
// documented pattern for a directional Slide-transition Dialog.
const SlideUpTransition = forwardRef(function SlideUpTransition(
  props: React.ComponentProps<typeof Slide>,
  ref: React.Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />
})

// quick-260820-kq0 round 3: `.Dialog__element` (Dialog/index.css) intended a
// 10px paper radius for every Dialog, but is dead CSS -- no element in this
// MUI-based primitive ever carries that class, so every dialog in the app
// (25 consumers, see SUMMARY.md) fell back to MUI's default
// `theme.shape.borderRadius` (4px), reading as sharp-cornered. Fixed here,
// at the primitive, via a `styled(Paper)` override -- the same officially
// supported MUI v5 mechanism this component already uses for
// `backgroundColor` -- rather than an external stylesheet racing MUI's own
// emotion-injected paper class on specificity/injection order.
const StyledPaper = styled(Paper)(() => ({
  backgroundColor: 'var(--modal-background)',
  maxWidth: '100%',
  borderRadius: '10px',
  '&:has(.settingsDialogContent):not(:has(.logs-wrapper))': {
    height: '80%'
  },
  '&:has(.logs-wrapper))': {
    maxHeight: '80%'
  }
}))

export const Dialog: React.FC<DialogProps> = ({
  children,
  className,
  showCloseButton = false,
  onClose
}) => {
  const [open, setOpen] = useState(true)
  const { disableDialogBackdropClose } = useContext(ContextProvider)

  useEffect(() => {
    // HACK: Focussing the dialog using JS does not seem to work
    //       Instead, simulate one or two tab presses
    // One tab to focus the dialog
    window.api.gamepadAction({ action: 'tab' })
    // Second tab to skip the close button if it's shown
    if (showCloseButton) window.api.gamepadAction({ action: 'tab' })
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    onClose()
  }, [onClose])

  return (
    <MuiDialog
      open={open}
      onClose={(e, reason) => {
        if (disableDialogBackdropClose && reason === 'backdropClick') return
        close()
      }}
      scroll="paper"
      maxWidth="md"
      PaperComponent={StyledPaper}
      PaperProps={{
        className
      }}
      // quick-260820-kq0 round 3: the previous `sx` prop here targeted
      // `.Dialog__element` for `maxWidth`/`paddingTop` -- also dead, since
      // nothing in this component tree ever carries that class. Deliberately
      // DROPPED rather than realized: `maxWidth="md"` below and StyledPaper's
      // own `maxWidth: '100%'` already constrain width, and reviving an
      // unreviewed `min(700px, 85vw)`/`paddingTop` pair here would change
      // sizing for all 25 Dialog consumers as an undiscussed side effect of
      // a corners/animation fix. Out of scope; not carried forward.
      // The 500ms entrance transition it also intended IS carried forward,
      // below, via MUI's own transition props (see comment there).
      // quick-260820-kq0 round 3: the dead `.Dialog__element` rule also
      // intended a 500ms opacity/translateY entrance transition that never
      // fired (same reason as the radius above), so every dialog opened
      // instantly. MUI's own transition system replaces it here:
      // SlideUpTransition (direction="up") matches the dead rule's
      // translateY-from-below intent, at the same 500ms duration. This uses
      // MUI's supported TransitionComponent/transitionDuration props on
      // MuiDialog -- not a second, competing transition applied to the
      // Paper -- so there is exactly one entrance animation, replacing the
      // default Fade the same way MUI's own docs do for a directional
      // Dialog transition.
      TransitionComponent={SlideUpTransition}
      transitionDuration={500}
    >
      <>
        <IconButton
          aria-label="close"
          onClick={close}
          sx={{
            position: 'absolute',
            right: 8,
            // showCloseButton used for gamepad back actions, should always be in DOM
            display: showCloseButton ? 'auto' : 'none',
            top: 8,
            color: 'var(--text-default)'
          }}
        >
          <CloseIcon />
        </IconButton>
        <DialogContent>{children}</DialogContent>
      </>
    </MuiDialog>
  )
}
