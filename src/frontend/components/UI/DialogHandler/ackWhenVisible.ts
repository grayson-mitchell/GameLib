interface VisibilityDocument {
  visibilityState: string
  addEventListener: (type: 'visibilitychange', listener: () => void) => void
  removeEventListener: (type: 'visibilitychange', listener: () => void) => void
}

/**
 * Sends `send(ackId)` once the document is visible: immediately when it already
 * is, otherwise on the first `visibilitychange` to visible. Returns a cleanup
 * that cancels a pending send. Sends at most once.
 */
export function ackWhenVisible(
  ackId: string,
  send: (ackId: string) => void,
  doc: VisibilityDocument
): () => void {
  if (doc.visibilityState === 'visible') {
    send(ackId)
    return () => {}
  }
  const onChange = () => {
    if (doc.visibilityState !== 'visible') return
    doc.removeEventListener('visibilitychange', onChange)
    send(ackId)
  }
  doc.addEventListener('visibilitychange', onChange)
  return () => doc.removeEventListener('visibilitychange', onChange)
}
