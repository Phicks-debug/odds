#!/bin/sh
# Deploys the profile reader (supabase/functions/read-profile). The token comes from the environment, never from a file here:
#   set -a; . ./.env.secrets; set +a; sh scripts/deploy-read-profile.sh
# The reader's key is an Edge Function secret (TYPESAFE_API_KEY), set once; the value is never stored in the repo.
set -e
cd "$(dirname "$0")/.."
: "${SUPABASE_ACCESS_TOKEN:?set SUPABASE_ACCESS_TOKEN}"
supabase functions deploy read-profile --project-ref ukpmpyfcnbhngkgbnkxi --use-api
