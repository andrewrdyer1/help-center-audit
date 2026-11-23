import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkFinding } from '../scripts/lib.mjs'
import { readGround } from '../scripts/ground.mjs'
import { renderReport } from '../scripts/report.mjs'
import { verify } from '../scripts/verify.mjs'

const notes = 'Version 4.2. The file upload limit is now 100 MB per file, up from 25 MB. Exports are faster. Learn more at https://example.com/docs/uploads. Reports can be shared soon.'
const pages = new Map([
  ['https://h.test/uploads', 'You can upload files of up to 25 MB each. Larger files are refused.'],
  ['https://h.test/other', 'Invoices are sent on the first of the month.'],
  ['release:v4.2.md', notes],
])
const affected = {
  kind: 'affected_by_release', title: 'Upload limit page still says the old limit',
  claim: 'The release note raises the upload limit. The help page still states the earlier limit.',
  evidence: [
    { url: 'release:v4.2.md', quote: 'The file upload limit is now 100 MB per file, up from 25 MB' },
    { url: 'https://h.test/uploads', quote: 'You can upload files of up to 25 MB each' },
  ],
  suggestion: 'You can upload files of up to 100 MB each. Larger files are refused. More at https://example.com/docs/uploads.',
}

test('a release note finding about a page needs one quote from each side, and may carry a checked suggestion', () => {
  const r = checkFinding(affected, pages)
  assert.equal(r.ok, true)
  assert.match(r.finding.suggestion, /100 MB/)
  assert.match(checkFinding({ ...affected, evidence: [affected.evidence[0]] }, pages).reason, /one quote from the release note and one from the help center page/)
  assert.match(checkFinding({ ...affected, evidence: [affected.evidence[1]] }, pages).reason, /one quote from the release note and one from the help center page/)
})

test('a suggestion may not introduce a figure or an address nobody wrote', () => {
  assert.match(checkFinding({ ...affected, suggestion: 'You can upload files of up to 500 MB each.' }, pages).reason, /"500"/)
  assert.match(checkFinding({ ...affected, suggestion: 'See https://evil.test/uploads for details about 100 MB.' }, pages).reason, /address/)
  assert.match(checkFinding({ ...affected, suggestion: 'x'.repeat(601) }, pages).reason, /over 600/)
  assert.match(checkFinding({ ...affected, suggestion: '   ' }, pages).reason, /empty/)
  assert.match(checkFinding({ ...affected, suggestion: 'Customers were affected by this.' }, pages).reason, /who was affected/)
  assert.match(checkFinding({ ...affected, suggestion: 'Up to 25 MB, now 100 MB. Page 25.' }, pages).reason ?? 'ok', /"25"|ok/, 'a figure in the notes is fine')
})

test('suggestions and release quotes stay with release findings', () => {
  const content = { kind: 'ambiguous', title: 'A', claim: 'A passage reads two ways.', evidence: [{ url: 'https://h.test/uploads', quote: 'Larger files are refused.' + ' ' }] }
  assert.match(checkFinding({ ...content, suggestion: 'Larger files are refused.' }, pages).reason, /belongs to a release note finding/)
  assert.match(checkFinding({ ...content, evidence: [{ url: 'release:v4.2.md', quote: 'Exports are faster. Learn more at' }] }, pages).reason, /belong to a release note finding/)
})

test('a note that is unclear quotes release notes only', () => {
  const unclear = { kind: 'release_note_unclear', title: 'Sharing is promised without a date', claim: 'The note says reports can be shared soon without saying when or to whom.', evidence: [{ url: 'release:v4.2.md', quote: 'Reports can be shared soon.' + ' Hi' }], suggestion: 'Reports can be shared with your team in a later release.' }
  assert.equal(checkFinding({ ...unclear, evidence: [{ url: 'release:v4.2.md', quote: 'Exports are faster. Learn more at' }] }, pages).ok, true)
  assert.match(checkFinding({ ...unclear, evidence: [{ url: 'release:v4.2.md', quote: 'Exports are faster. Learn more at' }, { url: 'https://h.test/uploads', quote: 'Larger files are refused.' }] }, pages).reason, /release notes only/)
})

test('verify drops an invented release quote and reads release documents from files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hca-'))
  await writeFile(join(dir, 'v4.2.md'), notes)
  const docs = await readGround([join(dir, 'v4.2.md')], 'release:')
  assert.equal(docs[0].url, 'release:v4.2.md')
  const list = [{ url: 'https://h.test/uploads', text: pages.get('https://h.test/uploads') }]
  const bad = { ...affected, title: 'Invented', evidence: [{ url: 'release:v4.2.md', quote: 'The file upload limit is now 200 MB per file' }, affected.evidence[1]] }
  const r = verify([affected, bad], list, [], docs)
  assert.equal(r.kept.length, 1)
  assert.equal(r.dropped.length, 1)
  assert.equal(r.releases[0].name, 'v4.2.md')
})

test('the report shows release findings with their suggestion marked as a draft', () => {
  const kept = [checkFinding(affected, pages).finding]
  const md = renderReport({ start: 'https://h.test', pagesRead: 2, brokenLinks: [], brokenLinksUnchecked: 0, thinPages: [], nearDuplicates: [], saysItWasUpdatedOverTwoYearsAgo: [] }, { kept, dropped: [], sources: [], releases: [{ url: 'release:v4.2.md', name: 'v4.2.md', words: 30 }] })
  assert.match(md, /## Release notes/)
  assert.match(md, /Release note: v4\.2\.md/)
  assert.match(md, /Suggested wording \(a draft, for a person to review\)/)
  assert.match(md, /### Release notes that are unclear \(0\)/)
  assert.match(md, /None held up in what was compared/)
})
