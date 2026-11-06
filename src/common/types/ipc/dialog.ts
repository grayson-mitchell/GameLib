import type { OpenDialogOptions } from 'backend/platform'

// ts-prune-ignore-next
export interface DialogAsync {
  openDialog: (args: OpenDialogOptions) => Promise<string | false>
}
