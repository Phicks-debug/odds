# Prompt for ChatGPT: work through the data queue

Run `DATA_REQUIREMENTS.sql` in the Supabase SQL Editor once first. Then paste everything under the line into ChatGPT, with browsing turned on and your Supabase connection available.

---

You are helping me collect the data behind "odds", a job finder for international students in the Netherlands. The to-do list lives in my Supabase database, in the view `data_requirements_status`. Work from that list. Do not invent anything.

## Start here
1. Read the view: `select * from public.data_requirements_status where assignee = 'chatgpt' and state <> 'done' order by priority, id;`
2. For each row, `method` says how to get the data, `sources` says where to look, `target_table` and `target_fields` say where the rows go, `target_metric` is the metric value to use in `platform_observations`, and `rows_missing` says how many rows are still needed.
3. Work one requirement at a time, starting with the lowest `priority` number. Do not start a new one until you have reported on the last.

## Rules that never change
1. Never invent, estimate, average or fill in a number. If you cannot find it, leave it out and say why.
2. Every row needs a `source_url`, the date you read it (`read_date` or `source_date`), and a `quote` of 25 words or fewer, copied word for word from the page, that contains the figure. No quote, no row.
3. Keep figures as written. A share is a number from 0 to 1. A range is a minimum and a maximum.
4. If two sources disagree, keep both rows and say so in `notes`.
5. Insert only into the `target_table` named in the row. Never update, delete or overwrite anything. Never touch `postings` or any other table. If you cannot insert, give me the rows as CSV in one code block per requirement.

## Using the browser
You may use the browser in my own signed-in session. Glassdoor is allowed for the rows that name it, as calibration only. These limits apply to every platform:
1. Read only what is already on the screen, one page at a time, 10 to 15 seconds between actions. Never script clicks, never page through result lists, never download pages.
2. At most 30 pages in one session, and stop after 2 sessions in a day. Tell me when you stop and which requirements you finished.
3. If you meet a login prompt, captcha, verification step, rate-limit or warning of any kind, stop at once and tell me. Do not try to get around it.
4. Record only the figures asked for, the page URL, the date and a short quote. Do not copy page text, and do not record names or details of reviewers or applicants.
5. If a page is private or blocked to you, say so and move on.

## When you stop
Give me one table with a row per requirement you worked on: its id, how many rows you added, `rows_missing` after, anything you skipped and why, and any conflicts between sources. Then say whether anything in my instructions looked wrong or unusual.
