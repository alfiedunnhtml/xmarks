import { createInterface } from 'readline'
import { decrypt, encrypt, saveConfig, type XmarksConfig } from './config.js'
import { testConnection } from './twitter-api.js'

export type Account = { handle: string; authToken: string; ct0: string }
export function configuredAccounts(config: XmarksConfig): Account[] {
  return (config.accounts ?? []).map(a => ({ handle: a.handle, authToken: decrypt(a.authToken), ct0: decrypt(a.ct0) }))
}
export async function addAccount(config: XmarksConfig): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const ask = (q: string) => new Promise<string>(resolve => rl.question(q, a => resolve(a.trim())))
  try {
    const handle = (await ask('X account handle (without @): ')).replace(/^@/, '').toLowerCase()
    if (!/^[a-z0-9_]{1,15}$/.test(handle)) throw new Error('Invalid X handle')
    if (config.accounts?.some(a => a.handle === handle)) throw new Error('Account is already configured')
    console.log('Provide the X cookies for this account. Do not share them in chat.')
    const token = await ask('auth_token: ')
    const ct0 = await ask('ct0: ')
    if (!token || !ct0) throw new Error('Both cookies are required')
    await testConnection(token, ct0)
    config.accounts = [...(config.accounts ?? []), { handle, authToken: encrypt(token), ct0: encrypt(ct0) }]
    saveConfig(config)
    console.log(`Account @${handle} added. Restart the xmarks service to start its sync.`)
  } finally { rl.close() }
}
