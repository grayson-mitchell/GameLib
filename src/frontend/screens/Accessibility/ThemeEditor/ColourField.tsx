interface ColourFieldProps {
  id: string
  label: string
  value: string
  onCommit: (value: string) => void
  describedBy?: string
}

// RED stub: renders nothing so the ColourField behaviours fail on their assertions.
export function ColourField(_props: ColourFieldProps) {
  return null
}
