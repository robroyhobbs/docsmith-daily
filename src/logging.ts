import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  renameSync,
} from "fs";
import { join } from "path";

/**
 * Sanitize content by removing potential tokens/secrets.
 */
function sanitize(text: string): string {
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    text = text.replaceAll(token, "[REDACTED]");
  }
  text = text.replace(/ghp_[A-Za-z0-9_]{36,}/g, "[REDACTED]");
  text = text.replace(/gho_[A-Za-z0-9_]{36,}/g, "[REDACTED]");
  return text;
}

/**
 * Write a failure log entry.
 * Creates logs/failures/{date}.md if it doesn't exist, appends if it does.
 */
export function writeFailureLog(
  logsDir: string,
  repoName: string,
  phase: number,
  errorMessage: string,
  durationSeconds: number
): void {
  try {
    mkdirSync(logsDir, { recursive: true });

    const date = new Date().toISOString().split("T")[0];
    const timestamp = new Date().toISOString();
    const logPath = join(logsDir, `${date}.md`);

    const safeError = sanitize(errorMessage);

    const entry = `
---

### ${repoName} - Phase ${phase}

- **Timestamp:** ${timestamp}
- **Phase:** ${phase}
- **Duration:** ${durationSeconds}s
- **Error:**

\`\`\`
${safeError}
\`\`\`

`;

    if (existsSync(logPath)) {
      appendFileSync(logPath, entry);
    } else {
      const header = `# Failure Log: ${date}\n\nDaily documentation generation failures.\n`;
      writeFileSync(logPath, header + entry);
    }
  } catch {
    // Don't crash the main process if logging fails
  }
}

interface HistoryRecord {
  repo: string;
  status: "success" | "failed" | "pending";
  url?: string;
  phase?: number;
  error?: string;
  duration: number;
}

/**
 * Record an entry in history.json.
 * Creates the file if it doesn't exist.
 * Handles corrupted JSON by starting fresh.
 */
export function recordHistory(
  historyPath: string,
  record: HistoryRecord
): void {
  let history: any[];

  try {
    if (existsSync(historyPath)) {
      const raw = readFileSync(historyPath, "utf-8");
      history = JSON.parse(raw);
      if (!Array.isArray(history)) {
        history = [];
      }
    } else {
      history = [];
    }
  } catch {
    // Corrupted JSON - start fresh
    history = [];
  }

  history.push({
    ...record,
    timestamp: new Date().toISOString(),
  });

  // Atomic write
  const tmp = historyPath + ".tmp";
  writeFileSync(tmp, JSON.stringify(history, null, 2));
  renameSync(tmp, historyPath);
}
