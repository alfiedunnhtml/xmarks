import { createInterface } from 'readline'
import { decrypt, encrypt, saveConfig, type XmarksConfig } from './config.js'
import { updateAccountViews } from './base.js'
import { testConnection } from './twitter-api.js'

export type Account = { handle: string; authToken: string; ct0: string }
export function configuredAccounts(config: XmarksConfig): Account[] {
  return (config.accounts ?? []).map(a => ({ handle: a.handle, authToken: decrypt(a.authToken), ct0: decrypt(a.ct0) }))
}
export async function addAccount(config: XmarksConfig): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const ask = (q: string) => new Promise<string>(resolve => rl.question(q, a => resolve(a.trim())))
  try {
    const handle = (await ask('Account label (for example, Panda Press): '))
    if (!handle || handle.length > 80 || /[\r\n]/.test(handle)) throw new Error('Invalid account label')
    if (config.accounts?.some(a => a.handle === handle)) throw new Error('Account is already configured')
    console.log('Provide the X cookies for this account. Do not share them in chat.')
    const token = await ask('auth_token: ')
    const ct0 = await ask('ct0: ')
    if (!token || !ct0) throw new Error('Both cookies are required')
    await testConnection(token, ct0)
    config.accounts = [...(config.accounts ?? []), { handle, authToken: encrypt(token), ct0: encrypt(ct0) }]
    saveConfig(config)
    updateAccountViews(config)
    console.log(`Account ${handle} added. Restart the xmarks service to start its sync.`)
  } finally { rl.close() }
}

export async function labelLegacy(config: XmarksConfig): Promise<void> {
  if (!config.twitterAuth) throw new Error('No legacy account is configured')
  if (config.accounts?.length) throw new Error('Accounts are already configured')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const handle = await new Promise<string>(resolve => rl.question('Label for the existing X account: ', a => resolve(a.trim())))
  rl.close()
  if (!handle || handle.length > 80 || /[\r\n]/.test(handle)) throw new Error('Invalid account label')
  const { readFileSync, existsSync } = await import('fs')
  const { join } = await import('path')
  const { bookmarkFiles, addBookmarkAccount } = await import('./markdown.js')
  const index = join(config.vaultPath, '.tweet-ids')
  const ids = new Set(existsSync(index) ? readFileSync(index, 'utf8').split('\n').filter(Boolean) : [])
  const files = bookmarkFiles(config.vaultPath)
  for (const [id, path] of files) if (ids.has(id)) addBookmarkAccount(path, handle)
  config.accounts = [{ handle, ...config.twitterAuth }]
  delete config.twitterAuth
  saveConfig(config)
  updateAccountViews(config)
  console.log(`Existing account labelled ${handle}.`)
}
