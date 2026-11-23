import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { crawl } from '../scripts/crawl.mjs'
import { verify } from '../scripts/verify.mjs'
import { renderReport } from '../scripts/report.mjs'

const long = (s) => `<p>${s} ${'This sentence pads the page so that it is not thin. '.repeat(12)}</p>`
const site = {
  '/': `<html><title>Help</title><main><h1>Help</h1>${long("Welcome to the help center.")}<a href="/refunds">Refunds</a><a href="/billing">Billing</a><a href="/thin">Thin</a><a href="/gone">Gone</a><a href="/private/x">Private</a></main></html>`,
  '/refunds': `<html><title>Refunds</title><main>${long('Refunds are available within 30 days of purchase.')}</main></html>`,
  '/billing': `<html><title>Billing</title><main>${long('You can request a refund within 14 days of your payment.')}<p>Last updated: January 5, 2019</p></main></html>`,
  '/thin': `<html><title>Thin</title><main><p>Short.</p></main></html>`,
}

function serve() {
  const seen = []
  const s = http.createServer((req, res) => {
    seen.push(req.url)
    if (req.url === '/robots.txt') { res.setHeader('content-type', 'text/plain'); return res.end('User-agent: *\nDisallow: /private\n') }
    if (req.url === '/sitemap.xml') { res.setHeader('content-type', 'application/xml'); return res.end(`<urlset><loc>http://${req.headers.host}/refunds</loc></urlset>`) }
    const body = site[req.url]
    if (!body) { res.statusCode = 404; return res.end('no') }
    res.setHeader('content-type', 'text/html'); res.end(body)
  })
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r({ s, seen, base: `http://127.0.0.1:${s.address().port}` })))
}

test('crawl, check and report end to end', async () => {
  const { s, seen, base } = await serve()
  try {
    const r = await crawl({ start: base + '/', pages: 10, delay: 0, checkLinks: 10 })
    assert.equal(r.analysis.pagesRead, 4)
    assert.ok(!seen.includes('/private/x'), 'robots.txt was obeyed')
    assert.deepEqual(r.analysis.thinPages.map((t) => t.url), [base + '/thin'])
    assert.deepEqual(r.analysis.brokenLinks.map((b) => b.to), [base + '/gone'])
    assert.equal(r.analysis.saysItWasUpdatedOverTwoYearsAgo.length, 1)

    const findings = [
      { kind: 'contradiction', title: 'Refund window differs', claim: 'One page says 30 days, another 14.', evidence: [{ url: base + '/refunds', quote: 'Refunds are available within 30 days of purchase' }, { url: base + '/billing', quote: 'You can request a refund within 14 days of your payment' }] },
      { kind: 'out_of_date', title: 'Invented', claim: 'Says something it does not.', evidence: [{ url: base + '/refunds', quote: 'Refunds are available within 99 days of purchase' }] },
    ]
    const v = verify(findings, r.pages)
    assert.equal(v.kept.length, 1)
    assert.equal(v.dropped.length, 1)
    const md = renderReport(r.analysis, v)
    assert.match(md, /Refund window differs/)
    assert.doesNotMatch(md, /Invented/)
    assert.match(md, /1 proposed finding was dropped/)
  } finally { s.close() }
})

test('the page limit is said, not hidden', async () => {
  const { s, base } = await serve()
  try {
    const r = await crawl({ start: base + '/', pages: 2, delay: 0, checkLinks: 0 })
    assert.equal(r.analysis.pagesRead, 2)
    assert.equal(r.analysis.capped, true)
  } finally { s.close() }
})

test('a link that fails HEAD but answers GET is not broken', async () => {
  const s = http.createServer((req, res) => {
    if (req.url === '/') { res.setHeader('content-type', 'text/html'); return res.end(`<html><title>Help</title><main>${long('Home.')}<a href="/articles/1">One</a><a href="/articles/2">Two</a></main></html>`) }
    if (req.url === '/articles/1') { res.statusCode = req.method === 'HEAD' ? 404 : 200; return res.end() }
    res.statusCode = 404; res.end()
  })
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${s.address().port}`
  try {
    const r = await crawl({ start: base + '/', pages: 1, delay: 0, checkLinks: 10 })
    assert.deepEqual(r.analysis.brokenLinks.map((b) => b.to), [base + '/articles/2'])
  } finally { s.close() }
})
