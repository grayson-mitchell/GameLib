import axios from 'axios'
import { storeCapabilities } from 'common/storeCapabilities'
import { Runner } from 'common/types'
import { umuStore } from '../stores'

interface GameObject {
  title: string
  umu_id: string
}
const storeMapping: Record<Runner, string> = {
  gog: 'gog',
  legendary: 'egs',
  nile: 'amazon',
  sideload: 'sideload',
  steam: 'steam'
}

export async function getUmuId(
  appName: string,
  runner: Runner
): Promise<string | null> {
  // if it's a sideload, there won't be any umu id
  if (!storeCapabilities[runner].hasStoreCatalog) {
    return null
  }

  const store = storeMapping[runner]
  const key = `${runner}_${appName}`
  const cachedValue = umuStore.get(key)
  if (cachedValue) {
    return cachedValue
  }
  const response = await axios
    .get<GameObject[]>('https://umu.openwinecomponents.org/umu_api.php', {
      params: { codename: appName.toLowerCase(), store }
    })
    .catch(() => null)

  if (!response || response.status !== 200) {
    return null
  }
  const [firstMatch] = response.data
  if (firstMatch === undefined) {
    umuStore.set(key, null)
    return null
  }
  const umuId = firstMatch.umu_id
  umuStore.set(key, umuId)
  return umuId
}
