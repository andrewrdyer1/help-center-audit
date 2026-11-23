#!/usr/bin/env node
// Reads release notes (a changelog page, notes you are about to publish) so the audit can review them and find the help
// center pages they change.
//   node releases.mjs <file.md|.txt|.html|.pdf> [more files] [--url https://example.com/changelog] [--out help-center-audit-out]
// A file is the usual case: it is the draft, or the notes saved from a page. --url reads one public page, once, if its
// robots.txt allows it, and does not follow links.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readGround } from './ground.mjs'
import { allowedByRobots, htmlToPage, parseRobots, RELEASE_PREFIX, wordCount } from './lib.mjs'

const UA = 'help-center-audit/0.1 (Claude Code plugin; reads public pages only)'

async function fetchText(url) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 15000)
  try { return await fetch(url, { signal: ctl.signal, headers: { 'user-agent': UA, accept: 'text/html,*/*;q=0.5' }, redirect: 'follow' }) } finally { clearTimeout(timer) }
}

export async function readReleaseUrl(href) {
  const u = new URL(href)
  if (!/^https?:$/.test(u.protocol)) throw new Error('--url must be an http or https address')
  try {
    const r = await fetchText(new URL('/robots.txt', u))
    if (r.ok && !allowedByRobots(parseRobots(await r.text(), 'help-center-audit'), u.pathname + u.search)) throw new Error(`${u.host}'s robots.txt does not allow reading ${u.pathname}. Save the notes as a file and pass that instead.`)
  } catch (e) { if (/robots\.txt does not allow/.test(e.message)) throw e }
  const r = await fetchText(u)
  if (!r.ok) throw new Error(`${href} answered ${r.status}`)
  if (!/html/i.test(r.headers.get('content-type') ?? '')) throw new Error(`${href} is not a web page`)
  const page = htmlToPage(await r.text(), r.url)
  const text = page.text
  const name = `${u.host}${u.pathname}`.replace(/\/+$/, '')
  return { url: RELEASE_PREFIX + name, name, words: wordCount(text), text }
}

async function main() {
  const argv = process.argv.slice(2)
  const flag = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined }
  const dir = flag('out') ?? 'help-center-audit-out'
  const url = flag('url')
  const files = argv.filter((a, k) => !a.startsWith('--') && !['--out', '--url'].includes(argv[k - 1]))
  if (!files.length && !url) { console.error('usage: releases.mjs <file.md|.txt|.html|.pdf> [more] [--url https://example.com/changelog] [--out dir]'); process.exit(2) }
  const docs = files.length ? await readGround(files, RELEASE_PREFIX) : []
  if (url) docs.push(await readReleaseUrl(url))
  await mkdir(join(dir, 'releases'), { recursive: true })
  await writeFile(join(dir, 'releases.json'), JSON.stringify({ documents: docs }, null, 2))
  await Promise.all(docs.map((d, k) => writeFile(join(dir, 'releases', `${String(k + 1).padStart(2, '0')}.txt`), `RELEASE NOTES: ${d.url}\n\n${d.text}\n`)))
  for (const d of docs) console.log(`${d.url}: ${d.words} words`)
  console.log(`Written to ${dir}/ (releases.json, releases/*.txt). Cite these in findings with the url shown, e.g. "${docs[0].url}".`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1) })
