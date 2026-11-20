/**
 * @jest-environment jsdom
 */
import 'frontend/testUtils/jsdomNoticeEnv'

import { cleanup, fireEvent, render } from '@testing-library/react'
import { Dialog } from '../components/Dialog'
import { StoreEmbedSuppressionProvider } from 'frontend/components/UI/NavShell/StoreEmbedSuppressionContext'
import { resetAllStores } from 'frontend/state/storeKit'

beforeEach(() => {
  Object.assign(window, {
    api: {
      storeNew: () => undefined,
      storeGet: (_name: string, _key: string, dflt?: unknown) => dflt,
      storeSet: () => undefined,
      storeSetChecked: () => Promise.resolve(true),
      gamepadAction: () => Promise.resolve()
    }
  })
})

afterEach(() => {
  cleanup()
  resetAllStores()
})

const closeButtons = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[aria-label="close"]'))
const closeButton = (): HTMLElement => {
  const [button] = closeButtons()
  if (!button) throw new Error('no close button')
  return button
}

describe('Dialog header slot (261121-dzl)', () => {
  it('261121-dzl D: no header renders one close button outside any header row', () => {
    render(
      <StoreEmbedSuppressionProvider>
        <Dialog showCloseButton onClose={jest.fn()}>
          <p>body</p>
        </Dialog>
      </StoreEmbedSuppressionProvider>
    )
    expect(closeButtons()).toHaveLength(1)
    expect(closeButton().closest('.Dialog__header')).toBeNull()
    expect(document.querySelector('.Dialog__header')).toBeNull()
  })

  it('261121-dzl E: a header renders in .Dialog__header beside the one close button', () => {
    const onClose = jest.fn()
    render(
      <StoreEmbedSuppressionProvider>
        <Dialog
          showCloseButton
          onClose={onClose}
          header={<span data-testid="hdr">Title</span>}
        >
          <p>body</p>
        </Dialog>
      </StoreEmbedSuppressionProvider>
    )
    const header = document.querySelector('.Dialog__header') as HTMLElement
    expect(header).not.toBeNull()
    expect(header.querySelector('[data-testid="hdr"]')).not.toBeNull()
    expect(closeButtons()).toHaveLength(1)
    expect(header.contains(closeButton())).toBe(true)
    fireEvent.click(closeButton())
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('261121-dzl F: showCloseButton false keeps the header close button in the DOM, hidden', () => {
    render(
      <StoreEmbedSuppressionProvider>
        <Dialog showCloseButton={false} onClose={jest.fn()} header={<b>T</b>}>
          <p>body</p>
        </Dialog>
      </StoreEmbedSuppressionProvider>
    )
    expect(closeButtons()).toHaveLength(1)
    expect(closeButton().style.display).toBe('')
    expect(getComputedStyle(closeButton()).display).toBe('none')
  })
})
