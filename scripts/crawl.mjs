#!/usr/bin/env node
// Reads a public help center politely and writes what it found to help-center-audit-out/.
//   node crawl.mjs <url> [--pages 60] [--delay 600] [--out help-center-audit-out] [--check-links 80] [--budget 12000]
// Obeys robots.txt and its crawl delay, stays on one host, and stops when the site pushes back.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { allowedByRobots, buildBatches, htmlToPage, inScope, languageFolder, nearDuplicates, parseRobots, scopeOf, statedUpdate, THIN_WORDS, wordCount } from './lib.mjs'

const UA = 'help-center-audit/0.1 (Claude Code plugin; reads public pages only)'
const MIN_DELAY_MS = 400
const MAX_PUSHBACK = 3

async function get(url, opts = {}) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 15000)
  try {
    return await fetch(url, { ...opts, signal: ctl.signal, headers: { 'user-agent': UA, accept: 'text/html,application/xml;q=0.9,*/*;q=0.5' }, redirect: 'follow' })
  } finally {
    clearTimeout(timer)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1])

function keyOf(href) {
  const u = new URL(href)
  u.hash = ''
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '')
  return u.href
}

export async function crawl({ start, pages = 60, delay = 600, checkLinks = 80, log = () => {} }) {
  const origin = new URL(start)
  const host = origin.host
  const out = { start: origin.href, host, startedAt: new Date().toISOString(), pages: [], skipped: { robots: [], notHtml: [], failed: [] }, stopped: null, capped: false }

  let robots = { rules: [], crawlDelay: null, sitemaps: [] }
  try {
    const r = await get(new URL('/robots.txt', origin))
    if (r.ok) robots = parseRobots(await r.text(), 'help-center-audit')
    else if (r.status === 401 || r.status === 403) { out.stopped = 'robots.txt refused the request'; return finish(out, [], checkLinks, host, robots, delay, log) }
  } catch { /* no robots.txt is allowed */ }
  const wait = Math.max(MIN_DELAY_MS, delay, (robots.crawlDelay ?? 0) * 1000)

  // The crawl stays in the folder it started in (scopeOf). A start at the root that redirects into a language folder
  // (/ to /hc/en-us) takes that folder once the start page answers.
  let scope = scopeOf(origin.pathname)
  const isInScope = (u) => inScope(scope, u.pathname)

  const startKey = keyOf(origin.href)
  const queue = [startKey]
  const seen = new Set(queue)
  const read = new Set()  // addresses of pages already read, after redirects
  const enqueue = (href) => {
    let k
    try { k = keyOf(href) } catch { return }
    if (new URL(k).host !== host || !isInScope(new URL(k)) || seen.has(k)) return
    seen.add(k)
    queue.push(k)
  }
  const sitemapUrls = robots.sitemaps.length ? robots.sitemaps : [new URL('/sitemap.xml', origin).href]
  const sitemapSeeds = []
  for (const sm of sitemapUrls.slice(0, 3)) {
    try {
      const r = await get(sm)
      if (!r.ok) continue
      const xml = await r.text()
      let found = locs(xml)
      if (/<sitemapindex/i.test(xml)) {
        found = []
        for (const child of locs(xml).slice(0, 5)) {
          await sleep(wait)
          try { const c = await get(child); if (c.ok) found.push(...locs(await c.text())) } catch { /* skip */ }
        }
      }
      sitemapSeeds.push(...found)
    } catch { /* no sitemap is allowed */ }
  }
  for (const s of sitemapSeeds) enqueue(s)

  const statuses = new Map()
  let pushback = 0
  while (queue.length && out.pages.length < pages) {
    const url = queue.shift()
    const u = new URL(url)
    // Already read under another address (a redirect landed on it), or queued before the scope narrowed: skip unfetched.
    if (read.has(url) || !isInScope(u)) continue
    if (!allowedByRobots(robots, u.pathname + u.search)) { out.skipped.robots.push(url); continue }
    await sleep(wait)
    let res
    try { res = await get(url) } catch (e) { out.skipped.failed.push({ url, reason: String(e.name === 'AbortError' ? 'timed out' : e.message) }); statuses.set(url, 0); continue }
    statuses.set(url, res.status)
    if (res.status === 429 || res.status === 403) {
      if (++pushback >= MAX_PUSHBACK) { out.stopped = `the site pushed back (${res.status}) ${MAX_PUSHBACK} times in a row`; break }
      continue
    }
    pushback = 0
    if (res.status >= 400) { out.skipped.failed.push({ url, reason: `HTTP ${res.status}` }); continue }
    const finalUrl = new URL(res.url)
    if (finalUrl.host !== host) { out.skipped.failed.push({ url, reason: `redirects off the site to ${finalUrl.host}` }); continue }
    if (!/html/i.test(res.headers.get('content-type') ?? '')) { out.skipped.notHtml.push(url); continue }
    const html = await res.text()
    const page = htmlToPage(html, finalUrl.href)
    const finalKey = keyOf(finalUrl.href)
    if (url === startKey && finalKey !== url && (scope === '/' || !inScope(scope, finalUrl.pathname))) {
      // The start page redirected: from the root, into a language folder; from a folder, to wherever it landed.
      scope = scope === '/' ? (languageFolder(finalUrl.pathname) ?? '/') : scopeOf(finalUrl.pathname)
    }
    if (!isInScope(finalUrl)) { out.skipped.failed.push({ url, reason: `redirects out of ${scope} to ${finalUrl.pathname}` }); continue }
    seen.add(finalKey)
    if (read.has(finalKey)) continue
    read.add(finalKey)
    const words = wordCount(page.text)
    out.pages.push({
      url: finalKey,
      title: page.title,
      words,
      lastModified: res.headers.get('last-modified') ?? null,
      statedUpdate: statedUpdate(page.text),
      links: page.links,
      text: page.text,
    })
    log(`${out.pages.length}/${pages} ${finalKey}`)
    for (const l of page.links) enqueue(l)
  }
  out.scope = scope
  if (!out.stopped && queue.some((k) => !read.has(k) && isInScope(new URL(k)))) out.capped = true
  return finish(out, queue, checkLinks, host, robots, wait, log, statuses)
}

async function finish(out, queue, checkLinks, host, robots, wait, log, statuses = new Map()) {
  // Internal links on the pages read that nothing has answered for yet: one HEAD each, up to a cap.
  const unknown = new Set()
  for (const p of out.pages) for (const l of p.links) {
    let k
    try { k = keyOf(l) } catch { continue }
    if (new URL(k).host === host && !statuses.has(k) && allowedByRobots(robots, new URL(k).pathname + new URL(k).search)) unknown.add(k)
  }
  let checked = 0
  if (!out.stopped) {
    for (const k of unknown) {
      if (checked >= checkLinks) break
      await sleep(wait)
      checked++
      try {
        let r = await get(k, { method: 'HEAD' })
        // Some sites answer HEAD with an error where GET works (Zendesk: 404 on an article's id-only address, which a
        // GET redirects to the article), so a link is called broken only on GET's answer.
        if (r.status >= 400) r = await get(k)
        statuses.set(k, r.status)
      } catch { statuses.set(k, 0) }
    }
  }
  const unchecked = unknown.size - checked
  const broken = []
  for (const p of out.pages) for (const l of p.links) {
    let k
    try { k = keyOf(l) } catch { continue }
    const s = statuses.get(k)
    if (s === 404 || s === 410 || (s !== undefined && s >= 500) || s === 0) broken.push({ from: p.url, to: k, status: s })
  }
  const thin = out.pages.filter((p) => p.words < THIN_WORDS).map((p) => ({ url: p.url, words: p.words }))
  const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 2)
  const old = out.pages.filter((p) => p.statedUpdate && new Date(p.statedUpdate.iso) < cutoff).map((p) => ({ url: p.url, says: p.statedUpdate.text }))
  const analysis = {
    start: out.start,
    scope: out.scope ?? null,
    pagesRead: out.pages.length,
    stopped: out.stopped,
    capped: out.capped,
    skipped: { robots: out.skipped.robots.length, notHtml: out.skipped.notHtml.length, failed: out.skipped.failed },
    brokenLinks: broken,
    brokenLinksUnchecked: Math.max(0, unchecked),
    thinPages: thin,
    nearDuplicates: nearDuplicates(out.pages),
    saysItWasUpdatedOverTwoYearsAgo: old,
  }
  return { ...out, analysis }
}

async function main() {
  const argv = process.argv.slice(2)
  const flag = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : dflt }
  const start = argv.find((a, i) => !a.startsWith('--') && !(argv[i - 1] ?? '').startsWith('--'))
  if (!start || !/^https?:\/\//i.test(start)) { console.error('usage: crawl.mjs <https://help.example.com> [--pages 60] [--delay 600] [--out dir] [--check-links 80] [--budget 12000]'); process.exit(2) }
  const outDir = flag('out', 'help-center-audit-out')
  const result = await crawl({ start, pages: Number(flag('pages', 60)), delay: Number(flag('delay', 600)), checkLinks: Number(flag('check-links', 80)), log: (m) => console.error(m) })
  await mkdir(join(outDir, 'pages'), { recursive: true })
  const pages = result.pages.map(({ links, ...p }) => p)
  await writeFile(join(outDir, 'pages.json'), JSON.stringify({ start: result.start, readAt: result.startedAt, pages }, null, 2))
  await writeFile(join(outDir, 'analysis.json'), JSON.stringify(result.analysis, null, 2))
  result.pages.forEach((p, i) => { p.file = `pages/${String(i + 1).padStart(3, '0')}.txt` })
  await Promise.all(result.pages.map((p) => writeFile(join(outDir, p.file), `URL: ${p.url}\nTITLE: ${p.title}\n\n${p.text}\n`)))
  const plan = buildBatches(result.pages, { budgetWords: Number(flag('budget', 12000)) })
  await writeFile(join(outDir, 'batches.json'), JSON.stringify(plan, null, 2))
  const a = result.analysis
  console.log(`Read ${a.pagesRead} pages from ${result.host}${a.scope && a.scope !== '/' ? ` under ${a.scope}` : ''}${a.capped ? ' (stopped at the page limit; there are more)' : ''}${a.stopped ? ` (stopped early: ${a.stopped})` : ''}.`)
  console.log(`Broken links: ${a.brokenLinks.length}. Thin pages: ${a.thinPages.length}. Near-duplicate pairs: ${a.nearDuplicates.length}. Pages saying they were updated over two years ago: ${a.saysItWasUpdatedOverTwoYearsAgo.length}.`)
  console.log(`Grouped into ${plan.batches.length} reading${plan.batches.length === 1 ? '' : 's'} of up to ${plan.budgetWords} words (batches.json), with ${plan.crossBatch.length} similar page pairs that cross groups.`)
  console.log(`Written to ${outDir}/ (pages.json, analysis.json, batches.json, pages/*.txt).`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1) })
