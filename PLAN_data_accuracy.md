# Plan: accurate interview chance, and a CV match we can trust

Decided with the owner: Glassdoor is allowed as a calibration source (never shown, never named in the product), the owner can supply students and recruiters for rating, and we request the Dutch field-experiment data. The browser records from platforms the owner is signed in to.

Rules that hold throughout: every number has a source, a date and a quote. No row without them. Ranges, never invented points. Nothing from Glassdoor appears in the product, only in checks against our own numbers.

## Workstream 1. Per-job competition (week 1, no new data needed)
- **Goal:** make the interview chance differ between jobs for a real reason.
- **Do:** for every posting with an applicant count (LinkedIn scrape: `applicants`, `applicants_text`), set the base rate as expected interviews per vacancy divided by applicants. Assumptions written in the code: 3.25 interviews per offer (SmartRecruiters 2025), one hire per posting (flag it).
- **Also:** record when the count was taken and the posting's age, since counts grow with age.
- **Done when:** two jobs with 40 and 400 applicants show clearly different base rates, and the "?" explains why.

## Workstream 2. Requirement tiers and skill dictionary (weeks 1–2)
- Fill `postings.requirements` with Jev (spec: `JEV_REQUIREMENTS_SPEC.md`).
- Expand the skill dictionary with ESCO labels, aliases and Dutch terms, and use ESCO essential/optional skills per occupation as a hint for vague postings.
- Make years, degree and language gates tier-aware in the data, not only on the job page.

## Workstream 3. Validation set (weeks 1–3, owner supplies people)
- **Tier labels:** hand-label 100 postings (every requirement line gets a tier). Two people label 30 of them, so we can measure agreement.
- **Fit ratings:** 30 CV–job pairs, each rated by 3 recruiters or students: "would you interview this person?" (yes / maybe / no).
- **Gate:** ship Jev tiers only if at least 90% of lines are tiered correctly. Show the fit only if its ranking correlates with the ratings (Spearman 0.5 or better). Otherwise change the weights, not the claim.

## Workstream 4. Research data for the anchors (request now, arrives in weeks)
- **Dutch field experiments:** ask the authors or the data archive for the application-level data behind Thijssen, Coenders & Lancee (GEMM) for callback by occupation, region and vacancy. This replaces the single 18–54% anchor with occupation-specific ones. (Whether it is public, I have not verified; the request tells us.)
- **Already open:** Kline, Rose & Walters 2022 (Harvard Dataverse, doi:10.7910/DVN/HLO4XC) for how contact rates vary with firm and job features.
- **Market tightness:** CBS vacancies (already pulled), UWV Spanningsindicator (owner downloads the CSV), ROA labour-market indicator, Indeed Hiring Lab NL.
- **Effect sizes by CV signal:** one table of ranges from the correspondence-study reviews (experience, language, internships, over-qualification), each with country, N and year.

## Workstream 5. Browser recording from platforms (weeks 2–3)
Use Claude in Chrome in the owner's own signed-in session. A person is present for the first sessions.

**What to record, per target employer (start with the 40 with the most internship and graduate postings):**
- Glassdoor: interview rating, share of positive experiences, number of interview reports, and the stated process steps. Intern pay lines.
- Job boards that show applicant counts (LinkedIn, and any Dutch board that does): applicants per posting.
- Employer careers pages: published intake ("applications received" against "places").

**Protocol (to respect the platforms' terms):**
1. Read only what is already on screen, one page at a time, at human pace (10 to 15 seconds between actions). No scrolling loops, no paging through results, no scripts.
2. At most 30 pages per session and 2 sessions a day.
3. Stop and tell the owner at any login prompt, captcha, verification or warning. Do not get around it.
4. Record only: platform, page URL, date read, metric name, value, number of reports, and a quote of up to 25 words. No page copies, no personal data of reviewers.
5. Rows go into a private table (`platform_observations`) that the app never reads. Glassdoor rows are `self-reported`, confidence low, check-only.

## Workstream 6. Outcome log (build in weeks 3–4, grows forever)
- Capture applied → interview → offer or rejected or no reply, with dates and the fit and chance the person saw at the time.
- Consent on first use, stored only aggregated, shown as a group result only from 10 people up (privacy), and "measured" replaces "estimate" for a group at about 30 results.
- Report Brier score against UWV's 0.191.

## Order and checkpoints
| When | What | Checkpoint |
| --- | --- | --- |
| Week 1 | Workstream 1 built. Start the data requests. Jev spec handed over. | Chance differs by job, with reasons |
| Week 2 | Jev tiers filled. Tier labels done. First browser sessions. | 90% tier accuracy |
| Week 3 | Fit ratings collected. Platform table reviewed. | Fit tracks the ratings |
| Week 4 | Anchors updated from the field-experiment data if it arrived. Outcome log live. | Page says what is measured and what is estimated |

## What I need from the owner
- Sign in to Glassdoor in Chrome for the recording sessions, and be there for the first one.
- Names of 10 to 15 students and 3 recruiters for the ratings.
- Approval to send the data request, and the UWV CSV.
- Jev run on the postings once the column exists.
