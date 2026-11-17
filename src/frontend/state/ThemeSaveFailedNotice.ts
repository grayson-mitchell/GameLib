import { create } from 'zustand'

interface ThemeSaveFailedNoticeStore {
  /** The theme whose Save was refused, or null when no notice is owed. */
  name: string | null
  /** Bumped by every `show`, so a repeat failure of the same theme re-shows the notice. */
  seq: number
  show: (name: string) => void
  dismiss: () => void
}

// Phase 64 (D-05, user decision 2026-11-18): written only by the theme editor when the config
// store refuses a Save. The notice itself lives in the bottom-right stack.
export const useThemeSaveFailedNotice = create<ThemeSaveFailedNoticeStore>()(
  (set) => ({
    name: null,
    seq: 0,
    show: (name) => set((s) => ({ name, seq: s.seq + 1 })),
    dismiss: () => set({ name: null })
  })
)
