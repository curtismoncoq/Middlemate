# Art direction

TrustBazaar is a **dark street at night**. Every listing is a stall on that street. The page is set in condensed capitals, uses one lime light, and navigates with a stack of colour tiles. The tokens live in `apps/web/app/globals.css` (`:root`); use them by name rather than as raw hex values.

## Colour

| Token | Value | Use |
|---|---|---|
| `--frame` | `#141414` | Window background, and the 8px gaps between the tiles and the stages |
| `--stage` | `#232323` | Big content sections (`.stage`) |
| `--panel` | `#2c2c2c` | Cards, Try-it panel |
| `--well` | `#1a1a1a` | Inputs, audit feed, recessed areas |
| `--line` | `#3a3a3a` | The few rules (tab underline track, list dividers) |
| `--text` | `#f2f2f2` | All running text |
| `--muted` | `#a6a6a6` | Secondary text only (labels, captions, units) |
| `--lime` | `#d6f58e` | **The one accent**: primary button, passed status, trust meter, prices on stall boards, live status sentence, links |
| `--lime-ink` | `#131313` | Text on lime |
| `--negative` | `#ff6a5c` | Slashed: tape, slashed pill, failed probe lines, Slashed count above 0 |
| `--warning` | `#f3c25b` | Under review, being audited, unverifiable |

Navigation tiles, from top to bottom: `--tile-white #f3f3f0` (Catalog), lime (List an endpoint), `--tile-grey #d2d2d2` (Audit log), `--tile-dark #343434` (Dashboard), `--tile-ink #262626` (Wallet).

Rules:

- Lime marks what is good or what to do next. Keep it off decoration, and give each screen only one lime button.
- Red and amber are status colours; they appear only on a listing whose state they describe.
- No gradients, glows, blur or glass. Surfaces are flat fills one tone step apart.

## Type

- **Display:** Barlow Condensed 700, UPPERCASE. Use it for headlines, section titles, card names, tabs, big figures and stall signs.
  - Hero: `clamp(44px, 7.2vw, 112px)`, line-height 0.9, at most two lines.
  - Section title (`.display-2`): `clamp(40px, 4.4vw, 64px)`.
  - Card name: 28px. Price: 36px. Figures: 48px (600).
- **Text:** Barlow 400–600, 16px body, line-height 1.5; secondary 14px. Use sentence case, never tracked small caps (the stall drawing's signage is the one exception).
- **Mono:** Geist Mono, only for model ids, tx hashes, wallet addresses and probe log lines.
- Numbers that change or align use `tabular-nums`.

## Shape and space

- **Corner radius: 0.** Buttons, cards, inputs, pills, tiles and panels are all square. Only round things are round: status dots and the pulse.
- **Borders:** none on cards. Separate surfaces by tone. Outline buttons and the warning pill use an inset 1.5px line.
- **Shadows:** none, except on things that float over the page (the Try-it panel).
- **Spacing:** 8px between frame blocks (tiles, stages, cards). Stage padding is 32px 40px on desktop and 24px 16px on a phone.
- **Buttons:** 48px tall with 22px side padding, Barlow 600 16px. The primary is lime with dark text; the secondary is a transparent 1.5px grey outline that turns lime on hover.

## Layout

- **Frame:** the tile column sits on the left (220px; 150px below 860px), with the stages on the right. Below 640px the tiles become one row across the top, with short labels.
- **Active page:** a `●` after the tile label.
- **Homepage:**
  - the wordmark, then the hero headline;
  - the street of stalls on one shared kerb;
  - a status sentence (lime lead-in, then plain text) beside the actions;
  - then the Catalog stage: figures, audit feed, tabs and cards.
- **`/list`:** the "Open a stall" headline. The form sits on the left; on the right, a live drawing of your stall and the "After you submit" track.

## The stall (signature element)

`components/Stall.tsx` draws one listing as a shop front. Its look comes from `stallView()` in `lib/stall.ts`, and its colours from the `.st-*` and `.stall--<state>` classes.

| State | Door placard | Lights |
|---|---|---|
| `open` (audited, passed) | TRUST 100 (lime) | lime |
| `review` (no audit yet) | UNDER REVIEW (amber) | amber |
| `auditing` | PROBE 3/6 (amber) + pulsing lamp | amber |
| `unverifiable` | NOT VERIFIED (amber) | grey |
| `unscored` (audit answered too few probes) | NOT SCORED (amber), never a trust number | amber |
| `api` | SCHEMA DECLARED (grey) | lime |
| `slashed` | shutter rolls down, red tape `SLASHED · STAKE 5 → 0`, price struck through | — |

New listing kinds get a placard and a light colour here; the drawing itself stays the same.

## Motion

Motion is feedback, never decoration:

- a card rises in when it arrives;
- a slashed card gives one shake;
- the shutter drops (0.9s) and the tape appears after it;
- the lights blink, and the audit lamp and pulse dots breathe;
- the meter fill animates when a score arrives.

Everything stops under `prefers-reduced-motion`.

## Checking a change

Run the inspector from the repo root with the app running:

```
node .claude/skills/design-taste-frontend/scripts/inspect.mjs http://localhost:3000/ --out .taste-skill/check
```

Then look at the screenshots at 1440, 768 and 390px. Two of its findings are expected:

- `font-not-dealt`: it still remembers an earlier, rejected style;
- `app-title-size`: the hero headline is meant to be huge.
