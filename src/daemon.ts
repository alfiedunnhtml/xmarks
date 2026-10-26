import { getDecryptedCredentials, type XmarksConfig } from './config.js'
import { configuredAccounts } from './accounts.js'
import { syncBookmarks } from './sync.js'
import { categorizeBookmarks } from './categorize.js'

export async function runDaemon(config: XmarksConfig): Promise<void> {
  const accounts = configuredAccounts(config)
  const legacy = getDecryptedCredentials(config)
  if (!accounts.length && legacy.authToken && legacy.ct0) accounts.push({ handle: '', authToken: legacy.authToken, ct0: legacy.ct0 })
  if (!accounts.length) throw new Error('No X accounts configured')
  let stopped = false
  const shutdown = () => { stopped = true }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  do {
    for (const account of accounts) {
      if (stopped) break
      console.log(`Syncing ${account.handle ? account.handle : 'legacy account'}...`)
      const result = await syncBookmarks(config.vaultPath, account.authToken, account.ct0, undefined, account.handle || undefined)
      if (result.error) console.error(`Sync failed for ${account.handle}: ${result.error}`)
      else {
        console.log(`Synced ${account.handle}: ${result.imported} new, ${result.skipped} existing, ${result.mediaDownloaded} thumbnails`)
        if (legacy.apiKey && result.imported) await categorizeBookmarks(config.vaultPath, legacy.apiKey, config.model)
      }
    }
    if (!stopped) await new Promise<void>(resolve => {
      const done = () => { process.off('SIGTERM', stop); process.off('SIGINT', stop); resolve() }
      const timer = setTimeout(done, config.syncIntervalMinutes * 60_000)
      const stop = () => { clearTimeout(timer); done() }
      process.once('SIGTERM', stop); process.once('SIGINT', stop)
    })
  } while (!stopped)
}
