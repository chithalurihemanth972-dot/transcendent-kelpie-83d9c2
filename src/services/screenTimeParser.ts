/**
 * High-performance Screen Time parser for browser WASM & frontend.
 * Matches iOS Screen Time and Android Digital Wellbeing (Samsung, Xiaomi,
 * OnePlus, Realme, Pixel, Nothing, Moto), including fuzzy OCR substitutions.
 */

export interface ParsedTime {
  minutes: number;
  raw: string;
  pattern: 'hero_format' | 'fuzzy_hm' | 'colon_format' | 'hours_only' | 'minutes_only';
  position: number;
  proximityBonus: number;
}

const H = '(?:h|H|n|N|A|R|k|b|hr|hrs|hour|hours|గం|గంట|గంటల)';
const M = '(?:m|M|rn|nn|min|mins|minute|minutes|ని|నిమి|నిమిషం|నిమిషాలు)';

const TODAY_HINTS = [
  'today', 'todays', "today's", 'daily average', 'screen time',
  'screentime', 'digital wellbeing', 'wellbeing', 'ఈరోజు', 'నేడు',
  'daily', 'average', 'total', 'usage',
];
const NEGATIVE_HINTS = ['yesterday', 'last week', 'weekly', 'goal', 'limit', 'target'];

const BASE_STRENGTH: Record<ParsedTime['pattern'], number> = {
  hero_format: 1.0,     // "4h 18m" / "4h 18min"
  fuzzy_hm: 0.94,       // "4n 18rn" (OCR misread)
  colon_format: 0.82,   // "4:18"
  hours_only: 0.70,     // "5h"
  minutes_only: 0.48,   // "45m"
};

export const MIN_PLAUSIBLE_MINUTES = 1;
export const MAX_PLAUSIBLE_MINUTES = 24 * 60;

function fixDigits(token: string): string {
  return token
    .replace(/[OoQD]/g, '0')
    .replace(/[lIi|!]/g, '1')
    .replace(/[Zz]/g, '2')
    .replace(/[Ss]/g, '5')
    .replace(/B/g, '8')
    .replace(/[gq]/g, '9');
}

function normalize(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function proximity(lowText: string, position: number): number {
  const window = lowText.slice(Math.max(0, position - 80), position + 80);
  let bonus = 0;
  if (TODAY_HINTS.some((h) => window.includes(h))) bonus += 0.25;
  if (NEGATIVE_HINTS.some((n) => window.includes(n))) bonus -= 0.50;
  return bonus;
}

export function strengthOf(p: ParsedTime): number {
  return Math.min(1, BASE_STRENGTH[p.pattern] + p.proximityBonus);
}

export function findAll(text: string): ParsedTime[] {
  const clean = normalize(text);
  const low = clean.toLowerCase();
  const out: ParsedTime[] = [];

  const add = (minutes: number, raw: string, pattern: ParsedTime['pattern'], position: number) => {
    if (minutes < MIN_PLAUSIBLE_MINUTES || minutes > MAX_PLAUSIBLE_MINUTES) return;
    out.push({ minutes, raw: raw.trim(), pattern, position, proximityBonus: proximity(low, position) });
  };

  // 1) "4h 18m" / "3 hrs 20 mins"
  for (const m of low.matchAll(new RegExp(`(\\d{1,2})\\s*${H}\\s*(\\d{1,2})\\s*${M}?`, 'gi'))) {
    const h = parseInt(fixDigits(m[1]), 10);
    const mins = parseInt(fixDigits(m[2]), 10);
    if (!isNaN(h) && !isNaN(mins) && mins < 60) {
      add(h * 60 + mins, m[0], 'hero_format', m.index ?? 0);
    }
  }

  // 2) Joined/Fuzzy "4h18m", "4n18rn", "4h 18"
  for (const m of low.matchAll(/(?<!\d)(\d{1,2})\s*([hn]|hr|hrs)\s*(\d{1,2})\s*(m|min|mins|rn)?(?!\w)/gi)) {
    const h = parseInt(fixDigits(m[1]), 10);
    const mins = parseInt(fixDigits(m[3]), 10);
    if (!isNaN(h) && !isNaN(mins) && mins < 60) {
      add(h * 60 + mins, m[0], 'fuzzy_hm', m.index ?? 0);
    }
  }

  // 3) "4:18" / "04:18" / "4.18" / "4-18"
  for (const m of low.matchAll(/(?<!\d)(\d{1,2})\s*[:;.\-]\s*([0-5]\d)(?!\d)/g)) {
    const h = parseInt(m[1], 10);
    const mins = parseInt(m[2], 10);
    if (!isNaN(h) && !isNaN(mins) && h <= 23) {
      add(h * 60 + mins, m[0], 'colon_format', m.index ?? 0);
    }
  }

  // 4) Hours only: "5h", "6 hr"
  for (const m of low.matchAll(new RegExp(`(\\d{1,2})\\s*${H}(?!\\s*\\d)`, 'gi'))) {
    const h = parseInt(fixDigits(m[1]), 10);
    if (!isNaN(h)) add(h * 60, m[0], 'hours_only', m.index ?? 0);
  }

  // 5) Minutes only: "45m", "45 min"
  for (const m of low.matchAll(new RegExp(`(?<!\d)(?<![hHnN]\\s)(\\d{1,3})\\s*${M}(?![a-z])`, 'gi'))) {
    const mins = parseInt(fixDigits(m[1]), 10);
    if (!isNaN(mins) && mins < 600) add(mins, m[0], 'minutes_only', m.index ?? 0);
  }

  return out;
}

export function selectBest(candidates: ParsedTime[]): ParsedTime | null {
  if (!candidates.length) return null;
  const ranked = [...candidates].sort((a, b) => {
    const d = strengthOf(b) - strengthOf(a);
    return Math.abs(d) > 1e-6 ? d : b.minutes - a.minutes;
  });
  const top = ranked[0];
  const peers = ranked.filter((c) => Math.abs(strengthOf(c) - strengthOf(top)) < 0.10);
  return peers.reduce((best, c) => (c.minutes > best.minutes ? c : best), peers[0] ?? top);
}

export function parse(text: string): ParsedTime | null {
  return selectBest(findAll(text));
}

export function countContext(text: string): number {
  const low = text.toLowerCase();
  return TODAY_HINTS.reduce((n, kw) => (low.includes(kw) ? n + 1 : n), 0);
}

export function formatDuration(totalMinutes: number): string {
  const t = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(t / 60);
  const m = t % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
