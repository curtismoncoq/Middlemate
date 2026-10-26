# M5 Callouts: spec

GOAL:    point at one thing in a screen recording (a tx hash, a trust score, the REJECTED line) without covering it.
FORM:    transparent overlay. A 6 px box draws left to right in 0.3 s (expo.out), then a tag with the label (Barlow 600 36 px) and value (Geist Mono 36 px) blurs in; both leave at 2.75 s.
VARS:    label, value, tone (lime | negative), x, y, w, h; one row per callout in batch.json.
