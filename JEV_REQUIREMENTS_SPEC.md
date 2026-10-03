# Jev: read what each posting insists on

The app compares a CV with a job. For that to be fair, it has to know which lines of the posting are compulsory and which are only a plus. Today the app guesses this from headings and cue words ("Nice to have:", "is a plus", "preferred"). Jev can read it properly. When a posting has Jev's reading, the app uses it instead of the guess.

## 1. Add the column (run once in the Supabase SQL Editor)

```sql
alter table public.postings add column if not exists requirements jsonb;
comment on column public.postings.requirements is 'Jev reading: [{"text": verbatim line, "tier": must|strong|optional|nice, "kind": skill|tool|experience|education|language|other}]';
```

The anon key can already read `postings`, so nothing else changes.

## 2. What Jev writes per posting

An array, one item per requirement line in the posting, in the order they appear. Nothing invented: every `text` is copied from the posting.

```json
[
  { "text": "3+ years of experience with SQL", "tier": "must", "kind": "tool" },
  { "text": "Experience with Tableau is a plus", "tier": "optional", "kind": "tool" },
  { "text": "Dutch is a strong plus", "tier": "strong", "kind": "language" },
  { "text": "Familiarity with Snowflake", "tier": "nice", "kind": "tool" }
]
```

### The four tiers

| tier | meaning | the posting says things like |
| --- | --- | --- |
| `must` | compulsory: without it the application is likely screened out | "requirements", "you have", "must", "required", "minimum", "essential" |
| `strong` | a strong plus: it clearly helps | "strongly preferred", "highly desirable", "big plus", "significant advantage" |
| `optional` | preferred: it helps a little | "preferred", "a plus", "an advantage", "ideally", "beneficial" |
| `nice` | nice to have: mentioned, barely counts | "nice to have", "bonus", "familiarity with", "exposure to" |

Rules for Jev:
1. If the posting does not say how much it insists, use `must` for lines under a requirements heading and leave other lines out. Do not guess a softer tier.
2. A line with a cue word takes the tier of the cue, whatever heading it sits under.
3. Years, degree and language lines are included with their tier. "Dutch is a plus" must come out as `optional`, not `must`.
4. Skip responsibilities ("what you'll do"), benefits ("what we offer") and company description.
5. If you cannot find a requirements part at all, write `[]` (an empty array), not null, so the app knows the posting was read.

## 3. What the app does with it

- **Fit with the job:** each skill or tool in a line counts by tier: must 1.0, strong 0.7, preferred 0.4, nice to have 0.2, mentioned without a tier 0.6. These weights are our assumption and are written in `src/lib/fit.ts`.
- **Gates:** Dutch, years and degree are only gates when a compulsory line says so. A posting that says "Dutch is a plus" no longer shows 0%.
- **Job page:** "Does it fit your CV?" groups skills as Must have, Strong plus, Preferred, Nice to have, and each posting line carries its tier.

Until the column is filled, the app reads the tiers from the text itself (headings and cue words), and the page works the same way.

## 4. Check before trusting it

Take 20 postings, and for each compare Jev's tiers with your own reading of the text. Count the lines where the tier is wrong. If more than 2 in 20 are wrong, tighten the rules above before filling the whole table.
