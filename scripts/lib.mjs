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
/** Compares the help center with a document the team says is right. Needs one quote from each side. */
export const SOURCE_KIND = 'disagrees_with_source'
export const GROUND_PREFIX = 'ground:'
export const isGround = (url) => typeof url === 'string' && url.startsWith(GROUND_PREFIX)

// A finding about content says what is on the pages. It never says who was affected.
const AFFECTED_CLAIM = /\b(?:customers?|users?|people)\s+(?:are|were|have been|will be)\s+(?:affected|confused|misled)\b/i
// A count of people, or a sum of money, may appear only if it is in a quote: "up to 500 users" is a limit the page states.
const COUNT_OF_PEOPLE = /\b\d[\d,]*\s+(?:customers?|users?|people|visitors?|tickets?|conversations?)\b/gi
const MONEY = /\$\s?\d[\d,]*(?:\.\d+)?/g

export const THIN_WORDS = 80

const squash = (s) => normalize(s).replace(/[\s,]/g, '')

function claimsOutsideQuotes(text, evidence) {
  const quoted = squash(evidence.map((e) => e.quote ?? '').join(' '))
  for (const re of [COUNT_OF_PEOPLE, MONEY]) {
    for (const m of text.matchAll(re)) if (!quoted.includes(squash(m[0]))) return m[0]
  }
  return null
}

/** Every rule a finding has to meet, and a reason when it does not. Evidence is checked against `pages` (url -> text). */
export function checkFinding(f, pages) {
  if (!f || typeof f !== 'object') return { ok: false, reason: 'not an object' }
  const isSource = f.kind === SOURCE_KIND
  if (!isSource && !KINDS.includes(f.kind)) return { ok: false, reason: `unknown kind "${f.kind}"` }
  if (typeof f.title !== 'string' || !f.title.trim() || typeof f.claim !== 'string' || !f.claim.trim()) return { ok: false, reason: 'missing title or claim' }
  if (AFFECTED_CLAIM.test(f.title) || AFFECTED_CLAIM.test(f.claim)) return { ok: false, reason: 'says who was affected' }
  if (!Array.isArray(f.evidence) || f.evidence.length === 0) return { ok: false, reason: 'no evidence' }
  const kept = []
  for (const e of f.evidence) {
    const text = pages.get(e?.url)
    if (text === undefined) return { ok: false, reason: `page not read: ${e?.url}` }
    if (!quoteAppears(String(e.quote ?? ''), text)) return { ok: false, reason: `quote not found on ${e.url}: "${String(e.quote ?? '').slice(0, 60)}"` }
    kept.push({ url: e.url, quote: e.quote })
  }
  const outside = claimsOutsideQuotes(`${f.title} ${f.claim}`, kept)
  if (outside) return { ok: false, reason: `counts people or states money not found in a quote ("${outside}")` }
  const fromSource = kept.filter((e) => isGround(e.url))
  const fromPages = kept.filter((e) => !isGround(e.url))
  if (isSource) {
    if (!fromSource.length || !fromPages.length) return { ok: false, reason: 'a comparison with a source document needs one quote from the source and one from a help center page' }
  } else {
    if (fromSource.length) return { ok: false, reason: 'quotes from a source document belong to a disagrees_with_source finding' }
    if (f.kind === 'contradiction' && new Set(fromPages.map((e) => e.url)).size < 2) return { ok: false, reason: 'a contradiction needs quotes from two different pages' }
  }
  return { ok: true, finding: { kind: f.kind, title: f.title.trim(), claim: f.claim.trim(), evidence: kept } }
}

// ---------------------------------------------------------------------------------------------------------------------
// Batching. A big help center does not fit in one reading, so pages are grouped by what they are about, one group per
// reading, and the pairs that cross groups are listed so a comparison across groups is still made.

const STOP = new Set(('the and for you your are with that this from have has can will not but all any our out use used using how what when where which who why '
  + 'was were been being into onto over under than then them they their there here also may might must should would could just more most some such only other '
  + 'about after before between through while does did doing done get got make made need needs want yes none each every very much many one two three see learn '
  + 'help center article articles please contact support click select').split(' '))

function termCounts(text) {
  const counts = new Map()
  for (const w of normalize(text).match(/[a-z][a-z0-9'-]{2,}/g) ?? []) {
    if (STOP.has(w)) continue
    counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  return counts
}

function addInto(acc, vec, k = 1) {
  for (const [t, w] of vec) acc.set(t, (acc.get(t) ?? 0) + w * k)
}

function dot(a, b) {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a]
  let sum = 0
  for (const [t, w] of small) { const o = big.get(t); if (o) sum += w * o }
  return sum
}

function norm(vec) {
  let n = 0
  for (const w of vec.values()) n += w * w
  return Math.sqrt(n)
}

/** One sparse, length-normalized TF-IDF vector per page. Terms in every page, or in only one, carry no grouping signal. */
export function topicVectors(pages, termsPerPage = 60) {
  const counts = pages.map((p) => termCounts(p.text))
  const df = new Map()
  for (const c of counts) for (const t of c.keys()) df.set(t, (df.get(t) ?? 0) + 1)
  const n = pages.length
  return counts.map((c) => {
    const weighted = []
    for (const [t, f] of c) {
      const d = df.get(t)
      if (d < 2 || d === n) continue
      weighted.push([t, (1 + Math.log(f)) * Math.log(n / d)])
    }
    weighted.sort((a, b) => b[1] - a[1])
    const vec = new Map(weighted.slice(0, termsPerPage))
    const len = norm(vec) || 1
    for (const [t, w] of vec) vec.set(t, w / len)
    return vec
  })
}

/**
 * Groups pages into readings of at most `budgetWords` each, most-alike pages together, and lists the most alike pairs
 * that ended up in different groups (`crossBatch`), which are the comparisons a group-by-group reading would miss.
 */
export function buildBatches(pages, { budgetWords = 12000, crossThreshold = 0.35, crossPerPage = 3, crossMax = 150 } = {}) {
  const vecs = topicVectors(pages)
  const words = pages.map((p) => p.words ?? wordCount(p.text))
  const left = new Set(pages.map((_, i) => i))
  const batches = []
  while (left.size) {
    const seed = left.values().next().value
    left.delete(seed)
    const members = [seed]
    const centroid = new Map(vecs[seed])
    let total = words[seed]
    while (left.size) {
      let best = -1
      let bestScore = -1
      for (const i of left) {
        if (total + words[i] > budgetWords) continue
        const sc = dot(vecs[i], centroid)
        if (sc > bestScore) { bestScore = sc; best = i }
      }
      if (best < 0) break
      left.delete(best)
      members.push(best)
      addInto(centroid, vecs[best])
      total += words[best]
    }
    const theme = [...centroid].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t)
    batches.push({ id: batches.length + 1, theme, words: total, members })
  }
  const batchOf = new Map()
  for (const b of batches) for (const i of b.members) batchOf.set(i, b.id)
  const pairs = new Map()
  for (let i = 0; i < pages.length; i++) {
    const near = []
    for (let j = 0; j < pages.length; j++) {
      if (i === j || batchOf.get(i) === batchOf.get(j)) continue
      const sc = dot(vecs[i], vecs[j])
      if (sc >= crossThreshold) near.push([j, sc])
    }
    near.sort((a, b) => b[1] - a[1])
    for (const [j, sc] of near.slice(0, crossPerPage)) {
      const [a, b] = i < j ? [i, j] : [j, i]
      pairs.set(`${a}|${b}`, { a: pages[a].url, b: pages[b].url, similarity: Math.round(sc * 100) / 100 })
    }
  }
  const crossBatch = [...pairs.values()].sort((x, y) => y.similarity - x.similarity).slice(0, crossMax)
  return {
    budgetWords,
    batches: batches.map((b) => ({ id: b.id, theme: b.theme, words: b.words, pages: b.members.map((i) => ({ url: pages[i].url, title: pages[i].title, words: words[i], file: pages[i].file })) })),
    crossBatch,
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The team's own rules: names that must no longer appear, and wording that must appear. Literal matches, no judgment.

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Checks the shape of a rules file and returns what is wrong with it, or [] if it is usable. */
export function validateRules(rules) {
  const errors = []
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) return ['the rules file must be a JSON object with "bannedTerms" and/or "required"']
  for (const k of Object.keys(rules)) if (!['bannedTerms', 'required'].includes(k)) errors.push(`unknown key "${k}"`)
  for (const [i, b] of (rules.bannedTerms ?? []).entries()) {
    if (!b || typeof b.term !== 'string' || b.term.trim().length < 2) errors.push(`bannedTerms[${i}]: "term" must be a string of at least 2 characters`)
    if (b?.replacement !== undefined && typeof b.replacement !== 'string') errors.push(`bannedTerms[${i}]: "replacement" must be a string`)
  }
  for (const [i, r] of (rules.required ?? []).entries()) {
    if (!r || typeof r.text !== 'string' || r.text.trim().length < MIN_QUOTE) errors.push(`required[${i}]: "text" must be a string of at least ${MIN_QUOTE} characters, so a match means something`)
    if (r?.appliesTo !== undefined && typeof r.appliesTo !== 'string') errors.push(`required[${i}]: "appliesTo" must be a string`)
    if (typeof r?.appliesTo === 'string' && r.appliesTo.startsWith('re:')) { try { new RegExp(r.appliesTo.slice(3), 'i') } catch { errors.push(`required[${i}]: "appliesTo" is not a valid pattern`) } }
  }
  return errors
}

/** `appliesTo`: "*" or empty (every page), "re:<pattern>", or a piece of the address or title. */
export function appliesTo(spec, page) {
  if (!spec || spec === '*') return true
  if (spec.startsWith('re:')) return new RegExp(spec.slice(3), 'i').test(page.url) || new RegExp(spec.slice(3), 'i').test(page.title ?? '')
  const s = spec.toLowerCase()
  return page.url.toLowerCase().includes(s) || (page.title ?? '').toLowerCase().includes(s)
}

function excerpt(text, index, length) {
  const from = Math.max(0, index - 50)
  const to = Math.min(text.length, index + length + 50)
  return (from > 0 ? '...' : '') + text.slice(from, to).replace(/\s+/g, ' ').trim() + (to < text.length ? '...' : '')
}

export function checkRules(rules, pages) {
  const banned = (rules.bannedTerms ?? []).map((b) => {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(b.term.trim()).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'giu')
    const hits = []
    for (const p of pages) {
      const found = [...p.text.matchAll(re)]
      if (found.length) hits.push({ url: p.url, count: found.length, excerpt: excerpt(p.text, found[0].index, found[0][0].length) })
    }
    return { term: b.term.trim(), reason: b.reason ?? null, replacement: b.replacement ?? null, pages: hits }
  })
  const required = (rules.required ?? []).map((r) => {
    const scope = pages.filter((p) => appliesTo(r.appliesTo, p))
    const want = normalize(r.text)
    const missing = scope.filter((p) => !normalize(p.text).includes(want)).map((p) => p.url)
    return { text: r.text, reason: r.reason ?? null, appliesTo: r.appliesTo || '*', checked: scope.length, missing }
  })
  return { pagesChecked: pages.length, banned, required }
}
