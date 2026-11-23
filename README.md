# help-center-audit

**Find the contradictions, stale pages and ambiguous passages in a help center before an AI support agent repeats them to your customers.**

A help center used to be read by people, who could notice when two articles disagreed and ask. Now it is also the source material for AI support agents and AI search. An agent doesn't notice. If one page says refunds take 14 days and another says 30, it will confidently tell some customers the wrong one, at whatever volume your support runs.

This is a Claude Code plugin that audits a public help center for those problems. Give it a URL. It reads the site politely and reports:

- pages that **contradict each other** (a number, a limit, a time frame, a list)
- pages that **look out of date** (an undated "temporary" notice, a retired name, a date long past)
- passages a reader could **take two ways**
- pages that **disagree with a document you say is right**, such as a pricing PDF or a policy
- **broken links, thin pages and near-duplicates**

Give it **release notes** too, and it reviews them from both sides: which help center pages the release makes wrong, with suggested new wording for a person to review, and where the notes themselves are unclear.

Every finding quotes the pages it's about, and **a finding whose quote isn't really on the page is dropped**. That check is code, not a request to the model to be careful.

## Why not just ask an AI to review the site?

You can, and you'll get an opinion. This tool is built so the result is something a team can act on:

| Asking an AI to review a site | This audit |
|---|---|
| Reads a handful of pages | Reads hundreds, grouped by topic, and compares similar pages across groups so a contradiction between distant articles still gets found |
| May quote a sentence that was never there | Every quote is checked against the page by code. A quote that isn't found drops the finding |
| Different answer every time | Mechanical checks are repeatable. Reading checks have to pass the same verification every run |
| Doesn't say what it skipped | States how many pages it read, whether it hit the limit, and what it never checks |
| Can drift into guesses about impact | Never says who was affected, how many, or which page is right. It says what's on the pages |
| Will happily write new help text with numbers it made up | A suggested rewrite may only use figures and addresses that are already in the release note or the quotes, or it is dropped |

The split is deliberate. Code does what code does well: crawling, links, word counts, duplicates, literal rules and verification. Claude does what needs reading: noticing that two pages on different subjects quietly disagree. People make the decisions, such as which page is right, what to fix first, and what goes to Product.

## Sample

[examples/support-claude-com/REPORT.md](examples/support-claude-com/REPORT.md) is a real run on 30 pages of a public help center. It includes [findings.json](examples/support-claude-com/findings.json) as Claude proposed them and a run of [rules.example.json](rules.example.json). The crawled page text is not included. The audit read 30 pages, and the report says so. It is not a verdict on the whole site.

An excerpt:

> **Two pages list the API usage tiers differently**
>
> The 429 troubleshooting page says there are three usage tiers (plus Custom). The rate limits page says there are three standard tiers and also an Evaluation tier that new organizations may start in. A reader of the first page would not know the Evaluation tier exists.

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

To compare it against documents you know are right:

```
Audit https://help.example.com and compare it with pricing.pdf and refund-policy.md
```

To review release notes against the help center:

```
Audit https://help.example.com against release-notes-v4.2.md. Which pages does it make wrong, and is the note clear?
```

Or invoke the skill directly with `/help-center-audit:help-center-audit`. The result is `help-center-audit-out/REPORT.md` in your current directory.

## What it checks

There are two kinds of check, with different standing. Code checks are mechanical and repeatable. Reading checks are Claude's judgment, and are kept only when the quotes hold up.

### Checked by code

| Check | What counts | What a result means |
|---|---|---|
| Broken links | An internal link (same site) that answers 404, 410, a server error, or nothing. Up to 80 unseen links are checked per run, and the report says how many were not. | A reader who clicks it lands nowhere. External links are not checked. |
| Thin pages | Fewer than 80 words of text after navigation, header and footer are removed. | The page may not answer anything on its own. Some are fine, such as a short "Where can I find the API docs?" |
| Near-duplicates | Two pages sharing at least 80% of their 5-word phrases. | Probably the same article published twice, or a copy that will drift when one is edited. |
| Says it is old | A page that states "Last updated: ..." (or "Updated", "Last reviewed") with a date over two years ago. | A hint, not a finding. A page can be old and right. |

### Found by reading (Claude), then checked by code

| Kind | What it is | What it needs |
|---|---|---|
| `contradiction` | Two pages state different things about the same subject: a number, a limit, a time frame, a list. | Exact quotes from **two different pages**. |
| `out_of_date` | A page that itself shows it is stale: a temporary notice with no date, a retired name, a date long past. | An exact quote from the page. |
| `ambiguous` | A passage a reader could take two ways, for example a list that looks complete but isn't. | An exact quote from the page. |
| `disagrees_with_source` | A help page and a document you say is right (a pricing PDF, a policy, terms) state different things. | An exact quote from **each**: one from the page, one from the document. |
| `affected_by_release` | A release note changes or contradicts something a help page says: a limit raised, a feature renamed, a step removed. | An exact quote from **each**: one from the release note, one from the page. May carry a suggested rewrite. |
| `release_note_unclear` | A release note is ambiguous, says two things, or promises something without saying what or when. | An exact quote from the release notes. May carry a suggested rewrite. |

A quote must be at least 20 characters and appear on the page or document it names. Curly quotes, dashes and spacing are ignored. A finding is dropped if a quote is missing, if it says anybody was affected, or if it counts people ("312 customers") or states a sum of money that isn't in one of its quotes. A limit or price the page itself states ("up to 500 users", "$49") is fine.

### Release notes

`scripts/releases.mjs` reads release notes from a file (`.md`, `.txt`, `.html`, `.pdf`), which is the usual case for a draft you haven't published, or from one public page with `--url`, read once and only if its robots.txt allows it. Each document is cited as `release:<filename>`.

For each change the notes announce, Claude finds the help center pages that talk about the same thing and compares. The report lists the pages the release affects, each with the quote from the notes and the quote from the page, so a person sees exactly what to look at. It also reads the notes the way a reviewer would, and flags wording a customer could take two ways.

**A suggested rewrite is a draft for a person to review.** Code checks only one thing about it: every number and address in it must already be in the release note or in one of the quotes. A suggestion that introduces a limit, a price or a link nobody wrote is dropped with the finding. The wording and tone of a suggestion are not checked, and it is never applied to anything.

### Your own rules

A rules file adds two literal checks, done by code with no judgment ([rules.example.json](rules.example.json)):

| Rule | What it does | What a result means |
|---|---|---|
| `bannedTerms` | Finds a term as written (any case, whole words, line breaks ignored), with an optional `reason` and `replacement`. Good for retired product names. | The text is there. The report shows the page and the sentence around it and leaves the decision to you, since a page may mention an old name on purpose ("now called ..."). |
| `required` | Checks that wording (at least 20 characters) is on every page the rule `appliesTo`: `*` for all, `re:<pattern>` against the address or title, or a piece of either. Good for disclaimers. | The pages listed don't contain the wording. If no page matches `appliesTo`, the report says nothing was checked. |

```
node scripts/rules.mjs rules.json
```

A rules file with a mistake is refused with what's wrong. It is never half applied.

## Bigger sites and source documents

**More pages.** `--pages` is a politeness cap, not a limit of the tool: `--pages 500` reads 500 pages in a few minutes. What doesn't fit in one go is reading them, so the crawl also writes `batches.json`, which groups pages by what they're about (TF-IDF similarity on their words), each group at most `--budget` words (default 12,000). Claude reads one group at a time. Pairs of similar pages that landed in different groups are listed as `crossBatch`, and Claude compares those pairs separately.

**Source documents.** `scripts/ground.mjs` reads `.pdf`, `.md`, `.txt` and `.html`. PDFs need `pdftotext` from poppler (`brew install poppler` or `apt install poppler-utils`). Without it, the tool says so and suggests saving the PDF's text as `.txt` instead. Each document is cited as `ground:<filename>`, and a finding needs one exact quote from the page and one from the document, both checked. Release notes are read the same way.

## How it works

| Step | Who does it | What |
|---|---|---|
| Crawl | `scripts/crawl.mjs` | Reads up to `--pages` pages (default 60) of one host. Obeys robots.txt and its crawl delay, goes slowly, stays inside the folder it starts in (`/docs` reads only `/docs`; a language folder such as `/hc/en-us` keeps it in that language), and stops if the site answers 429 or 403 three times in a row. |
| Mechanical checks | `scripts/crawl.mjs` | Broken internal links, pages under 80 words, near-duplicate pages (shared 5-word shingles), pages that say they were last updated over two years ago. |
| Reading | Claude | Reads one group of pages at a time, then the pairs that cross groups, then any source documents and release notes, and proposes findings as JSON, each with exact quotes. |
| Rules | `scripts/rules.mjs` | Optional. Literal checks for retired names and required wording, from a file you write. |
| Verification | `scripts/verify.mjs` | Keeps a finding only if every quote is found on the page or document it names, a contradiction has quotes from two different pages, a source or release comparison has one quote from each side, the wording doesn't count people or state money that isn't quoted, and a suggestion adds no figure or address that isn't there already. |
| Report | `scripts/report.mjs` | Writes `REPORT.md`: what was covered, what was kept, and how many proposals were dropped. |

## What it will not say

- **Who was affected, or how many.** It reads content, not customers.
- **Which page is right, or why a page is wrong.** Two pages that differ are reported as differing. A release note finding says what the note changes and what the page still says.
- **That a suggested rewrite is correct.** It is a draft with checked figures, for a person to read.
- **That the help center is clean.** An empty report means nothing was found in the pages read, and the report says how many that was.

Not checked: external links, images and alt text, spelling and grammar, tone, accessibility, search ranking, and whether a topic is missing from the help center altogether. A rule only finds what you wrote down.

## Run the scripts yourself

```bash
node scripts/crawl.mjs https://help.example.com --pages 200
node scripts/ground.mjs pricing.pdf          # optional: documents that are right
node scripts/releases.mjs release-notes.md   # optional: release notes to review
node scripts/rules.mjs rules.json            # optional: banned terms, required wording
# write findings to help-center-audit-out/findings/*.json (see skills/help-center-audit/SKILL.md)
node scripts/verify.mjs
node scripts/report.mjs
```

```bash
npm test
```

## Responsible use

It reads only public pages, identifies itself in its user agent, and goes at most a page or two a second. Only point it at a site you're allowed to read. It stores nothing outside `help-center-audit-out/`.

## About

Built by [Andy Dyer](https://andyer.com). I've spent about 15 years building and running support teams, most recently leading Support & Success at Workable, where I owned the help center and launched our first AI support agent. Every help center audit I did by hand turned up the same thing: articles written years apart, by different people, that quietly disagree. That never mattered much when people were the only readers. It matters a lot once an AI agent is answering from them.

I built this to do the first pass so a person can spend their time on the decisions.

## License

MIT
