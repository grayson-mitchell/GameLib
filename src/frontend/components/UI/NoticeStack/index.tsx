import type { ReactNode } from 'react'

import SteamEngineLaunchNotice from 'frontend/components/UI/SteamEngineLaunchNotice'
import ReadOnlyStoresNotice from 'frontend/components/UI/ReadOnlyStoresNotice'
import ThemeSaveFailedNotice from 'frontend/components/UI/ThemeSaveFailedNotice'
import RemovalRefusedNotice from 'frontend/components/UI/RemovalRefusedNotice'
import HumbleExpiryToast from 'frontend/components/UI/HumbleExpiryToast'
import './index.scss'

// Sketch 006: every bottom-right notice lives in this ONE region; no notice
// positions itself.
export default function NoticeStack({ children }: { children: ReactNode }) {
  return <div className="noticeStack">{children}</div>
}

// Steam first, Humble last: the Humble prompt sits nearest the corner and the
// transient Steam notices appear and collapse above it without moving it. The
// read-only stores notice (phase 68, data integrity) sits between them: above
// the Humble prompt, below the transient Steam notices. The theme save-failure
// notice (phase 64) follows it: also data that did not reach disk, also dismissed by hand. The
// removal-refusal toasts (phase 82) come next: also something the user must acknowledge.
export function AppNoticeStack() {
  return (
    <NoticeStack>
      <SteamEngineLaunchNotice />
      <ReadOnlyStoresNotice />
      <ThemeSaveFailedNotice />
      <RemovalRefusedNotice />
      <HumbleExpiryToast />
    </NoticeStack>
  )
}
