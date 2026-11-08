import type { ReactNode } from 'react'

import SteamEngineLaunchNotice from 'frontend/components/UI/SteamEngineLaunchNotice'
import ReadOnlyStoresNotice from 'frontend/components/UI/ReadOnlyStoresNotice'
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
// the Humble prompt, below the transient Steam notices.
export function AppNoticeStack() {
  return (
    <NoticeStack>
      <SteamEngineLaunchNotice />
      <ReadOnlyStoresNotice />
      <HumbleExpiryToast />
    </NoticeStack>
  )
}
