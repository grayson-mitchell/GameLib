/**
 * @jest-environment jsdom
 */
import 'frontend/testUtils/jsdomNoticeEnv'

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { cleanup, render, screen } from '@testing-library/react'
import MessageBoxModal from '../index'
import { StoreEmbedSuppressionProvider } from 'frontend/components/UI/NavShell/StoreEmbedSuppressionContext'
import { resetAllStores } from 'frontend/state/storeKit'

void i18next.use(initReactI18next).init({
  lng: 'en',
  resources: {},
  initImmediate: false
})

beforeEach(() => {
  Object.assign(window, {
    api: {
      storeNew: () => undefined,
      storeGet: (_name: string, _key: string, dflt?: unknown) => dflt,
      storeSet: () => undefined,
      gamepadAction: () => Promise.resolve()
    }
  })
})

afterEach(() => {
  cleanup()
  resetAllStores()
})

const renderModal = (second: { autoFocus?: boolean }) =>
  render(
    <StoreEmbedSuppressionProvider>
      <MessageBoxModal
        title="Title"
        message={<p>Body</p>}
        type="MESSAGE"
        onClose={jest.fn()}
        buttons={[{ text: 'First' }, { text: 'Second', ...second }]}
      />
    </StoreEmbedSuppressionProvider>
  )

describe('MessageBoxModal button autoFocus', () => {
  it('focuses the button marked autoFocus when the dialog opens', () => {
    renderModal({ autoFocus: true })
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Second' })
    )
  })

  it('does not focus either footer button when none is marked', () => {
    renderModal({})
    expect(document.activeElement).not.toBe(
      screen.getByRole('button', { name: 'First' })
    )
    expect(document.activeElement).not.toBe(
      screen.getByRole('button', { name: 'Second' })
    )
  })
})
