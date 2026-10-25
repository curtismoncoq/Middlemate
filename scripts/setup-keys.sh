#!/usr/bin/env bash
# Generates and funds one testnet identity per role, adds USDC trustlines,
# and writes TB_<ROLE>_PUBLIC / TB_<ROLE>_SECRET into .env. Idempotent.
set -euo pipefail
cd "$(dirname "$0")/.."

USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
ROLES=(admin auditor treasury provider_a provider_b cheapmax agent)
touch .env

set_env() { # key value
  if grep -q "^$1=" .env; then sed -i '' "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}

for role in "${ROLES[@]}"; do
  id="tb-${role//_/-}"
  if ! stellar keys public-key "$id" >/dev/null 2>&1; then
    stellar keys generate "$id" --network testnet --fund -q
  else
    stellar keys fund "$id" --network testnet -q || true
  fi
  up=$(echo "$role" | tr '[:lower:]' '[:upper:]')
  set_env "TB_${up}_PUBLIC" "$(stellar keys public-key "$id")"
  set_env "TB_${up}_SECRET" "$(stellar keys secret "$id")"
  if [ "$role" != admin ]; then
    stellar tx new change-trust --source "$id" --line "USDC:$USDC_ISSUER" --network testnet -q >/dev/null 2>&1 \
      || echo "  (trustline for $id already exists or failed)"
  fi
  echo "$role: $(stellar keys public-key "$id")"
done
