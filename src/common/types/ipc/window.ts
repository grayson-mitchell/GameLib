// ts-prune-ignore-next
export interface WindowSync {
  setZoomFactor: (zoomFactor: string) => void
  minimizeWindow: () => void
  maximizeWindow: () => void
  unmaximizeWindow: () => void
  closeWindow: () => void
  setFullscreen: (enabled: boolean) => void
}

// ts-prune-ignore-next
export interface WindowAsync {
  isFullscreen: () => boolean
  isFrameless: () => boolean
  isMaximized: () => boolean
  isMinimized: () => boolean
}
