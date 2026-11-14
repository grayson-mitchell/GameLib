/** 79-22: the depot order is read from a Rust client's product-info result, with no `_send` tap. */
import { createAppinfoOrder } from '../appinfoOrder'

describe('appinfoOrder with a Rust-backed client', () => {
  it('records depotOrder from the getProductInfo result and installs no tap', async () => {
    const order = createAppinfoOrder()
    const client = {
      getProductInfo: jest.fn((..._a: unknown[]) =>
        Promise.resolve({
          apps: { 200510: { depotOrder: [225341, '200522'] }, 7: {} }
        })
      )
    }
    const result = await order.withAppInfoOrderCapture(client, () =>
      client.getProductInfo([200510], [], true)
    )
    expect(result.apps[200510]).toBeDefined()
    expect(order.getAppInfoDepotOrder('200510')).toEqual(['225341', '200522'])
    expect(order.getAppInfoDepotOrder('7')).toBeUndefined()
    expect('_send' in client).toBe(false)
  })

  it('ignores a malformed depotOrder', async () => {
    const order = createAppinfoOrder()
    await order.withAppInfoOrderCapture({}, () =>
      Promise.resolve({ apps: { 5: { depotOrder: ['x'] } } })
    )
    expect(order.getAppInfoDepotOrder('5')).toBeUndefined()
  })
})
