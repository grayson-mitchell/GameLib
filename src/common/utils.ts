import { Runner } from './types'

export const storeMap: { [key in Runner]: string | undefined } = {
  legendary: 'epic',
  gog: 'gog',
  nile: 'amazon',
  sideload: undefined,
  steam: 'steam'
}

export function isRunner(value: unknown): value is Runner {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(storeMap, value)
  )
}
