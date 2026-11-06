import type { OpenDialogOptions } from 'backend/platform'

export interface DialogAsync {
  openDialog: (args: OpenDialogOptions) => Promise<string | false>
}
