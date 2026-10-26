#!/usr/bin/env bash
# Starts providers (:4001), auditor (:4002) and web (:3000); logs in .logs/. Ctrl-C stops all.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .logs
ports=(4001 4002 3000)
if [[ "${WEATHER_DEMO:-}" == "1" ]]; then ports+=(4003 4004 4005 4006); fi
for port in "${ports[@]}"; do lsof -iTCP:$port -sTCP:LISTEN -t 2>/dev/null | xargs kill 2>/dev/null || true; done
trap 'kill 0' EXIT
(cd apps/providers && npx tsx src/server.ts > ../../.logs/providers.log 2>&1) &
(cd apps/auditor && npx tsx src/server.ts 2>&1 | tee ../../.logs/auditor.log) &
(cd apps/web && npx next dev -p 3000 > ../../.logs/web.log 2>&1) &
sleep 6
if [[ "${WEATHER_DEMO:-}" == "1" ]]; then
  echo "web http://localhost:3000 · providers :4001 · auditor :4002 · weather demos :4003–4006 (logs in .logs/)"
else
  echo "web http://localhost:3000 · providers :4001 · auditor :4002 (logs in .logs/)"
fi
wait
