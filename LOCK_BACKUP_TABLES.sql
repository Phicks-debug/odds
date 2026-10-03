-- Run this in the Supabase SQL Editor. The three backup tables below have row-level security OFF and the public (anon) key may
-- read, insert, update and delete in them (checked 2 Oct 2026). Anyone with the public key from the app could erase the backups.
-- This turns row-level security on with no policy, so only the service role and the dashboard can reach them, and takes the public
-- permissions away. The app does not read these tables.
alter table public.postings_body_backup enable row level security;
alter table public.postings_requirements_backup enable row level security;
alter table public.postings_years_backup enable row level security;
revoke all on public.postings_body_backup from anon, authenticated;
revoke all on public.postings_requirements_backup from anon, authenticated;
revoke all on public.postings_years_backup from anon, authenticated;
