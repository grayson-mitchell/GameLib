// RED stub: the real component lands in the GREEN commit.
interface AdvancedSectionProps {
  base: string
  draft: Readonly<Record<string, string>>
  onCommit: (token: string, value: string) => void
}

export function AdvancedSection(_props: AdvancedSectionProps) {
  return null
}
