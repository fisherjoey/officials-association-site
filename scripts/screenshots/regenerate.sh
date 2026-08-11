#!/usr/bin/env bash
#
# Rebuild every screenshot in docs/screenshots/ from scratch.
#
# The images in the README are captured from a real running stack: a local
# Supabase started by the CLI, the 13 migrations applied to an empty database,
# fictional demo rows seeded through service_role, and the production static
# export served by Netlify Dev so the Netlify Functions answer /api the way they
# do in a deploy.
#
# That means a rebrand — new colours in lib/siteConfig.ts, a new logo — is
# re-shot by running this, not by hand.
#
# Needs: Docker, the Supabase CLI (a devDependency), and Playwright's Chromium.
# Playwright is deliberately NOT a dependency of this project; installing it
# would pull a browser download into every adopter's `npm install` for a script
# almost none of them will run. Get it once with:
#
#     npm install --no-save playwright && npx playwright install chromium
#
# Then, from the repo root:
#
#     ./scripts/screenshots/regenerate.sh
#
set -euo pipefail

cd "$(dirname "$0")/../.."

PORT="${PORT:-9000}"

# Netlify Dev still runs netlify.toml's [dev] command alongside the static
# server, and `next dev` reads PORT out of the environment as well. Run this as
# `PORT=9317 ./regenerate.sh` with PORT still exported and Next tries to bind the
# port Netlify Dev is already serving on, which kills the run with EADDRINUSE.
# Keep the value for our own use, take it away from the children: with no PORT
# set, `next dev` picks the first free port on its own.
export -n PORT 2>/dev/null || true

# --- the fictional association the screenshots show ---------------------------
# Everything here is invented. example.org is reserved by RFC 2606, so no
# unconfigured link or address in a committed image can reach anyone real.
export NEXT_PUBLIC_ORG_NAME="Riverbend Officials Association"
export NEXT_PUBLIC_ORG_SHORT_NAME="ROA"
export NEXT_PUBLIC_ORG_TAGLINE="Trained, certified officials for every level of the game"
export NEXT_PUBLIC_ORG_LOCATION="Riverbend, Example Region"
export NEXT_PUBLIC_ORG_CITY="Riverbend"
export NEXT_PUBLIC_ORG_REGION="Example Region"
export NEXT_PUBLIC_ORG_SPORT="basketball"
export NEXT_PUBLIC_ORG_FOUNDED_YEAR="1994"
export NEXT_PUBLIC_ORG_MEMBER_COUNT="240"
export NEXT_PUBLIC_EMAIL_DOMAIN="example.org"
export NEXT_PUBLIC_NEWSLETTER_NAME="The Whistle"
export NEXT_PUBLIC_SITE_URL="http://127.0.0.1:${PORT}"

# Set so the portal's configured-services tiles render — they are hidden when
# the matching value is empty, which is what the flag-gated screenshot shows.
export NEXT_PUBLIC_LINK_ASSIGNING="https://example.org/assigning"
export NEXT_PUBLIC_LINK_FILM_STUDY="https://example.org/film"
export NEXT_PUBLIC_LINK_COMMUNITY="https://example.org/community"
export NEXT_PUBLIC_LINK_RESOURCE_CENTRE="https://example.org/resources"

# --- local Supabase -----------------------------------------------------------
echo "==> starting Supabase"
npx supabase start >/dev/null

echo "==> applying migrations to an empty database"
npx supabase db reset

status=$(npx supabase status -o json)
export NEXT_PUBLIC_SUPABASE_URL=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).API_URL)" "$status")
export NEXT_PUBLIC_SUPABASE_ANON_KEY=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).ANON_KEY)" "$status")
export SUPABASE_SERVICE_ROLE_KEY=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).SERVICE_ROLE_KEY)" "$status")

echo "==> seeding fictional demo data"
node scripts/screenshots/seed.mjs

# --- production static export -------------------------------------------------
# Not `npm run dev`: NODE_ENV=development forces the mock-data fallback in
# lib/api/client.ts, so a dev-server screenshot would show fixtures rather than
# the database. The export is what a deploy actually serves.
echo "==> building the static export"
npm run build

# Netlify Dev refuses to start when the port is taken, and the readiness probe
# below cannot tell "my server answered" from "somebody else's server answered".
# Get that wrong and the run captures eleven copies of a stranger's 404 page and
# still exits 0.
if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -qE "[:.]${PORT}[[:space:]]"; then
  echo "Port ${PORT} is already in use, so Netlify Dev cannot bind it and every" >&2
  echo "capture would record whatever else is answering there. Free the port, or" >&2
  echo "re-run as PORT=<a free port> $0" >&2
  exit 1
fi

log=$(mktemp -t oas-screenshots-netlify.XXXXXXXX)
echo "==> serving out/ plus the Netlify Functions on :${PORT}  (log: ${log})"
npx netlify dev --dir out --port "$PORT" --offline >"$log" 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true; rm -f "$log"' EXIT

ready=
for _ in $(seq 1 60); do
  if ! kill -0 "$server" 2>/dev/null; then
    echo "Netlify Dev exited before it served anything. Its last output:" >&2
    tail -20 "$log" >&2
    exit 1
  fi
  if curl -sf "http://127.0.0.1:${PORT}/" >/dev/null; then ready=1; break; fi
  sleep 2
done
if [ -z "$ready" ]; then
  echo "Netlify Dev never answered on :${PORT} within two minutes. Its last output:" >&2
  tail -20 "$log" >&2
  exit 1
fi

echo "==> capturing"
BASE_URL="http://127.0.0.1:${PORT}" node scripts/screenshots/capture.mjs

echo
echo "Done. Look at every image in docs/screenshots/ before committing it —"
echo "the secret scan reads text, not pixels."
echo "Run 'npx supabase stop' when you are finished with the local stack."
