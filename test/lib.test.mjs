import test from 'node:test'
import assert from 'node:assert/strict'
import { allowedByRobots, checkFinding, htmlToPage, jaccard, nearDuplicates, normalize, parseRobots, quoteAppears, shingles, statedUpdate } from '../scripts/lib.mjs'

test('a quote matches through curly quotes, dashes and spacing', () => {
  const page = 'You can’t get a refund — after\n 30 days of purchase.'
  assert.ok(quoteAppears("You can't get a refund - after 30 days of purchase", page))
})

test('a short or invented quote does not count', () => {
  assert.equal(quoteAppears('30 days', 'within 30 days of purchase'), false)
  assert.equal(quoteAppears('Refunds are available within 45 days of purchase', 'Refunds are available within 30 days of purchase'), false)
})

test('robots: longest match wins, our group beats *, sitemaps and delay are read', () => {
  const r = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: help-center-audit\nDisallow: /admin\nAllow: /admin/help\nCrawl-delay: 2\nSitemap: https://x.test/s.xml')
  assert.equal(allowedByRobots(r, '/articles/1'), true)
  assert.equal(allowedByRobots(r, '/admin/users'), false)
  assert.equal(allowedByRobots(r, '/admin/help/a'), true)
  assert.equal(r.crawlDelay, 2)
  assert.deepEqual(r.sitemaps, ['https://x.test/s.xml'])
  const star = parseRobots('User-agent: *\nDisallow: /private$\nDisallow: /*?draft=')
  assert.equal(allowedByRobots(star, '/private'), false)
  assert.equal(allowedByRobots(star, '/private/x'), true)
  assert.equal(allowedByRobots(star, '/a?draft=1'), false)
})

test('html: main text, title and links; navigation and scripts are left out', () => {
  const p = htmlToPage('<html><head><title>Refunds &amp; returns</title><script>var x=1</script></head><body><nav>Menu stuff</nav><main><h1>Refunds</h1><p>Within 30 days.</p><a href="/billing#top">Billing</a><a href="mailto:a@b.c">m</a></main><footer>Legal</footer></body></html>', 'https://h.test/refunds')
  assert.equal(p.title, 'Refunds & returns')
  assert.match(p.text, /Within 30 days\./)
  assert.doesNotMatch(p.text, /Menu stuff|var x|Legal/)
  assert.deepEqual(p.links, ['https://h.test/billing'])
})

test('near-duplicates are found, different pages are not', () => {
  const a = 'to reset your password open settings choose security and press reset password then check your email for the link we send you'
  const pages = [{ url: 'a', text: a }, { url: 'b', text: a + ' thanks' }, { url: 'c', text: 'invoices are issued on the first day of each month and sent to the billing contact on your account by email' }]
  const d = nearDuplicates(pages, 0.7)
  assert.equal(d.length, 1)
  assert.deepEqual([d[0].a, d[0].b], ['a', 'b'])
  assert.equal(jaccard(shingles(a), shingles(a)), 1)
})

test('a stated update date is read', () => {
  assert.equal(statedUpdate('Last updated: March 3, 2021 by the team').iso, '2021-03-03')
  assert.equal(statedUpdate('nothing here'), null)
})

const pages = new Map([
  ['https://h.test/refunds', 'Refunds are available within 30 days of purchase.'],
  ['https://h.test/billing', 'You can request a refund within 14 days of your payment.'],
])
const good = {
  kind: 'contradiction', title: 'Refund window differs', claim: 'One page says 30 days, another 14.',
  evidence: [
    { url: 'https://h.test/refunds', quote: 'Refunds are available within 30 days of purchase' },
    { url: 'https://h.test/billing', quote: 'You can request a refund within 14 days of your payment' },
  ],
}

test('a good finding is kept', () => assert.equal(checkFinding(good, pages).ok, true))

test('findings are refused for the rules, not the wording', () => {
  assert.match(checkFinding({ ...good, kind: 'wrong' }, pages).reason, /unknown kind/)
  assert.match(checkFinding({ ...good, claim: '312 customers were confused by this.' }, pages).reason, /who was affected/)
  assert.match(checkFinding({ ...good, claim: 'This costs $4,000 a month.' }, pages).reason, /money/)
  assert.match(checkFinding({ ...good, evidence: [] }, pages).reason, /no evidence/)
  assert.match(checkFinding({ ...good, evidence: [good.evidence[0]] }, pages).reason, /two different pages/)
  assert.match(checkFinding({ ...good, evidence: [good.evidence[0], { url: 'https://h.test/billing', quote: 'You can request a refund within 90 days of your payment' }] }, pages).reason, /quote not found/)
  assert.match(checkFinding({ ...good, evidence: [good.evidence[0], { url: 'https://h.test/other', quote: 'whatever the quote says here' }] }, pages).reason, /page not read/)
})

test('normalize is stable', () => assert.equal(normalize('  A’B – C  '), "a'b - c"))
