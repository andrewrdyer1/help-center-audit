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

It obeys robots.txt and its crawl delay, stays on the one host, goes at most a couple
of pages a second, and stops if the site pushes back (429 or 403 three times). It
writes `pages.json` (full text of each page), `analysis.json` (thin pages,
near-duplicates, broken links, pages that say they were last updated long ago) and
`pages/NNN.txt` (one readable file per page). If it was stopped, say so in the report:
the audit covers only what was read.

## 2. Read

Read `analysis.json` first, then the pages in `pages/`. Read enough to compare pages
that cover the same subject (prices, limits, steps, eligibility, time frames).

## 3. Write findings

Write `help-center-audit-out/findings.json`, a list of:

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

- `kind` is one of `contradiction` (needs quotes from two different pages),
  `out_of_date` (a page that itself shows it is stale: an old version, a retired
  product name, a date long past) or `ambiguous` (a passage a reader could take two
  ways).
- Every `quote` is copied exactly from the page, at least 20 characters. Do not
  paraphrase and do not join two sentences. A quote that is not found is dropped.
- Say what is on the pages, never why or who it affects. Do not count customers, say
  anybody was affected, guess at money, or say a page is wrong when you only know two
  pages differ.
- No finding without evidence. If you are unsure, leave it out. An empty list is a
  valid answer.

## 4. Check and report

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs"
node "${CLAUDE_PLUGIN_ROOT}/scripts/report.mjs"
```

`verify.mjs` writes `verified.json` and tells you what it dropped and why. `report.mjs`
writes `REPORT.md`. Tell the user how many findings were kept and dropped, what the
crawl covered, and where `REPORT.md` is. Do not edit the report to add findings that
verification dropped.
