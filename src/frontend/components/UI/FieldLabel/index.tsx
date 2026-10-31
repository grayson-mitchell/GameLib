import { ReactNode } from 'react'
import classnames from 'classnames'
import './index.css'

interface Props {
  htmlId: string
  label: string
  help?: ReactNode
  className?: string
}

// Renders a field label. With `help`, the help trigger sits beside the label
// (never inside it: a button inside a <label> is invalid and would activate
// the labelled control).
export default function FieldLabel({ htmlId, label, help, className }: Props) {
  if (!help) {
    return (
      <label htmlFor={htmlId} className={className}>
        {label}
      </label>
    )
  }

  return (
    <div className="fieldLabelRow">
      <label
        htmlFor={htmlId}
        className={classnames('fieldLabelRow__label', className)}
      >
        {label}
      </label>
      {help}
    </div>
  )
}
