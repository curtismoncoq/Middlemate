# Demo video: motion pieces

The motion-design pieces M1–M6 of `docs/demo-runbook.md`, made with [HyperFrames](https://hyperframes.heygen.com) (HTML + GSAP, rendered to video). The screen recordings (R1–R10) and the voiceover are separate; these clips are cut in with them in the editor. All clips are **silent**.

| Piece | Folder | Length | Output |
|---|---|---|---|
| M1 Hook | `m1/` | 15 s | `out/m1-hook.mp4` |
| M2 How it works | `m2/` | 10 s | `out/m2-how-it-works.mp4` |
| M3 Fingerprint | `m3/` | 8.6 s | `out/m3-fingerprint.mp4` |
| M4 Stake counter | `m4/` | 3 s | `out/m4-stake-counter.mp4` |
| M5 Callouts | `m5/` | 3 s each, transparent | `out/m5-callout-<label>.mov` (ProRes 4444 with alpha) |
| M6 End card | `m6/` | 10 s | `out/m6-end-card.mp4` |

Each folder is its own HyperFrames project (`index.html` mounts the scenes in `compositions/`); they share `assets/` through a symlink.

## Run

```
cd video
sh render.sh                          # every piece into out/
TEAM="Name One · Name Two" sh render.sh  # same, with the team names on the M6 end card
PIECE=m3 npm run preview              # Studio preview of one piece (edit timing live)
npm run check                         # the HyperFrames check on every piece
```

Every command runs `hyperframes@0.8.200` with `HYPERFRAMES_NO_TELEMETRY=1`. Requires Node 22+, FFmpeg and Chrome.

## Callouts (M5)

`m5/batch.json` lists one callout per row: `label`, `value`, `tone` (`lime` for good, `negative` for slashed or rejected) and optionally the box `x`, `y`, `w`, `h` in pixels of the 1920×1080 screen recording. After recording, set each box on the spot it highlights and run `sh render.sh` again.

## Real things only

- **Stall drawings:** the app's own `apps/web/components/Stall.tsx`, rendered to SVG in `assets/stall-*.svg.html`. To re-render one after the stall changes, from `apps/web/` run a throwaway `_stall-svg.mts` with `npx tsx`:
  ```ts
  import React from 'react';
  (globalThis as any).React = React;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { Stall } = await import('./components/Stall.tsx');
  process.stdout.write(renderToStaticMarkup(React.createElement(Stall, { listing: { /* ApiListing */ }, number: 5 })));
  ```
  and redirect it to `../../video/assets/stall-<name>.svg.html`. The scenes inline these SVGs, so paste the new markup into the scene that uses it.
- **M1:** the agent's terminal lines use the real `pnpm agent` output format; the tx hash is left out rather than invented.
- **M2:** the probe is real (`c-reverse` in `apps/auditor/src/probes.ts`), and so is qwen2.5:0.5b's answer to it, "moonlight".
- **M3:** real similarities of qwen2.5:0.5b's answers to each reference (2026-10-25). After recording R4, replace `PROBES` in `m3/compositions/m3-fingerprint.html` with that audit's `closest.margins` from `data/audits.json`.
- **M5:** the slash tx `abfa5a43…` is the real one from the README.
- **Look:** colours, type and radius from `docs/design.md`; fonts in `assets/fonts/`.
