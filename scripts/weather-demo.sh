#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export WEATHER_DEMO=1
export NEXT_PUBLIC_WEATHER_DEMO=1
pnpm dev
