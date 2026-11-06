export interface ClipboardSync {
  clipboardWriteText: (text: string) => void
  copySystemInfoToClipboard: () => void
}

export interface ClipboardAsync {
  clipboardReadText: () => string
}
