import { DMQueueElement, DMStatus } from 'common/types'
import { isRunner } from 'common/utils'

// Pure list logic behind downloadqueue.ts's finished history. Kept free of the
// store and of storeManagers so it can be tested without module mocks (69-12).

/** Elements whose runner is a known store; unknown-runner entries are dropped. */
export function keepKnownRunnerElements(
  list: DMQueueElement[]
): DMQueueElement[] {
  return list.filter((element) => isRunner(element?.params?.runner))
}

/** Replace the entry for the same appName in place, or append a new one. */
export function upsertFinished(
  elements: DMQueueElement[],
  element: DMQueueElement,
  status: DMStatus
): DMQueueElement[] {
  const elementIndex = elements.findIndex(
    (el) => el.params.appName === element.params.appName
  )
  if (elementIndex >= 0) {
    elements[elementIndex] = { ...element, status: status ?? 'abort' }
  } else {
    elements.push({ ...element, status })
  }
  return elements
}
