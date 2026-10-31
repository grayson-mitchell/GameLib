import React, { useEffect, useRef, useState } from 'react'
import './index.scss'

interface PopoverComponentProps {
  item: React.ReactElement
  children: React.ReactElement | React.ReactNode | React.ReactNode[]
}

export function bindPopoverDismiss(
  doc: EventTarget,
  isInside: (target: EventTarget | null) => boolean,
  close: (reason: 'escape' | 'outside') => void
): () => void {
  const onClick = (event: Event) => {
    if (!isInside(event.target)) close('outside')
  }
  const onKeyDown = (event: Event) => {
    if ((event as KeyboardEvent).key === 'Escape') close('escape')
  }
  doc.addEventListener('click', onClick)
  doc.addEventListener('keydown', onKeyDown)
  return () => {
    doc.removeEventListener('click', onClick)
    doc.removeEventListener('keydown', onKeyDown)
  }
}

const PopoverComponent: React.FC<PopoverComponentProps> = ({
  item,
  children
}) => {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)

  const handleClick = () => {
    setOpen(!open)
  }

  useEffect(() => {
    if (!open) return
    // listeners exist only while the popover is open; unbind on close/unmount
    return bindPopoverDismiss(
      document,
      (t) => !!wrapper.current?.contains(t as Node),
      (reason) => {
        setOpen(false)
        if (reason === 'escape') {
          // keep keyboard users on the trigger instead of dropping to <body>
          wrapper.current
            ?.querySelector<HTMLElement>('button, [tabindex]')
            ?.focus()
        }
      }
    )
  }, [open])

  return (
    <div className="popover-wrapper" ref={wrapper}>
      {React.cloneElement(item, {
        onClick: handleClick,
        'aria-expanded': open,
        style: { cursor: 'pointer' }
      })}
      {open && (
        <div id={item.props.id} className="popover">
          {children}
        </div>
      )}
    </div>
  )
}

export default PopoverComponent
