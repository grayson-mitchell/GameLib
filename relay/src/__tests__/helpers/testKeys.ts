import { createPrivateKey, generateKeyPairSync } from 'crypto'

export interface TestKeys {
  pkcs8Pem: string
  pkcs1Pem: string
  publicKey: CryptoKey
}

let cached: Promise<TestKeys> | undefined

async function build(): Promise<TestKeys> {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  })
  const pkcs1Pem = createPrivateKey(privateKey).export({
    type: 'pkcs1',
    format: 'pem'
  }) as string
  const der = Buffer.from(
    publicKey.replace(/-----[^-]+-----|\s/g, ''),
    'base64'
  )
  const key = await crypto.subtle.importKey(
    'spki',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  )
  return { pkcs8Pem: privateKey, pkcs1Pem, publicKey: key }
}

export function generateTestKeys(): Promise<TestKeys> {
  cached ??= build()
  return cached
}
