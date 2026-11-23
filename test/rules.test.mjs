import test from 'node:test'
import assert from 'node:assert/strict'
import { appliesTo, checkRules, validateRules } from '../scripts/lib.mjs'
import { renderReport } from '../scripts/report.mjs'

const pages = [
  { url: 'https://h.test/legal/privacy', title: 'Privacy', text: 'We keep data for 30 days. This is general information, not legal advice.' },
  { url: 'https://h.test/legal/terms', title: 'Terms', text: 'Read the terms carefully before you sign up.' },
  { url: 'https://h.test/models', title: 'Models', text: 'Claude Instant is fast. Later the Acceptable\n  Use Policy changed. Instantly useful; claude instantly.' },
  { url: 'https://h.test/start', title: 'Start', text: 'Welcome. Nothing retired here.' },
]

test('a rules file is checked before it is used', () => {
  assert.deepEqual(validateRules({ bannedTerms: [{ term: 'Old Name' }], required: [{ text: 'This is general information, not legal advice.' }] }), [])
  const errors = validateRules({ bannedTerms: [{ term: 'x' }], required: [{ text: 'short' }, { text: 'long enough text for a rule here', appliesTo: 're:(' }], extra: 1 })
  assert.equal(errors.length, 4)
  assert.match(errors.join('\n'), /at least 2 characters/)
  assert.match(errors.join('\n'), /at least 20 characters/)
  assert.match(errors.join('\n'), /not a valid pattern/)
  assert.match(errors.join('\n'), /unknown key "extra"/)
  assert.equal(validateRules([]).length, 1)
})

test('banned terms match whole words, any case and spacing, and say where', () => {
  const r = checkRules({ bannedTerms: [{ term: 'Claude Instant', reason: 'retired', replacement: 'a current model' }, { term: 'Acceptable Use Policy' }] }, pages)
  const instant = r.banned[0]
  assert.equal(instant.pages.length, 1)
  assert.equal(instant.pages[0].count, 1, '"Claude Instant is" counts, "claude instantly" does not')
  assert.match(instant.pages[0].excerpt, /Claude Instant is fast/)
  assert.equal(r.banned[1].pages.length, 1, 'a line break inside the term still matches')
  assert.equal(r.banned[1].reason, null)
})

test('required wording is checked only on the pages it applies to', () => {
  const rule = { text: 'This is general information, not legal advice.', appliesTo: 're:/legal/' }
  const r = checkRules({ required: [rule, { ...rule, appliesTo: 'nowhere-at-all' }, { ...rule, appliesTo: '*' }] }, pages)
  assert.deepEqual(r.required[0].missing, ['https://h.test/legal/terms'])
  assert.equal(r.required[0].checked, 2)
  assert.equal(r.required[1].checked, 0)
  assert.equal(r.required[2].missing.length, 3)
  assert.equal(appliesTo('terms', pages[1]), true, 'a piece of the address or title')
  assert.equal(appliesTo('', pages[3]), true)
})

test('the report shows hits, misses, and says when nothing matched a rule', () => {
  const rules = checkRules({
    bannedTerms: [{ term: 'Claude Instant', reason: 'retired', replacement: 'a current model' }, { term: 'Never Used Name' }],
    required: [{ text: 'This is general information, not legal advice.', appliesTo: 're:/legal/', reason: 'legal pages' }, { text: 'A sentence no page matches at all here.', appliesTo: 'billing' }],
  }, pages)
  const md = renderReport({ start: 'https://h.test', pagesRead: 4, brokenLinks: [], brokenLinksUnchecked: 0, thinPages: [], nearDuplicates: [], saysItWasUpdatedOverTwoYearsAgo: [] }, { kept: [], dropped: [] }, rules)
  assert.match(md, /## Checked against your rules/)
  assert.match(md, /"Claude Instant"\*\* \(retired; use a current model\): found on 1 page/)
  assert.match(md, /"Never Used Name"\*\*: not found/)
  assert.match(md, /missing from 1 of 2 pages that match re:\/legal\//)
  assert.match(md, /no page read matches billing, so nothing was checked/)
  assert.match(md, /https:\/\/h\.test\/legal\/terms/)
})
