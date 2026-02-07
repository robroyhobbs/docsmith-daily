import { readFileSync, existsSync } from "fs";

interface CandidateEntry {
  name: string;
  full_name: string;
  stars: number;
  language?: string | null;
  readme_length?: number;
  file_count?: number;
}

/**
 * Get the next candidate to retry after a failure.
 * Reads candidates.json and history.json, returns the first candidate
 * that hasn't been successfully processed.
 *
 * Returns null if no candidates available or all have been processed.
 */
export function retryWithNextCandidate(
  candidatesPath: string,
  historyPath: string,
): CandidateEntry | null {
  // Read candidates
  let candidates: CandidateEntry[];
  try {
    if (!existsSync(candidatesPath)) {
      return null;
    }
    candidates = JSON.parse(readFileSync(candidatesPath, "utf-8"));
  } catch {
    return null;
  }

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  // Read history
  let history: any[];
  try {
    history = existsSync(historyPath)
      ? JSON.parse(readFileSync(historyPath, "utf-8"))
      : [];
  } catch {
    history = [];
  }

  // Build set of repos already attempted (success or failed)
  const attemptedRepos = new Set(
    history
      .filter((h: any) => h.status === "success" || h.status === "failed")
      .map((h: any) => h.repo),
  );

  // Find first candidate not already attempted
  for (const candidate of candidates) {
    if (!attemptedRepos.has(candidate.full_name)) {
      return candidate;
    }
  }

  return null;
}
