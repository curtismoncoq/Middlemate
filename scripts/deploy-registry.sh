#!/usr/bin/env bash
# Builds and deploys the registry to testnet; writes REGISTRY_CONTRACT_ID to .env.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
USDC=${USDC_CONTRACT:-CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA}

stellar contract build --package registry -q
id=$(stellar contract deploy -q --network testnet --source tb-admin \
  --wasm target/wasm32v1-none/release/registry.wasm -- \
  --admin "$TB_ADMIN_PUBLIC" --auditor "$TB_AUDITOR_PUBLIC" --token "$USDC" --treasury "$TB_TREASURY_PUBLIC")

if grep -q '^REGISTRY_CONTRACT_ID=' .env; then sed -i '' "s|^REGISTRY_CONTRACT_ID=.*|REGISTRY_CONTRACT_ID=$id|" .env; else echo "REGISTRY_CONTRACT_ID=$id" >> .env; fi
echo "$id"
