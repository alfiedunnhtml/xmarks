import { existsSync, writeFileSync, readdirSync, readFileSync, appendFileSync } from 'fs'
import { join } from 'path'
import { parse as parseYaml } from 'yaml'
import type { TweetData } from './twitter-api.js'

const TWEET_INDEX_FILE = '.tweet-ids'
const notesDir = (vaultPath: string) => process.env.XMARKS_NOTES_DIR || join(vaultPath, 'bookmarks')

function getIndexPath(vaultPath: string): string {
  return join(vaultPath, TWEET_INDEX_FILE)
}

export function loadTweetIndex(vaultPath: string): Set<string> {
  const indexPath = getIndexPath(vaultPath)
  if (!existsSync(indexPath)) {
    // Build index from existing files on first run
    return rebuildTweetIndex(vaultPath)
  }
  const content = readFileSync(indexPath, 'utf8')
  return new Set(content.split('\n').filter(Boolean))
}

export function rebuildTweetIndex(vaultPath: string): Set<string> {
  const bookmarksDir = notesDir(vaultPath)
  const ids = new Set<string>()
  if (!existsSync(bookmarksDir)) return ids

  const files = readdirSync(bookmarksDir).filter(f => f.endsWith('.md') && readFileSync(join(bookmarksDir, f), 'utf8').match(/^tweetId: "\d+"$/m))
  for (const file of files) {
    const content = readFileSync(join(bookmarksDir, file), 'utf8')
    const match = content.match(/^tweetId: "(\d+)"$/m)
    if (match) ids.add(match[1])
  }

  // Write the index file
  writeFileSync(getIndexPath(vaultPath), [...ids].join('\n') + '\n', 'utf8')
  return ids
}

export function appendToTweetIndex(vaultPath: string, tweetId: string): void {
  appendFileSync(getIndexPath(vaultPath), tweetId + '\n', 'utf8')
}

function slugify(text: string, maxLen = 40): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLen)
    .replace(/-$/, '')
}

function formatDate(date: Date | null): string {
  if (!date) return new Date().toISOString().split('T')[0]
  return date.toISOString().split('T')[0]
}

export function tweetToMarkdown(tweet: TweetData, account?: string): string {
  const date = formatDate(tweet.createdAt)
  const now = new Date().toISOString()

  let frontmatter = `---\n`
  frontmatter += `tweetId: "${tweet.tweetId}"\n`
  frontmatter += `author: "@${tweet.authorHandle}"\n`
  frontmatter += `authorName: "${tweet.authorName.replace(/"/g, '\\"')}"\n`
  frontmatter += `date: ${date}\n`
  frontmatter += `bookmarkedAt: ${now}\n`
  frontmatter += `categories: []\n`
  frontmatter += `semanticTags: []\n`
  frontmatter += `source: bookmark\n`
  if (account) frontmatter += `bookmarkAccounts: ${JSON.stringify([account])}\n`
  frontmatter += `url: https://x.com/${tweet.authorHandle}/status/${tweet.tweetId}\n`
  frontmatter += `categorized: false\n`
  frontmatter += `---\n`

  let body = `\n${tweet.text}\n`

  if (tweet.mediaUrls.length > 0) {
    body += `\n## Media\n`
    for (const media of tweet.mediaUrls) {
      const filename = `${tweet.tweetId}-${tweet.mediaUrls.indexOf(media)}.jpg`
      body += `![[! attachments/X Bookmarks/${filename}]]\n`
    }
  }

  if (tweet.urls.length > 0) {
    body += `\n## Links\n`
    for (const url of tweet.urls) {
      body += `- ${url}\n`
    }
  }

  return frontmatter + body
}

export function generateFilename(tweet: TweetData): string {
  const date = formatDate(tweet.createdAt)
  const slug = slugify(tweet.text) || tweet.tweetId
  return `${date}-@${tweet.authorHandle}-${slug}-${tweet.tweetId}.md`
}

export function writeBookmark(vaultPath: string, tweet: TweetData, index?: Set<string>, account?: string): boolean {
  // Use index for O(1) lookup if provided, fall back to file scan
  if (index) {
    if (index.has(tweet.tweetId)) return false
  } else if (bookmarkExists(vaultPath, tweet.tweetId)) {
    return false
  }

  const filename = generateFilename(tweet)
  const filepath = join(notesDir(vaultPath), filename)
  const content = tweetToMarkdown(tweet, account)
  writeFileSync(filepath, content, { encoding: 'utf8', flag: 'wx' })

  // Update index
  if (index) {
    index.add(tweet.tweetId)
    appendToTweetIndex(vaultPath, tweet.tweetId)
  }

  return true // written
}

export function bookmarkExists(vaultPath: string, tweetId: string): boolean {
  const bookmarksDir = notesDir(vaultPath)
  if (!existsSync(bookmarksDir)) return false

  const files = readdirSync(bookmarksDir).filter(f => f.endsWith('.md') && readFileSync(join(bookmarksDir, f), 'utf8').match(/^tweetId: "\d+"$/m))
  for (const file of files) {
    const content = readFileSync(join(bookmarksDir, file), 'utf8')
    if (content.includes(`tweetId: "${tweetId}"`)) return true
  }
  return false
}

export function getUncategorizedBookmarks(vaultPath: string): { filepath: string; content: string }[] {
  const bookmarksDir = notesDir(vaultPath)
  if (!existsSync(bookmarksDir)) return []

  const files = readdirSync(bookmarksDir).filter(f => f.endsWith('.md') && readFileSync(join(bookmarksDir, f), 'utf8').match(/^tweetId: "\d+"$/m))
  const uncategorized: { filepath: string; content: string }[] = []

  for (const file of files) {
    const filepath = join(bookmarksDir, file)
    const content = readFileSync(filepath, 'utf8')
    if (content.includes('categorized: false')) {
      uncategorized.push({ filepath, content })
    }
  }

  return uncategorized
}

export function updateFrontmatter(
  filepath: string,
  updates: Record<string, string | string[] | boolean>,
): void {
  const content = readFileSync(filepath, 'utf8')
  const fmEnd = content.indexOf('---', 3)
  if (fmEnd === -1) return

  let frontmatter = content.slice(0, fmEnd + 3)
  const body = content.slice(fmEnd + 3)

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}:.*$`, 'm')
    let formatted: string
    if (Array.isArray(value)) {
      formatted = `${key}: [${value.join(', ')}]`
    } else if (typeof value === 'boolean') {
      formatted = `${key}: ${value}`
    } else {
      formatted = `${key}: ${value}`
    }

    if (regex.test(frontmatter)) {
      frontmatter = frontmatter.replace(regex, formatted)
    } else {
      // Insert before closing ---
      frontmatter = frontmatter.replace(/---\s*$/, `${formatted}\n---`)
    }
  }

  writeFileSync(filepath, frontmatter + body, 'utf8')
}

export function getBookmarkCount(vaultPath: string): { total: number; categorized: number; uncategorized: number } {
  const bookmarksDir = notesDir(vaultPath)
  if (!existsSync(bookmarksDir)) return { total: 0, categorized: 0, uncategorized: 0 }

  const files = readdirSync(bookmarksDir).filter(f => f.endsWith('.md') && readFileSync(join(bookmarksDir, f), 'utf8').match(/^tweetId: "\d+"$/m))
  let categorized = 0
  let uncategorized = 0

  for (const file of files) {
    const content = readFileSync(join(bookmarksDir, file), 'utf8')
    if (content.includes('categorized: false')) {
      uncategorized++
    } else {
      categorized++
    }
  }

  return { total: files.length, categorized, uncategorized }
}

// Use real note files as the source of truth; stale indexes must not suppress imports.
export function bookmarkFiles(vaultPath: string): Map<string, string> {
  const dir = notesDir(vaultPath)
  const result = new Map<string, string>()
  if (!existsSync(dir)) return result
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.md')) continue
    const path = join(dir, name)
    const content = readFileSync(path, 'utf8')
    const id = content.match(/^tweetId: ["']?(\d+)["']?\s*$/m)?.[1]
    if (id && !result.has(id)) result.set(id, path)
  }
  return result
}

export function addBookmarkAccount(path: string, account: string): boolean {
  const original = readFileSync(path, 'utf8')
  const match = original.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/)
  if (!match) throw new Error(`Missing frontmatter in ${path}`)
  const metadata = parseYaml(match[1])
  if (!metadata || typeof metadata !== 'object') throw new Error(`Invalid frontmatter in ${path}`)
  const old = metadata.bookmarkAccounts
  if (old != null && !Array.isArray(old)) throw new Error(`Invalid bookmarkAccounts in ${path}`)
  const accounts = old ?? []
  if (accounts.includes(account)) return false
  // Update only the property, preserving all unrelated note contents and formatting.
  const node = JSON.stringify([...accounts, account])
  let frontmatter = match[1]
  if (old != null) {
    const property = /^bookmarkAccounts:.*(?:\r?\n[ \t]+.*)*/m
    if (!property.test(frontmatter)) throw new Error(`Cannot update bookmarkAccounts in ${path}`)
    frontmatter = frontmatter.replace(property, `bookmarkAccounts: ${node.replace(/\n/g, '\n  ')}`)
  } else frontmatter += `\nbookmarkAccounts: ${JSON.stringify([...accounts, account])}`
  const updated = `---\n${frontmatter}\n---${match[2]}` + original.slice(match[0].length)
  writeFileSync(path, updated, 'utf8')
  return true
}
