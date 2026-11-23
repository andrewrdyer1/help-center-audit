#!/usr/bin/env node
// Writes REPORT.md from analysis.json and verified.json.
//   node report.mjs [--out help-center-audit-out]
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const SOURCE = 'disagrees_with_source'
const LABEL = { contradiction: 'Pages that contradict each other', out_of_date: 'Pages that look out of date', ambiguous: 'Passages that can be read two ways' }

export function renderReport(analysis, verified, rules = null) {
  const L = []
  const a = analysis
  L.push(`# Help center audit: ${a.start}`, '')
  L.push(`This report is about the **content** of the help center. It says what is on the pages. It does not say who was affected or what anything costs.`, '')
  L.push(`**Covered:** ${a.pagesRead} pages read${a.scope && a.scope !== '/' ? ` under ${a.scope}` : ''}${a.capped ? ', stopped at the page limit (there are more pages than this audit read)' : ''}${a.stopped ? `. Stopped early: ${a.stopped}` : ''}.`, '')

  L.push('## What a reader of the pages can check', '')
  for (const kind of Object.keys(LABEL)) {  // source-document findings have their own section below
    const rows = verified.kept.filter((f) => f.kind === kind)
    if (!rows.length) continue
    L.push(`### ${LABEL[kind]} (${rows.length})`, '')
    for (const f of rows) {
      L.push(`**${f.title}**`, '', f.claim, '')
      for (const e of f.evidence) L.push(`- ${e.url.startsWith('ground:') ? `Source document: ${e.url.slice(7)}` : e.url}  \n  > ${e.quote.replace(/\n+/g, ' ')}`)
      L.push('')
    }
  }
  const sources = verified.sources ?? []
  if (sources.length) {
    const rows = verified.kept.filter((f) => f.kind === SOURCE)
    L.push('## Compared with your source documents', '')
    L.push(`Read: ${sources.map((d) => `${d.name} (${d.words} words)`).join(', ')}. A finding here means a help center page and a source document state different things. It does not say which is right.`, '')
    for (const f of rows) {
      L.push(`**${f.title}**`, '', f.claim, '')
      for (const e of f.evidence) L.push(`- ${e.url.startsWith('ground:') ? `Source document: ${e.url.slice(7)}` : e.url}  \n  > ${e.quote.replace(/\n+/g, ' ')}`)
      L.push('')
    }
    if (!rows.length) L.push('No disagreements held up in what was compared. That means none were found, not that the source is fully covered: only the pages and passages Claude compared were checked.', '')
  }
  if (!verified.kept.length && !sources.length) L.push('No findings of this kind held up. That means none were found in the pages read, not that there are none.', '')

  if (rules) {
    L.push('## Checked against your rules', '')
    L.push(`Literal matches over ${rules.pagesChecked} pages. A hit means the text is there as written; whether it is a problem is yours to decide.`, '')
    for (const b of rules.banned) {
      L.push(`**"${b.term}"**${b.reason ? ` (${b.reason}${b.replacement ? `; use ${b.replacement}` : ''})` : ''}: ${b.pages.length ? `found on ${b.pages.length} page${b.pages.length === 1 ? '' : 's'}` : 'not found'}.`, '')
      for (const h of b.pages.slice(0, 30)) L.push(`- ${h.url} (${h.count}x)  \n  > ${h.excerpt}`)
      if (b.pages.length > 30) L.push(`- ... and ${b.pages.length - 30} more`)
      if (b.pages.length) L.push('')
    }
    for (const r of rules.required) {
      L.push(`**Required:** "${r.text}"${r.reason ? ` (${r.reason})` : ''}: ${r.checked ? `missing from ${r.missing.length} of ${r.checked} page${r.checked === 1 ? '' : 's'} that ${r.appliesTo === '*' ? 'were read' : `match ${r.appliesTo}`}` : `no page read matches ${r.appliesTo}, so nothing was checked`}.`, '')
      for (const u of r.missing.slice(0, 30)) L.push(`- ${u}`)
      if (r.missing.length > 30) L.push(`- ... and ${r.missing.length - 30} more`)
      if (r.missing.length) L.push('')
    }
  }

  L.push('## Checked by code', '')
  L.push(`**Broken links (${a.brokenLinks.length}).**${a.brokenLinksUnchecked ? ` ${a.brokenLinksUnchecked} more internal links were not checked.` : ''}`, '')
  for (const b of a.brokenLinks.slice(0, 50)) L.push(`- ${b.to} (${b.status || 'no answer'}), linked from ${b.from}`)
  L.push('', `**Thin pages (${a.thinPages.length})**, fewer than 80 words of text.`, '')
  for (const t of a.thinPages) L.push(`- ${t.url} (${t.words} words)`)
  L.push('', `**Near-duplicate pages (${a.nearDuplicates.length} pairs)**, mostly the same text.`, '')
  for (const d of a.nearDuplicates) L.push(`- ${d.a} and ${d.b} (${Math.round(d.similarity * 100)}% the same)`)
  L.push('', `**Pages that say they were last updated over two years ago (${a.saysItWasUpdatedOverTwoYearsAgo.length}).**`, '')
  for (const o of a.saysItWasUpdatedOverTwoYearsAgo) L.push(`- ${o.url} ("${o.says}")`)
  L.push('')

  L.push('## How to read this', '')
  L.push('- Every quote above was checked to appear on the page or source document named. A finding whose quote did not was dropped, never shown.')
  if (verified.dropped.length) L.push(`- ${verified.dropped.length} proposed finding${verified.dropped.length === 1 ? ' was' : 's were'} dropped because a quote was not on the page or a rule was not met.`)
  L.push('- Age is a hint, not a finding: a page can be old and right.', '')
  return L.join('\n')
}

async function main() {
  const argv = process.argv.slice(2)
  const i = argv.indexOf('--out')
  const dir = i >= 0 ? argv[i + 1] : 'help-center-audit-out'
  const analysis = JSON.parse(await readFile(join(dir, 'analysis.json'), 'utf8'))
  const verified = JSON.parse(await readFile(join(dir, 'verified.json'), 'utf8'))
  let rules = null
  try { rules = JSON.parse(await readFile(join(dir, 'rules-results.json'), 'utf8')) } catch { /* no rules were run */ }
  await writeFile(join(dir, 'REPORT.md'), renderReport(analysis, verified, rules))
  console.log(`Wrote ${join(dir, 'REPORT.md')}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1) })
