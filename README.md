# help-center-audit

A Claude Code plugin that audits a public help center. Give it a URL and it reads the site politely, then reports pages that contradict each other, pages that look out of date, passages that can be read two ways, broken links, thin pages and near-duplicates.

Every finding quotes the pages it is about, and **a quote that is not really on the page is dropped**. A model reading a help center will sometimes remember a sentence that was never there; the check is code, not a request to be careful.

## Sample

[examples/support-claude-com/REPORT.md](examples/support-claude-com/REPORT.md) is a real run on 30 pages of a public help center, with [findings.json](examples/support-claude-com/findings.json) as Claude proposed them. The crawled page text is not included. The audit read 30 pages and the report says so; it is not a verdict on the whole site.

## Install

In Claude Code:

```
/plugin marketplace add andrewrdyer1/help-center-audit
/plugin install help-center-audit@help-center-audit
```

Needs Node 20 or later. There are no dependencies.

## Use

Ask Claude Code:

```
Audit the help center at https://help.example.com
```

Or invoke the skill directly with `/help-center-audit:help-center-audit`. The result is `help-center-audit-out/REPORT.md` in your current directory.

## How it works

| Step | Who does it | What |
|---|---|---|
| Crawl | `scripts/crawl.mjs` | Reads up to 60 pages of one host. Obeys robots.txt and its crawl delay, goes slowly, stays in the start page's language folder, and stops if the site answers 429 or 403 three times in a row. |
| Mechanical checks | `scripts/crawl.mjs` | Broken internal links, pages under 80 words, near-duplicate pages (shared 5-word shingles), pages that state they were last updated over two years ago. |
| Reading | Claude | Compares pages that cover the same subject and proposes findings as JSON, each with exact quotes. |
| Verification | `scripts/verify.mjs` | Keeps a finding only if every quote is found on the page it names (ignoring curly quotes, dashes and spacing), a contradiction has quotes from two different pages, and the wording does not count people or money. |
| Report | `scripts/report.mjs` | Writes `REPORT.md` with what was covered, what was kept and how many proposals were dropped. |

## What it will not say

- Who was affected, or how many. It reads content, not customers.
- Why a page is wrong. Two pages that differ are reported as differing.
- That the help center is clean. An empty report means nothing was found in the pages read, and the report says how many that was.

## Run the scripts yourself

```bash
node scripts/crawl.mjs https://help.example.com --pages 60
# write help-center-audit-out/findings.json (see skills/help-center-audit/SKILL.md)
node scripts/verify.mjs
node scripts/report.mjs
```

```bash
npm test
```

## Responsible use

It reads only public pages, identifies itself in its user agent and goes at most a page or two a second. Only point it at a site you are allowed to read. It stores nothing outside `help-center-audit-out/`.

## License

MIT
