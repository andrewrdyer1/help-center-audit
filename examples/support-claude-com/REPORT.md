# Help center audit: https://support.claude.com/en/

This report is about the **content** of the help center. It says what is on the pages. It does not say who was affected or what anything costs.

**Covered:** 30 pages read, stopped at the page limit (there are more pages than this audit read).

## What a reader of the pages can check

### Pages that contradict each other (1)

**Two pages list the API usage tiers differently**

The 429 troubleshooting page says there are three usage tiers (plus Custom). The rate limits page says there are three standard tiers and also an Evaluation tier that new organizations may start in. A reader of the first page would not know the Evaluation tier exists.

- https://support.claude.com/en/articles/8114527-i-m-encountering-429-errors-and-i-m-worried-my-rate-limit-is-too-low-what-should-i-do  
  > There are three usage tiers: Start, Build, and Scale.
- https://support.claude.com/en/articles/8243635-our-approach-to-rate-limits-for-the-claude-api  
  > New organizations and organizations with limited usage history may start in the Evaluation tier

### Pages that look out of date (1)

**A temporary notice about response times has no date**

The page opens with a notice that response times are longer because of a "recent launch". It names no launch and no date, so a reader cannot tell whether it still applies.

- https://support.claude.com/en/articles/8241253-safeguards-warnings-and-appeals  
  > Our response times are currently longer than normal due to our recent launch

### Passages that can be read two ways (3)

**"What interfaces can I use" reads as complete but the home page lists more products**

The interfaces page introduces a list of five ways to access Claude. The home page lists Claude Code (in the terminal) as its own collection. A reader could take the shorter list as every way in.

- https://support.claude.com/en/articles/8114487-what-interfaces-can-i-use-to-access-claude  
  > You access Claude via:
- https://support.claude.com/en  
  > Use Claude in your terminal to write, review, and ship code.

**The documentation is called two different things**

One page sends readers to "Claude Docs" at docs.claude.com. Another sends them to "Claude Platform Docs" for the same kind of reference. A reader cannot tell whether these are one site or two.

- https://support.claude.com/en/articles/8114490-where-can-i-find-your-api-documentation  
  > You can access our API documentation by visiting our Claude Docs
- https://support.claude.com/en/articles/8243635-our-approach-to-rate-limits-for-the-claude-api  
  > see Rate limits in Claude Platform Docs

**A tax registration is described as coming "at the earliest" in a year that is now under way**

The page, dated March 16, 2026, says registration for Japanese Consumption Tax will happen once a threshold is exceeded, "at the earliest as of FY2026". It does not say whether that has happened.

- https://support.claude.com/en/articles/7996921-i-use-claude-in-amazon-bedrock-who-do-i-contact-for-customer-support-inquiries  
  > at the earliest as of FY2026

## Checked against your rules

Literal matches over 30 pages. A hit means the text is there as written; whether it is a problem is yours to decide.

**"Claude Instant"** (retired model name; use a current model name): not found.

**"Acceptable Use Policy"** (renamed; use Usage Policy): found on 1 page.

- https://support.claude.com/en/articles/8241253-safeguards-warnings-and-appeals (1x)  
  > ...ated Articles API Safeguards Tools Updates to our Acceptable Use Policy (now “Usage Policy”), Consumer Terms of Service,...

**Required:** "This is general information, not legal advice." (every legal-topic page carries the disclaimer): no page read matches re:/(privacy|legal|terms), so nothing was checked.

## Checked by code

**Broken links (0).** 92 more internal links were not checked.


**Thin pages (0)**, fewer than 80 words of text.


**Near-duplicate pages (0 pairs)**, mostly the same text.


**Pages that say they were last updated over two years ago (0).**


## How to read this

- Every quote above was checked to appear on the page or source document named. A finding whose quote did not was dropped, never shown.
- Age is a hint, not a finding: a page can be old and right.
