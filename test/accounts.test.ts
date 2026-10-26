import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { syncBookmarks } from '../src/sync.js'
import { addBookmarkAccount, bookmarkFiles } from '../src/markdown.js'
import type { TweetData } from '../src/twitter-api.js'
import { parse } from 'yaml'

function post(id: string): TweetData { return { tweetId: id, text: 'same text', authorHandle: 'author', authorName: 'Author', createdAt: new Date('2026-01-01'), mediaUrls: [], urls: [], rawJson: '{}' } }
function accounts(path: string) { const content = readFileSync(path, 'utf8'); return parse(content.split('---')[1]).bookmarkAccounts }
test('shared posts preserve both accounts, scan all pages and repair stale indexes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'xmarks-test-')); mkdirSync(join(dir, 'bookmarks')); mkdirSync(join(dir, 'media'))
  writeFileSync(join(dir, '.tweet-ids'), '3\n')
  const download = async () => 0
  const first = await syncBookmarks(dir, 'a', 'a', undefined, 'first', async (_a, _b, cursor) => cursor ? { tweets: [post('2')], nextCursor: null } : { tweets: [post('1')], nextCursor: 'next' }, download)
  assert.equal(first.imported, 2); assert.equal(first.error, undefined)
  const second = await syncBookmarks(dir, 'b', 'b', undefined, 'second', async (_a, _b, cursor) => cursor ? { tweets: [post('3')], nextCursor: null } : { tweets: [post('1')], nextCursor: 'next' }, download)
  assert.equal(second.imported, 1); assert.equal(second.error, undefined)
  const files = bookmarkFiles(dir); assert.equal(files.size, 3)
  assert.deepEqual(accounts(files.get('1')!), ['first', 'second'])
  assert.deepEqual(accounts(files.get('2')!), ['first'])
  assert.deepEqual(accounts(files.get('3')!), ['second'])
  assert.equal(readdirSync(join(dir, 'bookmarks')).length, 3)
  const p = files.get('1')!; const before = readFileSync(p, 'utf8'); addBookmarkAccount(p, 'second'); assert.equal(readFileSync(p, 'utf8'), before)
})

test('account views preserve the shared view and filter each handle', async () => {
  const { updateAccountViews } = await import('../src/base.js')
  const root = mkdtempSync(join(tmpdir(), 'xmarks-base-'))
  const previous = process.env.XMARKS_NOTES_DIR; process.env.XMARKS_NOTES_DIR = root
  try {
    const path = join(root, 'X Bookmarks.base')
    writeFileSync(path, 'filters:\n  and:\n    - source == "bookmark"\nviews:\n  - type: feed\n    name: Bookmarks\n')
    const config = { vaultPath: root, model: '', syncIntervalMinutes: 5, accounts: [{handle: 'first', authToken: '', ct0: ''}, {handle: 'second', authToken: '', ct0: ''}] }
    updateAccountViews(config); updateAccountViews(config)
    const data = parse(readFileSync(path, 'utf8'))
    assert.deepEqual(data.views.map((v: {name: string}) => v.name), ['Bookmarks', '@first', '@second'])
    assert.deepEqual(data.views[1].filters.and, ['bookmarkAccounts.contains("first")'])
    assert.equal(data.views[2].type, 'feed')
  } finally { if (previous === undefined) delete process.env.XMARKS_NOTES_DIR; else process.env.XMARKS_NOTES_DIR = previous }
})
