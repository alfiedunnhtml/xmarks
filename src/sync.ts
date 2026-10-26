import { appendFileSync } from 'fs'
import { join } from 'path'
import { fetchBookmarksPage } from './twitter-api.js'
import { bookmarkFiles, writeBookmark, addBookmarkAccount } from './markdown.js'
import { downloadThumbnails } from './media.js'
import type { TweetData } from './twitter-api.js'

export interface SyncResult { imported: number; skipped: number; mediaDownloaded: number; error?: string }
type FetchPage = (auth: string, ct0: string, cursor?: string) => Promise<{ tweets: TweetData[]; nextCursor: string | null }>
export async function syncBookmarks(vaultPath: string, authToken: string, ct0: string,
  onProgress?: (msg: string) => void, account?: string,
  fetchPage: FetchPage = fetchBookmarksPage, download = downloadThumbnails): Promise<SyncResult> {
  let imported = 0, skipped = 0, mediaDownloaded = 0
  let cursor: string | undefined
  const visited = new Set<string>()
  try {
    const files = bookmarkFiles(vaultPath)
    for (let page = 0; page < 1000; page++) {
      onProgress?.(`Fetching page ${page + 1}...`)
      const { tweets, nextCursor } = await fetchPage(authToken, ct0, cursor)
      for (const tweet of tweets) {
        const path = files.get(tweet.tweetId)
        if (path) {
          if (account) addBookmarkAccount(path, account)
          skipped++
        } else {
          writeBookmark(vaultPath, tweet, undefined, account)
          const newPath = bookmarkFiles(vaultPath).get(tweet.tweetId)
          if (!newPath) throw new Error(`Unable to verify saved post ${tweet.tweetId}`)
          files.set(tweet.tweetId, newPath)
          imported++
          mediaDownloaded += await download(vaultPath, tweet)
        }
      }
      if (!nextCursor) break
      if (visited.has(nextCursor) && tweets.length === 0) break
      if (visited.has(nextCursor)) throw new Error('X returned a repeated pagination cursor with posts')
      if (page === 999) throw new Error('Bookmark scan reached the page limit')
      visited.add(nextCursor)
      cursor = nextCursor
      await new Promise(r => setTimeout(r, 300))
    }
    appendFileSync(join(vaultPath, 'sync.log'), `${new Date().toISOString()} | account: ${account ?? 'unlabelled'} | imported: ${imported}, skipped: ${skipped}, media: ${mediaDownloaded}\n`, 'utf8')
    return { imported, skipped, mediaDownloaded }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    appendFileSync(join(vaultPath, 'sync.log'), `${new Date().toISOString()} | account: ${account ?? 'unlabelled'} | ERROR: ${error}\n`, 'utf8')
    return { imported, skipped, mediaDownloaded, error }
  }
}
