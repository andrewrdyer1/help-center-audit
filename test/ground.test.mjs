import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { buildBatches, checkFinding, SOURCE_KIND } from '../scripts/lib.mjs'
import { readGround } from '../scripts/ground.mjs'
import { verify } from '../scripts/verify.mjs'

const run = promisify(execFile)

const pages = new Map([
  ['https://h.test/pricing', 'The Pro plan costs $49 a month and includes up to 500 users per workspace.'],
  ['ground:pricing.pdf', 'Pro plan: $59 per month. Includes up to 500 users per workspace. Annual billing available.'],
])
const finding = {
  kind: SOURCE_KIND, title: 'Pro plan price differs from the pricing document',
  claim: 'The help page states $49 a month for Pro. The pricing document states $59 per month.',
  evidence: [
    { url: 'https://h.test/pricing', quote: 'The Pro plan costs $49 a month' },
    { url: 'ground:pricing.pdf', quote: 'Pro plan: $59 per month.' },
  ],
}

test('a source comparison needs a quote from each side and may state figures that are in the quotes', () => {
  assert.equal(checkFinding(finding, pages).ok, true)
  const plain = { ...finding, claim: 'The page and the pricing document state different prices for Pro.' }
  assert.equal(checkFinding(plain, pages).ok, true)
  assert.match(checkFinding({ ...plain, evidence: [finding.evidence[0]] }, pages).reason, /one quote from the source/)
  assert.match(checkFinding({ ...plain, evidence: [finding.evidence[1]] }, pages).reason, /one quote from the source/)
})

test('a figure not in any quote is still refused, and so is a claim about who was affected', () => {
  assert.match(checkFinding({ ...finding, claim: 'Customers are overcharged $10 a month.' }, pages).reason, /money not found in a quote/)
  assert.match(checkFinding({ ...finding, claim: 'About 2,000 users saw the wrong price.' }, pages).reason, /counts people/)
  assert.match(checkFinding({ ...finding, claim: 'Customers were misled by this.' }, pages).reason, /who was affected/)
  const limit = { ...finding, claim: 'Both say up to 500 users per workspace, but the prices differ.', evidence: [{ url: 'https://h.test/pricing', quote: 'includes up to 500 users per workspace' }, finding.evidence[1]] }
  assert.equal(checkFinding(limit, pages).ok, true)
})

test('source quotes do not belong to the other kinds', () => {
  assert.match(checkFinding({ ...finding, kind: 'ambiguous' }, pages).reason, /belong to a disagrees_with_source/)
})

test('verify drops an invented source quote and repeats of the same finding', () => {
  const list = [{ url: 'https://h.test/pricing', text: pages.get('https://h.test/pricing') }]
  const src = [{ url: 'ground:pricing.pdf', name: 'pricing.pdf', words: 14, text: pages.get('ground:pricing.pdf') }]
  const bad = { ...finding, title: 'Invented', evidence: [finding.evidence[0], { url: 'ground:pricing.pdf', quote: 'Pro plan: $99 per month.' }] }
  const r = verify([finding, finding, bad], list, src)
  assert.equal(r.kept.length, 1)
  assert.equal(r.dropped.length, 1)
  assert.match(r.dropped[0].reason, /quote not found/)
  assert.equal(r.sources[0].name, 'pricing.pdf')
})

test('ground files: text, markdown and html are read; unknown types and a missing pdftotext say what to do', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hca-'))
  await writeFile(join(dir, 'a.txt'), 'Refunds within 30 days.')
  await writeFile(join(dir, 'b.md'), '# Terms\n\nRefunds within 14 days.')
  await writeFile(join(dir, 'c.html'), '<html><main><p>Refunds within 7 days.</p></main></html>')
  const docs = await readGround([join(dir, 'a.txt'), join(dir, 'b.md'), join(dir, 'c.html')])
  assert.deepEqual(docs.map((d) => d.url), ['ground:a.txt', 'ground:b.md', 'ground:c.html'])
  assert.match(docs[2].text, /7 days/)
  await writeFile(join(dir, 'x.docx'), 'x')
  await assert.rejects(readGround([join(dir, 'x.docx')]), /unsupported type/)
  await writeFile(join(dir, 'p.pdf'), '%PDF-1.4')
  const saved = process.env.PATH
  process.env.PATH = ''
  try { await assert.rejects(readGround([join(dir, 'p.pdf')]), /pdftotext is not installed/) } finally { process.env.PATH = saved }
})

test('a real pdf is read when pdftotext is installed', async (t) => {
  try { await run('pdftotext', ['-v']).catch((e) => { if (e.code === 'ENOENT') throw e }) } catch { return t.skip('pdftotext not installed') }
  const dir = await mkdtemp(join(tmpdir(), 'hca-'))
  // A minimal one-page PDF with the text "Refunds within 30 days of purchase".
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  const stream = 'BT /F1 14 Tf 20 100 Td (Refunds within 30 days of purchase) Tj ET'
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  let pdf = '%PDF-1.4\n'
  const offsets = []
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = pdf.length
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  await writeFile(join(dir, 'policy.pdf'), pdf)
  const [doc] = await readGround([join(dir, 'policy.pdf')])
  assert.match(doc.text, /Refunds within 30 days of purchase/)
})

const make = (n, topic, filler) => Array.from({ length: n }, (_, i) => ({
  url: `https://h.test/${topic}-${i}`, title: `${topic} ${i}`,
  text: `${topic} ${filler} ${topic}s guide step ${i}. `.repeat(8) + `${topic} ${filler} reference ${'detail '.repeat(30)}`,
}))

test('batches keep alike pages together, respect the word budget and list pairs that cross groups', () => {
  const billing = make(4, 'invoice', 'payment card receipt tax')
  const sso = make(4, 'okta', 'saml directory provisioning login')
  const all = [billing[0], sso[0], billing[1], sso[1], billing[2], sso[2], billing[3], sso[3]].map((p) => ({ ...p, words: p.text.split(/\s+/).length }))
  const total = all.reduce((s, p) => s + p.words, 0)
  const plan = buildBatches(all, { budgetWords: Math.ceil(total / 2) + 50 })
  assert.equal(plan.batches.length, 2)
  for (const b of plan.batches) {
    assert.ok(b.words <= plan.budgetWords)
    const kinds = new Set(b.pages.map((p) => p.url.split('/')[3].split('-')[0]))
    assert.equal(kinds.size, 1, `batch ${b.id} mixes topics: ${[...kinds]}`)
  }
  assert.equal(plan.batches.flatMap((b) => b.pages).length, 8)
  const one = buildBatches(all, { budgetWords: total + 1 })
  assert.equal(one.batches.length, 1)
  assert.equal(one.crossBatch.length, 0)
})

test('a page bigger than the budget gets a batch of its own, and pages in two groups that overlap are listed as pairs', () => {
  const a = { url: 'a', title: 'a', text: 'refund window days purchase eligible '.repeat(40) + 'invoice ' }
  const b = { url: 'b', title: 'b', text: 'refund window days purchase eligible '.repeat(40) + 'okta ' }
  const c = { url: 'c', title: 'c', text: 'saml okta provisioning directory login '.repeat(40) }
  const d = { url: 'd', title: 'd', text: 'invoice tax receipt payment card '.repeat(40) }
  const plan = buildBatches([a, b, c, d].map((p) => ({ ...p, words: p.text.split(/\s+/).length })), { budgetWords: 210, crossThreshold: 0.3 })
  assert.ok(plan.batches.length >= 2)
  assert.ok(plan.crossBatch.every((p) => p.similarity >= 0.3))
})
