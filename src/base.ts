import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { isSeq, parseDocument } from 'yaml'
import type { XmarksConfig } from './config.js'

export function updateAccountViews(config: XmarksConfig): void {
  const root = process.env.XMARKS_NOTES_DIR
  if (!root) return
  const path = join(root, 'X Bookmarks.base')
  if (!existsSync(path)) return
  const doc = parseDocument(readFileSync(path, 'utf8'))
  if (doc.errors.length) throw new Error('Could not parse X Bookmarks.base')
  const views = doc.get('views', true)
  if (!isSeq(views)) throw new Error('X Bookmarks.base has no views')
  const plain = doc.toJS() as { views?: { type?: string; name?: string; [key: string]: unknown }[] }
  const main = plain.views?.find(v => v.name === 'Bookmarks')
  if (!main) throw new Error('X Bookmarks.base has no Bookmarks view')
  for (const account of config.accounts ?? []) {
    const name = account.handle
    if (plain.views?.some(v => v.name === name)) continue
    const view = { ...main, name, filters: { and: [`bookmarkAccounts.contains(${JSON.stringify(account.handle)})`] } }
    views.add(doc.createNode(view))
  }
  writeFileSync(path, String(doc), 'utf8')
}
