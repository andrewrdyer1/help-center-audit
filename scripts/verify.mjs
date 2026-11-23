#!/usr/bin/env node
// Keeps only findings whose quotes are really on the pages they name.
//   node verify.mjs [--out help-center-audit-out]
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkFinding } from './lib.mjs'

export function verify(findings, pageList) {
  const pages = new Map(pageList.map((p) => [p.url, p.text]))
  const kept = []
  const dropped = []
  for (const f of Array.isArray(findings) ? findings : []) {
    const r = checkFinding(f, pages)
    if (r.ok) kept.push(r.finding)
    else dropped.push({ title: f?.title ?? '(no title)', reason: r.reason })
  }
  return { kept, dropped }
}

async function main() {
  const argv = process.argv.slice(2)
  const i = argv.indexOf('--out')
  const dir = i >= 0 ? argv[i + 1] : 'help-center-audit-out'
  const findings = JSON.parse(await readFile(join(dir, 'findings.json'), 'utf8'))
  const { pages } = JSON.parse(await readFile(join(dir, 'pages.json'), 'utf8'))
  const { kept, dropped } = verify(findings, pages)
  await writeFile(join(dir, 'verified.json'), JSON.stringify({ kept, dropped }, null, 2))
  console.log(`Kept ${kept.length} of ${kept.length + dropped.length} findings.`)
  for (const d of dropped) console.log(`  dropped: ${d.title} (${d.reason})`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1) })
