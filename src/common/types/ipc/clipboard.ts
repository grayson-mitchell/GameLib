// ts-prune-ignore-next
export interface ClipboardSync {
  clipboardWriteText: (text: string) => void
  copySystemInfoToClipboard: () => void
}

// ts-prune-ignore-next
export interface ClipboardAsync {
  clipboardReadText: () => string
}
