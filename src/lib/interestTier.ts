export type InterestTier = "notable" | "recommended" | "must-read";

export function interestTier(score: number): InterestTier {
  if (score >= 8) return "must-read";
  if (score >= 6) return "recommended";
  return "notable";
}
