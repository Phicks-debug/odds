#!/usr/bin/env bash
# One command that switches the LinkedIn import on:
#   bash /Users/ad/careerapp2/setup-linkedin.sh
# It installs the Supabase tool if needed, logs you in (a browser tab opens once), deploys the function,
# asks for your Apify token (typed hidden, never saved to a file) and checks that the function answers.
# Run SETUP.sql in the Supabase SQL Editor first: that creates the table the function counts imports in.
set -euo pipefail
REF="ukpmpyfcnbhngkgbnkxi"
cd "$(dirname "$0")"

if ! command -v supabase >/dev/null 2>&1; then
  echo "Installing the Supabase tool..."
  brew install supabase/tap/supabase
fi

if ! supabase projects list >/dev/null 2>&1; then
  echo "Logging in to Supabase (a browser tab opens)..."
  supabase login
fi

echo "Deploying import-linkedin..."
if ! supabase functions deploy import-linkedin --project-ref "$REF" --use-api; then
  echo "Retrying without --use-api..."
  supabase functions deploy import-linkedin --project-ref "$REF"
fi

if [ -z "${APIFY_TOKEN:-}" ]; then
  printf "Paste your Apify token (typing is hidden): "
  read -rs APIFY_TOKEN
  echo
fi
supabase secrets set "APIFY_TOKEN=$APIFY_TOKEN" --project-ref "$REF"

echo "Checking that the function answers..."
set -a; . ./.env.local; set +a
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d '{"url":"https://www.linkedin.com/in/test-user"}' "$VITE_SUPABASE_URL/functions/v1/import-linkedin")
if [ "$code" = "401" ]; then
  echo "OK: the function is live (it asks you to sign in, as it should)."
else
  echo "Unexpected answer $code. Paste this line back to me."
fi
