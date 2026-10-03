# odds

Jobs in the Netherlands with what they pay, what you keep after tax, whether they clear your permit threshold, and your chances. It is the Roomie app (React, Vite, Tailwind, the same look and the same flow) with housing swapped for jobs: real employer logos replace the room photos, job cards replace room cards, and the sign-up questions ask about permit, background, birth year, months abroad and Dutch.

## Run
```
bun install
cp .env.example .env.local   # VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (anon key only)
npx vite --port 5175
bun test src                 # tax engine, cumulative odds, level classifier, filters
bun run build
```

## Database
Supabase project `ukpmpyfcnbhngkgbnkxi`. Schema: `/Users/ad/career-simulator-data/backend/schema.sql`; loader: `backend/load.py` (reads SB_URL and SB_KEY from the environment; never commit the service-role key).
- Public read: `postings`, `ind_sponsors`, `cbs_bands`, `cbs_age_factors`, `tax_params`, `transitions`, `benchmarks`, `freshness_observations`.
- Owner only (row-level security on `auth.uid()`): `profiles`, `applications`.
- Service role only: `glassdoor_calibration` (never shown).

## Screens and where they came from
| Screen | File | Was |
| --- | --- | --- |
| Front page: headline, floating employer strip, dark (navy) band of cards, story | `Landing.tsx` | room photos, rooms, story |
| Filters: industry, level, language, recognised sponsors | `JobFilters.tsx` | place, rent, move-in, confirmed only |
| Job list (rows) with the open job beside it from 1024 px; matches and "close, if you want to stretch" | `JobBoard.tsx`, `JobGallery.tsx` | `RoomGallery.tsx` |
| One job: logo, pay, facts, posting, locked personal card | `JobDetail.tsx`, `JobPersonal.tsx` | `RoomDetail.tsx` |
| Floating employer logo | `CompanyMark.tsx` (`CompanyLogo`) | `RoomPhoto.tsx` |
| One question per screen | `SeekerJourney.tsx`, `SeekerQuestions.tsx`, `lib/journey.ts` | the room-search form |
| Account: kept jobs, applications, what we read from you | `Account.tsx` | the curated list |
| Sign in (email and password) | `SignIn.tsx` | phone number |
| Info pages | `StaticPages.tsx` | about, how it works, etc. |

The fit logic (tax with the ruling floor, pay bands, gates, rate derivation, levels) is `src/lib/engine.ts`; queries are `src/lib/jobs.ts`; the store is `src/lib/data.tsx`; logos are cut out of their background squares by `scripts/make_logos.py` (source picture URLs in `src/lib/company-logos.json`, results in `public/logos/` and `src/lib/company-logos-local.json`). Re-run it when the employer list changes: `python3 scripts/make_logos.py`.

## Known gaps
- Email confirmation is on in the Supabase project: a new sign-up must confirm by email before signing in. Answers are kept on the device meanwhile.
- No LinkedIn profile link import yet (needs a server step). Export files and CV paste work.
- Postings are a 29–30 Sep 2026 snapshot; no daily re-crawl yet.
- Only 54% of titles map to a CBS pay band.
