#!/usr/bin/env node
// Checks the crawled pages against the team's own rules: names that must no longer appear, wording that must appear.
//   node rules.mjs <rules.json> [--out help-center-audit-out]
// Literal matches only. Writes rules-results.json, which report.mjs includes.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkRules, validateRules } from './lib.mjs'

async function main() {
  const argv = process.argv.slice(2)
  const i = argv.indexOf('--out')
  const dir = i >= 0 ? argv[i + 1] : 'help-center-audit-out'
  const file = argv.find((a, k) => !a.startsWith('--') && argv[k - 1] !== '--out')
  if (!file) { console.error('usage: rules.mjs <rules.json> [--out dir]'); process.exit(2) }
  let rules
  try { rules = JSON.parse(await readFile(file, 'utf8')) } catch (e) { console.error(`${file}: ${e.message}`); process.exit(2) }
  const errors = validateRules(rules)
  if (errors.length) { console.error(`${file} has problems:\n${errors.map((e) => `  - ${e}`).join('\n')}`); process.exit(2) }
  const { pages } = JSON.parse(await readFile(join(dir, 'pages.json'), 'utf8'))
  const result = checkRules(rules, pages)
  await writeFile(join(dir, 'rules-results.json'), JSON.stringify(result, null, 2))
  for (const b of result.banned) console.log(`"${b.term}": ${b.pages.length} page${b.pages.length === 1 ? '' : 's'}`)
  for (const r of result.required) console.log(`required "${r.text.slice(0, 50)}${r.text.length > 50 ? '...' : ''}": missing from ${r.missing.length} of ${r.checked} page${r.checked === 1 ? '' : 's'}`)
  console.log(`Checked ${result.pagesChecked} pages. Written to ${join(dir, 'rules-results.json')}.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1) })
