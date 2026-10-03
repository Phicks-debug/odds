#!/usr/bin/env bash
# One command that switches "Reach out from a job" on (finding people at a company):
#   bash /Users/ad/careerapp2/setup-people.sh
# It logs you in to Supabase if needed (a browser tab opens once) and deploys the suggest-referrals function.
# It uses the same APIFY_TOKEN secret that import-linkedin already has, so nothing else to paste.
# The function counts searches in the linkedin_imports table, so SETUP.sql must have been run once.
set -euo pipefail
REF="ukpmpyfcnbhngkgbnkxi"
cd "$(dirname "$0")"

if ! supabase projects list >/dev/null 2>&1; then
  echo "Logging in to Supabase (a browser tab opens)..."
  supabase login
fi

echo "Deploying suggest-referrals..."
if ! supabase functions deploy suggest-referrals --project-ref "$REF" --use-api; then
  echo "Retrying without --use-api..."
  supabase functions deploy suggest-referrals --project-ref "$REF"
fi

echo "Checking that it answers..."
URL="https://$REF.supabase.co/functions/v1/suggest-referrals"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL" -H "Content-Type: application/json" -d '{}')
if [ "$CODE" = "404" ]; then
  echo "Not found yet. Wait a minute and run this again."
  exit 1
fi
echo "Done. Open People, press 'Reach out from a job', pick a job."
