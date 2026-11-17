// RED stub: the real component lands in the GREEN commit.
import type { SupportsFn } from 'frontend/customThemes/validate'

interface GradientFieldProps {
  id: string
  label: string
  value: string
  onCommit: (value: string) => void
  supports?: SupportsFn
  allowEmpty?: boolean
  describedBy?: string
}

export function GradientField(_props: GradientFieldProps) {
  return null
}
