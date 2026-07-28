/**
 * Consensus voting across OCR readings.
 *
 * A single reading is a guess. Twelve readings that independently agree
 * on "258 minutes" is evidence. This module turns many noisy candidates
 * into one answer plus an honest confidence, and — critically — refuses
 * to answer when the evidence is genuinely split.
 */

import { strengthOf, type ParsedTime } from './screenTimeParser';

export interface Candidate {
  parsed: ParsedTime;
  /** Raw OCR confidence for the reading it came from (0..1). */
  ocrConfidence: number;
  /** Which preprocessing produced it. */
  variant: string;
  /** Weight for the region: a detected screen beats a blind crop. */
  regionWeight: number;
  /** Full text of the reading, for diagnostics. */
  text: string;
}

export interface ConsensusResult {
  minutes: number;
  confidence: number;
  votes: number;
  totalCandidates: number;
  agreement: number;      // 0..1 — share of weight behind the winner
  best: Candidate;
  runnerUpMinutes: number | null;
  /** Quick check — is this result strong enough to stop early? */
  isDecisive: boolean;
}

/** Values within this many minutes are treated as the same reading. */
const GROUP_TOLERANCE = 2;

function weightOf(c: Candidate): number {
  // Pattern strength is the dominant term: "4h 18m" is structurally far
  // more trustworthy than a bare "45m" that could be any app row.
  const pattern = strengthOf(c.parsed);
  const ocr = 0.35 + c.ocrConfidence * 0.65; // never fully discount a reading
  return pattern * ocr * c.regionWeight;
}

/**
 * Group candidates by value and pick the group with the most weight.
 */
export function vote(candidates: Candidate[]): ConsensusResult | null {
  if (!candidates.length) return null;

  interface Group {
    minutes: number;
    weight: number;
    members: Candidate[];
  }

  const groups: Group[] = [];

  for (const c of candidates) {
    const w = weightOf(c);
    const g = groups.find((x) => Math.abs(x.minutes - c.parsed.minutes) <= GROUP_TOLERANCE);
    if (g) {
      g.weight += w;
      g.members.push(c);
      // Keep the group's canonical value anchored to its strongest member.
      const strongest = g.members.reduce((a, b) => (weightOf(a) >= weightOf(b) ? a : b));
      g.minutes = strongest.parsed.minutes;
    } else {
      groups.push({ minutes: c.parsed.minutes, weight: w, members: [c] });
    }
  }

  groups.sort((a, b) => b.weight - a.weight);
  const winner = groups[0];
  const runnerUp = groups[1] ?? null;

  const totalWeight = groups.reduce((s, g) => s + g.weight, 0);
  const agreement = totalWeight > 0 ? winner.weight / totalWeight : 0;

  const best = winner.members.reduce((a, b) => (weightOf(a) >= weightOf(b) ? a : b));

  // Confidence blends three independent signals:
  //   · how structurally sound the winning match is
  //   · how well the OCR engine read it
  //   · how much of the total evidence agrees
  const patternTerm = strengthOf(best.parsed);
  const ocrTerm = best.ocrConfidence;
  const agreementTerm = agreement;
  const multiVoteBonus = Math.min(0.08, (winner.members.length - 1) * 0.02);

  let confidence =
    patternTerm * 0.42 + ocrTerm * 0.28 + agreementTerm * 0.30 + multiVoteBonus;

  // A lone low-strength candidate should never look certain.
  if (winner.members.length === 1 && patternTerm < 0.7) confidence *= 0.72;

  // Genuine disagreement must be reflected, not smoothed over.
  if (runnerUp && winner.weight < runnerUp.weight * 1.25) confidence *= 0.68;

  const isDec = isDecisive({ minutes: winner.minutes, confidence, votes: winner.members.length, totalCandidates: candidates.length, agreement, best, runnerUpMinutes: runnerUp ? runnerUp.minutes : null } as ConsensusResult);
  return {
    minutes: winner.minutes,
    confidence: Math.max(0, Math.min(0.99, confidence)),
    votes: winner.members.length,
    totalCandidates: candidates.length,
    agreement,
    best,
    runnerUpMinutes: runnerUp ? runnerUp.minutes : null,
    isDecisive: isDec,
  };
}

/**
 * Is this consensus strong enough to stop early?
 * Used by the escalation loop to avoid unnecessary work.
 */
export function isDecisive(r: ConsensusResult | null): boolean {
  if (!r) return false;
  const strongPattern =
    r.best.parsed.pattern === 'hero_format' || r.best.parsed.pattern === 'fuzzy_hm';

  // Two independent agreeing reads of a well-formed duration.
  if (strongPattern && r.votes >= 2 && r.agreement >= 0.65) return true;

  // One very clean read of a well-formed duration.
  if (strongPattern && r.best.ocrConfidence >= 0.80 && r.agreement >= 0.80) return true;

  return false;
}

/** Set the `isDecisive` flag on a consensus result. */
export function markDecisive(r: ConsensusResult): void {
  (r as { isDecisive: boolean }).isDecisive = isDecisive(r);
}
