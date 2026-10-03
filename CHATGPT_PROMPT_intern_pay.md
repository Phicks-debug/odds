# Prompt for ChatGPT: precise internship allowances in the Netherlands

Paste everything under the line into ChatGPT. The SQL for the staging table is at the bottom: run it once in the Supabase SQL Editor before you start.

---

You are helping me build "odds", a job finder for international students in the Netherlands. I need precise, sourced internship compensation data. In the Netherlands an internship pays an allowance (stagevergoeding), not a salary, and it is usually a few hundred euros a month. I will only use precise data.

## Hard rules
1. Never invent, estimate, average or fill in a number. If you cannot find an amount, write null and say why.
2. Every row needs a source URL, the date you read it, and a verbatim quote of 25 words or fewer that contains the amount. No quote, no row.
3. Keep amounts as written: per month, gross or net as stated, with the hours per week and the education level (HBO or WO) if the source says so. Do not convert or normalise anything.
4. If two sources for the same employer disagree, keep both rows and flag the conflict.
5. Do not change, delete or overwrite anything in my database except inserting rows into `intern_pay_observations`.

## Step 1: find the gaps (database, read only)
You are connected to my Supabase database. The table `postings` has these columns: id, employer, employer_display, title, body, url, region, level. An internship posting is one whose title matches the words intern, internship, stage, stagiair or meewerkstage as a whole word ("Internal Auditor" does not count).
- List the employers that have internship postings, with how many each.
- Many postings already state an amount in the body text ("allowance of €600 per month"). For each employer, say whether any of its internship postings names an amount. I already have those; I need the employers whose postings name none.
- Work through those employers from the one with the most internship postings down.

## Step 2: find the published allowance, in this order
1. The employer's own careers site: internship page, FAQ, "what we offer" page, benefits page.
2. Other vacancy pages for the same employer that name an amount (the employer's applicant system, Magnet.me, werkenbij, Nationale Vacaturebank, Indeed, Werkzoeken).
3. Official and collective sources: CAO or collective agreements that set a stagevergoeding, government (Rijk) rules, Nuffic, CBS and parliamentary letters.
4. Only if you find nothing above, and only after I confirm in chat: Glassdoor intern pay pages, through my own signed-in browser session. If I confirm, read only the figures visible on at most 10 pages, at human pace, by hand. Do not page through results, do not automate clicks, do not try to get around a login wall, captcha or warning: stop and tell me. Record these rows with source_type = "self-reported" and the number of reports if shown. Never copy page text beyond the short quote. These rows are for checking the other data, never for showing to users.

If a page is private or blocked to you, say so and move on. Do not use a workaround.

## Step 3: write the results
Insert one row per finding into `intern_pay_observations` (columns below). If you cannot insert, return the same rows as a CSV in one code block.

employer_key (copy `postings.employer` exactly), employer_name, scope (all interns, HBO, WO, master, relocation, other), min_eur_month, max_eur_month, gross_or_net (gross, net, not stated), hours_per_week (number or null), source_type (employer site, vacancy page, official, job board, self-reported), source_url, source_date (the day you read it, YYYY-MM-DD), quote, confidence (high: the employer states it itself; medium: a third-party page quotes it; low: self-reported), notes

## Finish with
- How many employers you covered, and which ones you could not find an amount for.
- Every conflict between sources.
- Anything that looks wrong or unusual in what I asked for.

---

## SQL to run once (Supabase SQL Editor)

```sql
create table if not exists public.intern_pay_observations (
  id bigint generated always as identity primary key,
  employer_key text not null,
  employer_name text not null,
  scope text,
  min_eur_month integer,
  max_eur_month integer,
  gross_or_net text check (gross_or_net in ('gross', 'net', 'not stated')),
  hours_per_week numeric,
  source_type text not null check (source_type in ('employer site', 'vacancy page', 'official', 'job board', 'self-reported')),
  source_url text not null,
  source_date date not null,
  quote text not null,
  confidence text check (confidence in ('high', 'medium', 'low')),
  notes text,
  created_at timestamptz not null default now(),
  constraint quote_short check (char_length(quote) <= 220),
  constraint range_sane check (min_eur_month is null or (min_eur_month between 100 and 3000)),
  constraint range_order check (min_eur_month is null or max_eur_month is null or min_eur_month <= max_eur_month)
);

-- Private: the app never reads this directly. Only the service role (which bypasses RLS) can read or write it.
alter table public.intern_pay_observations enable row level security;
```
