import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { parse } from "yaml";
import { readFileSync, mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { retryWithNextCandidate } from "../src/retry";

const TEST_DIR = "/tmp/docsmith-daily-test-workflow";

// --- Phase 2: GitHub Actions + TeamSwarm Integration Tests ---

describe("Phase 2 - GitHub Actions Workflow", () => {
  // === Happy Path ===
  describe("Happy Path", () => {
    test("YAML is valid and parseable", () => {
      const raw = readFileSync(
        "./.github/workflows/daily-discover.yml",
        "utf-8",
      );
      const parsed = parse(raw);
      expect(parsed).toBeTruthy();
      expect(parsed.name).toBeTruthy();
    });

    test("cron is 0 16 * * * (8am PST = 4pm UTC)", () => {
      const raw = readFileSync(
        "./.github/workflows/daily-discover.yml",
        "utf-8",
      );
      const parsed = parse(raw);
      const cron = parsed.on.schedule[0].cron;
      expect(cron).toBe("0 16 * * *");
    });

    test("has workflow_dispatch for manual trigger", () => {
      const raw = readFileSync(
        "./.github/workflows/daily-discover.yml",
        "utf-8",
      );
      const parsed = parse(raw);
      expect(parsed.on.workflow_dispatch).toBeDefined();
    });

    test("uses bun for build step", () => {
      const raw = readFileSync(
        "./.github/workflows/daily-discover.yml",
        "utf-8",
      );
      expect(raw).toContain("setup-bun");
      expect(raw).toContain("bun install");
    });

    test("commits and pushes intent/ and data/ directories", () => {
      const raw = readFileSync(
        "./.github/workflows/daily-discover.yml",
        "utf-8",
      );
      expect(raw).toContain("git add intent/ data/");
      expect(raw).toContain("git push");
    });
  });

  // === Bad Path ===
  describe("Bad Path", () => {
    test("git push fails gracefully with || true", () => {
      const raw = readFileSync(
        "./.github/workflows/daily-discover.yml",
        "utf-8",
      );
      expect(raw).toContain("|| true");
    });
  });

  // === Edge Cases ===
  describe("Edge Cases", () => {
    test("handles DST (cron stays UTC)", () => {
      const raw = readFileSync(
        "./.github/workflows/daily-discover.yml",
        "utf-8",
      );
      const parsed = parse(raw);
      // 0 16 * * * is UTC - doesn't change with DST
      expect(parsed.on.schedule[0].cron).toBe("0 16 * * *");
    });
  });

  // === Security ===
  describe("Security", () => {
    test("GITHUB_TOKEN from secrets, not hardcoded", () => {
      const raw = readFileSync(
        "./.github/workflows/daily-discover.yml",
        "utf-8",
      );
      expect(raw).toContain("secrets.GITHUB_TOKEN");
      // Should NOT have a hardcoded token
      expect(raw).not.toMatch(/ghp_[A-Za-z0-9]{36}/);
    });
  });

  // === Data Leak ===
  describe("Data Leak", () => {
    test("no API keys in workflow file", () => {
      const raw = readFileSync(
        "./.github/workflows/daily-discover.yml",
        "utf-8",
      );
      expect(raw).not.toMatch(/ghp_[A-Za-z0-9]/);
      expect(raw).not.toMatch(/sk-[A-Za-z0-9]/);
    });
  });
});

describe("Phase 2 - CLAUDE.md", () => {
  // === Happy Path ===
  describe("Happy Path", () => {
    test("CLAUDE.md exists with doc-smith pipeline instructions", () => {
      const content = readFileSync("./CLAUDE.md", "utf-8");
      expect(content).toContain("doc-smith");
    });
  });

  // === Security ===
  describe("Security", () => {
    test("CLAUDE.md contains no credentials or tokens", () => {
      const content = readFileSync("./CLAUDE.md", "utf-8");
      expect(content).not.toMatch(/ghp_[A-Za-z0-9]/);
      expect(content).not.toMatch(/sk-[A-Za-z0-9]/);
      expect(content).not.toContain("GITHUB_TOKEN=");
    });
  });
});

describe("Phase 2 - Retry Logic", () => {
  beforeEach(() => {
    mkdirSync(join(TEST_DIR, "data"), { recursive: true });
    mkdirSync(join(TEST_DIR, "intent"), { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  // === Happy Path ===
  describe("Happy Path", () => {
    test("picks next candidate from candidates.json", () => {
      const candidatesPath = join(TEST_DIR, "data", "candidates.json");
      const historyPath = join(TEST_DIR, "data", "history.json");
      writeFileSync(
        candidatesPath,
        JSON.stringify([
          { name: "repo-a", full_name: "o/repo-a", stars: 1000 },
          { name: "repo-b", full_name: "o/repo-b", stars: 800 },
        ]),
      );
      writeFileSync(
        historyPath,
        JSON.stringify([{ repo: "o/repo-a", status: "failed" }]),
      );

      const next = retryWithNextCandidate(candidatesPath, historyPath);
      // repo-a failed, so next should be repo-b
      expect(next).not.toBeNull();
      expect(next?.name).toBe("repo-b");
    });
  });

  // === Bad Path ===
  describe("Bad Path", () => {
    test("returns null when candidates.json is empty", () => {
      const candidatesPath = join(TEST_DIR, "data", "candidates.json");
      const historyPath = join(TEST_DIR, "data", "history.json");
      writeFileSync(candidatesPath, "[]");
      writeFileSync(historyPath, "[]");

      const next = retryWithNextCandidate(candidatesPath, historyPath);
      expect(next).toBeNull();
    });

    test("returns null when candidates.json doesn't exist", () => {
      const candidatesPath = join(TEST_DIR, "data", "no-candidates.json");
      const historyPath = join(TEST_DIR, "data", "history.json");
      writeFileSync(historyPath, "[]");

      const next = retryWithNextCandidate(candidatesPath, historyPath);
      expect(next).toBeNull();
    });

    test("returns null when all candidates already in history as success", () => {
      const candidatesPath = join(TEST_DIR, "data", "candidates.json");
      const historyPath = join(TEST_DIR, "data", "history.json");
      writeFileSync(
        candidatesPath,
        JSON.stringify([
          { name: "repo-a", full_name: "o/repo-a", stars: 1000 },
        ]),
      );
      writeFileSync(
        historyPath,
        JSON.stringify([{ repo: "o/repo-a", status: "success" }]),
      );

      const next = retryWithNextCandidate(candidatesPath, historyPath);
      expect(next).toBeNull();
    });
  });

  // === Data Damage ===
  describe("Data Damage", () => {
    test("picking next candidate doesn't corrupt candidates.json", () => {
      const candidatesPath = join(TEST_DIR, "data", "candidates.json");
      const historyPath = join(TEST_DIR, "data", "history.json");
      const original = [
        { name: "repo-a", full_name: "o/repo-a", stars: 1000 },
        { name: "repo-b", full_name: "o/repo-b", stars: 800 },
      ];
      writeFileSync(candidatesPath, JSON.stringify(original));
      writeFileSync(historyPath, "[]");

      retryWithNextCandidate(candidatesPath, historyPath);

      // candidates.json should be unchanged
      const after = JSON.parse(readFileSync(candidatesPath, "utf-8"));
      expect(after).toEqual(original);
    });
  });
});
