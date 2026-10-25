export type Probe =
  | { id: string; kind: 'checkable'; prompt: string; check: (answer: string) => boolean }
  | { id: string; kind: 'fingerprint'; prompt: string };

const words = (a: string) => a.trim().replace(/[.!?]+$/, '').split(/\s+/).filter(Boolean);
const has = (re: RegExp) => (a: string) => re.test(a);

/** Known-answer prompts: easy for a large model, error-prone for a 0.5B one. */
export const CHECKABLE: Probe[] = [
  { id: 'c-apples', kind: 'checkable', prompt: 'A shop has 23 apples. It sells 9, then receives 3 boxes of 6 apples each, then sells 11. How many apples are left? Reply with only the number.', check: has(/(^|\D)21(\D|$)/) },
  { id: 'c-train', kind: 'checkable', prompt: 'A train leaves at 14:35 and the trip takes 2 hours 50 minutes. At what time does it arrive? Reply with only the time in HH:MM.', check: has(/17:25/) },
  { id: 'c-seven', kind: 'checkable', prompt: 'Describe the ocean in exactly seven words, all lowercase, no punctuation. Reply with only those words.', check: (a) => words(a).length === 7 && a === a.toLowerCase() },
  { id: 'c-reverse', kind: 'checkable', prompt: 'Spell the word "lantern" backwards. Reply with only the reversed word.', check: has(/nretnal/i) },
  { id: 'c-extract', kind: 'checkable', prompt: 'Text: "Marta paid 14 euros for lunch, Joao paid 9, and Ines paid twice what Joao paid." How much did Ines pay? Reply with only the number.', check: has(/(^|\D)18(\D|$)/) },
  { id: 'c-count', kind: 'checkable', prompt: 'How many times does the letter "s" appear in the word "possessions"? Reply with only the number.', check: has(/(^|\D)5(\D|$)/) },
  { id: 'c-json', kind: 'checkable', prompt: 'Return only a JSON object with keys "city" and "country" for the capital of Portugal. No prose, no code fences.', check: (a) => { try { const j = JSON.parse(a); return /lisbo/i.test(j.city) && /portugal/i.test(j.country); } catch { return false; } } },
  { id: 'c-prime', kind: 'checkable', prompt: 'What is the smallest prime number greater than 90? Reply with only the number.', check: has(/(^|\D)97(\D|$)/) },
  { id: 'c-order', kind: 'checkable', prompt: 'Sort these numbers from smallest to largest and reply with only the comma-separated list: 42, 7, 19, 3, 88, 25', check: (a) => a.replace(/\s/g, '').includes('3,7,19,25,42,88') },
  { id: 'c-days', kind: 'checkable', prompt: 'If today is Wednesday, what day of the week will it be in 10 days? Reply with only the day.', check: has(/saturday/i) },
  { id: 'c-upper', kind: 'checkable', prompt: 'Reply with the word "stellar" in uppercase letters, followed by the number of letters it has, separated by a single space. Nothing else.', check: has(/^STELLAR 7$/) },
  { id: 'c-pct', kind: 'checkable', prompt: 'What is 15% of 240? Reply with only the number.', check: has(/(^|\D)36(\D|$)/) },
];

/** Open-ended prompts whose wording carries a model's fingerprint. */
export const FINGERPRINT: Probe[] = [
  { id: 'f-pitch', kind: 'fingerprint', prompt: 'In two sentences, explain to a ten-year-old why the sky looks blue.' },
  { id: 'f-coffee', kind: 'fingerprint', prompt: 'Write a two-sentence product description for a reusable coffee cup.' },
  { id: 'f-lisbon', kind: 'fingerprint', prompt: 'Give three short tips for a first-time visitor to Lisbon, one line each.' },
  { id: 'f-email', kind: 'fingerprint', prompt: 'Write a polite two-sentence email declining a meeting invitation.' },
  { id: 'f-debt', kind: 'fingerprint', prompt: 'In two sentences, what is technical debt?' },
  { id: 'f-recipe', kind: 'fingerprint', prompt: 'Summarize how to make pancakes in three short steps.' },
  { id: 'f-rain', kind: 'fingerprint', prompt: 'Describe the smell of rain in one vivid sentence.' },
];

function shuffle<T>(items: T[], seed: number): T[] {
  const a = [...items];
  let s = seed >>> 0 || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A randomized round: about two-thirds fingerprint probes, the rest checkable. */
export function pickProbes(n = 6, seed = Date.now()): Probe[] {
  const nCheck = Math.max(1, Math.round(n / 3));
  return shuffle([...shuffle(FINGERPRINT, seed).slice(0, n - nCheck), ...shuffle(CHECKABLE, seed + 1).slice(0, nCheck)], seed + 2);
}
