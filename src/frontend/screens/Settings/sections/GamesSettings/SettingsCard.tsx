import type { ReactNode } from 'react'

// quick-261121-dzl (sketch 009 #7): a bordered card with a heading. A div on
// purpose: index.scss gives every `section` a 500px floor.
export default function SettingsCard({
  title,
  children
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="settingsCard">
      <h3 className="settingsCard__title">{title}</h3>
      {children}
    </div>
  )
}
