---
name: help-center-audit
description: Audit a public help center or documentation site. Use when the user gives a help center URL and asks to audit, review, check or find problems in it (contradictions, stale pages, thin pages, duplicates, broken links).
---

# Help center audit

You audit a public help center and report problems with the content. Code does the
crawling and the checking; you do the reading. A finding is only kept if the passages
it quotes are really on the pages it names.

The scripts are in `${CLAUDE_PLUGIN_ROOT}/scripts` and need Node 20 or later. They have
no dependencies. Work in the user's current directory; everything is written to
`help-center-audit-out/`.

## 1. Crawl

Only crawl a site the user named. Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/crawl.mjs" <url> --pages 60
```

`--pages` is how many pages to read (default 60; ask the user if the site is bigger and they want all of it, a
few hundred is fine, it only takes minutes). It obeys robots.txt and its crawl delay, stays on the one host and in the
start page's language folder, goes at most a couple of pages a second, and stops if the site pushes back (429 or 403
three times). It writes:

- `pages.json` and `pages/NNN.txt`: the text of each page.
- `analysis.json`: thin pages, near-duplicates, broken links, pages that say they were last updated long ago.
- `batches.json`: the pages grouped into readings of about 12,000 words each, most-alike pages together, with a theme
  for each, and `crossBatch`, the pairs of alike pages that landed in different readings.

If it stopped early or hit the page limit, say so in the report: the audit covers only what was read.

## 2. Source documents (only if the user gave you some)

If the user named documents that are right (a pricing PDF, a policy, terms), read them in:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ground.mjs" pricing.pdf policy.md
```

PDF text needs `pdftotext` (poppler). If it says it is not installed, tell the user how to install it, or read the PDF
yourself and save the text as a `.txt` to pass instead. Each document is cited as `ground:<filename>`.

## 3. Read and write findings

Do not read the whole site at once. Work reading by reading:

1. For each batch in `batches.json`, read its pages (the `file` paths) and write the findings for that reading to
   `help-center-audit-out/findings/batch-<id>.json`. Compare pages on the same subject: prices, limits, steps,
   eligibility, time frames. Read `analysis.json` first.
2. Then take `crossBatch`, highest similarity first, read both pages of each pair and write
   `findings/cross.json`. This is how a contradiction between two readings is found.
3. If there are source documents, read each (a long one a part at a time) and for each claim in it that a help page
   also makes (a price, a limit, a time frame, a rule), find the page (search `pages/` for the term) and compare. Write
   `findings/source.json`. Do not go looking for a source's every sentence; compare what the help center also says.

Each file is a list of:

```json
{
  "kind": "contradiction",
  "title": "Refund window differs between two pages",
  "claim": "One page says 30 days, the other says 14 days.",
  "evidence": [
    { "url": "https://help.example.com/refunds", "quote": "Refunds are available within 30 days of purchase" },
    { "url": "https://help.example.com/billing", "quote": "You can request a refund within 14 days" }
  ]
}
```

Rules:

- `kind` is one of `contradiction` (quotes from two different pages), `out_of_date` (a page that itself shows it is
  stale: a temporary notice with no date, a retired name, a date long past), `ambiguous` (a passage a reader could
  take two ways) or `disagrees_with_source` (one quote from a help page and one from a source document, using the
  `ground:<filename>` url, that state different things).
- Every `quote` is copied exactly from the page or document, at least 20 characters. Do not paraphrase and do not
  join two sentences. A quote that is not found is dropped.
- Say what is on the pages, never why or who it affects. Do not count customers or say anybody was affected. A price
  or a limit may be stated only if it is in one of the quotes. Do not say a page is wrong when you only know two
  texts differ, and do not say the source is right: say they differ.
- No finding without evidence. If you are unsure, leave it out. An empty list is a valid answer.

## 4. Check and report

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs"
node "${CLAUDE_PLUGIN_ROOT}/scripts/report.mjs"
```

`verify.mjs` reads `findings.json` and every `findings/*.json`, writes `verified.json` and tells you what it dropped and
why. `report.mjs`
writes `REPORT.md`. Tell the user how many findings were kept and dropped, what the
crawl covered, and where `REPORT.md` is. Do not edit the report to add findings that
verification dropped.
