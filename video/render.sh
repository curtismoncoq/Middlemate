#!/bin/sh
# Renders every motion piece into out/: M1-M4 and M6 as MP4, each M5 callout in m5/batch.json as a transparent MOV.
set -e
cd "$(dirname "$0")"
export HYPERFRAMES_NO_TELEMETRY=1
HF="npx --yes hyperframes@0.8.200"
mkdir -p out
for p in m1:m1-hook m2:m2-how-it-works m3:m3-fingerprint m4:m4-stake-counter m6:m6-end-card; do
  (cd "${p%%:*}" && $HF render -o "../out/${p##*:}.mp4" < /dev/null)
done
# M6 team names: TEAM="Ada · Grace" sh render.sh
if [ -n "$TEAM" ]; then (cd m6 && $HF render --variables "{\"team\":\"$TEAM\"}" -o ../out/m6-end-card.mp4 < /dev/null); fi
node -e 'require("./m5/batch.json").forEach((r) => console.log(r.label.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "\t" + JSON.stringify(r)))' > out/.m5-rows.tsv
while IFS="$(printf '\t')" read -r name vars; do
  (cd m5 && $HF render --format mov --variables "$vars" -o "../out/m5-callout-$name.mov" < /dev/null)
done < out/.m5-rows.tsv
rm out/.m5-rows.tsv
