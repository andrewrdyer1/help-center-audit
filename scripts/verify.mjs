#!/usr/bin/env node
// Keeps only findings whose quotes are really on the pages (or source documents) they name.
//   node verify.mjs [--out help-center-audit-out]
// Reads findings.json and every findings/*.json (one per reading, if you wrote them that way), the crawled pages and,
// if ground.mjs was run, the source documents.
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkFinding } from './lib.mjs'

export function verify(findings, pageList, sources = []) {
  const pages = new Map([...pageList, ...sources].map((p) => [p.url, p.text]))
  const kept = []
  const dropped = []
  const seen = new Set()
  for (const f of Array.isArray(findings) ? findings : []) {
    const r = checkFinding(f, pages)
    if (!r.ok) { dropped.push({ title: f?.title ?? '(no title)', reason: r.reason }); continue }
    const key = `${r.finding.kind}|${r.finding.evidence.map((e) => e.url).sort().join('|')}|${r.finding.title.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(r.finding)
  }
  return { kept, dropped, sources: sources.map((s) => ({ url: s.url, name: s.name, words: s.words })) }
}

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch (e) { if (e.code === 'ENOENT' && fallback !== undefined) return fallback; throw new Error(`${path}: ${e.message}`) }
}

async function main() {
  const argv = process.argv.slice(2)
  const i = argv.indexOf('--out')
  const dir = i >= 0 ? argv[i + 1] : 'help-center-audit-out'
  let findings = await readJson(join(dir, 'findings.json'), [])
  let files = []
  try { files = (await readdir(join(dir, 'findings'))).filter((f) => f.endsWith('.json')).sort() } catch { /* none */ }
  for (const f of files) findings = findings.concat(await readJson(join(dir, 'findings', f)))
  const { pages } = await readJson(join(dir, 'pages.json'))
  const { documents } = await readJson(join(dir, 'ground.json'), { documents: [] })
  const { kept, dropped, sources } = verify(findings, pages, documents)
  await writeFile(join(dir, 'verified.json'), JSON.stringify({ kept, dropped, sources }, null, 2))
  console.log(`Kept ${kept.length} of ${kept.length + dropped.length} findings${sources.length ? ` (compared with ${sources.length} source document${sources.length === 1 ? '' : 's'})` : ''}.`)
  for (const d of dropped) console.log(`  dropped: ${d.title} (${d.reason})`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1) })
