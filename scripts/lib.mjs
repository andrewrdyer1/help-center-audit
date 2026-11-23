// Pure helpers shared by the scripts and the tests. No network, no file system.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…' }

export function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
}

/** The form a quote is compared in: how a model reproduces text, not what it says. */
export function normalize(s) {
  return s
    .toLowerCase()
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
}

export const MIN_QUOTE = 20

/** A quote counts only if it is long enough to mean something and is really in the text. */
export function quoteAppears(quote, text) {
  const q = normalize(quote)
  return q.length >= MIN_QUOTE && normalize(text).includes(q)
}

export function parseRobots(txt, agent = 'help-center-audit') {
  const groups = []
  const sitemaps = []
  let current = null
  let lastWasAgent = false
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const i = line.indexOf(':')
    if (i < 0) continue
    const key = line.slice(0, i).trim().toLowerCase()
    const value = line.slice(i + 1).trim()
    if (key === 'sitemap') { if (value) sitemaps.push(value); continue }
    if (key === 'user-agent') {
      if (!lastWasAgent || !current) { current = { agents: [], rules: [], delay: null }; groups.push(current) }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (!current) continue
    if (key === 'allow' || key === 'disallow') { if (value || key === 'allow') current.rules.push({ allow: key === 'allow', path: value }) }
    else if (key === 'crawl-delay') { const n = Number(value); if (Number.isFinite(n)) current.delay = n }
  }
  const a = agent.toLowerCase()
  const group = groups.find((g) => g.agents.some((x) => x !== '*' && a.includes(x))) ?? groups.find((g) => g.agents.includes('*')) ?? { rules: [], delay: null }
  return { rules: group.rules, crawlDelay: group.delay, sitemaps }
}

function ruleRegex(path) {
  const end = path.endsWith('$')
  const body = (end ? path.slice(0, -1) : path).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp('^' + body + (end ? '$' : ''))
}

/** The longest matching rule wins; a tie is allowed. */
export function allowedByRobots(robots, pathAndQuery) {
  let best = null
  for (const r of robots.rules) {
    if (!r.path) continue
    if (ruleRegex(r.path).test(pathAndQuery) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r
  }
  return best ? best.allow : true
}

function stripBlocks(html, tags) {
  let out = html
  for (const t of tags) out = out.replace(new RegExp(`<${t}\\b[\\s\\S]*?</${t}>`, 'gi'), ' ')
  return out
}

export function htmlToPage(html, baseUrl) {
  const links = []
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const href = decodeEntities((m[1] ?? m[2] ?? '').trim())
    if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) continue
    try {
      const u = new URL(href, baseUrl)
      if (!/^https?:$/.test(u.protocol)) continue
      u.hash = ''
      links.push(u.href)
    } catch { /* not a link */ }
  }
  let body = stripBlocks(html, ['script', 'style', 'noscript', 'svg', 'template'])
  body = body.replace(/<!--[\s\S]*?-->/g, ' ')
  const main = body.match(/<main\b[\s\S]*?<\/main>/i) ?? body.match(/<article\b[\s\S]*?<\/article>/i)
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const h1 = body.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  let region = main ? main[0] : stripBlocks(body, ['nav', 'header', 'footer', 'aside'])
  region = region.replace(/<\/(p|div|li|h[1-6]|tr|section|br|ul|ol|table|pre)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
  const text = decodeEntities(region).replace(/[ \t\f\v ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  const clean = (s) => decodeEntities((s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
  return { title: clean(titleTag) || clean(h1) || baseUrl, text, links: [...new Set(links)] }
}

export function wordCount(text) {
  return (text.match(/\S+/g) ?? []).length
}

export function shingles(text, n = 5) {
  const words = normalize(text).split(' ').filter(Boolean)
  const out = new Set()
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(' '))
  return out
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const x of a) if (b.has(x)) shared++
  return shared / (a.size + b.size - shared)
}

export function nearDuplicates(pages, threshold = 0.8) {
  const sets = pages.map((p) => shingles(p.text))
  const out = []
  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      const s = jaccard(sets[i], sets[j])
      if (s >= threshold) out.push({ a: pages[i].url, b: pages[j].url, similarity: Math.round(s * 100) / 100 })
    }
  }
  return out
}

/** A year or a "last updated" date a page states about itself, if any. */
export function statedUpdate(text) {
  const m = text.match(/\b(?:last\s+updated|updated|last\s+modified|last\s+reviewed)\s*(?:on|:)?\s*([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{4}|\d{4}-\d{2}-\d{2})/i)
  if (!m) return null
  const t = Date.parse(m[1].replace(/\./g, ''))
  return Number.isFinite(t) ? { text: m[0].trim(), iso: new Date(t).toISOString().slice(0, 10) } : null
}

export const KINDS = ['contradiction', 'out_of_date', 'ambiguous']

// A finding about content says what is on the pages. It never says who was affected.
const PEOPLE_CLAIM = /\b\d[\d,]*\s+(?:customers?|users?|people|visitors?|tickets?|conversations?)\b|\b(?:customers?|users?|people)\s+(?:are|were|have been|will be)\s+(?:affected|confused|misled)\b|\$\s?\d/i

export const THIN_WORDS = 80

/** Every rule a finding has to meet, and a reason when it does not. Evidence is checked against `pages` (url -> text). */
export function checkFinding(f, pages) {
  if (!f || typeof f !== 'object') return { ok: false, reason: 'not an object' }
  if (!KINDS.includes(f.kind)) return { ok: false, reason: `unknown kind "${f.kind}"` }
  if (typeof f.title !== 'string' || !f.title.trim() || typeof f.claim !== 'string' || !f.claim.trim()) return { ok: false, reason: 'missing title or claim' }
  if (PEOPLE_CLAIM.test(f.title) || PEOPLE_CLAIM.test(f.claim)) return { ok: false, reason: 'counts or names who was affected, or a sum of money' }
  if (!Array.isArray(f.evidence) || f.evidence.length === 0) return { ok: false, reason: 'no evidence' }
  const kept = []
  for (const e of f.evidence) {
    const text = pages.get(e?.url)
    if (text === undefined) return { ok: false, reason: `page not read: ${e?.url}` }
    if (!quoteAppears(String(e.quote ?? ''), text)) return { ok: false, reason: `quote not found on ${e.url}: "${String(e.quote ?? '').slice(0, 60)}"` }
    kept.push({ url: e.url, quote: e.quote })
  }
  if (f.kind === 'contradiction' && new Set(kept.map((e) => e.url)).size < 2) return { ok: false, reason: 'a contradiction needs quotes from two different pages' }
  return { ok: true, finding: { kind: f.kind, title: f.title.trim(), claim: f.claim.trim(), evidence: kept } }
}
