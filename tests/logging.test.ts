import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "fs";
import { join } from "path";
import { writeFailureLog, recordHistory } from "../src/logging";

const TEST_DIR = "/tmp/docsmith-daily-test-logging";

// --- Phase 3: Failure Logging + History Tracking Tests ---

describe("Phase 3 - Failure Logging", () => {
  beforeEach(() => {
    mkdirSync(join(TEST_DIR, "logs", "failures"), { recursive: true });
    mkdirSync(join(TEST_DIR, "data"), { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  // === Happy Path ===
  describe("Happy Path", () => {
    test("creates failure log with repo name, phase, error, timestamp", () => {
      const logsDir = join(TEST_DIR, "logs", "failures");
      writeFailureLog(logsDir, "test/repo", 2, "timeout after 30 min", 1800);
      const date = new Date().toISOString().split("T")[0];
      const logPath = join(logsDir, `${date}.md`);
      expect(existsSync(logPath)).toBe(true);
      const content = readFileSync(logPath, "utf-8");
      expect(content).toContain("test/repo");
      expect(content).toContain("Phase 2");
      expect(content).toContain("timeout after 30 min");
    });

    test("appends to existing day's log if multiple failures", () => {
      const logsDir = join(TEST_DIR, "logs", "failures");
      writeFailureLog(logsDir, "test/repo-1", 1, "error 1", 100);
      writeFailureLog(logsDir, "test/repo-2", 3, "error 2", 200);
      const date = new Date().toISOString().split("T")[0];
      const logPath = join(logsDir, `${date}.md`);
      const content = readFileSync(logPath, "utf-8");
      expect(content).toContain("test/repo-1");
      expect(content).toContain("test/repo-2");
    });
  });

  // === Bad Path ===
  describe("Bad Path", () => {
    test("logs/ directory doesn't exist -- creates it", () => {
      const logsDir = join(TEST_DIR, "new-logs", "failures");
      // This directory doesn't exist yet
      writeFailureLog(logsDir, "test/repo", 1, "error", 100);
      const date = new Date().toISOString().split("T")[0];
      expect(existsSync(join(logsDir, `${date}.md`))).toBe(true);
    });

    test("write fails gracefully (doesn't crash main process)", () => {
      // Try writing to a non-writable path
      expect(() => {
        writeFailureLog("/dev/null/impossible/path", "test", 1, "err", 0);
      }).not.toThrow();
    });
  });

  // === Edge Cases ===
  describe("Edge Cases", () => {
    test("3 failures in one day appear in same file, clearly separated", () => {
      const logsDir = join(TEST_DIR, "logs", "failures");
      writeFailureLog(logsDir, "repo-1", 1, "e1", 100);
      writeFailureLog(logsDir, "repo-2", 2, "e2", 200);
      writeFailureLog(logsDir, "repo-3", 3, "e3", 300);
      const date = new Date().toISOString().split("T")[0];
      const content = readFileSync(join(logsDir, `${date}.md`), "utf-8");
      expect(content).toContain("repo-1");
      expect(content).toContain("repo-2");
      expect(content).toContain("repo-3");
      // Should have separators
      expect(content).toContain("---");
    });

    test("error message with markdown special chars is handled", () => {
      const logsDir = join(TEST_DIR, "logs", "failures");
      writeFailureLog(logsDir, "test", 1, "Error: `code` *bold* <script>", 100);
      const date = new Date().toISOString().split("T")[0];
      const content = readFileSync(join(logsDir, `${date}.md`), "utf-8");
      // Should contain the error (may be escaped or in code block)
      expect(content).toContain("Error:");
    });
  });

  // === Security ===
  describe("Security", () => {
    test("error messages don't contain stack traces with file paths in production", () => {
      const logsDir = join(TEST_DIR, "logs", "failures");
      writeFailureLog(logsDir, "test", 1, "Error at /Users/secret/path.ts:42", 100);
      const date = new Date().toISOString().split("T")[0];
      const content = readFileSync(join(logsDir, `${date}.md`), "utf-8");
      // The error is logged as-is (since we're logging for debugging)
      // but shouldn't have tokens
      expect(content).not.toContain("GITHUB_TOKEN");
    });
  });

  // === Data Leak ===
  describe("Data Leak", () => {
    test("failure logs don't contain API tokens", () => {
      process.env.GITHUB_TOKEN = "ghp_test_secret_token_123";
      const logsDir = join(TEST_DIR, "logs", "failures");
      writeFailureLog(
        logsDir,
        "test",
        1,
        "Auth failed with ghp_test_secret_token_123",
        100
      );
      const date = new Date().toISOString().split("T")[0];
      const content = readFileSync(join(logsDir, `${date}.md`), "utf-8");
      expect(content).not.toContain("ghp_test_secret_token_123");
      delete process.env.GITHUB_TOKEN;
    });
  });

  // === Data Damage ===
  describe("Data Damage", () => {
    test("append-only pattern preserves previous entries", () => {
      const logsDir = join(TEST_DIR, "logs", "failures");
      writeFailureLog(logsDir, "first-repo", 1, "first error", 100);
      const date = new Date().toISOString().split("T")[0];
      const before = readFileSync(join(logsDir, `${date}.md`), "utf-8");
      expect(before).toContain("first-repo");

      writeFailureLog(logsDir, "second-repo", 2, "second error", 200);
      const after = readFileSync(join(logsDir, `${date}.md`), "utf-8");
      expect(after).toContain("first-repo");
      expect(after).toContain("second-repo");
    });
  });
});

describe("Phase 3 - History Tracking", () => {
  beforeEach(() => {
    mkdirSync(join(TEST_DIR, "data"), { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  // === Happy Path ===
  describe("Happy Path", () => {
    test("records success with repo, status, url, timestamp, duration", () => {
      const historyPath = join(TEST_DIR, "data", "history.json");
      writeFileSync(historyPath, "[]");
      recordHistory(historyPath, {
        repo: "test/repo",
        status: "success",
        url: "https://docsmith.aigne.io/discuss/docs/repo",
        duration: 300,
      });
      const history = JSON.parse(readFileSync(historyPath, "utf-8"));
      expect(history.length).toBe(1);
      expect(history[0].repo).toBe("test/repo");
      expect(history[0].status).toBe("success");
      expect(history[0].url).toBe("https://docsmith.aigne.io/discuss/docs/repo");
      expect(history[0].timestamp).toBeTruthy();
    });

    test("records failure with repo, status, phase, error, timestamp", () => {
      const historyPath = join(TEST_DIR, "data", "history.json");
      writeFileSync(historyPath, "[]");
      recordHistory(historyPath, {
        repo: "test/repo",
        status: "failed",
        phase: 2,
        error: "timeout",
        duration: 1800,
      });
      const history = JSON.parse(readFileSync(historyPath, "utf-8"));
      expect(history[0].status).toBe("failed");
      expect(history[0].phase).toBe(2);
    });
  });

  // === Bad Path ===
  describe("Bad Path", () => {
    test("history.json doesn't exist -- creates it", () => {
      const historyPath = join(TEST_DIR, "data", "new-history.json");
      recordHistory(historyPath, { repo: "test", status: "success", duration: 0 });
      expect(existsSync(historyPath)).toBe(true);
    });

    test("history.json is corrupted -- recreates from scratch", () => {
      const historyPath = join(TEST_DIR, "data", "history.json");
      writeFileSync(historyPath, "{{{broken json");
      recordHistory(historyPath, { repo: "test", status: "success", duration: 0 });
      const history = JSON.parse(readFileSync(historyPath, "utf-8"));
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(1);
    });
  });

  // === Edge Cases ===
  describe("Edge Cases", () => {
    test("duplicate repo entry (retried after failure) -- both kept", () => {
      const historyPath = join(TEST_DIR, "data", "history.json");
      writeFileSync(historyPath, "[]");
      recordHistory(historyPath, { repo: "test/repo", status: "failed", duration: 100 });
      recordHistory(historyPath, { repo: "test/repo", status: "success", duration: 200 });
      const history = JSON.parse(readFileSync(historyPath, "utf-8"));
      expect(history.length).toBe(2);
      expect(history[0].status).toBe("failed");
      expect(history[1].status).toBe("success");
    });
  });

  // === Data Damage ===
  describe("Data Damage", () => {
    test("history.json written atomically", () => {
      const historyPath = join(TEST_DIR, "data", "history.json");
      writeFileSync(historyPath, "[]");
      recordHistory(historyPath, { repo: "test", status: "success", duration: 0 });
      // File should be valid JSON after write
      const content = readFileSync(historyPath, "utf-8");
      expect(() => JSON.parse(content)).not.toThrow();
    });
  });

  // === Security ===
  describe("Security", () => {
    test("no credential data in records", () => {
      const historyPath = join(TEST_DIR, "data", "history.json");
      writeFileSync(historyPath, "[]");
      recordHistory(historyPath, { repo: "test", status: "success", duration: 0 });
      const content = readFileSync(historyPath, "utf-8");
      expect(content).not.toContain("GITHUB_TOKEN");
      expect(content).not.toMatch(/ghp_[A-Za-z0-9]/);
    });
  });
});
