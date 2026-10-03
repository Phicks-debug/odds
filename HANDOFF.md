> **Newer: read `START_HERE.md` first (state on 2 Oct 2026: access, data flow, open work). The text below is the older product and design hand-off; its numbers (for example 2,568 postings) are out of date.**

# HANDOFF: odd (Netherlands job finder for international graduates)

You are taking over a working React app. Read this whole file first, then `README.md` and `/Users/ad/.claude/projects/-Users-ad/memory/career-simulator-prototype.md` if you can read it. The owner is blunt and fast. They want things to look and feel professional, consistent and simple, and they react to screenshots. Do not ask what to do when a sensible default exists: pick it, say so in one line, move on.

## 1. What the product is
A job finder for international graduates in the Netherlands. Real postings (about 2,568 loaded), pay (CBS typical or employer-stated), what you keep after tax (2026 rates, 30% ruling), IND work-permit salary thresholds and recognised-sponsor flag, an interview-chance RANGE built from published studies, job odds, what-ifs/recommendations, application tracking, people/referrals, career path.

**Hard rule (the owner cares a lot):** every number traces to a source. Ranges, never point estimates. No invented statistics. If there is no data, say "No figure" / "Not stated", do not guess. Explanations live behind a small "?" popover, not as paragraphs on the page. Avoid jargon and "AI-sounding" prose ("gate", "charge it", "empty", "not a guarantee" on the page itself).

## 2. Where everything lives
- App: `/Users/ad/careerapp2` (React 19, Vite 8, Tailwind v4 with oklch tokens in `src/index.css`, strict TypeScript with noUnused*, bun test, base-ui Select/Popover, Phosphor icons via the shim `src/components/icons.tsx`, Geist font; Fraunces only on landing/long-read pages).
- Data + docs + backend SQL/loader: `/Users/ad/career-simulator-data/` (`backend/schema.sql`, `backend/load.py`, `ux/` PRD etc.).
- Supabase project id `ukpmpyfcnbhngkgbnkxi`. Client uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `/Users/ad/careerapp2/.env.local`. RLS is on: `profiles` and `applications` are owner-only. The owner once pasted a SERVICE-ROLE key in chat: it must be rotated; never write it to any file. The service role cannot run DDL, so schema changes must be given to the owner as SQL to run.
- Profile JSON (`profiles.data`) holds name, avatar, custom columns/types, notes, people, views (per-view hidden/sort/names), templates. On-device localStorage keys start with `careersim.*`.
- Dev server: launch entries are in `/Users/ad/.claude/launch.json` ("careerapp" port 5175, "careerapp-fork" port 5176, same folder). Or `cd /Users/ad/careerapp2 && npx vite --port 5176 --host 127.0.0.1`.
- Not a git repo. There is no undo: edit carefully and keep changes small. Another Claude session may be editing the same folder at the same time (see section 8).

## 3. Checks to run after every change (all currently pass)
```
cd /Users/ad/careerapp2
npx tsc --noEmit -p tsconfig.app.json
bun test src            # 26 tests
bun run build
```
Headless Playwright was used for visual checks (playwright-core in node_modules, scripts were in a previous session's scratchpad, e.g. `audit.mjs` checking phone 390, iPad 820, desktop 1280 for horizontal overflow and console errors). Recreate a similar audit if you need it. Seed a signed-in view by setting `localStorage` keys `careersim.profile` (onboarded: true) and `careersim.saved` (array of posting ids such as `p1279`).

## 4. Design system (current)
- Name: **odd** (was "Career Simulator Netherlands", then "zob"). Logo `src/logo.svg`: dark circle, white ring "o", orange dot. **Check the name**, see section 8.
- Palette: white/warm-tinted background, warm near-black ink `oklch(0.18 0.004 60)` for text/primary/dark band, ONE orange accent `--brand oklch(0.7 0.18 52)` (`--brand-ink` for orange text), soft orange tint for `accent`, pastel green/yellow/red only for meaning (good/warn/bad). Radius 0.5rem. Geist everywhere.
- Orange means "you / saved / new / focus". Green text is used for "Posted today" and "Clear". Do not add blue/purple. Keep it restrained; the owner said "don't make it too much" and hated anything that looks like a pop-up ad.
- Logos float (no coloured tiles). Company logos resolve through `lib/companies.ts` (`logoFor`, link-favicon fallback, monogram).
- Toasts: `<Toaster position="top-center" closeButton />`, close X forced top-right in CSS.
- Mobile first: the owner checks phone and iPad. No horizontal scrolling for primary UI.

## 5. What the app does now (by area)
**Landing** (`components/Landing.tsx`): headline, floating logo strip, black band "Jobs right now" with search, filters, sort and the public job list. Personal parts are locked behind the questionnaire.

**Job list rows** (`components/JobBoard.tsx` `JobRow`): ONLY logo, title, company, location, posted time (green: Today / Yesterday / N days ago) and a bookmark. The data only has dates (Workday says "4 Days Ago", LinkedIn a date), so "19 hours ago" is impossible without real timestamps; the owner asked for hours, this was explained. Same simple row is used on the dashboard list; board cards are the same plus a move-to-step select.

**Search + filters** (`components/JobFilters.tsx`, `lib/filters.ts`, `lib/job-facts.ts`, `lib/jobs.ts` `fetchSignals`): search box plus two always-visible filters (Date posted, Job type) and an "Add filter" menu for Level, Workplace, Pay, Location, Industry, Language, IND sponsors. Added filters become chips with an X. Sort sits at the end of the row. Job type/workplace come from text signals fetched server-side with PostgREST `ilike` queries (hybrid, remote, part-time, full-time, contract wording), not stored columns.

**Sort menu** (`components/ViewSettings.tsx`): one list of properties; first press sorts the usual way, second press reverses; active row shows "A to Z" / "High to low" / etc. NO "ascending/descending" wording (the owner rejected it). Landing uses `SortSelect.tsx`.

**Dashboard** ("Your job search", `components/Account.tsx`): SearchSummary (Saved/Applied/Interviews/Offers counts, Interview odds bar, Job odds bar; Job odds = interview odds x 0.81/3.25 from SmartRecruiters 2025), a View menu (List / Board / People), Sort, "Add your own jobs" (CSV/paste import in `Tracker.tsx`, `lib/import.ts`; extra CSV columns become the user's own properties), list/board of saved jobs.

**Job drawer** (`components/JobDrawer` inside `JobBoard.tsx`, content `JobDetail.tsx`), in this order:
1. Header card: logo, title, company, place, posted, pay line, Status picker (Not saved/Saved/Applied/Interview/Offer/Closed).
2. **Properties** (`components/JobProperties.tsx`): Interview chance, Pay a month, Level, Industry, Language, Sponsor, Contact, plus the user's own properties. Level/Industry/Language/Sponsor are inline dropdowns with fixed vocabularies that the user can override (stored in profile notes as `@level` etc.; Reset link). An "Edit" dropdown lists every property: eye to hide/show (hidden ones stay in place, dimmed, value "Hidden"), type to rename, X to delete own properties, and "Add property" at the bottom. Contact lists all people linked to the job (several allowed per job) with "Add / Add another". There is deliberately no "Fit: strong/partial" label: Interview chance is the single measure of fit (0% when a hard requirement is unmet).
3. Interview chance + "You keep" strip with "?" explanations.
4. **Recommendations** right under it: checkbox + resulting chance like "-> 2-7%" + "?" (referral, tailor CV, learn Dutch, add a year, finish a master's, skill gaps). Ticking moves the numbers at the top.
5. "Does it fit your CV?": only blocking requirements as short red lines, then Tools and Skills as separate groups of tags against the CV, then the posting's own requirement lines. Extraction: `lib/skills.ts` (RULES with kind tool|skill), `lib/requirements.ts` (requirement-section detection EN/NL).
6. Chance sources, Your odds meter, then **Pay and career path** (`JobPersonal.tsx`): pay range, You keep, After health insurance, "Permit salary minimum EUR 3.122 [Clear/Short]", 30% ruling checkbox, then **Career path**: "After working [N] years", a vertical staircase (Director at top, Entry at bottom, indented per step) built by `lib/ladder.ts` from the loaded postings (median years_min per level, median stated pay per level where >= 8, open count), this job's step dark, the N-years step ringed in orange. Below it: same job after N years (CBS pay grown at the occupation's own 2019-24 growth, no promotion), what you keep, and for 5 job types the real next moves from JobHop (Flemish) data. A terse "Sources" list replaced the paragraph of prose.
7. About the job, More at employer.

**People / referrals** (`components/People.tsx`, `lib/templates.ts`): company-first add, Messages per person with templates (Waalaxy-style) and saved messages, People view grouped by company then position. Multiple people per job are supported; a person with relationship "Referral" counts in the interview chance.

**Engine** (`lib/engine.ts`): tax, bands, gates (permit pay, minimum years, degree, Dutch), `standing()`, `levelOf`, FACTORS (base rates and multipliers with sources), interview odds combine as 1 - product(1 - p_i). `lib/spec.ts` payOf/payMid, `lib/format.ts`, `lib/properties.ts`, `lib/views.ts` (per-view config incl. `names`), `lib/sort.ts`.

## 6. Decisions the owner already made (do not relitigate)
Keep sign-in. Supabase DB stays. Board/list show only logo/title/company/place/posted; all other properties live inside the job. Custom/uploaded columns are standardised into the same property format. No "Log application" button (Status picker instead). No "is this job still open" block. Notifications need a close X in the corner. Tags and standard facts follow one pattern. Career path must exist for every job.

## 7. Open items / ideas not done
- Real "hours ago" posted time needs timestamps from the source; currently impossible.
- Rotate the exposed Supabase service-role key (owner action).
- Pending user-side data: UWV CSV, Apify company/Glassdoor profiles, LinkedIn profile import, deployment/domain.
- The owner wanted reference to real trackers / LinkedIn mobile for phone layout; never viewed (browser tools were blocked by a LinkedIn popup, Chrome extension never connected).
- Colour idea offered for the career path page but not applied: ink black for this job's step and headings, orange only for "you" (Year N tag, ring, pay bars), warm paper background, soft sand for empty bars, muted green only for good news.
- Board/table "Reset this view" logic, summary card height on dashboard, a fuller visual pass with many saved jobs, README/memory refresh.

## 8. Watch-outs
- **Name confusion:** I set the name to "odd". Later the header wordmark in `src/App.tsx` read "odds" with a tagline, and `src/components/Research.tsx` plus `src/content/research/` appeared, not made by me (another session or the owner). Ask/confirm which name is final and make logo, wordmark, page title, `index.html`, README and static pages agree.
- Two Claude sessions share this folder and edit concurrently. Re-read a file right before editing it and keep edits small.
- BSD sed on macOS fails on many patterns; use python3 for multi-line edits.
- Circular import risk: `People` <-> `JobPersonal` was fixed by extracting `Section.tsx`; keep shared bits in small leaf files.
- Never put secrets in files, chat or code. Test credentials only for local dev hosts.

## 9. FILE MAP (absolute paths)

### Project root `/Users/ad/careerapp2/`
- `HANDOFF.md` (this file), `README.md`, `package.json`, `.env.local` (Supabase URL + anon key, do not print), `.env.example`, `index.html`, `components.json`, `tsconfig.app.json`, `vite.config.ts`, `.oxlintrc.json`, `.prettierrc`, `dist/` (build output).
- `public/logos/*` company logo images. `scripts/make_logos.py` (builds logos, MAX_SIDE 256), `scripts/make_industries.py` (builds `src/lib/industries.json` from LinkedIn industry field).
- `scripts/qa/*.mjs` headless Playwright checks (copied from the old session; they use `http://localhost:5175` by default, change the port to 5176 if you use the fork server): `audit.mjs` (phone/iPad/desktop overflow + console errors), `flow6.mjs` (dashboard, job drawer, properties, career path screenshots), `career2.mjs` (career path on 3 jobs incl. phone), `filt.mjs` (phone filter row), `props2.mjs` (Edit-properties menu), `sortshot.mjs` (sort menu). Screenshots are written to a `shots/` folder relative to where you run them: create it first.

### `src/` entry and shell
- `src/main.tsx`, `src/App.tsx` (header, `Wordmark`, routing between landing / journey / account / job / static pages, Toaster), `src/index.css` (all design tokens), `src/logo.svg`.

### `src/components/` (UI)
- Landing and lists: `Landing.tsx` (front page + dark "Jobs right now" band), `JobBoard.tsx` (`JobBoard`, `JobRow`, `JobDrawer`), `JobGallery.tsx` (signed-in "Jobs that fit you" list), `JobFilters.tsx` (search, two filters, Add filter), `SortSelect.tsx` (landing/gallery sort), `Skeleton.tsx`, `CompanyMark.tsx` (logos), `Tag.tsx` (`ageText`, `factsOf`, `KeyFacts`).
- Job page: `JobDetail.tsx` (assembles the drawer content), `JobProperties.tsx` (Properties box, `PropertyField`), `JobPersonal.tsx` (UspStrip, FitCard, Recommendations, ChanceSources, PayCard, CareerPath, LockedPersonal), `FitCells.tsx` (`useFit`, `ChanceCell`), `StatusPicker.tsx`, `InterviewMeter.tsx` (SearchSummary, odds bars), `Section.tsx`, `Hint.tsx` ("?" popover via portal), `bits.tsx` (Pill, Source), `CompanyInsights.tsx`.
- Dashboard: `Account.tsx` (dashboard shell, ViewMenu List/Board/People), `Tracker.tsx` (saved-jobs list + `AddJobs` CSV/paste import), `PipelineBoard.tsx` (board + `moveJob`, `stepOf`, `STEPS`), `ViewSettings.tsx` (Sort popover, `directionLabels`, `choicesFor`), `People.tsx` (people view, AddPerson, messages, templates), `ProfilePage.tsx`, `NewPlacesBell.tsx`.
- Onboarding/other: `SeekerJourney.tsx`, `SeekerQuestions.tsx`, `SignIn.tsx`, `StaticPages.tsx`, `Footer.tsx`, `HowItWorksVisual.tsx`, `BeeBlastMark.tsx`, `icons.tsx` (Phosphor shim), `ui/` (shadcn-style primitives: button, popover, select, etc.).
- Research pages (added by another session, not by me): `Research.tsx`, `ResearchArt.tsx`, content in `src/content/research/types.ts` and `src/content/research/reports/*.ts` (graduates-and-careers, gross-to-net-2026, interview-odds-base-rates, origin-and-callbacks, pay-bands-and-transparency, permits-and-sponsors, reading-postings-and-limits, what-improves-callbacks).

### `src/lib/` (logic and data)
- Data + state: `data.tsx` (React context: postings, saved, passed, applications, people, referrals, profile, signals, reference), `jobs.ts` (Supabase fetchers, `fetchReference`, `fetchSignals`, `SIGNAL_TERMS`), `supabase.ts`, `auth.ts`, `session.ts`, `sync.ts` (profile sync), `save.ts` (`toggleSave`), `types.ts` (Posting, Profile, Person, ViewConfig, PropertyType), `changes.ts`, `seen.ts`, `reveal.ts`, `draft.ts`.
- Engine: `engine.ts` (tax, bands, gates, `standing`, `levelOf`, `LEVELS`, FACTORS), `engine.test.ts`, `spec.ts` (`payOf`, `payMid`), `odds-kind.ts`, `ladder.ts` (career-path ladder), `journey.ts` (questionnaire options, `DUTCH_OPTIONS`).
- Posting understanding: `skills.ts`, `requirements.ts`, `job-facts.ts` (job types, workplace, city), `industries.ts` + `industries.json`, `format.ts` (`formatAge`, `formatPlace`, `formatPosted`, `stripMarkup`), `companies.ts` + `companies.test.ts` + `company-logos.json` + `company-logos-local.json`.
- Views and lists: `filters.ts` + `filters.test.ts`, `filter-bus.tsx`, `sort.ts`, `views.ts`, `properties.ts` (STANDARD_PROPERTIES / STANDARD_SORTS), `import.ts` + `csv.ts` (CSV import), `templates.ts` (message templates), `example.ts` (EXAMPLE_PROFILE), `pages.ts`.

### Data and docs outside the app
- `/Users/ad/career-simulator-data/` : `HANDOFF.md` and `MANIFEST.md` (older handoff, read them), `backend/schema.sql`, `backend/load.py`, `backend/migration_2026-09-30.sql`, `ux/` (PRD `.md`/`.docx`, DATA_SCHEMA.md, RATE_METHOD.md, QUESTIONS_WE_CAN_ANSWER.md, VALIDATION.md, DESIGN_PROMPT.md, PRIOR_ART.md, TRUST_RESEARCH.md), raw data folders `cbs/ ind/ jobhop/ postings/ tax/ uwv/ hiringlab/ employers/ international/ reddit/ skills/ benchmarks/`, older single-file prototype `app/`.
- Memory notes: `/Users/ad/.claude/projects/-Users-ad/memory/career-simulator-prototype.md` (+ `MEMORY.md` index in the same folder).
- Launch configs for dev servers: `/Users/ad/.claude/launch.json`.
- Full conversation history of the long build session (if you want the exact reasoning behind a decision): `/Users/ad/.claude/projects/-Users-ad/6d0895fe-4d41-48b9-8749-d2c94d775ad1.jsonl`; the forked session is `/Users/ad/.claude/projects/-Users-ad/a8532a12-2647-4f53-8f1b-b70b3d57f567.jsonl`. These are large; search them with grep rather than reading them whole.

## 10. Copy-paste starter prompt for the new agent
> Read `/Users/ad/careerapp2/HANDOFF.md` completely, then `/Users/ad/careerapp2/README.md` and `/Users/ad/career-simulator-data/HANDOFF.md`. You are continuing work on "odd", a Netherlands job finder for international graduates, in `/Users/ad/careerapp2`. Start the dev server (`cd /Users/ad/careerapp2 && npx vite --port 5176 --host 127.0.0.1`), run `npx tsc --noEmit -p tsconfig.app.json`, `bun test src` and `bun run build` to confirm a clean baseline, and summarise back in five lines what you understand before changing anything. Follow the rules in section 1 (no unsourced numbers) and section 6 (decisions already made). Confirm the final product name with me first (section 8).
