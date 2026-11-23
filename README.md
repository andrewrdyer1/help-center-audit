# help-center-audit

A Claude Code plugin that audits a public help center. Give it a URL and it reads the site politely, then reports pages that contradict each other, pages that look out of date, passages that can be read two ways, broken links, thin pages and near-duplicates.

Every finding quotes the pages it is about, and **a quote that is not really on the page is dropped**. A model reading a help center will sometimes remember a sentence that was never there; the check is code, not a request to be careful.

## Sample

[examples/support-claude-com/REPORT.md](examples/support-claude-com/REPORT.md) is a real run on 30 pages of a public help center, with [findings.json](examples/support-claude-com/findings.json) as Claude proposed them, plus a run of [rules.example.json](rules.example.json) (see "Checked against your rules"). The crawled page text is not included. The audit read 30 pages and the report says so; it is not a verdict on the whole site.

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

## What it checks

Two kinds of check, with different standing. Code checks are mechanical and repeatable. Reading checks are Claude's judgment, kept only when the quotes hold up.

### Checked by code

| Check | What counts | What a result means |
|---|---|---|
| Broken links | An internal link (same site) that answers 404, 410, a server error, or nothing. Up to 80 unseen links are checked per run, and the report says how many were not. | A reader who clicks it lands nowhere. External links are not checked. |
| Thin pages | Fewer than 80 words of text after navigation, header and footer are removed. | The page may not answer anything on its own. Some are fine, such as a short "Where can I find the API docs?" |
| Near-duplicates | Two pages sharing at least 80% of their 5-word phrases. | Probably the same article published twice, or a copy that will drift apart when one is edited. |
| Says it is old | A page that states "Last updated: ..." (or "Updated", "Last reviewed") with a date over two years ago. | A hint, not a finding. A page can be old and right. |

### Found by reading (Claude), then checked by code

| Kind | What it is | What it needs |
|---|---|---|
| `contradiction` | Two pages state different things about the same subject: a number, a limit, a time frame, a list. | Exact quotes from **two different pages**. |
| `out_of_date` | A page that itself shows it is stale: a temporary notice with no date, a retired name, a date long past. | An exact quote from the page. |
| `ambiguous` | A passage a reader could take two ways, for example a list that looks complete but isn't. | An exact quote from the page. |
| `disagrees_with_source` | A help page and a document you say is right (a pricing PDF, a policy, terms) state different things. | An exact quote from **each**: one from the page, one from the document. |

A quote must be at least 20 characters and appear on the page or source document it names (curly quotes, dashes and spacing are ignored). A finding is dropped if a quote is missing, if it says anybody was affected, or if it counts people ("312 customers") or states a sum of money that is not in one of its quotes. A limit or price the page itself states ("up to 500 users", "$49") is fine.

### Your own rules

A rules file adds two literal checks, done by code with no judgment ([rules.example.json](rules.example.json)):

| Rule | What it does | What a result means |
|---|---|---|
| `bannedTerms` | Finds a term as written (any case, whole words, line breaks ignored), with an optional `reason` and `replacement`. Good for retired product names. | The text is there. The report shows the page and the sentence around it, and leaves the decision to you: a page may mention an old name on purpose ("now called ..."). |
| `required` | Checks that wording (at least 20 characters) is on every page the rule `appliesTo`: `*` for all, `re:<pattern>` against the address or title, or a piece of either. Good for disclaimers. | The pages listed do not contain the wording. If no page matches `appliesTo`, the report says nothing was checked. |

```
node scripts/rules.mjs rules.json
```

A rules file with a mistake is refused with what is wrong, never half applied.

### What a result says, and does not

- "Contradiction" means two pages differ. It does not say which one is right. "Disagrees with source" means a page and your document differ; it says so, and leaves the decision to you.
- Counts are about pages, never about customers. Nothing here says how many people a problem reached.
- An empty section means nothing was found **in the pages read**. The report always states how many pages that was, and whether it stopped at the limit.
- Not checked: external links, images and alt text, spelling and grammar, tone, accessibility, search ranking, and whether a topic is missing from the help center altogether. A rule only finds what you wrote down.

## Bigger sites and source documents

**More pages.** `--pages` is only a politeness cap, not a limit of the tool: `--pages 500` reads 500 pages in a few minutes. Reading them is what doesn't fit in one go, so the crawl also writes `batches.json`: pages grouped by what they are about (TF-IDF similarity on their words), each group at most `--budget` words (default 12,000). Claude reads one group at a time. The pairs of similar pages that landed in different groups are listed as `crossBatch`, and Claude compares those pairs separately, so a contradiction between two groups is still looked for.

**Source documents.** Give it the documents that are right:

```
Audit https://help.example.com and compare it with pricing.pdf and refund-policy.md
```

`scripts/ground.mjs` reads `.pdf`, `.md`, `.txt` and `.html`. PDFs need `pdftotext` from poppler (`brew install poppler` or `apt install poppler-utils`); without it the tool says so and suggests saving the PDF's text as `.txt` instead. Each document is cited as `ground:<filename>`, and a finding needs one exact quote from the page and one from the document, both checked.

## How it works

| Step | Who does it | What |
|---|---|---|
| Crawl | `scripts/crawl.mjs` | Reads up to `--pages` pages (default 60) of one host. Obeys robots.txt and its crawl delay, goes slowly, stays inside the folder it starts in (`/docs` reads only `/docs`; a language folder such as `/hc/en-us` keeps it in that language), and stops if the site answers 429 or 403 three times in a row. |
| Mechanical checks | `scripts/crawl.mjs` | Broken internal links, pages under 80 words, near-duplicate pages (shared 5-word shingles), pages that state they were last updated over two years ago. |
| Reading | Claude | Reads one group of pages at a time, then the pairs that cross groups, then (if given) your source documents, and proposes findings as JSON, each with exact quotes. |
| Rules | `scripts/rules.mjs` | Optional. Literal checks for retired names and required wording, from a file you write. |
| Verification | `scripts/verify.mjs` | Keeps a finding only if every quote is found on the page or document it names (ignoring curly quotes, dashes and spacing), a contradiction has quotes from two different pages, a source comparison has one quote from each side, and the wording does not count people or state money that isn't quoted. |
| Report | `scripts/report.mjs` | Writes `REPORT.md` with what was covered, what was kept and how many proposals were dropped. |

## What it will not say

- Who was affected, or how many. It reads content, not customers.
- Why a page is wrong. Two pages that differ are reported as differing.
- That the help center is clean. An empty report means nothing was found in the pages read, and the report says how many that was.

## Run the scripts yourself

```bash
node scripts/crawl.mjs https://help.example.com --pages 200
node scripts/ground.mjs pricing.pdf          # optional: documents that are right
node scripts/rules.mjs rules.json            # optional: banned terms, required wording
# write findings to help-center-audit-out/findings/*.json (see skills/help-center-audit/SKILL.md)
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
