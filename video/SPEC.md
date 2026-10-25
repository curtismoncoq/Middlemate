# M1 Hook: spec

GOAL:    In 15 s the viewer feels the problem: an agent pays for a premium model and gets a 0.5B one, and nobody checked.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps, silent (the voiceover is recorded separately and laid over in the edit).
TIME:    15 s x 30 = 450 frames. Cut on a 120 BPM grid, 15 frames a beat, so the edit can drop music on it.

LOOK:    From docs/design.md, exact values.
         Ground #141414 (frame) and #232323 (stage); ink #f2f2f2; muted #a6a6a6.
         Accent lime #d6f58e, only on what is good or next (here: the price and the word CHECKS).
         Red #ff6a5c only for the lie (the real model), amber #f3c25b for "not verified".
         Colour fields: tile white #f3f3f0, lime, tile grey #d2d2d2 (the app's nav tiles), text on them #131313.
         Display: Barlow Condensed 700 caps, hero words 380-520 px (60-90% of frame width), tracking -1%.
         Text: Barlow 600 at 40 px. Mono: Geist Mono 500 at 34 px for the agent's terminal lines.
         Medium: the app's own flat night street. Flat fills one tone apart, radius 0, no shadows, no gradients.
OBJECTS: The real stall SVG from apps/web/components/Stall.tsx (state: not verified), drawn 900 px tall.
         Its sign plate is a separate layer: "CLAUDE OPUS 5.5" with the Claude Code icon; underneath, the
         red plate "QWEN 2.5 0.5B". The agent is its real terminal output from apps/agent (format verbatim).
MOTION:  Arrivals expo.out 0.3-0.45 s; camera power2.inOut; exits and whips power3.in, 40-50% of the entrance.
         Words: blur 8 -> 0 px + opacity in 0.13 s, 0.067 s apart, no translate. Hits are 0 ms sets on the beat.
         Sign tug: back.out(1.6) 0.25 s; sign rip: power3.in 0.35 s with 14 px blur at its fastest frame.
         Landed titles are dead still.

SHOTS:
  A  0.0-3.0   Type on colour fields. Hard cut on every beat: AGENTS (white field) / PAY (lime) / FOR (grey) /
               COMPUTE (frame ground, white). Beat 4 (2.0 s): COMPUTE shrinks to the top line, "ON THEIR OWN."
               arrives word by word under it. Hands off with a whip left at 2.75 s.
  B  3.0-9.5   The street. The stall lands from the whip (blurred, sharpens in 0.13 s), 900 px tall, right of centre.
               3.3: terminal lines type in on the left (task, then "picked CheapClaude at $0.012/request").
               4.5: a lime "$0.012" chip flies from the terminal to the price board (0.45 s), pop on 5.0 (beat 10),
               then the "paid" line prints. 5.5-6.5: camera pushes into the sign (1 -> 1.45, power2.inOut 1 s).
               7.5: the sign's corner tugs. 8.0 (beat 16, bar 5 downbeat): the plate rips off, QWEN 2.5 0.5B
               underneath (impact), the window's model rolls like a slot machine to QWEN2.5:0.5B by 8.4.
               Hold on the lie until 9.5.
  C  9.5-15.0  Dip cut to the ground. NOBODY CHECKS (CHECKS in lime) word by word grey -> ink at 9.6,
               WHAT AGENTS ACTUALLY GET. at 10.6; hold dead still to the end (>= 4 s).

SOUND:   None. The piece is cut into the full video under the voiceover; music, if any, is laid in the edit.
BANNED:  dark void with small things in the middle; glow, particles, gradients; every element fading and sliding up;
         titles drifting after they land; breathing or pulsing loops; three cards in a row; the logo docked in a corner;
         a made-up tx hash or any number not from the product.
QA:      0.0 (frame 0 is a full white field with AGENTS), 1.6, 2.4, 3.2, 5.0, 6.4, 8.05, 8.5, 12.0, 14.9.
