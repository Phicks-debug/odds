-- 10 LinkedIn jobs the actor reported closed (job_status closed), 2026-10-03.
update public.postings set closed_at = now(), last_checked = now() where id in ('p0fa06dd89628', 'p48ef6fad656b', 'p4f85de618a71', 'p7776a2726daf', 'p8fa723cda26e', 'p9e9afc1aba76', 'pa6a1338682df', 'pd649e07aee34', 'pdd142b85508a', 'pfa2c2eb008f9') and closed_at is null;
