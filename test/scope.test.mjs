import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { crawl } from '../scripts/crawl.mjs'
import { inScope, languageFolder, scopeOf } from '../scripts/lib.mjs'

test('the scope is the start folder, or its language folder', () => {
  assert.equal(scopeOf('/'), '/')
  assert.equal(scopeOf(''), '/')
  assert.equal(scopeOf('/docs'), '/docs')
  assert.equal(scopeOf('/docs/'), '/docs')
  assert.equal(scopeOf('/en'), '/en')
  assert.equal(scopeOf('/en/articles/123-refunds'), '/en')
  assert.equal(scopeOf('/hc/en-us'), '/hc/en-us')
  assert.equal(scopeOf('/hc/en-us/articles/1'), '/hc/en-us')
  assert.equal(languageFolder('/docs/getting-started'), null)
  assert.equal(languageFolder('/docs/go/intro'), null, 'a two-letter folder that is not first is not a language')
  assert.equal(languageFolder('/hc/en-us'), '/hc/en-us', 'a language with a region wins over a two-letter first folder')
  assert.ok(inScope('/docs', '/docs'))
  assert.ok(inScope('/docs', '/docs/install'))
  assert.ok(!inScope('/docs', '/docs-old/install'))
  assert.ok(!inScope('/docs', '/blog/post'))
  assert.ok(inScope('/', '/anything'))
})

const long = (s) => `<p>${s} ${'This sentence pads the page so that it is not thin. '.repeat(12)}</p>`
const page = (title, links = []) => `<html><title>${title}</title><main>${long(title)}${links.map((l) => `<a href="${l}">${l}</a>`).join('')}</main></html>`

function serve(routes, sitemap = []) {
  const seen = []
  const s = http.createServer((req, res) => {
    seen.push(req.url)
    if (req.url === '/robots.txt') { res.statusCode = 404; return res.end() }
    if (req.url === '/sitemap.xml') {
      res.setHeader('content-type', 'application/xml')
      return res.end(`<urlset>${sitemap.map((p) => `<url><loc>http://${req.headers.host}${p}</loc></url>`).join('')}</urlset>`)
    }
    const r = routes[req.url]
    if (r === undefined) { res.statusCode = 404; return res.end('no') }
    if (r.redirect) { res.statusCode = 302; res.setHeader('location', r.redirect); return res.end() }
    res.setHeader('content-type', 'text/html'); res.end(r)
  })
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok({ s, seen, base: `http://127.0.0.1:${s.address().port}` })))
}

test('a start that redirects is read once, not again under the address it landed on', async () => {
  const { s, base } = await serve({
    '/': { redirect: '/hc/en-us' },
    '/hc/en-us': page('Home', ['/hc/en-us/articles/1', '/hc/fr/articles/1']),
    '/hc/en-us/articles/1': page('Refunds', ['/hc/en-us']),
    '/hc/fr/articles/1': page('Remboursements'),
  }, ['/hc/en-us', '/hc/en-us/articles/1', '/hc/fr/articles/1'])
  try {
    const r = await crawl({ start: base + '/', pages: 10, delay: 0, checkLinks: 0 })
    const urls = r.pages.map((p) => p.url)
    assert.deepEqual(urls.sort(), [base + '/hc/en-us', base + '/hc/en-us/articles/1'])
    assert.equal(r.analysis.nearDuplicates.length, 0, 'a page is never its own near-duplicate')
    assert.equal(r.analysis.scope, '/hc/en-us', 'a root that lands in a language folder stays in it')
    assert.equal(r.analysis.capped, false)
  } finally { s.close() }
})

test('a start at a folder stays inside it', async () => {
  const { s, seen, base } = await serve({
    '/docs': page('Docs', ['/docs/install', '/blog/launch', '/pricing']),
    '/docs/install': page('Install', ['/docs']),
    '/blog/launch': page('Launch'),
    '/pricing': page('Pricing'),
  }, ['/pricing', '/blog/launch', '/docs/install'])
  try {
    const r = await crawl({ start: base + '/docs', pages: 10, delay: 0, checkLinks: 0 })
    assert.deepEqual(r.pages.map((p) => p.url).sort(), [base + '/docs', base + '/docs/install'])
    assert.ok(!seen.includes('/blog/launch') && !seen.includes('/pricing'), 'pages outside the folder are not fetched')
    assert.equal(r.analysis.scope, '/docs')
    assert.equal(r.analysis.capped, false, 'pages outside the folder do not count as left unread')
  } finally { s.close() }
})
